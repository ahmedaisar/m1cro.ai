import {describe,expect,it,vi} from "vitest";
import {registerFilesystemTools,ToolRegistry,Workspace} from "./index.js";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
describe("filesystem built-ins",()=>{
 it("registers read/write/list/search tools with correct risk classes",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"m1cro-builtins-"));
  try{
   const registry=new ToolRegistry();registerFilesystemTools(registry,new Workspace({root}));
   expect(registry.list().map(t=>[t.name,t.risk])).toEqual([["read_file","read"],["write_file","write"],["list_files","read"],["search_files","read"]]);
   expect(()=>registry.validateInput("write_file",{path:"x"})).toThrow();
   expect(()=>registry.validateInput("read_file",{path:"x",extra:true})).toThrow();
  }finally{await rm(root,{recursive:true,force:true});}
 });
});
