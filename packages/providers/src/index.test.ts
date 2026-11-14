import {describe,expect,it,vi} from "vitest";
import {OpenAICompatibleProvider,ProviderHttpError} from "./index.js";
import type {ModelRequest} from "@m1cro/protocol";
const req=(signal=new AbortController().signal):ModelRequest=>({model:"fixture",messages:[{role:"user",content:"hi"}],tools:[{name:"write_file",description:"write",inputSchema:{type:"object"}}],signal});
function sse(chunks:string[]):Response{
 const body=new ReadableStream<Uint8Array>({start(controller){for(const chunk of chunks)controller.enqueue(new TextEncoder().encode(chunk));controller.close();}});
 return new Response(body,{status:200,headers:{"content-type":"text/event-stream"}});
}
describe("OpenAICompatibleProvider",()=>{
 it("assembles fragmented tool id, name and arguments across SSE deltas",async()=>{
  const fetcher=vi.fn(async()=>sse([
   'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_","function":{"name":"write_","arguments":"{\\"path\\""}}]}}]}\n\n',
   'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"file","arguments":":\\"a.txt\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
   'data: [DONE]\n\n'
  ]));
  const provider=new OpenAICompatibleProvider({baseUrl:"https://provider.test/v1",fetcher});
  const events=[];for await(const event of provider.stream(req()))events.push(event);
  expect(events).toContainEqual({type:"tool_call",call:{id:"call_1",name:"write_file",input:{path:"a.txt"}}});
  expect(events.at(-1)).toEqual({type:"done"});
 });
 it("retries a transient 429 and honours retry-after",async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response("limited",{status:429,headers:{"retry-after":"0"}})).mockResolvedValueOnce(sse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n']));
  const provider=new OpenAICompatibleProvider({baseUrl:"https://provider.test/v1",fetcher,maxRetries:1,retryBaseDelayMs:0});
  const events=[];for await(const event of provider.stream(req()))events.push(event);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(events).toContainEqual({type:"text",text:"ok"});
 });
 it("does not retry a permanent 400 response",async()=>{
  const fetcher=vi.fn(async()=>new Response("bad request",{status:400}));
  const provider=new OpenAICompatibleProvider({baseUrl:"https://provider.test/v1",fetcher,maxRetries:3,retryBaseDelayMs:0});
  await expect(async()=>{for await(const _ of provider.stream(req()))void _;}).rejects.toBeInstanceOf(ProviderHttpError);
  expect(fetcher).toHaveBeenCalledOnce();
 });
 it("serializes assistant tool call and tool result messages with OpenAI-compatible fields",async()=>{
  const fetcher=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));expect(body.messages).toEqual([{role:"assistant",content:null},{role:"tool",content:"{\"ok\":true}",tool_call_id:"c1",name:"read_file"}]);return sse(['data: [DONE]\n\n']);});
  const provider=new OpenAICompatibleProvider({baseUrl:"https://provider.test/v1",fetcher});
  const request={...req(),messages:[{role:"assistant",content:null} as never,{role:"tool",content:"{\"ok\":true}",toolCallId:"c1",name:"read_file"}]};
  for await(const _ of provider.stream(request))void _;
 });
});
