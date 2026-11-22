import { chmod, lstat, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentRuntime } from "@m1cro/core";
import { DefaultPolicy } from "@m1cro/policy";
import { AnthropicProvider, OllamaProvider, OpenAICompatibleProvider, ProviderHttpError, RunpodServerlessProvider, type ModelProvider } from "@m1cro/providers";
import { JsonlSessionStore } from "@m1cro/sessions";
import { registerFilesystemTools, ToolRegistry, Workspace } from "@m1cro/tools";
import { createLocalRuntimeHost } from "./index.js";
import { JsonlRuntimeSessionRegistry } from "./registry.js";
import { JsonlRuntimeProjectRegistry } from "./projects.js";
import { EncryptedProviderConfigStore, validateProviderConfig, type RuntimeProviderConfig } from "./provider-config.js";

type ProviderKind = "openai-compatible" | "anthropic" | "ollama" | "runpod";
const defaults: Record<ProviderKind, { baseUrl: string; model: string }> = {
  "openai-compatible": { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-3-5-haiku-latest" },
  ollama: { baseUrl: "http://127.0.0.1:11434", model: "llama3.2" },
  runpod: { baseUrl: "", model: "" },
};
function providerFromEnvironment(): RuntimeProviderConfig {
  const kind = (process.env.M1CRO_PROVIDER ?? "openai-compatible") as ProviderKind;
  if (!(kind in defaults)) throw new Error("M1CRO_PROVIDER must be openai-compatible, anthropic, ollama or runpod");
  const config = defaults[kind];
  if (kind === "runpod") {
    const endpointId = process.env.M1CRO_RUNPOD_ENDPOINT_ID ?? process.env.RUNPOD_ENDPOINT_ID;
    const apiKey = process.env.RUNPOD_API_KEY;
    const model = process.env.M1CRO_MODEL ?? process.env.RUNPOD_MODEL_ID;
    if (!endpointId || !/^[A-Za-z0-9_-]{1,128}$/.test(endpointId)) throw new Error("Set M1CRO_RUNPOD_ENDPOINT_ID to a valid Runpod Serverless endpoint ID");
    if (!apiKey) throw new Error("Set RUNPOD_API_KEY for the Runpod provider");
    if (!model) throw new Error("Set RUNPOD_MODEL_ID or M1CRO_MODEL to the exact deployed model ID");
    return { kind, model, baseUrl: "https://api.runpod.ai/v2/" + endpointId + "/openai/v1", apiKey };
  }
  const baseUrl = process.env.M1CRO_BASE_URL ?? config.baseUrl;
  if (!/^https?:\\/\\//i.test(baseUrl)) throw new Error("M1CRO_BASE_URL must use http or https");
  const apiKey = kind === "anthropic" ? process.env.ANTHROPIC_API_KEY : kind === "ollama" ? undefined : process.env.OPENAI_API_KEY;
  return { kind, model: process.env.M1CRO_MODEL ?? config.model, baseUrl, ...(apiKey ? { apiKey } : {}) };
}
function createProvider(config: RuntimeProviderConfig): ModelProvider {
  if (config.kind === "runpod") {
    const endpointId = new URL(config.baseUrl).pathname.match(/^\\/v2\\/([A-Za-z0-9_-]{1,128})\\/openai\\/v1$/)?.[1];
    if (!endpointId || !config.apiKey) throw new Error("Runpod provider configuration is incomplete");
    return new RunpodServerlessProvider({ endpointId, apiKey: config.apiKey });
  }
  return config.kind === "anthropic"
    ? new AnthropicProvider({ baseUrl: config.baseUrl, ...(config.apiKey ? { apiKey: config.apiKey } : {}) })
    : config.kind === "ollama"
      ? new OllamaProvider({ baseUrl: config.baseUrl })
      : new OpenAICompatibleProvider({ baseUrl: config.baseUrl, ...(config.apiKey ? { apiKey: config.apiKey } : {}) });
}
function providerStatus(config: RuntimeProviderConfig): Record<string, unknown> {
  return { kind: config.kind, model: config.model, baseUrl: config.baseUrl, authenticationRequired: config.kind !== "ollama", credentialConfigured: config.kind === "ollama" || Boolean(config.apiKey), connectivity: "not_checked" };
}
async function preparePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Runtime storage must be a real directory");
  await chmod(directory, 0o700);
}
export async function startRuntimeHost(): Promise<void> {
  const token = process.env.M1CRO_RUNTIME_TOKEN;
  if (!token || token.length < 32) throw new Error("Set M1CRO_RUNTIME_TOKEN to a random secret of at least 32 characters");
  const workspaceRoot = path.resolve(process.env.M1CRO_WORKSPACE_ROOT ?? process.cwd());
  const storageRoot = path.resolve(process.env.M1CRO_DATA_DIR ?? path.join(os.homedir(), ".m1cro"));
  const sessionRoot = path.join(storageRoot, "sessions");
  const projectsRoot = path.resolve(process.env.M1CRO_PROJECTS_DIR ?? path.join(storageRoot, "projects"));
  await preparePrivateDirectory(storageRoot);
  await preparePrivateDirectory(sessionRoot);
  await preparePrivateDirectory(projectsRoot);
  const sessionStore = new JsonlSessionStore(id => path.join(sessionRoot, id + ".jsonl"));
  const registryStore = new JsonlRuntimeSessionRegistry(path.join(storageRoot, "runtime-sessions.jsonl"));
  const projectStore = new JsonlRuntimeProjectRegistry(path.join(storageRoot, "projects.jsonl"), projectsRoot);
  if (process.env.M1CRO_MULTI_USER_ENABLED === "1") {
    // Managed users receive explicitly-created projects; never expose a shared default workspace.
  } else {
    await projectStore.ensureDefault("local-user", "default", "Default workspace", workspaceRoot);
  }
  const providerConfigStore = new EncryptedProviderConfigStore(path.join(storageRoot, "provider-config.json.enc"), process.env.M1CRO_PROVIDER_CONFIG_KEY);
  let activeProviderConfig = await providerConfigStore.load() ?? providerFromEnvironment();
  let activeProvider = createProvider(activeProviderConfig);
  const host = createLocalRuntimeHost({
    token,
    sessionStore,
    registryStore,
    projectStore,
    providerStatus: () => providerStatus(activeProviderConfig),
    probeProvider: async () => {
      const startedAt = Date.now();
      try {
        let responseChars = 0;
        for await (const event of activeProvider.stream({
          model: activeProviderConfig.model,
          messages: [{ role: "user", content: "Reply with exactly OK." }],
          tools: [],
          signal: AbortSignal.timeout(15_000),
        })) {
          if (event.type === "text" && event.text.length > 0) {
            responseChars = event.text.length;
            break;
          }
          if (event.type === "done") break;
        }
        return {
          ok: responseChars > 0,
          connectivity: responseChars > 0 ? "connected" : "error",
          model: activeProviderConfig.model,
          latencyMs: Date.now() - startedAt,
          responseReceived: responseChars > 0,
        };
      } catch (error) {
        const status = error instanceof ProviderHttpError ? error.status : undefined;
        return {
          ok: false,
          connectivity: "error",
          model: activeProviderConfig.model,
          latencyMs: Date.now() - startedAt,
          errorCode: status === 401 || status === 403 ? "authentication_failed" : status ? "provider_http_error" : "request_failed",
          ...(status ? { httpStatus: status } : {}),
        };
      }
    },
    updateProviderConfig: async value => {
      const input = value && typeof value === "object" ? { ...(value as Record<string, unknown>) } : value;
      if (input && typeof input === "object" && (input as Record<string, unknown>).kind === activeProviderConfig.kind && !(typeof (input as Record<string, unknown>).apiKey === "string" && ((input as Record<string, unknown>).apiKey as string).trim()) && activeProviderConfig.apiKey) {
        (input as Record<string, unknown>).apiKey = activeProviderConfig.apiKey;
      }
      const next = validateProviderConfig(input);
      await providerConfigStore.save(next);
      activeProviderConfig = next;
      activeProvider = createProvider(next);
      return providerStatus(next);
    },
    corsOrigins: (process.env.M1CRO_CORS_ORIGINS ?? "http://localhost:3000").split(",").map(value => value.trim()).filter(Boolean),
    host: process.env.M1CRO_RUNTIME_HOST ?? "127.0.0.1",
    port: Number(process.env.M1CRO_RUNTIME_PORT ?? "8787"),
    createAgent: (approval, store, projectWorkspaceRoot) => {
      const tools = new ToolRegistry();
      registerFilesystemTools(tools, new Workspace({ root: projectWorkspaceRoot ?? workspaceRoot }));
      return new AgentRuntime({ provider: activeProvider, model: activeProviderConfig.model, tools, policy: new DefaultPolicy(), approval, sessionStore: store });
    },
  });
  const address = await host.listen();
  process.stdout.write("m1cro runtime listening on http://" + address.host + ":" + address.port + "\n");
  const shutdown = () => { void host.close().then(() => process.exit(0), error => { process.stderr.write(String(error) + "\n"); process.exit(1); }); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  startRuntimeHost().catch(error => { process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n"); process.exitCode = 1; });
}
