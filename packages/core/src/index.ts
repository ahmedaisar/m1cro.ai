import { randomUUID } from "node:crypto";
import type { Policy } from "@m1cro/policy";
import type { ModelProvider } from "@m1cro/providers";
import type { ModelMessage, RuntimeEvent, ToolCall } from "@m1cro/protocol";
import type { ToolRegistry } from "@m1cro/tools";
import type { SessionStore } from "@m1cro/sessions";

export type ApprovalDecision = {decision:"approve";actor:"user"}|{decision:"reject";actor:"user";reason?:string};
export interface ApprovalRequest {turnId:string;callId:string;toolName:string;input:unknown;risk:"read"|"write"|"destructive"|"network"|"execute"}
export interface ApprovalController {request(request:ApprovalRequest,signal:AbortSignal):Promise<ApprovalDecision>}
export interface AgentOptions {provider:ModelProvider;tools:ToolRegistry;policy:Policy;model:string;maxToolRounds?:number;systemPrompt?:string;approval?:ApprovalController;sessionStore?:SessionStore}
export interface RunInput {sessionId:string;prompt:string;signal?:AbortSignal}
export class AgentRuntime {
 constructor(private readonly options:AgentOptions){}
 async *run(input:RunInput):AsyncIterable<RuntimeEvent>{
  const controller=new AbortController(),abort=()=>controller.abort(input.signal?.reason);
  input.signal?.addEventListener("abort",abort,{once:true});if(input.signal?.aborted)abort();
  const turnId=`turn_${randomUUID()}`;
  const record=async(kind:"message"|"event",data:unknown)=>this.options.sessionStore?.append(input.sessionId,{id:randomUUID(),timestamp:new Date().toISOString(),kind,data});
  const history:ModelMessage[]=[];
  if(this.options.sessionStore){
   for(const item of await this.options.sessionStore.read(input.sessionId)){
    if(item.kind!=="message"||!item.data||typeof item.data!=="object")continue;
    const candidate=item.data as Partial<ModelMessage>;
    if(["system","user","assistant","tool"].includes(String(candidate.role))&&typeof candidate.content==="string"){
     if(candidate.role==="tool"&&typeof candidate.toolCallId!=="string")continue;
     if(candidate.role==="assistant"&&candidate.toolCalls!==undefined&&!Array.isArray(candidate.toolCalls))continue;
     if(candidate.role==="assistant"&&candidate.toolCalls?.some(call=>!call||typeof call.id!=="string"||typeof call.name!=="string"))continue;
     history.push(candidate as ModelMessage);
    }
   }
  }
  const messages:ModelMessage[]=[
   ...(this.options.systemPrompt?[{role:"system" as const,content:this.options.systemPrompt}]:[]),
   ...history.filter(message=>message.role!=="system"),
   {role:"user",content:input.prompt}
  ];
  const maxRounds=this.options.maxToolRounds??8;
  let terminal:RuntimeEvent={type:"turn.status",turnId,status:"completed"};
  try{
   await record("message",{role:"user",content:input.prompt});
   yield {type:"turn.status",turnId,status:"running"};
   for(let round=0;round<=maxRounds;round++){
    controller.signal.throwIfAborted();
    const calls:ToolCall[]=[];let sawDone=false;
    for await(const event of this.options.provider.stream({model:this.options.model,messages,tools:this.options.tools.list().map(({name,description,inputSchema})=>({name,description,inputSchema})),signal:controller.signal})){
     if(event.type==="text"){
      const last=messages.at(-1);
      if(last?.role==="assistant"&&!last.toolCalls)last.content+=event.text;
      else messages.push({role:"assistant",content:event.text});
      await record("event",{type:"text.delta",turnId,delta:event.text});yield {type:"text.delta",turnId,delta:event.text};
     }else if(event.type==="tool_call"){
      calls.push(event.call);await record("event",{type:"tool.call",turnId,call:event.call});yield {type:"tool.call",turnId,callId:event.call.id,toolName:event.call.name,input:event.call.input};
     }else if(event.type==="done")sawDone=true;
    }
    if(calls.length===0){if(!sawDone&&round===maxRounds)throw new Error("Agent reached maximum tool-round limit");break;}
    if(round===maxRounds)throw new Error("Agent reached maximum tool-round limit");
    const assistant:ModelMessage={role:"assistant",content:"",toolCalls:calls};
    messages.push(assistant);
    await record("message",assistant);
    for(const call of calls){
     controller.signal.throwIfAborted();
     const tool=this.options.tools.get(call.name);
     if(!tool){
      const output={error:`Unknown tool: ${call.name}`};const msg:ModelMessage={role:"tool",toolCallId:call.id,name:call.name,content:JSON.stringify(output)};messages.push(msg);await record("message",msg);yield {type:"tool.result",turnId,callId:call.id,output,isError:true};continue;
     }
     const decision=this.options.policy.evaluate({toolName:tool.name,risk:tool.risk,input:call.input});
     if(decision==="deny"){
      const output={error:"Tool execution denied by policy"};const msg:ModelMessage={role:"tool",toolCallId:call.id,name:call.name,content:JSON.stringify(output)};messages.push(msg);await record("message",msg);yield {type:"tool.result",turnId,callId:call.id,output,isError:true};continue;
     }
     if(decision==="approve"){
      yield {type:"turn.status",turnId,status:"awaiting_approval"};
      const request:ApprovalRequest={turnId,callId:call.id,toolName:call.name,input:call.input,risk:tool.risk};
      await record("event",{type:"approval.required",...request});
      yield {type:"approval.required",...request};
      if(!this.options.approval)throw new Error(`Approval controller not configured; blocked tool: ${call.name}`);
      const approval=await this.options.approval.request(request,controller.signal);controller.signal.throwIfAborted();
      if(approval.actor!=="user")throw new Error("Approval actor must be the user");
      if(approval.decision!=="approve"){
       const reason=approval.reason??"Rejected by user";
       const resolved={type:"approval.resolved",turnId,callId:call.id,decision:"rejected",actor:"user",reason};
       await record("event",resolved);yield resolved;
       const output={error:`Tool approval rejected: ${reason}`};const msg:ModelMessage={role:"tool",toolCallId:call.id,name:call.name,content:JSON.stringify(output)};messages.push(msg);await record("message",msg);
       yield {type:"tool.result",turnId,callId:call.id,output,isError:true};yield {type:"turn.status",turnId,status:"running"};continue;
      }
      const resolved={type:"approval.resolved",turnId,callId:call.id,decision:"approved",actor:"user"};
      await record("event",resolved);yield resolved;yield {type:"turn.status",turnId,status:"running"};
     }
     try{
      this.options.tools.validateInput(call.name,call.input);
      const output=await tool.execute(tool.parse(call.input),controller.signal);
      const msg:ModelMessage={role:"tool",toolCallId:call.id,name:call.name,content:JSON.stringify(output)};messages.push(msg);await record("message",msg);
      yield {type:"tool.result",turnId,callId:call.id,output,isError:false};
     }catch(error){
      const output={error:error instanceof Error?error.message:String(error)};const msg:ModelMessage={role:"tool",toolCallId:call.id,name:call.name,content:JSON.stringify(output)};messages.push(msg);await record("message",msg);
      yield {type:"tool.result",turnId,callId:call.id,output,isError:true};
     }
    }
   }
  }catch(error){
   terminal={type:"turn.status",turnId,status:controller.signal.aborted?"cancelled":"failed",reason:error instanceof Error?error.message:String(error)};
  }finally{input.signal?.removeEventListener("abort",abort);}
  await record("event",terminal);yield terminal;
 }
}
