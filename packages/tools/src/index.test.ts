import { describe, expect, it, vi } from "vitest";
import { ToolInputValidationError, ToolRegistry } from "./index.js";
describe("ToolRegistry JSON Schema validation",()=>{
  it("rejects invalid inputs before tool execution",()=>{
    const registry=new ToolRegistry();
    registry.register({name:"echo",description:"echo",risk:"read",inputSchema:{type:"object",properties:{message:{type:"string"}},required:["message"],additionalProperties:false},parse:(value)=>value,execute:vi.fn(async(value)=>value)});
    expect(()=>registry.validateInput("echo",{message:3})).toThrow(ToolInputValidationError);
    expect(()=>registry.validateInput("echo",{message:"ok",unexpected:true})).toThrow(ToolInputValidationError);
  });
  it("accepts values matching the registered schema",()=>{
    const registry=new ToolRegistry();
    registry.register({name:"echo",description:"echo",risk:"read",inputSchema:{type:"object",properties:{message:{type:"string"}},required:["message"],additionalProperties:false},parse:(value)=>value,execute:vi.fn(async(value)=>value)});
    expect(()=>registry.validateInput("echo",{message:"ok"})).not.toThrow();
  });
});
