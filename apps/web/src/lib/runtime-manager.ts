const DEFAULT_SANDBOX_NAME = "m1cro-runtime";
const DEFAULT_PORT = 4310;
const DEFAULT_WORKSPACE = "/vercel/m1cro.ai";
const HEALTH_TIMEOUT_MS = 1_500;
const START_TIMEOUT_MS = 15_000;
const READY_TIMEOUT_MS = 20_000;
const VERCEL_API = "https://api.vercel.com";

let cachedRuntimeUrl: string | undefined;
let cachedAt = 0;
let wakeInFlight: Promise<string> | undefined;

function config() {
  const name = process.env.M1CRO_RUNTIME_SANDBOX_NAME ?? DEFAULT_SANDBOX_NAME;
  const port = Number(process.env.M1CRO_RUNTIME_PORT ?? DEFAULT_PORT);
  const cwd = process.env.M1CRO_RUNTIME_CWD ?? DEFAULT_WORKSPACE;
  const projectId = process.env.M1CRO_VERCEL_PROJECT_ID ?? process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.M1CRO_VERCEL_TEAM_ID ?? process.env.VERCEL_ORG_ID;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(name)) throw new Error("Invalid runtime sandbox name");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid runtime port");
  if (!projectId || !teamId) throw new Error("Vercel project and team IDs are required to manage the runtime sandbox");
  if (!cwd.startsWith("/") || cwd.includes("\n") || cwd.includes("\r")) throw new Error("Runtime working directory must be an absolute path");
  return { name, port, cwd, projectId, teamId };
}

async function isHealthy(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(new URL("/health", baseUrl), { cache: "no-store", signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!response.ok) return false;
    const body = await response.json() as { protocol?: string; ready?: boolean };
    return body.protocol === "m1cro.runtime" && body.ready === true;
  } catch { return false; }
}

async function apiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(VERCEL_API + path, {
    ...init,
    cache: "no-store",
    headers: { authorization: "Bearer " + token, ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) {
    throw new Error("Vercel Sandbox API returned " + response.status);
  }
  return await response.json() as T;
}

async function waitUntilHealthy(baseUrl: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isHealthy(baseUrl)) return;
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw new Error("The m1cro runtime did not become healthy after it was resumed");
}

async function wakeRuntime(oidcToken: string | null): Promise<string> {
  const { name, port, cwd, projectId, teamId } = config();
  const token = oidcToken?.trim();
  if (!token) throw new Error("Enable Secure Backend Access with OIDC Federation in the m1cro.ai Vercel project settings to allow automatic runtime recovery");
  const query = new URLSearchParams({ projectId, teamId, resume: "true" });
  const sandboxData = await apiRequest<{ sandbox?: { currentSessionId?: string }; session?: { id?: string }; routes?: Array<{ port: number; url: string }> }>(
    "/v2/sandboxes/" + encodeURIComponent(name) + "?" + query.toString(), token,
  );
  const sessionId = sandboxData.session?.id ?? sandboxData.sandbox?.currentSessionId;
  const route = sandboxData.routes?.find(item => item.port === port);
  const runtimeUrl = route?.url;
  if (!sessionId || !runtimeUrl) throw new Error("The named runtime sandbox is missing its session or exposed runtime port");

  if (!(await isHealthy(runtimeUrl))) {
    const env: Record<string, string> = { M1CRO_RUNTIME_HOST: "0.0.0.0", M1CRO_RUNTIME_PORT: String(port) };
    if (process.env.M1CRO_RUNTIME_TOKEN) env.M1CRO_RUNTIME_TOKEN = process.env.M1CRO_RUNTIME_TOKEN;
    if (process.env.M1CRO_PROVIDER_CONFIG_KEY) env.M1CRO_PROVIDER_CONFIG_KEY = process.env.M1CRO_PROVIDER_CONFIG_KEY;
    if (process.env.M1CRO_USERS_JSON) env.M1CRO_MULTI_USER_ENABLED = "1";
    const commandData = await apiRequest<{ command?: { exitCode?: number | null } }>(
      "/v2/sandboxes/sessions/" + encodeURIComponent(sessionId) + "/cmd?teamId=" + encodeURIComponent(teamId),
      token,
      { method: "POST", body: JSON.stringify({
        command: "bash",
        args: ["-lc", [
          "set -eu",
          "lock=/tmp/m1cro-runtime-start.lock",
          "for attempt in $(seq 1 56); do",
          "  if curl -fsS http://127.0.0.1:" + port + "/health >/dev/null 2>&1; then exit 0; fi",
          "  if mkdir \"$lock\" 2>/dev/null; then",
          "    trap 'rmdir \"$lock\" 2>/dev/null || true' EXIT",
          "    if ! curl -fsS http://127.0.0.1:" + port + "/health >/dev/null 2>&1; then nohup pnpm --filter @m1cro/runtime-host start >/tmp/m1cro-runtime.log 2>&1 </dev/null & fi",
          "    exit 0",
          "  fi",
          "  if [ -d \"$lock\" ]; then lock_age=$(( $(date +%s) - $(stat -c %Y \"$lock\" 2>/dev/null || date +%s) )); if [ \"$lock_age\" -gt 40 ]; then rmdir \"$lock\" 2>/dev/null || true; fi; fi",
          "  sleep 0.25",
          "done",
          "exit 75"
        ].join("\n")],
        cwd,
        env,
        wait: true,
        timeout: START_TIMEOUT_MS,
      }) },
    );
    const exitCode = commandData.command?.exitCode == null ? null : Number(commandData.command.exitCode);
    if (exitCode != null && exitCode !== 0) throw new Error("Could not start the runtime process inside the sandbox");
  }

  await waitUntilHealthy(runtimeUrl);
  cachedRuntimeUrl = runtimeUrl;
  cachedAt = Date.now();
  return runtimeUrl;
}

export async function ensureRuntime(oidcToken: string | null): Promise<string> {
  if (cachedRuntimeUrl && Date.now() - cachedAt < 4_000 && await isHealthy(cachedRuntimeUrl)) return cachedRuntimeUrl;
  const configuredUrl = process.env.M1CRO_RUNTIME_URL;
  if (configuredUrl && await isHealthy(configuredUrl)) {
    cachedRuntimeUrl = configuredUrl;
    cachedAt = Date.now();
    return configuredUrl;
  }
  if (!wakeInFlight) wakeInFlight = wakeRuntime(oidcToken).finally(() => { wakeInFlight = undefined; });
  return wakeInFlight;
}
