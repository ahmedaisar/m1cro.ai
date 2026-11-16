"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type RuntimeEvent = { type: string; turnId?: string; [key: string]: unknown };
type RuntimeEnvelope = { protocol: string; version: number; sessionId: string; sequence: number; event: RuntimeEvent };
type RuntimeSession = { id: string; projectId: string; ownerId: string; createdAt: string; updatedAt: string; status: string; activeTurnId?: string };
type RuntimeProject = { id: string; name: string; ownerId: string; createdAt: string; updatedAt: string };
type ToolActivity = { callId: string; name: string; input?: unknown; output?: unknown; isError?: boolean };
type TranscriptItem = { timestamp: string; data: { role: "user" | "assistant" | "tool"; content: string; toolCallId?: string } };

function shortId(id: string) { return id.slice(0, 8); }
function timeLabel(value: string) { return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }

export default function WorkspaceClient() {
  const router = useRouter();
  const [sessions, setSessions] = useState<RuntimeSession[]>([]);
  const [activeId, setActiveId] = useState("");
  const [events, setEvents] = useState<RuntimeEnvelope[]>([]);
  const [history, setHistory] = useState<TranscriptItem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [projects, setProjects] = useState<RuntimeProject[]>([]);
  const [selectedProje¶»§q«^