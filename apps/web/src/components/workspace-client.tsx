"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type RuntimeEvent = { type: string; turnId?: string; [key: string]: unknown };
type RuntimeEnvelope = { protocol: string; version: number; sessionId: string; sequence: number; event: RuntimeEvent };
type RuntimeSession = { id: string; projectId: string; ownerId: string; createdAt: string; updatedAt: string; status: string; activeTurnId?: string };
type RuntimeProject = { id: string; name: string; ownerId: string; createdAt: string; updatedAt: string };
type ProviderStatus = { kind?: string; model?: string; baseUrl?: string; authenticationRequired?: boolean; credentialConfigured?: boolean; connectivity?: string };
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
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [runtimeUnavailable, setRuntimeUnavailable] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [providerKind, setProviderKind] = useState("openai-compatible");
  const [providerModel, setProviderModel] = useState("gpt-4o-mini");
  const [providerBaseUrl, setProviderBaseUrl] = useState("https://api.openai.com/v1");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerMessage, setProviderMessage] = useState("");
  const streamRef = useRef<EventSource | null>(null);
  const lastSequence = useRef(0);

  const activeSession = sessions.find(session => session.id === activeId);
  const activeTurnId = [...events].reverse().find(item => item.event.turnId)?.event.turnId ?? activeSession?.activeTurnId;
  const assistantText = useMemo(() => {
    if (!activeSession || (activeSession.status !== "running" && activeSession.status !== "awaiting_approval")) return "";
    return events.filter(item => item.event.type === "text.delta" && item.event.turnId === activeTurnId).map(item => String(item.event.delta ?? "")).join("");
  }, [events, activeSession, activeTurnId]);
  const tools = useMemo(() => {
    const map = new Map<string, ToolActivity>();
    for (const envelope of events) {
      const event = envelope.event;
      if (event.type === "tool.call") map.set(String(event.callId), { callId: String(event.callId), name: String(event.toolName), input: event.input });
      if (event.type === "tool.result") {
        const existing = map.get(String(event.callId)) ?? { callId: String(event.callId), name: "Tool" };
        map.set(String(event.callId), { ...existing, output: event.output, isError: Boolean(event.isError) });
      }
    }
    return [...map.values()];
  }, [events]);
  const approval = [...events].reverse().find(item => item.event.type === "approval.required" &&
    !events.some(other => other.event.type === "approval.resolved" && other.event.callId === item.event.callId))?.event;
  const refreshHistory = useCallback(async (sessionId: string) => {
    const response = await fetch("/api/runtime/v1/sessions/" + encodeURIComponent(sessionId) + "/history", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { messages: TranscriptItem[] };
    setHistory(data.messages ?? []);
  }, []);

  const refreshProjects = useCallback(async () => {
    const response = await fetch("/api/runtime/v1/projects", { cache: "no-store" });
    if (response.status === 401) { router.replace("/login"); return; }
    if (!response.ok) throw new Error("Unable to load projects (" + response.status + ")");
    const data = await response.json() as { projects: RuntimeProject[] };
    setProjects(data.projects ?? []);
    setSelectedProjectId(current => current && data.projects.some(project => project.id === current) ? current : data.projects[0]?.id ?? "");
  }, [router]);

  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/runtime/v1/sessions", { cache: "no-store" });
    if (response.status === 401) { router.replace("/login"); return; }
    if (response.status === 503) { setRuntimeUnavailable(true); setError("Runtime connection is not configured. Set M1CRO_RUNTIME_URL and M1CRO_RUNTIME_TOKEN on the server."); return; }
    if (!response.ok) throw new Error("Unable to load sessions (" + response.status + ")");
    const data = await response.json() as { sessions: RuntimeSession[] };
    setSessions(data.sessions);
    setRuntimeUnavailable(false);
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("m1cro-active-session") : null;
    if (!activeId && data.sessions.length) setActiveId(data.sessions.some(item => item.id === saved) ? saved! : data.sessions[0].id);
  }, [activeId, router]);

  useEffect(() => {
    let active = true;
    fetch("/api/runtime/v1/provider/status", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Provider status unavailable");
      const data = await response.json() as { provider?: ProviderStatus };
      if (active) {
        setProviderStatus(data.provider ?? null);
        if (data.provider?.kind) setProviderKind(data.provider.kind);
        if (data.provider?.model) setProviderModel(data.provider.model);
        if (data.provider?.baseUrl) setProviderBaseUrl(data.provider.baseUrl);
      }
    }).catch(() => { if (active) setProviderStatus(null); });
    return () => { active = false; };
  }, []);
  useEffect(() => { refreshProjects().catch(cause => setError(cause instanceof Error ? cause.message : "Projects unavailable")); }, [refreshProjects]);
  useEffect(() => { refreshSessions().catch(cause => setError(cause instanceof Error ? cause.message : "Runtime unavailable")); }, [refreshSessions]);
  useEffect(() => {
    if (!activeId) { setHistory([]); return; }
    refreshHistory(activeId).catch(() => {});
  }, [activeId, refreshHistory]);
  useEffect(() => {
    if (!activeId) { setEvents([]); setConnected(false); return; }
    window.localStorage.setItem("m1cro-active-session", activeId);
    lastSequence.current = 0;
    setEvents([]);
    streamRef.current?.close();
    const source = new EventSource("/api/runtime/v1/sessions/" + encodeURIComponent(activeId) + "/events?after=0");
    streamRef.current = source;
    source.onopen = () => { setConnected(true); setError(""); };
    source.onerror = () => setConnected(false);
    source.addEventListener("runtime", message => {
      try {
        const envelope = JSON.parse((message as MessageEvent<string>).data) as RuntimeEnvelope;
        if (envelope.sequence <= lastSequence.current) return;
        lastSequence.current = envelope.sequence;
        setEvents(current => [...current, envelope]);
        if (envelope.event.type === "turn.status" && ["completed", "failed", "cancelled"].includes(String(envelope.event.status))) {
          refreshSessions().catch(() => {});
          refreshHistory(activeId).catch(() => {});
        }
      } catch { setError("Received an invalid runtime event"); }
    });
    return () => { source.close(); if (streamRef.current === source) streamRef.current = null; };
  }, [activeId, refreshSessions, refreshHistory]);

  async function createSession() {
    if (!selectedProjectId) { setError("Create or select a project first"); return; }
    setError(""); setBusy(true);
    try {
      const response = await fetch("/api/runtime/v1/sessions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });
      const data = await response.json() as { session?: RuntimeSession; error?: string };
      if (!response.ok || !data.session) throw new Error(data.error ?? "Could not create a session");
      setSessions(current => [data.session!, ...current]);
      setActiveId(data.session.id);
      setEvents([]);
      setHistory([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create session"); }
    finally { setBusy(false); }
  }

  async function createProject() {
    if (!newProjectName.trim()) return;
    setError(""); setBusy(true);
    try {
      const response = await fetch("/api/runtime/v1/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newProjectName }) });
      const data = await response.json() as { project?: RuntimeProject; error?: string };
      if (!response.ok || !data.project) throw new Error(data.error ?? "Could not create project");
      setProjects(current => [...current, data.project!]);
      setSelectedProjectId(data.project.id);
      setNewProjectName("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create project"); }
    finally { setBusy(false); }
  }

  async function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProviderSaving(true); setProviderMessage(""); setError("");
    try {
      const response = await fetch("/api/runtime/v1/provider/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: providerKind, model: providerModel, baseUrl: providerBaseUrl, apiKey: providerApiKey }),
      });
      const data = await response.json() as { provider?: ProviderStatus; error?: string };
      if (!response.ok || !data.provider) throw new Error(data.error ?? "Could not save provider settings");
      setProviderStatus(data.provider);
      setProviderApiKey("");
      setProviderMessage("Provider saved securely. New sessions will use this configuration.");
    } catch (cause) {
      setProviderMessage(cause instanceof Error ? cause.message : "Could not save provider settings");
    } finally { setProviderSaving(false); }
  }

  async function sendPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeId || !prompt.trim() || busy) return;
    const value = prompt.trim();
    setPrompt(""); setError(""); setBusy(true);
    try {
      const response = await fetch("/api/runtime/v1/sessions/" + encodeURIComponent(activeId) + "/commands", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "turn.start", requestId: crypto.randomUUID(), sessionId: activeId, prompt: value }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not start turn");
      await refreshSessions();
      await refreshHistory(activeId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start turn"); }
    finally { setBusy(false); }
  }

  async function sendCommand(command: Record<string, unknown>) {
    if (!activeId) return;
    const response = await fetch("/api/runtime/v1/sessions/" + encodeURIComponent(activeId) + "/commands", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...command, requestId: crypto.randomUUID(), sessionId: activeId }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) setError(data.error ?? "Command failed");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="brand"><span className="brand-mark">m<span>·</span></span><span>m1cro<span className="brand-dot">.ai</span></span></div>
        <div className="workspace-switch"><span className="workspace-avatar">M</span><div><strong>Personal workspace</strong><small>Local runtime</small></div><span className="chevron">⌄</span></div>
        <div className="nav-label">WORKSPACE</div>
        <div className="nav-list"><div className="nav-item active"><span>▦</span> Sessions</div><div className="nav-item"><span>▱</span> Projects</div><div className="nav-item"><span>◷</span> Activity</div></div>
        <div className="session-list-heading"><span className="nav-label">RECENT SESSIONS</span><button className="icon-button" onClick={createSession} disabled={busy} aria-label="New session">＋</button></div>
        <div className="session-list">
          {sessions.map(session => <button key={session.id} className={"session-item " + (session.id === activeId ? "selected" : "")} onClick={() => setActiveId(session.id)}>
            <span className="session-dot" data-status={session.status}></span><span className="session-item-copy"><strong>{session.projectId}</strong><small>{shortId(session.id)} · {timeLabel(session.updatedAt)}</small></span>
          </button>)}
          {!sessions.length && <p className="empty-small">No sessions yet. Start a new one.</p>}
        </div>
        <div className="sidebar-bottom"><div className="runtime-state"><span className={"connection-dot " + (connected ? "online" : "")}></span><span>{connected ? "Runtime connected" : "Runtime disconnected"}</span></div><button className="user-row" onClick={logout}><span className="user-avatar">U</span><span><strong>Workspace user</strong><small>Sign out</small></span><span className="chevron">↗</span></button></div>
      </aside>
      <section className="workspace-main">
        <header className="workspace-topbar"><div><span className="breadcrumb-muted">Workspace</span><span className="breadcrumb-sep">/</span><strong>{activeSession ? activeSession.projectId : "New session"}</strong></div><div className="topbar-right"><span className="provider-pill" title={providerStatus?.baseUrl ?? "Provider status unavailable"}>{providerStatus ? (providerStatus.kind ?? "Provider") + " · " + (providerStatus.model ?? "No model") + (providerStatus.authenticationRequired && !providerStatus.credentialConfigured ? " · API key missing" : " · " + (providerStatus.connectivity === "not_checked" ? "not tested" : "configured")) : "Provider status unavailable"}</span><details className="provider-settings"><summary>Configure</summary><form className="provider-settings-panel" onSubmit={saveProvider}><label>Provider<select value={providerKind} onChange={event => setProviderKind(event.target.value)}><option value="openai-compatible">OpenAI-compatible</option><option value="anthropic">Anthropic</option><option value="ollama">Ollama</option></select></label><label>Model<input value={providerModel} onChange={event => setProviderModel(event.target.value)} required maxLength={160} placeholder="Model identifier" /></label><label>API base URL<input value={providerBaseUrl} onChange={event => setProviderBaseUrl(event.target.value)} required type="url" placeholder="https://api.openai.com/v1" /></label><label>API key {providerKind === "ollama" ? "(optional)" : ""}<input type="password" autoComplete="new-password" value={providerApiKey} onChange={event => setProviderApiKey(event.target.value)} placeholder={providerKind === "ollama" ? "Optional" : "Enter provider API key"} required={providerKind !== "ollama"} /></label><button className="primary-button" type="submit" disabled={providerSaving}>{providerSaving ? "Saving…" : "Save provider"}</button>{providerMessage && <small role="status">{providerMessage}</small>}</form></details><span className="runtime-pill"><i className={connected ? "online" : ""}></i>{connected ? "Connected" : "Waiting for runtime"}</span><button className="secondary-button" onClick={logout}>Sign out</button></div></header>
        <div className="session-workarea">
          {!activeId ? <div className="welcome-panel"><div className="welcome-orb">m·</div><p className="eyebrow">ONE WORKSPACE. ANY MODEL.</p><h1>What are we building?</h1><p>Start a session against your configured runtime workspace.</p><div className="new-session-row"><select aria-label="Select project" value={selectedProjectId} onChange={event => setSelectedProjectId(event.target.value)} disabled={!projects.length}>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select><input aria-label="New project name" value={newProjectName} onChange={event => setNewProjectName(event.target.value)} placeholder="New project name" /><button className="secondary-button" onClick={createProject} disabled={busy || !newProjectName.trim()}>Add</button><button className="primary-button" onClick={createSession} disabled={busy || !selectedProjectId}>New session</button></div></div> :
          <div className="conversation">
            <div className="conversation-heading"><div><p className="eyebrow">CODING SESSION</p><h1>{activeSession?.projectId ?? "Workspace session"}</h1><span className="session-id">Session {activeId}</span></div><div className="conversation-actions"><span className="status-chip">{activeSession?.status ?? "loading"}</span>{activeTurnId && activeSession && (activeSession.status === "running" || activeSession.status === "awaiting_approval") && <button className="secondary-button" onClick={() => sendCommand({ type: "turn.cancel", turnId: activeTurnId })}>Stop turn</button>}</div></div>
            {runtimeUnavailable && <div className="notice notice-warning">Runtime connection is not configured. Set M1CRO_RUNTIME_URL and M1CRO_RUNTIME_TOKEN in the server environment, and make sure the runtime host is reachable over HTTPS.</div>}
            {error && <div className="notice notice-error">{error}</div>}
            {history.length === 0 && events.length === 0 && <div className="conversation-empty"><div className="welcome-orb small">m·</div><h2>Ready when you are.</h2><p>Describe a task. The shared runtime will stream its progress here.</p></div>}
            {history.map((message, index) => <div className={"message " + (message.data.role === "user" ? "user-message" : "assistant-message")} key={message.timestamp + "-" + index}>
              <div className={"message-avatar " + (message.data.role === "assistant" ? "assistant-avatar" : "")}>{message.data.role === "user" ? "U" : message.data.role === "tool" ? "⌘" : "m·"}</div>
              <div className="message-body"><span className="message-label">{message.data.role === "user" ? "You" : message.data.role === "tool" ? "Tool result" : "m1cro"}</span><p className="assistant-output">{message.data.content}</p></div>
            </div>)}
            {assistantText && <div className="message assistant-message"><div className="message-avatar assistant-avatar">m·</div><div className="message-body"><span className="message-label">m1cro · streaming</span><p className="assistant-output">{assistantText}</p></div></div>}
            {tools.map(tool => <div className="tool-card" key={tool.callId}><div className="tool-card-head"><span className="tool-symbol">⌘</span><strong>{tool.name}</strong><span className="tool-state">{tool.output === undefined ? "Running" : tool.isError ? "Failed" : "Completed"}</span></div><pre>{JSON.stringify(tool.output ?? tool.input ?? {}, null, 2)}</pre></div>)}
            {approval && <div className="approval-card"><div><strong>Approval required · {String(approval.toolName)}</strong><p>{String(approval.risk)} permission for this tool call</p><pre>{JSON.stringify(approval.input ?? {}, null, 2)}</pre></div><div className="approval-actions"><button className="secondary-button" onClick={() => sendCommand({ type: "approval.respond", turnId: approval.turnId, callId: approval.callId, decision: "reject" })}>Reject</button><button className="primary-button" onClick={() => sendCommand({ type: "approval.respond", turnId: approval.turnId, callId: approval.callId, decision: "approve" })}>Approve</button></div></div>}
            {events.length > 0 && <div className="event-footer">{connected ? "Live event stream" : "Reconnecting to runtime"} · {events.length} events received</div>}
          </div>}
        </div>
        <footer className="composer-wrap">
          {!activeId && <div className="composer-hint">Create a session to start sending prompts.</div>}
          <form className="composer" onSubmit={sendPrompt}>
            <textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={activeId ? "Ask m1cro to inspect, plan, or change your code…" : "Create a session first…"} disabled={!activeId || runtimeUnavailable} rows={2} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <div className="composer-bottom"><span>Enter to send · Shift + Enter for newline</span><button className="primary-button send-button" type="submit" disabled={!activeId || !prompt.trim() || busy || runtimeUnavailable}>{busy ? "Working…" : "Send ↗"}</button></div>
          </form>
          <p className="composer-disclaimer">Tool permissions are enforced by the runtime. Model output cannot grant itself approval.</p>
        </footer>
      </section>
    </main>
  );
}
