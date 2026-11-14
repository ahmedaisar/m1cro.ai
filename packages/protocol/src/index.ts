export type TurnStatus="queued"|"running"|"awaiting_approval"|"retrying"|"completed"|"failed"|"cancelled"|"interrupted";
export interface TextDeltaEvent {type:"text.delta";turnId:string;delta:string}
export interface ToolCallEvent {type:"tool.call";turnId:string;callId:string;toolName:string;input:unknown}
export interface ToolResultEvent {type:"tool.result";turnId:string;callId:string;output:unknown;isError:boolean}
export interface TurnStatusEvent {type:"turn.status";turnId:string;status:TurnStatus;reason?:string}
export interface ApprovalRequiredEvent {type:"approval.required";turnId:string;callId:string;toolName:string;input:unknown;risk:"read"|"write"|"destructive"|"network"|"execute"}
export interface ApprovalResolvedEvent {type:"approval.resolved";turnId:string;callId:string;decision:"approved"|"rejected";actor:"user";reason?:string}
export type RuntimeEvent=TextDeltaEvent|ToolCallEvent|ToolResultEvent|TurnStatusEvent|ApprovalRequiredEvent|ApprovalResolvedEvent;
export interface ToolCall {id:string;name:string;input:unknown}
export type ModelEvent={type:"text";text:string}|{type:"tool_call";call:ToolCall}|{type:"done";stopReason?:string};
export interface ModelMessage {role:"system"|"user"|"assistant"|"tool";content:string;toolCallId?:string;name?:string;toolCalls?:ToolCall[]}
export interface ModelRequest {model:string;messages:ModelMessage[];tools:Array<{name:string;description:string;inputSchema:unknown}>;signal:AbortSignal}
