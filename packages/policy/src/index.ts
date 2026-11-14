export type Risk = "read"|"write"|"destructive"|"network"|"execute";
export type Decision = "allow"|"deny"|"approve";
export interface PolicyContext { toolName:string; risk:Risk; input:unknown }
export interface Policy { evaluate(context:PolicyContext):Decision }
/** Conservative default: only explicitly classified read-only tools auto-run. */
export class DefaultPolicy implements Policy { evaluate(context:PolicyContext):Decision { return context.risk==="read"?"allow":"approve"; } }
