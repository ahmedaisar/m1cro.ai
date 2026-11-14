import type {ToolRegistry} from "./index.js";
import {Workspace} from "./filesystem.js";
export function registerFilesystemTools(registry:ToolRegistry,workspace:Workspace):void{
 registry.register({
  name:"read_file",description:"Read a UTF-8 text file relative to the configured workspace root.",
  risk:"read",inputSchema:{type:"object",properties:{path:{type:"string",minLength:1}},required:["path"],additionalProperties:false},
  parse:(input)=>input as {path:string},execute:({path})=>workspace.readFile(path)
 });
 registry.register({
  name:"write_file",description:"Create or replace a UTF-8 text file relative to the configured workspace root.",
  risk:"write",inputSchema:{type:"object",properties:{path:{type:"string",minLength:1},content:{type:"string"}},required:["path","content"],additionalProperties:false},
  parse:(input)=>input as {path:string;content:string},execute:({path,content})=>workspace.writeFile(path,content)
 });
 registry.register({
  name:"list_files",description:"List direct children of a workspace directory.",
  risk:"read",inputSchema:{type:"object",properties:{path:{type:"string"}},additionalProperties:false},
  parse:(input)=>input as {path?:string},execute:({path="."})=>workspace.list(path)
 });
 registry.register({
  name:"search_files",description:"Search text in workspace files, optionally filtered by a glob.",
  risk:"read",inputSchema:{type:"object",properties:{query:{type:"string",minLength:1},glob:{type:"string"},maxResults:{type:"integer",minimum:1,maximum:500}},required:["query"],additionalProperties:false},
  parse:(input)=>input as {query:string;glob?:string;maxResults?:number},execute:({query,glob,maxResults})=>workspace.search(query,{...(glob?{glob}:{}),...(maxResults?{maxResults}:{})})
 });
}
