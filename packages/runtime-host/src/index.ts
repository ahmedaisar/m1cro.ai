import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { AgentRuntime, type ApprovalController, type ApprovalDecision, type ApprovalRequest } from "@m1cro/core";
import { RuntimeEventSequencer, RUNTIME_PROTOCOL_NAME, RUNTIME_PROTOCOL_VERSION, isRuntimeEventEnvelope, type RuntimeCommand, type RuntimeEvent, type RuntimeEventEnvelope } from "@m1cro/protocol";
import type { SessionStore } from "@m1cro/sessions";
import type { RuntimeSessionRegistry, RuntimeSessionRecord } from "./registry.js";
import type { RuntimeProjectRegistry } from "./projects.js";

export interface RuntimeHostOptions {
  createAgent: (approval: ApprovalController, sessionStore: SessionStore, workspaceRoot?: string) => AgentRuntime;
  projectStore?: RuntimeProjectRegistry;
  sessionStore: SessionStore;
  registryStore?: RuntimeSessionRegistry;
  /** Resolve identity from an opaque bearer token. Return null to reject. */
  authenticate: (token: string) => Promise<string | null> | string | null;
  /** Authorize a principal against a session id, including read/write access. */
  authorizeSession: (principalId: string, sessionId: string, access: "read" | "write") => Promise<boolean> | boolean;
  /** Project/workspace ownership check for session creation. */
  authorizeProject: (principalId: string, projectId: string) => Promise<boolean> | boolean;
  corsOrigins: string[];
  maxBodyBytes?: number;
  maxPromptChars?: number¶»§q«^