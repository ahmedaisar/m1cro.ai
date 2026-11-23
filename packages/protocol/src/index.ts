export type TurnStatus="queued"|"running"|"awaiting_approval"|"retrying"|"completed"|"failed"|"cancelled"|"interrupted";
export interface TextDeltaEvent {type:"text.delta";turnId:string;delta:string}
export interface ToolCallEvent {type:"tool.call";turnId:string;callId:string;toolName:string;input:unknown}
export interface ToolResultEvent {type:"tool.result";turnId:string;callId:string;output:unknown;isError:boolean}
export interface TurnStatusEvent {type:"turn.status";turnId:string;status:TurnStatus;reason?:string}
export interface ApprovalRequiredEvent {type:"approval.required";turnId:string;callId:string;toolName:string;input:unknown;risk:"read"|"write"|"destructive"|"network"|"execute"}
export interface ApprovalResolvedEvent {type:"approval.resolved";turnId:string;callId:string;decision:"approved"|"rejected";actor:"user";reason?:string}
export interface UsageReportEvent {type:"usage.report";turnId:string;requestId:string;provider:string;model:string;inputTokens:number;outputTokens:number;projectId?:string}\nexport type RuntimeEvent=TextDeltaEvent|ToolCallEvent|ToolResultEvent|TurnStatusEvent|ApprovalRequiredEvent|ApprovalResolvedEvent|UsageReportEvent;
export interface ToolCall {id:string;name:string;input:unknown}
export type ModelEvent={type:"text";text:string}|{type:"tool_call";call:ToolCall}|{type:"usage";inputTokens:number;outputTokens:number}|{type:"done";stopReason?:string};
export interface ModelMessage {role:"system"|"user"|"assistant"|"tool";content:string;toolCallId?:string;name?:string;toolCalls?:ToolCall[]}
export interface ModelRequest {model:string;messages:ModelMessage[];tools:Array<{name:string;description:string;inputSchema:unknown}>;signal:AbortSignal}

/** Stable wire contract shared by CLI, web, desktop and remote runtime clients. */
export const RUNTIME_PROTOCOL_NAME = "m1cro.runtime" as const;
export const RUNTIME_PROTOCOL_VERSION = 1 as const;
export interface RuntimeEventEnvelope {
  protocol: typeof RUNTIME_PROTOCOL_NAME;
  version: typeof RUNTIME_PROTOCOL_VERSION;
  sessionId: string;
  sequence: number;
  event: RuntimeEvent;
}
export type RuntimeCommand =
  | { type: "turn.start"; requestId: string; sessionId: string; prompt: string }
  | { type: "turn.cancel"; requestId: string; sessionId: string; turnId: string }
  | { type: "approval.respond"; requestId: string; sessionId: string; turnId: string; callId: string; decision: "approve" | "reject"; reason?: string };

/** Adds stable session correlation and monotonically increasing per-session sequence numbers. */
export class RuntimeEventSequencer {
  private readonly sequences = new Map<string, number>();
  wrap(sessionId: string, event: RuntimeEvent): RuntimeEventEnvelope {
    if (!sessionId.trim()) throw new Error("sessionId must not be empty");
    const sequence = (this.sequences.get(sessionId) ?? 0) + 1;
    this.sequences.set(sessionId, sequence);
    return { protocol: RUNTIME_PROTOCOL_NAME, version: RUNTIME_PROTOCOL_VERSION, sessionId, sequence, event };
  }
  reset(sessionId: string): void { this.sequences.delete(sessionId); }
}

export function isRuntimeEventEnvelope(value: unknown): value is RuntimeEventEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RuntimeEventEnvelope>;
  return candidate.protocol === RUNTIME_PROTOCOL_NAME
    && candidate.version === RUNTIME_PROTOCOL_VERSION
    && typeof candidate.sessionId === "string" && candidate.sessionId.length > 0
    && Number.isSafeInteger(candidate.sequence) && (candidate.sequence ?? 0) > 0
    && !!candidate.event && typeof candidate.event === "object"
    && ["text.delta", "tool.call", "tool.result", "turn.status", "approval.required", "approval.resolved", "usage.report"].includes(String((candidate.event as { type?: unknown }).type));
}


/** Stable query parameter used to deep-link browser, desktop and editor clients to a session. */
export const RUNTIME_SESSION_QUERY_PARAM = "session" as const;

/** Builds a browser URL that opens an existing session without embedding credentials. */
export function createSessionDeepLink(baseUrl: string, sessionId: string): string {
  if (!sessionId.trim()) throw new Error("sessionId must not be empty");
  const url = new URL(baseUrl);
  url.searchParams.set(RUNTIME_SESSION_QUERY_PARAM, sessionId);
  return url.toString();
}

/** Reads a session deep link. Returns null for invalid URLs or missing/blank session IDs. */
export function readSessionDeepLink(value: string): string | null {
  try {
    const sessionId = new URL(value).searchParams.get(RUNTIME_SESSION_QUERY_PARAM)?.trim();
    return sessionId || null;
  } catch {
    return null;
  }
}
