import {createInterface} from "node:readline/promises";
import {stdin,stdout} from "node:process";
import {chmod,lstat,mkdir,readFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {randomUUID} from "node:crypto";
import {AgentRuntime,type ApprovalController} from "@m1cro/core";
import {DefaultPolicy} from "@m1cro/policy";
import {AnthropicProvider,OpenAICompatibleProvider,OllamaProvider,type ModelProvider} from "@m1cro/providers";
import {JsonlSessionStore} from "@m1cro/sessions";
import {registerFilesystemTools,ToolRegistry,Workspace} from "@m1cro/tools";

type ProviderKind="openai-compatible"|"anthropic"|"ollama";
type Config={provider:ProviderKind;baseUrl:string;model:string};
type Args={prompt:string[];workspace:string;session?:string;model?:string;baseUrl?:string;provider?:ProviderKind;listModels:boolean;help:boolean};
const providerDefaults:Record<ProviderKind,{baseUrl:string;model:string}>={ "openai-compatible":{baseUrl:"https://api.openai.com/v1",model:"gpt-4o-mini"}, anthropic:{baseUrl:"https://api.anthropic.com",model:"claude-3-5-haiku-latest"}, ollama:{baseUrl:"http://127.0.0.1:11434",model:"llama3.2"} };
const defaultConfig:Config={provider:"openai-compatible",...providerDefaults["openai-compatible"]};
const isProviderKind=(value:string):value is ProviderKind=>value==="openai-compatible"||value==="anthropic"||value==="ollama";
export function createProvider(provider:ProviderKind,baseUrl:string,apiKey?:string):ModelProvider{ if(provider==="anthropic")return new AnthropicProvider({baseUrl,...(apiKey?{apiKey}:{})}); if(provider==="ollama")return new OllamaProvider({baseUrl}); return new OpenAICompatibleProvider({baseUrl,...(apiKey?{apiKey}:{})}); }
function parseArgs(argv:string[]):Args{
 const parsed:Args={prompt:[],workspace:process.cwd(),listModels:false,help:false};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i]!;
  if(arg==="--help"||arg==="-h")parsed.help=true;
  else if(arg==="--list-models")parsed.listModels=true;
  else if(arg==="--workspace"){const value=argv[++i];if(value===undefined||!value.trim())throw new Error("--workspace requires a directory");parsed.workspace=value;}
  else if(arg==="--session"){const value=argv[++i];if(value===undefined)throw new Error("--session requires an ID");parsed.session=value;}
  else if(arg==="--model"){const value=argv[++i];if(value===undefined||!value.trim())throw new Error("--model requires a model ID");parsed.model=value;}
  else if(arg==="--base-url"){const value=argv[++i];if(value===undefined||!value.trim())throw new Error("--base-url requires a URL");parsed.baseUrl=value;}
  else if(arg==="--provider"){const value=argv[++i];if(value===undefined||!isProviderKind(value))throw new Error("--provider must be openai-compatible, anthropic or ollama");parsed.provider=value;}
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
  --provider <id>    openai-compatible, anthropic or ollama
  --model <id>       Exact provider model identifier
  --base-url <url>   Provider API base URL
  --list-models      List models exposed by the selected provider
  -h, --help         Show this help

Configuration:
  OPENAI_API_KEY     OpenAI-compatible provider key
  ANTHROPIC_API_KEY  Anthropic provider key
  M1CRO_PROVIDER     Default provider (openai-compatible)
  M1CRO_MODEL        Exact provider model ID override
  M1CRO_BASE_URL     Generic provider base URL override
  OPENAI_BASE_URL / ANTHROPIC_BASE_URL / OLLAMA_BASE_URL  Provider-specific URL overrides

Interactive commands:
  /help, /exit, /quit

Writes, network calls and execution tools are never authorized by model output.
Filesystem write tools trigger an explicit terminal approval prompt.
`;
}
async function loadConfig():Promise<Config>{
 const dir=path.join(os.homedir(),".m1cro"),file=path.join(dir,"config.json");
 try{
  const parsed=JSON.parse(await readFile(file,"utf8")) as Partial<Config> & {apiKey?:unknown};
  if(typeof parsed.apiKey==="string"&&parsed.apiKey.length>0){
   throw new Error("Plaintext API keys in ~/.m1cro/config.json are not supported. Remove the apiKey field and set OPENAI_API_KEY in your environment.");
  }
  const provider=parsed.provider??defaultConfig.provider;
  if(!isProviderKind(provider))throw new Error("Unsupported provider in ~/.m1cro/config.json");
  return {provider,baseUrl:parsed.baseUrl??providerDefaults[provider].baseUrl,model:parsed.model??providerDefaults[provider].model};
 }catch(error){
  if((error as NodeJS.ErrnoException).code==="ENOENT")return defaultConfig;
  if(error instanceof Error&&error.message.startsWith("Plaintext API keys"))throw error;
  throw new Error("Could not read ~/.m1cro/config.json");
 }
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
function safeTerminalText(value:string):string{
 return value
  .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g,"")
  .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g,"")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g,"");
}
function formatEvent(event:Awaited<ReturnType<AgentRuntime["run"]>> extends AsyncIterable<infer T>?T:never):void{
 if(event.type==="text.delta")stdout.write(safeTerminalText(event.delta));
 else if(event.type==="tool.call")stdout.write("\n[tool] "+safeTerminalText(event.toolName)+"\n");
 else if(event.type==="tool.result")stdout.write("\n[tool result] "+(event.isError?"error":"ok")+"\n");
 else if(event.type==="turn.status"&&(event.status==="failed"||event.status==="cancelled"))stdout.write("\n[turn "+event.status+"] "+safeTerminalText(event.reason??"")+"\n");
}
export async function runPrompt(runtime:AgentRuntime,sessionId:string,prompt:string):Promise<number>{
 let exitCode=0;
 for await(const event of runtime.run({sessionId,prompt})){
  formatEvent(event);
  if(event.type==="turn.status"&&(event.status==="failed"||event.status==="cancelled"))exitCode=1;
 }
 stdout.write("\n");
 return exitCode;
}
export async function runCli(argv=process.argv.slice(2)):Promise<number>{
 let args:Args;
 try{args=parseArgs(argv);}catch(error){console.error(error instanceof Error?error.message:String(error));return 2;}
 if(args.help){stdout.write(help());return 0;}
 let config:Config;
 try{config=await loadConfig();}catch(error){console.error(error instanceof Error?error.message:String(error));return 2;}
 const provider=args.provider??(process.env.M1CRO_PROVIDER&&isProviderKind(process.env.M1CRO_PROVIDER)?process.env.M1CRO_PROVIDER:config.provider);
 const providerEnvUrl=provider==="anthropic"?process.env.ANTHROPIC_BASE_URL:provider==="ollama"?process.env.OLLAMA_BASE_URL:process.env.OPENAI_BASE_URL;
 const defaults=providerDefaults[provider];
 const merged:Config={
  provider,
  baseUrl:args.baseUrl??process.env.M1CRO_BASE_URL??providerEnvUrl??(config.provider===provider?config.baseUrl:defaults.baseUrl),
  model:args.model??process.env.M1CRO_MODEL??(config.provider===provider?config.model:defaults.model),
 };
 const apiKey=provider==="anthropic"?process.env.ANTHROPIC_API_KEY:provider==="ollama"?undefined:process.env.OPENAI_API_KEY;
 if(provider!=="ollama"&&!apiKey){
  const variable=provider==="anthropic"?"ANTHROPIC_API_KEY":"OPENAI_API_KEY";
  console.error(`Set ${variable} in your environment. m1cro does not prompt for or persist plaintext API keys.`);
  return 2;
 }
 if(!/^https?:\/\//i.test(merged.baseUrl)){console.error("Provider base URL must use http or https.");return 2;}
 const base=path.join(os.homedir(),".m1cro"),sessions=path.join(base,"sessions");
 try{
  for(const directory of [base,sessions]){
   await mkdir(directory,{recursive:true,mode:0o700});
   const stat=await lstat(directory);
   if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error("Session storage path must be a real directory");
   await chmod(directory,0o700);
  }
 }catch(error){console.error("Could not prepare private local session storage.");return 2;}
 const sessionId=args.session??randomUUID().replace(/-/g,"");
 const sessionStore=new JsonlSessionStore(id=>path.join(sessions,`${id}.jsonl`));
 const tools=new ToolRegistry();
 registerFilesystemTools(tools,new Workspace({root:path.resolve(args.workspace)}));
 const modelProvider=createProvider(merged.provider,merged.baseUrl,apiKey);
 if(args.listModels){
  if(!modelProvider.discoverModels){console.error("The selected provider does not support model discovery.");return 2;}
  try{
   const models=await modelProvider.discoverModels();
   if(models.length===0)stdout.write("No models were returned by the provider.\\n");
   else for(const model of models)stdout.write(model.id+"\\t"+(model.displayName??"")+(model.contextWindow?"\\t"+model.contextWindow+" context":"")+"\\n");
   return 0;
  }catch(error){console.error(error instanceof Error?error.message:String(error));return 1;}
 }
 const approval:ApprovalController={request:approvalPrompt};
 const runtime=new AgentRuntime({provider:modelProvider,tools,policy:new DefaultPolicy(),model:merged.model,approval,sessionStore});
 stdout.write(`m1cro.ai · ${merged.provider} · model ${merged.model}\nWorkspace: ${path.resolve(args.workspace)}\nSession: ${sessionId}\nType /help for commands.\n\n`);
 if(args.prompt.length){
  const prompt=args.prompt.join(" ");
  const exitCode=await runPrompt(runtime,sessionId,prompt);
  if(!stdin.isTTY||!stdout.isTTY)return exitCode;
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
   try{await runPrompt(runtime,sessionId,prompt);}
   catch(error){stdout.write(`\n[error] ${error instanceof Error?error.message:String(error)}\n`);}
  }
 }finally{rl.close();}
 return 0;
}
