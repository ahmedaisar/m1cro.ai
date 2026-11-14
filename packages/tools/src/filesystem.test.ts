import {mkdtemp,mkdir,symlink,writeFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {Workspace,WorkspacePathError} from "./filesystem.js";
let root:string;
afterEach(async()=>{if(root)await rm(root,{recursive:true,force:true});});
describe("Workspace",()=>{
 it("reads, writes and lists files inside the workspace",async()=>{
  root=await mkdtemp(path.join(os.tmpdir(),"m1cro-workspace-"));const ws=new Workspace({root});
  await ws.writeFile("src/hello.txt","hello world");
  expect(await ws.readFile("src/hello.txt")).toBe("hello world");
  expect(await ws.list("src")).toEqual([{path:"src/hello.txt",type:"file",size:11}]);
 });
 it("rejects traversal and absolute paths",async()=>{
  root=await mkdtemp(path.join(os.tmpdir(),"m1cro-workspace-"));const ws=new Workspace({root});
  await expect(ws.readFile("../outside.txt")).rejects.toBeInstanceOf(WorkspacePathError);
  await expect(ws.readFile(path.join(root,"secret.txt"))).rejects.toBeInstanceOf(WorkspacePathError);
 });
 it("rejects symlinks that point outside the workspace",async()=>{
  root=await mkdtemp(path.join(os.tmpdir(),"m1cro-workspace-"));
  const outside=await mkdtemp(path.join(os.tmpdir(),"m1cro-outside-"));
  try{
   await writeFile(path.join(outside,"secret.txt"),"secret");
   await symlink(outside,path.join(root,"linked"));
   const ws=new Workspace({root});
   await expect(ws.readFile("linked/secret.txt")).rejects.toBeTruthy();
   await expect(ws.writeFile("linked/new.txt","bad")).rejects.toBeTruthy();
  }finally{await rm(outside,{recursive:true,force:true});}
 });
 it("enforces read and write size limits",async()=>{
  root=await mkdtemp(path.join(os.tmpdir(),"m1cro-workspace-"));const ws=new Workspace({root,maxReadBytes:3,maxWriteBytes:3});
  await expect(ws.writeFile("long.txt","four")).rejects.toBeInstanceOf(WorkspacePathError);
  await writeFile(path.join(root,"long.txt"),"four");
  await expect(ws.readFile("long.txt")).rejects.toBeInstanceOf(WorkspacePathError);
 });
 it("searches text while skipping dependency and VCS directories",async()=>{
  root=await mkdtemp(path.join(os.tmpdir(),"m1cro-workspace-"));const ws=new Workspace({root});
  await mkdir(path.join(root,"src"));await mkdir(path.join(root,"node_modules"),{recursive:true});
  await writeFile(path.join(root,"src","a.ts"),"first\nneedle here\nthird");
  await writeFile(path.join(root,"node_modules","ignore.txt"),"needle hidden");
  expect(await ws.search("needle")).toEqual([{path:"src/a.ts",line:2,content:"needle here"}]);
 });
 it("creates missing nested parent directories without leaving the workspace",async()=>{
  root=await mkdtemp(path.join(os.tmpdir(),"m1cro-workspace-"));
  const ws=new Workspace({root});
  await ws.writeFile("new/deep/file.txt","nested");
  expect(await ws.readFile("new/deep/file.txt")).toBe("nested");
 });

});
