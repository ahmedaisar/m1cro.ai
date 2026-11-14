import {createInterface} from "node:readline/promises";
import {stdin,stdout} from "node:process";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {randomUUID} from "node:crypto";
import {AgentRuntime,type ApprovalController} from "@m1cro/core";
import {DefaultPolicy} from "@m1cro/policy";
import {OpenAICompatibleProvider} from "@m1cro/providers";
import {JsonlSessionStore} from "@m1cro/sessions";
import {registerFilesystemTools,ToolRegistry,Workspace} from "@m1cro/tools";

type Config={baseUrl:string;model:string;apiKey?:string};
type Args={prompt:string[];workspace:string;session?:string;model?:string;baseUrl?:string;help:boolean};
const defaultConfig:Config={baseUrl:"https://api.openai.com/v1",model:"gpt-4o-mini"};
function parseArgs(argv:string[]):Args{
 const parsed:Args={prompt:[],workspace:process.cwd(),help:false};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i]!;
  if(arg==="--help"||arg==="-h")parsed.help=true;
  else if(arg==="--workspace"){const value=argv[++i];if(value===undefined||!value.trim())throw new Error("--workspace requires a directory");parsed.workspace=value;}
  else if(arg==="--session"){const value=argv[++i];if(value===undefined)throw new Error("--session requires an ID");parsed.session=value;}
  else if(arg==="--model"){const value=argv[++i];if(value===undefined||!value.trim())throw new Error("--model requires a model ID");parsed.model=value;}
  else if(arg==="--base-url"){const value=argv[++i];if(value===undefined||!value.trim())throw new Error("--base-url requires a URL");parsed.baseUrl=value;}
  else if(arg.startsWith("-"))throw new Error(`Unknown option: ${arg}`);
  else parsed.prompt.push(arg);
 }
 if(!parsed.workspace)throw new Error("--workspace requires a directory");
 if(parsed.session&&!/^[A-Za-z0-9_-]{1,80}$/.test(parsed.session))throw new Error("Invalid session ID");
 return parsed;
}
function help():string{
 return `m1cro — local-first AI engineering workspace

Usage:
  m1cro [options] [prompt...]

Options:
  --workspace <dir>  Workspace root (default: current directory)
  --session <id>     Resume an existing local session ID
  --model <id>       OpenAI-compatible model identifier
  --base-url <url>   API base URL (default: OpenAI)
  -h, --help         Show this help

Configuration:
  OPENAI_API_KEY     Provider API key (required unless set in local config)
  M1CRO_MODEL        Default model override
  OPENAI_BASE_URL    Default API base URL override

Interactive commands:
  /help, /exit, /quit

Writes, network calls and execution tools are never authorized by model output.
Filesystem write tools trigger an explicit terminal approval prompt.
`;
}
async function loadConfig():Promise<Config>{
 const dir=path.join(os.homedir(),".m1cro"),file=path.join(dir,"config.json");
 try{
  const parsed=JSON.parse(await readFile(file,"utf8")) as Partial<Config>;
  return {baseUrl:parsed.baseUrl??defaultConfig.baseUrl,model:parsed.model??defaultConfig.model,...(parsed.apiKey?{apiKey:parsed.apiKey}:{})};
 }catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw new Error("Could not read ~/.m1cro/config.json");return defaultConfig;}
}
async function saveConfig(config:Config):Promise<void>{
 const dir=path.join(os.homedir(),".m1cro");
 await mkdir(dir,{recursive:true,mode:0o700});
 const file=path.join(dir,"config.json");
 await writeFile(file,JSON.stringify(config,null,2)+"\n",{encoding:"utf8",mode:0o600});
}
async function approvalPrompt(request:Parameters<ApprovalController["request"]>[0],signal:AbortSignal):Promise<Awaited<ReturnType<ApprovalController["request"]>>>{
 if(!stdin.isTTY||!stdout.isTTY)return {decision:"reject",actor:"user",reason:"Interactive approval requires a TTY"};
 const rl=createInterface({input:stdin,output:stdout});
 try{
  const safeInput=JSON.stringify(request.input,null,2);
  stdout.write(`\nApproval required\nTool: ${request.toolName}\nRisk: ${request.risk}\nInput: ${safeInput.length>2000?safeInput.slice(0,2000)+"… (truncated)":safeInput}\n`);
  signal.throwIfAborted();
  const answer=await rl.question("Approve this exact tool call? [y/N] ");
  signal.throwIfAborted();
  return answer.trim().toLowerCase()==="y"?{decision:"approve",actor:"user"}:{decision:"reject",actor:"user",reason:"User declined"};
 }finally{rl.close();}
}
function formatEvent(event:Awaited<ReturnType<AgentRuntime["run"]>> extends AsyncIterable<infer T>?T:never):void{
 if(event.type==="text.delta")stdout.write(event.delta);
 else if(event.type==="tool.call")stdout.write(`\n[tool] ${event.toolName}\n`);
 else if(event.type==="tool.result")stdout.write(`\n[tool result] ${event.isError?"error":"ok"}\n`);
 else if(event.type==="turn.status"&&(event.status==="failed"||event.status==="cancelled"))stdout.write(`\n[turn ${event.status}] ${event.reason??""}\n`);
}
export async function runCli(argv=process.argv.slice(2)):Promise<number>{
 let args:Args;
 try{args=parseArgs(argv);}catch(error){console.error(error instanceof Error?error.message:String(error));return 2;}
 if(args.help){stdout.write(help());return 0;}
 let config:Config;
 try{config=await loadConfig();}catch(error){console.error(error instanceof Error?error.message:String(error));return 2;}
 const merged:Config={
  baseUrl:args.baseUrl??process.env.OPENAI_BASE_URL??config.baseUrl,
  model:args.model??process.env.M1CRO_MODEL??config.model,
  ...((process.env.OPENAI_API_KEY??config.apiKey)?{apiKey:process.env.OPENAI_API_KEY??config.apiKey}:{})
 };
 if(!merged.apiKey){
  if(!stdin.isTTY||!stdout.isTTY){console.error("Set OPENAI_API_KEY or configure ~/.m1cro/config.json before running non-interactively.");return 2;}
  const rl=createInterface({input:stdin,output:stdout});
  try{
   merged.apiKey=(await rl.question("OpenAI-compatible API key (input is visible in this terminal): ")).trim();
  }finally{rl.close();}
  if(!merged.apiKey){console.error("An API key is required.");return 2;}
  try{await saveConfig(merged);}catch(error){console.error(error instanceof Error?error.message:String(error));return 2;}
 }
 if(!/^https?:\/\//i.test(merged.baseUrl)){console.error("Provider base URL must use http or https.");return 2;}
 const base=path.join(os.homedir(),".m1cro"),sessions=path.join(base,"sessions");
 try{await mkdir(sessions,{recursive:true,mode:0o700});}catch(error){console.error("Could not prepare local session storage.");return 2;}
 const sessionId=args.session??randomUUID().replace(/-/g,"");
 const sessionStore=new JsonlSessionStore(id=>path.join(sessions,`${id}.jsonl`));
 const tools=new ToolRegistry();
 registerFilesystemTools(tools,new Workspace({root:path.resolve(args.workspace)}));
 const provider=new OpenAICompatibleProvider({baseUrl:merged.baseUrl,apiKey:merged.apiKey});
 const approval:ApprovalController={request:approvalPrompt};
 const runtime=new AgentRuntime({provider,tools,policy:new DefaultPolicy(),model:merged.model,approval,sessionStore});
 stdout.write(`m1cro.ai · model ${merged.model}\nWorkspace: ${path.resolve(args.workspace)}\nSession: ${sessionId}\nType /help for commands.\n\n`);
 if(args.prompt.length){
  const prompt=args.prompt.join(" ");
  for await(const event of runtime.run({sessionId,prompt}))formatEvent(event);
  stdout.write("\n");
  if(!stdin.isTTY||!stdout.isTTY)return 0;
 }
 if(!stdin.isTTY||!stdout.isTTY)return 0;
 const rl=createInterface({input:stdin,output:stdout});
 try{
  while(true){
   const prompt=(await rl.question("\nyou › ")).trim();
   if(!prompt)continue;
   if(prompt==="/exit"||prompt==="/quit")break;
   if(prompt==="/help"){stdout.write("Enter a prompt. /exit or /quit closes m1cro. /help repeats this message.\n");continue;}
   if(prompt.startsWith("/")){stdout.write("Unknown command. Type /help.\n");continue;}
   try{for await(const event of runtime.run({sessionId,prompt}))formatEvent(event);stdout.write("\n");}
   catch(error){stdout.write(`\n[error] ${error instanceof Error?error.message:String(error)}\n`);}
  }
 }finally{rl.close();}
 return 0;
}
