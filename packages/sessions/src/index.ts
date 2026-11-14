import {constants} from "node:fs";
import {chmod,mkdir,open,lstat} from "node:fs/promises";
import {dirname,resolve} from "node:path";
export interface SessionRecord {id:string;timestamp:string;kind:"message"|"event";data:unknown}
export interface SessionStore {append(sessionId:string,record:SessionRecord):Promise<void>;read(sessionId:string):Promise<SessionRecord[]>}
/** Append-only JSONL adapter. Host must constrain fileForSession to a product-owned directory. */
export class JsonlSessionStore implements SessionStore {
 constructor(private readonly fileForSession:(sessionId:string)=>string){}
 private pathFor(sessionId:string):string{
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(sessionId))throw new Error("Invalid session ID");
  const file=resolve(this.fileForSession(sessionId));
  if(!file.endsWith(sessionId+".jsonl"))throw new Error("Session file path must end with the session ID and .jsonl");
  return file;
 }
 async append(sessionId:string,record:SessionRecord):Promise<void>{
  const file=this.pathFor(sessionId),directory=dirname(file);
  await mkdir(directory,{recursive:true,mode:0o700});
  const dirStat=await lstat(directory);
  if(dirStat.isSymbolicLink()||!dirStat.isDirectory())throw new Error("Session directory must be a real directory");
  await chmod(directory,0o700);
  try{
   const existing=await lstat(file);
   if(existing.isSymbolicLink()||!existing.isFile())throw new Error("Session file must be a regular file");
  }catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  const flags=constants.O_WRONLY|constants.O_CREAT|constants.O_APPEND|(constants.O_NOFOLLOW??0);
  const handle=await open(file,flags,0o600);
  try{
   const stat=await handle.stat();
   if(!stat.isFile())throw new Error("Session file must be a regular file");
   await handle.chmod(0o600);
   await handle.writeFile(JSON.stringify(record)+"\n","utf8");
   await handle.sync();
  }finally{await handle.close();}
 }
 async read(sessionId:string):Promise<SessionRecord[]>{
  const file=this.pathFor(sessionId);
  try{
   const directory=dirname(file);
   const dirStat=await lstat(directory);
   if(dirStat.isSymbolicLink()||!dirStat.isDirectory())throw new Error("Session directory must be a real directory");
   await chmod(directory,0o700);
   const flags=constants.O_RDONLY|(constants.O_NOFOLLOW??0);
   const handle=await open(file,flags);
   try{
    const stat=await handle.stat();
    if(!stat.isFile())throw new Error("Session file must be a regular file");
    await handle.chmod(0o600);
    const raw=await handle.readFile("utf8");
    return raw.split("\n").filter(Boolean).map(line=>JSON.parse(line) as SessionRecord);
   }finally{await handle.close();}
  }catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return[];throw error;}
 }
}
