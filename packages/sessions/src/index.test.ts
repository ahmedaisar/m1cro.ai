import {mkdtemp,readFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {JsonlSessionStore} from "./index.js";
let directory:string;
afterEach(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
describe("JsonlSessionStore",()=>{
 it("appends and reads records in order",async()=>{
  directory=await mkdtemp(path.join(os.tmpdir(),"m1cro-session-"));
  const store=new JsonlSessionStore(id=>path.join(directory,`${id}.jsonl`));
  await store.append("session_1",{id:"1",timestamp:"2026-01-01T00:00:00.000Z",kind:"message",data:{role:"user",content:"hello"}});
  await store.append("session_1",{id:"2",timestamp:"2026-01-01T00:00:01.000Z",kind:"event",data:{type:"turn.status",status:"completed"}});
  const records=await store.read("session_1");
  expect(records).toHaveLength(2);
  expect(records[0]?.id).toBe("1");
  expect(records[1]?.id).toBe("2");
 });
 it("rejects session IDs containing path syntax",async()=>{
  directory=await mkdtemp(path.join(os.tmpdir(),"m1cro-session-"));
  const store=new JsonlSessionStore(id=>path.join(directory,`${id}.jsonl`));
  await expect(store.read("../escape")).rejects.toThrow("Invalid session ID");
  await expect(store.append("bad/id",{id:"1",timestamp:"x",kind:"event",data:{}})).rejects.toThrow("Invalid session ID");
 });
 it("tightens existing session file and directory permissions",async()=>{
  if(process.platform==="win32")return;
  directory=await mkdtemp(path.join(os.tmpdir(),"m1cro-session-"));
  const fs=await import("node:fs/promises");
  const store=new JsonlSessionStore(id=>path.join(directory,id+".jsonl"));
  await store.append("private",{id:"1",timestamp:"x",kind:"event",data:{}});
  await fs.chmod(directory,0o755);
  await fs.chmod(path.join(directory,"private.jsonl"),0o644);
  await store.append("private",{id:"2",timestamp:"y",kind:"event",data:{}});
  expect((await fs.stat(directory)).mode&0o777).toBe(0o700);
  expect((await fs.stat(path.join(directory,"private.jsonl"))).mode&0o777).toBe(0o600);
 });
 it("rejects a symlinked session file",async()=>{
  directory=await mkdtemp(path.join(os.tmpdir(),"m1cro-session-"));
  const fs=await import("node:fs/promises");
  const outside=path.join(os.tmpdir(),"m1cro-outside-session.jsonl");
  try{
   await fs.writeFile(outside,"outside\n");
   await fs.symlink(outside,path.join(directory,"linked.jsonl"));
   const store=new JsonlSessionStore(id=>path.join(directory,id+".jsonl"));
   await expect(store.read("linked")).rejects.toBeTruthy();
   await expect(store.append("linked",{id:"1",timestamp:"x",kind:"event",data:{}})).rejects.toBeTruthy();
  }finally{await fs.rm(outside,{force:true});}
 });
 it("does not overwrite an existing session when appending",async()=>{
  directory=await mkdtemp(path.join(os.tmpdir(),"m1cro-session-"));
  const store=new JsonlSessionStore(id=>path.join(directory,`${id}.jsonl`));
  await store.append("stable",{id:"1",timestamp:"x",kind:"message",data:{role:"user",content:"a"}});
  await store.append("stable",{id:"2",timestamp:"y",kind:"message",data:{role:"assistant",content:"b"}});
  const raw=await readFile(path.join(directory,"stable.jsonl"),"utf8");
  expect(raw.split("\n").filter(Boolean)).toHaveLength(2);
 });
});
