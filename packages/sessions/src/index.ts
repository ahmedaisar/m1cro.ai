import { mkdir,appendFile,readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
export interface SessionRecord { id:string; timestamp:string; kind:"message"|"event"; data:unknown }
export interface SessionStore { append(sessionId:string,record:SessionRecord):Promise<void>; read(sessionId:string):Promise<SessionRecord[]> }
/** Append-only JSONL adapter. Host must constrain fileForSession to a product-owned directory. */
export class JsonlSessionStore implements SessionStore {
 constructor(private readonly fileForSession:(sessionId:string)=>string){}
 private pathFor(sessionId:string):string{
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(sessionId))throw new Error("Invalid session ID");
  const path=resolve(this.fileForSession(sessionId));
  if(!path.endsWith(`${sessionId}.jsonl`))throw new Error("Session file path must end with the session ID and .jsonl");
  return path;
 }
 async append(sessionId:string,record:SessionRecord):Promise<void>{const path=this.pathFor(sessionId);await mkdir(dirname(path),{recursive:true,mode:0o700});await appendFile(path,`${JSON.stringify(record)}\n`,{encoding:"utf8",mode:0o600});}
 async read(sessionId:string):Promise<SessionRecord[]>{try{const raw=await readFile(this.pathFor(sessionId),"utf8");return raw.split("\n").filter(Boolean).map(line=>JSON.parse(line) as SessionRecord);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return[];throw error;}}
}
