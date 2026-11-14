import { describe, expect, it } from "vitest";
import { AgentRuntime } from "./index.js";
import { DefaultPolicy } from "@m1cro/policy";
import { ToolRegistry } from "@m1cro/tools";
import type { ModelProvider } from "@m1cro/providers";
import type { ModelRequest } from "@m1cro/protocol";
const provider:ModelProvider={id:"fixture",async *stream(_request:ModelRequest){yield {type:"text",text:"hello"} as const;yield {type:"done"} as const;}};
describe("AgentRuntime",()=>{
 it("streams text and a completed terminal state",async()=>{
  const runtime=new AgentRuntime({provider,tools:new ToolRegistry(),policy:new DefaultPolicy(),model:"fixture-model"});
  const events=[];for await(const event of runtime.run({sessionId:"s1",prompt:"say hello"}))events.push(event);
  expect(events.some(e=>e.type==="text.delta"&&e.delta==="hello")).toBe(true);
  expect(events.at(-1)).toMatchObject({type:"turn.status",status:"completed"});
 });
 it("propagates cancellation into a cancelled terminal state",async()=>{
  const controller=new AbortController();
  const cancelledProvider:ModelProvider={id:"cancel",async *stream(request){request.signal.throwIfAborted();yield {type:"done"} as const;}};
  controller.abort(new Error("stop"));
  const runtime=new AgentRuntime({provider:cancelledProvider,tools:new ToolRegistry(),policy:new DefaultPolicy(),model:"fixture"});
  const events=[];for await(const event of runtime.run({sessionId:"s2",prompt:"cancel",signal:controller.signal}))events.push(event);
  expect(events.at(-1)).toMatchObject({type:"turn.status",status:"cancelled"});
 });
});
