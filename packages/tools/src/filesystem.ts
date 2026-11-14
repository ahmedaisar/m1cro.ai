import {promises as fs} from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";

export class WorkspacePathError extends Error {
 constructor(message:string){super(message);this.name="WorkspacePathError";}
}
export interface WorkspaceOptions {root:string;maxReadBytes?:number;maxWriteBytes?:number}
export class Workspace {
 readonly root:string;
 readonly maxReadBytes:number;
 readonly maxWriteBytes:number;
 constructor(options:WorkspaceOptions){
  this.root=path.resolve(options.root);
  this.maxReadBytes=options.maxReadBytes??2*1024*1024;
  this.maxWriteBytes=options.maxWriteBytes??2*1024*1024;
 }
 async resolve(relativePath:string,options:{allowMissingLeaf?:boolean}={}):Promise<string>{
  if(typeof relativePath!=="string"||!relativePath.trim())throw new WorkspacePathError("Path must be a non-empty string");
  if(path.isAbsolute(relativePath))throw new WorkspacePathError("Absolute paths are not allowed");
  const candidate=path.resolve(this.root,relativePath);
  if(candidate!==this.root&&!candidate.startsWith(this.root+path.sep))throw new WorkspacePathError("Path escapes workspace root");
  const rootReal=await fs.realpath(this.root);
  let current=path.parse(candidate).root;
  const rel=path.relative(current,candidate).split(path.sep).filter(Boolean);
  for(let i=0;i<rel.length;i++){
   current=path.join(current,rel[i]!);
   const isLeaf=i===rel.length-1;
   try{
    const stat=await fs.lstat(current);
    if(stat.isSymbolicLink())throw new WorkspacePathError("Symbolic links are not permitted in workspace paths");
    const real=await fs.realpath(current);
    if(real!==rootReal&&!real.startsWith(rootReal+path.sep))throw new WorkspacePathError("Resolved path escapes workspace root");
    if(!isLeaf&&!stat.isDirectory())throw new WorkspacePathError("A parent path component is not a directory");
   }catch(error){
    if((error as NodeJS.ErrnoException).code==="ENOENT"&&options.allowMissingLeaf&&isLeaf)break;
    throw error;
   }
  }
  return candidate;
 }
 async readFile(relativePath:string):Promise<string>{
  const resolved=await this.resolve(relativePath);
  const stat=await fs.stat(resolved);
  if(!stat.isFile())throw new WorkspacePathError("Only regular files can be read");
  if(stat.size>this.maxReadBytes)throw new WorkspacePathError("File exceeds maximum read size");
  return fs.readFile(resolved,"utf8");
 }
 async writeFile(relativePath:string,content:string):Promise<{bytes:number}>{
  const bytes=Buffer.byteLength(content,"utf8");
  if(bytes>this.maxWriteBytes)throw new WorkspacePathError("Content exceeds maximum write size");
  const candidate=path.resolve(this.root,relativePath);
  if(candidate!==this.root&&!candidate.startsWith(this.root+path.sep))throw new WorkspacePathError("Path escapes workspace root");
  const relativeParent=path.relative(this.root,path.dirname(candidate));
  const parentParts=relativeParent?relativeParent.split(path.sep):[];
  let current=this.root;
  for(const part of parentParts){
   current=path.join(current,part);
   try{
    const stat=await fs.lstat(current);
    if(stat.isSymbolicLink()||!stat.isDirectory())throw new WorkspacePathError("Parent directory is not a safe workspace directory");
   }catch(error){
    if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
    await fs.mkdir(current,{mode:0o700});
   }
  }
  const parent=path.dirname(candidate);
  // Re-check all path components and the leaf after creating missing parents.
  const checked=await this.resolve(relativePath,{allowMissingLeaf:true});
  const resolved=checked;
  if(checked!==resolved)throw new WorkspacePathError("Path changed during write");
  const temp=path.join(parent,`.m1cro-${randomUUID()}.tmp`);
  try{
   const handle=await fs.open(temp,"wx",0o600);
   try{await handle.writeFile(content,"utf8");await handle.sync();}finally{await handle.close();}
   await fs.rename(temp,resolved);
  }catch(error){await fs.rm(temp,{force:true}).catch(()=>undefined);throw error;}
  return {bytes};
 }
 async list(relativePath="."):Promise<Array<{path:string;type:"file"|"directory";size:number}>>{
  const resolved=await this.resolve(relativePath);
  const entries=await fs.readdir(resolved,{withFileTypes:true});
  const results=[];
  for(const entry of entries){
   if(entry.isSymbolicLink())continue;
   const child=path.join(resolved,entry.name);
   const stat=await fs.lstat(child);
   if(stat.isSymbolicLink())continue;
   results.push({path:path.relative(this.root,child).split(path.sep).join("/"),type:entry.isDirectory()?("directory" as const):("file" as const),size:entry.isFile()?stat.size:0});
  }
  return results.sort((a,b)=>a.path.localeCompare(b.path));
 }
 async search(query:string,options:{glob?:string;maxResults?:number}={}):Promise<Array<{path:string;line:number;content:string}>>{
  if(!query)throw new Error("Search query must not be empty");
  const maxResults=Math.min(Math.max(options.maxResults??100,1),500);
  const matches:Array<{path:string;line:number;content:string}>=[];
  const walk=async(dir:string):Promise<void>=>{
   if(matches.length>=maxResults)return;
   for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    if(matches.length>=maxResults)return;
    if(entry.name==="node_modules"||entry.name===".git"||entry.name==="dist")continue;
    if(entry.isSymbolicLink())continue;
    const full=path.join(dir,entry.name);
    const stat=await fs.lstat(full);
    if(stat.isSymbolicLink())continue;
    const rel=path.relative(this.root,full).split(path.sep).join("/");
    if(options.glob&&!globToRegExp(options.glob).test(rel))continue;
    if(stat.isDirectory()){await walk(full);continue;}
    if(!stat.isFile()||stat.size>this.maxReadBytes)continue;
    const text=await fs.readFile(full,"utf8");
    if(text.includes("\0"))continue;
    const lines=text.split(/\r?\n/);
    for(let i=0;i<lines.length&&matches.length<maxResults;i++){
     if(lines[i]!.includes(query))matches.push({path:rel,line:i+1,content:lines[i]!.slice(0,500)});
    }
   }
  };
  await walk(this.root);return matches;
 }
}
function globToRegExp(glob:string):RegExp{
 const escaped=glob.replace(/[.+^$()|[\]{}\\]/g,"\\$&").replace(/\*\*/g,"§").replace(/\*/g,"[^/]*").replace(/§/g,".*").replace(/\?/g,"[^/]");
 return new RegExp(`^${escaped}$`);
}
