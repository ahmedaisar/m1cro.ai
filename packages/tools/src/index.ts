import { Ajv, type AnySchema, type ValidateFunction } from "ajv";
import type { Risk } from "@m1cro/policy";
export {Workspace,WorkspacePathError} from "./filesystem.js";
export type {WorkspaceOptions} from "./filesystem.js";
export {registerFilesystemTools} from "./builtins.js";
export interface ToolDefinition<TInput=unknown,TOutput=unknown> {
 name:string;description:string;inputSchema:AnySchema;risk:Risk;
 parse(input:unknown):TInput;execute(input:TInput,signal:AbortSignal):Promise<TOutput>;
}
export class ToolInputValidationError extends Error {
 constructor(readonly toolName:string,message:string){super(`Invalid input for tool "${toolName}": ${message}`);this.name="ToolInputValidationError";}
}
type RegisteredTool=ToolDefinition<never,unknown>&{validate:ValidateFunction};
export class ToolRegistry {
 private readonly tools=new Map<string,RegisteredTool>();
 private readonly ajv=new Ajv({allErrors:true,strict:true,allowUnionTypes:true});
 register<TInput,TOutput>(tool:ToolDefinition<TInput,TOutput>):void{
  if(this.tools.has(tool.name))throw new Error(`Tool already registered: ${tool.name}`);
  const validate=this.ajv.compile(tool.inputSchema);
  this.tools.set(tool.name,{...tool,validate} as RegisteredTool);
 }
 get(name:string):RegisteredTool|undefined{return this.tools.get(name);}
 list():RegisteredTool[]{return [...this.tools.values()];}
 validateInput(name:string,input:unknown):void{
  const tool=this.tools.get(name);if(!tool)throw new Error(`Unknown tool: ${name}`);
  if(!tool.validate(input))throw new ToolInputValidationError(name,this.ajv.errorsText(tool.validate.errors,{separator:"; "}));
 }
}
