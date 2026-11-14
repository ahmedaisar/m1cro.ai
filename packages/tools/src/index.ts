import type { Risk } from "@m1cro/policy";
export interface ToolDefinition<TInput=unknown,TOutput=unknown> { name:string; description:string; inputSchema:unknown; risk:Risk; parse(input:unknown):TInput; execute(input:TInput,signal:AbortSignal):Promise<TOutput> }
export class ToolRegistry {
 private readonly tools=new Map<string,ToolDefinition<never,unknown>>();
 register<TInput,TOutput>(tool:ToolDefinition<TInput,TOutput>):void { if(this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`); this.tools.set(tool.name,tool as ToolDefinition<never,unknown>); }
 get(name:string):ToolDefinition<never,unknown>|undefined { return this.tools.get(name); }
 list():ToolDefinition<never,unknown>[] { return [...this.tools.values()]; }
}
