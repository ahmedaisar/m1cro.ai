import type { ModelEvent, ModelRequest } from "@m1cro/protocol";
export interface ModelProvider { readonly id:string; stream(request:ModelRequest):AsyncIterable<ModelEvent> }
/** Minimal OpenAI Chat Completions-compatible SSE adapter. No hidden retries or provider switching. */
export class OpenAICompatibleProvider implements ModelProvider {
 readonly id="openai-compatible";
 constructor(private readonly options:{baseUrl:string;apiKey?:string;headers?:Record<string,string>;fetcher?:typeof fetch}) {}
 async *stream(request:ModelRequest):AsyncIterable<ModelEvent> {
  const fetcher=this.options.fetcher??fetch;
  const response=await fetcher(`${this.options.baseUrl.replace(/\/$/,"")}/chat/completions`,{method:"POST",signal:request.signal,headers:{"content-type":"application/json",...(this.options.apiKey?{authorization:`Bearer ${this.options.apiKey}`}:{}),...this.options.headers},body:JSON.stringify({model:request.model,stream:true,messages:request.messages.map(({role,content,name,toolCallId})=>({role,content,...(name?{name}:{}),...(toolCallId?{tool_call_id:toolCallId}:{})})),tools:request.tools.map(t=>({type:"function",function:{name:t.name,description:t.description,parameters:t.inputSchema}}))})});
  if(!response.ok){const detail=await response.text().catch(()=>"");throw new Error(`Provider request failed (${response.status}): ${detail.slice(0,500)}`);}
  if(!response.body) throw new Error("Provider returned an empty response body");
  const reader=response.body.getReader(); const decoder=new TextDecoder(); let buffer="";
  try { while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split("\n");buffer=lines.pop()??"";for(const line of lines){const trimmed=line.trim();if(!trimmed.startsWith("data:"))continue;const payload=trimmed.slice(5).trim();if(payload==="[DONE]")return;let chunk:any;try{chunk=JSON.parse(payload);}catch{continue;}const delta=chunk.choices?.[0]?.delta;if(delta?.content)yield {type:"text",text:delta.content};for(const tool of delta?.tool_calls??[]){if(tool.function?.name&&tool.function?.arguments){let args:unknown;try{args=JSON.parse(tool.function.arguments);}catch{throw new Error("Provider emitted malformed tool-call JSON");}yield {type:"tool_call",call:{id:tool.id??`call_${tool.index??0}`,name:tool.function.name,input:args}};}}}}}
  finally {reader.releaseLock();}
  yield {type:"done"};
 }
}function toOpenAIMessages(messages:ModelMessage[]):OpenAIMessage[]{
 const result:OpenAIMessage[]=[];
 for(const message of messages){
  if(message.role==="tool"){
   if(!message.toolCallId)throw new Error("Tool messages require a toolCallId");
   result.push({role:"tool",content:message.content,tool_call_id:message.toolCallId,...(message.name?{name:message.name}:{})});
  }else if(message.role==="assistant"&&message.toolCalls?.length){
   result.push({role:"assistant",content:message.content||null,tool_calls:message.toolCalls.map(call=>({id:call.id,type:"function",function:{name:call.name,arguments:JSON.stringify(call.input)}}))});
  }else result.push({role:message.role,content:message.content});
 }
 return result;
}
export class OpenAICompatibleProvider implements ModelProvider {
 readonly id="openai-compatible";
 constructor(private readonly options:{baseUrl:string;apiKey?:string;headers?:Record<string,string>;fetcher?:typeof fetch}) {}
 async *stream(request:ModelRequest):AsyncIterable<ModelEvent> {
  const fetcher=this.options.fetcher??fetch;
  const response=await fetcher(`${this.options.baseUrl.replace(/\/$/,"")}/chat/completions`,{method:"POST",signal:request.signal,headers:{"content-type":"application/json",...(this.options.apiKey?{authorization:`Bearer ${this.options.apiKey}`}:{}),...this.options.headers},body:JSON.stringify({model:request.model,stream:true,messages:request.messages.map(({role,content,name,toolCallId})=>({role,content,...(name?{name}:{}),...(toolCallId?{tool_call_id:toolCallId}:{})})),tools:request.tools.map(t=>({type:"function",function:{name:t.name,description:t.description,parameters:t.inputSchema}}))})});
  if(!response.ok){const detail=await response.text().catch(()=>"");throw new Error(`Provider request failed (${response.status}): ${detail.slice(0,500)}`);}
  if(!response.body) throw new Error("Provider returned an empty response body");
  const reader=response.body.getReader(); const decoder=new TextDecoder(); let buffer="";
  try { while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split("\n");buffer=lines.pop()??"";for(const line of lines){const trimmed=line.trim();if(!trimmed.startsWith("data:"))continue;const payload=trimmed.slice(5).trim();if(payload==="[DONE]")return;let chunk:any;try{chunk=JSON.parse(payload);}catch{continue;}const delta=chunk.choices?.[0]?.delta;if(delta?.content)yield {type:"text",text:delta.content};for(const tool of delta?.tool_calls??[]){if(tool.function?.name&&tool.function?.arguments){let args:unknown;try{args=JSON.parse(tool.function.arguments);}catch{throw new Error("Provider emitted malformed tool-call JSON");}yield {type:"tool_call",call:{id:tool.id??`call_${tool.index??0}`,name:tool.function.name,input:args}};}}}}}
  finally {reader.releaseLock();}
  yield {type:"done"};
 }
}
