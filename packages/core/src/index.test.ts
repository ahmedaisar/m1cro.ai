import { describe, expect, it, vi } from "vitest";
import { AgentRuntime, type ApprovalController } from "./index.js";
import { DefaultPolicy } from "@m1cro/policy";
import { ToolRegistry } from "@m1cro/tools";
import type { ModelProvider } from "@m1cro/providers";
import type { ModelRequest } from "@m1cro/protocol";

const basicProvider:ModelProvider={
  id:"fixture",
  async *stream(_request:ModelRequest){yield {type:"text",text:"hello"} as const;yield {type:"done"} as const;}
};
describe("AgentRuntime",()=>{
  it("streams text and a completed terminal state",async()=>{
    const runtime=new AgentRuntime({provider:basicProvider,tools:new ToolRegistry(),policy:new DefaultPolicy(),model:"fixture-model"});
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
  it("executes a write tool only after an explicit user approval",async()=>{
    const tools=new ToolRegistry();const execute=vi.fn(async()=>({saved:true}));
    tools.register({name:"write_file",description:"write",risk:"write",inputSchema:{type:"object",properties:{path:{type:"string"}},required:["path"],additionalProperties:false},parse:(v)=>v as {path:string},execute});
    const approval:ApprovalController={request:async()=>({decision:"approve",actor:"user"})};
    const provider:ModelProvider={id:"tool",async *stream(){yield {type:"tool_call",call:{id:"c1",name:"write_file",input:{path:"a.txt"}}} as const;yield {type:"done"} as const;}};
    const runtime=new AgentRuntime({provider,tools,policy:new DefaultPolicy(),model:"fixture",approval});
    const events=[];for await(const event of runtime.run({sessionId:"s3",prompt:"save"}))events.push(event);
    expect(execute).toHaveBeenCalledOnce();
    expect(events).toContainEqual(expect.objectContaining({type:"approval.resolved",callId:"c1",decision:"approved",actor:"user"}));
  });
  it("never executes a write tool without an approval controller",async()=>{
    const tools=new ToolRegistry();const execute=vi.fn(async()=>({saved:true}));
    tools.register({name:"write_file",description:"write",risk:"write",inputSchema:{type:"object",properties:{path:{type:"string"}},required:["path"],additionalProperties:false},parse:(v)=>v as {path:string},execute});
    const provider:ModelProvider={id:"tool",async *stream(){yield {type:"tool_call",call:{id:"c2",name:"write_file",input:{path:"a.txt"}}} as const;yield {type:"done"} as const;}};
    const runtime=new AgentRuntime({provider,tools,policy:new DefaultPolicy(),model:"fixture"});
    const events=[];for await(const event of runtime.run({sessionId:"s4",prompt:"save"}))events.push(event);
    expect(execute).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({type:"turn.status",status:"failed"});
  });
  it("does not execute a tool whose input fails JSON Schema validation",async()=>{
    const tools=new ToolRegistry();const execute=vi.fn(async()=>({saved:true}));
    tools.register({name:"write_file",description:"write",risk:"read",inputSchema:{type:"object",properties:{path:{type:"string"}},required:["path"],additionalProperties:false},parse:(v)=>v as {path:string},execute});
    const provider:ModelProvider={id:"tool",async *stream(){yield {type:"tool_call",call:{id:"c3",name:"write_file",input:{path:42}}} as const;yield {type:"done"} as const;}};
    const runtime=new AgentRuntime({provider,tools,policy:new DefaultPolicy(),model:"fixture"});
    const events=[];for await(const event of runtime.run({sessionId:"s5",prompt:"save"}))events.push(event);
    expect(execute).not.toHaveBeenCalled();
    expect(events).toContainEqual(expect.objectContaining({type:"tool.result",callId:"c3",isError:true}));
  });
  it("records rejection and continues without executing the tool",async()=>{
    const tools=new ToolRegistry();const execute=vi.fn(async()=>({saved:true}));
    tools.register({name:"write_file",description:"write",risk:"write",inputSchema:{type:"object"},parse:(v)=>v,execute});
    const approval:ApprovalController={request:async()=>({decision:"reject",actor:"user",reason:"Not now"})};
    const provider:ModelProvider={id:"tool",async *stream(){yield {type:"tool_call",call:{id:"c4",name:"write_file",input:{}}} as const;yield {type:"done"} as const;}};
    const runtime=new AgentRuntime({provider,tools,policy:new DefaultPolicy(),model:"fixture",approval});
    const events=[];for await(const event of runtime.run({sessionId:"s6",prompt:"save"}))events.push(event);
    expect(execute).not.toHaveBeenCalled();
    expect(events).toContainEqual(expect.objectContaining({type:"approval.resolved",callId:"c4",decision:"rejected"}));
  });
  it("persists messages and restores history in a later turn",async()=>{
    const records:Array<{id:string;timestamp:string;kind:"message"|"event";data:unknown}>=[];
    const sessionStore={
      append:async(_sessionId:string,record:typeof records[number])=>{records.push(record);},
      read:async()=>records
    };
    let seenMessages:ModelRequest["messages"]=[];
    const capturingProvider:ModelProvider={id:"history",async *stream(request){seenMessages=request.messages;yield {type:"text",text:"second"} as const;yield {type:"done"} as const;}};
    const runtime=new AgentRuntime({provider:capturingProvider,tools:new ToolRegistry(),policy:new DefaultPolicy(),model:"fixture",sessionStore});
    for await(const _ of runtime.run({sessionId:"history",prompt:"first"}))void _;
    // Seed a prior assistant reply to make the restored conversational context explicit.
    await sessionStore.append("history",{id:"prior",timestamp:new Date().toISOString(),kind:"message",data:{role:"assistant",content:"first reply"}});
    for await(const _ of runtime.run({sessionId:"history",prompt:"second question"}))void _;
    expect(seenMessages).toEqual([
      {role:"user",content:"first"},
      {role:"assistant",content:"first reply"},
      {role:"user",content:"second question"}
    ]);
  });

});
