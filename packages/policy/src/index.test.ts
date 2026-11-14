import { describe, expect, it } from "vitest";
import { DefaultPolicy } from "./index.js";
describe("DefaultPolicy",()=>{
 const policy=new DefaultPolicy();
 it("allows read-only tools",()=>expect(policy.evaluate({toolName:"read_file",risk:"read",input:{}})).toBe("allow"));
 it.each(["write","destructive","network","execute"] as const)("requires approval for %s risk",(risk)=>expect(policy.evaluate({toolName:"action",risk,input:{}})).toBe("approve"));
});
