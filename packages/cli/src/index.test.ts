import {describe,expect,it} from "vitest";
import {createProvider,runCli,runPrompt} from "./index.js";
import type {AgentRuntime} from "@m1cro/core";
describe("CLI",()=>{
 it("prints help without requiring credentials",async()=>{
  const original=process.argv;
  expect(await runCli(["--help"])).toBe(0);
  process.argv=original;
 });
 it("documents provider selection without requiring credentials",async()=>{\n  const original=process.env.OPENAI_API_KEY;\n  delete process.env.OPENAI_API_KEY;\n  try{expect(await runCli(["--help"])).toBe(0);}\n  finally{if(original!==undefined)process.env.OPENAI_API_KEY=original;}\n });\n it("rejects unsupported provider values",async()=>{\n  expect(await runCli(["--provider","unknown"])).toBe(2);\n });\n it("rejects unknown CLI options",async()=>{
  expect(await runCli(["--not-an-option"])).toBe(2);
 });
 it("requires an environment API key instead of prompting or persisting one",async()=>{
  const original=process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try{expect(await runCli(["hello"])).toBe(2);}
  finally{if(original===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=original;}
 });
 it("creates provider adapters with the configured base URL and without requiring a key for Ollama",()=>{\n  expect(createProvider("openai-compatible","https://api.example/v1","key").id).toBe("openai-compatible");\n  expect(createProvider("anthropic","https://api.anthropic.com","key").id).toBe("anthropic");\n  expect(createProvider("ollama","http://127.0.0.1:11434").id).toBe("ollama");\n });\n it("returns a failing exit code when a non-interactive turn fails",async()=>{
  const runtime={async *run(){yield {type:"turn.status",turnId:"t1",status:"failed",reason:"provider unavailable"} as const;}} as unknown as AgentRuntime;
  expect(await runPrompt(runtime,"s1","hello")).toBe(1);
 });
 it("rejects invalid session identifiers before touching the filesystem",async()=>{
  expect(await runCli(["--session","../bad"])).toBe(2);
 });
});
