import { randomUUID } from "node:crypto";
import type { Policy } from "@m1cro/policy";
import type { ModelProvider } from "@m1cro/providers";
import type { ModelMessage, RuntimeEvent } from "@m1cro/protocol";
import type { ToolRegistry } from "@m1cro/tools";
export interface AgentOptions { provider:ModelProvider; tools:ToolRegistry; policy:Policy; model:string; maxToolRounds?:number; systemPrompt?:string }
export interface RunInput { sessionId:string; prompt:string; signal?:AbortSignal }
export class AgentRuntime {
 constructor(private readonly options:AgentOptions){}
 async *run(input:RunInput):AsyncIterable<RuntimeEvent>{
  const controller=new AbortController();const abort=()=>controller.abort(input.signal?.reason);input.signal?.addEventListener("abort",abort,{once:true});if(input.signal?.aborted)abort();
  const turnId=`turn_${randomUUID()}`;const messages:ModelMessage[]=[...(this.options.systemPrompt?[{role:"system" as const,content:this.options.systemPrompt}]:[]),{role:"user",content:input.prompt}];const maxRounds=this.options.maxToolRounds??8;
  let terminal:RuntimeEvent={type:"turn.status",turnId,status:"completed"};
  try{
   yield {type:"turn.status",turnId,status:"running"};
   for(let round=0;round<=maxRounds;round++){
    if(controller.signal.aborted)throw controller.signal.reason??new Error("Cancelled");
    const calls:Array<{id:string;name:string;input:unknown}>=[];let sawDone=false;
    for await(const event of this.options.provider.stream({model:this.options.model,messages,tools:this.options.tools.list().map(({name,description,inputSchema})=>({name,description,inputSchema})),signal:controller.signal})){
     if(event.type==="text"){messages.push({role:"assistant",content:event.text});yield {type:"text.delta",turnId,delta:event.text};}
     else if(event.type==="tool_call"){calls.push(event.call);yield {type:"tool.call",turnId,callId:event.call.id,toolName:event.call.name,input:event.call.input};}
     else if(event.type==="done")sawDone=true;
    }
    if(calls.length===0){if(!sawDone&&round===maxRounds)throw new Error("Agent reached maximum tool-round limit");break;}
    if(round===maxRounds)throw new Error("Agent reached maximum tool-round limit");
    messages.push({role:"assistant",content:`Requested ${calls.length} tool call(s).`});
    for(const call of calls){
     if(controller.signal.aborted)throw controller.signal.reason??new Error("Cancelled");
     const tool=this.options.tools.get(call.name);
     if(!tool){const output={error:`Unknown tool: ${call.name}`};messages.push({role:"tool",toolCallId:call.id,name:call.name,content:JSON.stringify(output)});yield {type:"tool.result",turnId,callId:call.id,output,isError:true};continue;}
     const decision=this.options.policy.evaluate({toolName:tool.name,risk:tool.risk,input:call.input});
     if(decision!=="allow"){yield {type:"approval.required",turnId,callId:call.id,toolName:call.name,input:call.input,risk:tool.risk};throw new Error(`Tool approval required: ${call.name}; execution blocked because approval handshake is not implemented yet.`);}
     try{const parsed=tool.parse(call.input);const output=await tool.execute(parsed,controller.signal);messages.push({role:"tool",toolCallId:call.id,name:call.name,content:JSON.stringify(output)});yield {type:"tool.result",turnId,callId:call.id,output,isError:false};}
     catch(error){const output={error:error instanceof Error?error.message:String(error)};messages.push({role:"tool",toolCallId:call.id,name:call.name,content:JSON.stringify(output)});yield {type:"tool.result",turnId,callId:call.id,output,isError:true};}
    }
   }
  }catch(error){terminal={type:"turn.status",turnId,status:controller.signal.aborted?"cancelled":"failed",reason:error instanceof Error?error.message:String(error)};}
  finally{input.signal?.removeEventListener("abort",abort);}
  yield terminal;
 }
}
