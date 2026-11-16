import { chmod, lstat, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentRuntime } from "@m1cro/core";
import { DefaultPolicy } from "@m1cro/policy";
import { AnthropicProvider, OllamaProvider, OpenAICompatibleProvider, type ModelProvider } from "@m1cro/providers";
import { JsonlSessionStore } from "@m1cro/sessions";
import { registerFilesystemTools, ToolRegistry, Workspace } from "@m1cro/tools";
import { createLocalRuntimeHost } from "./index.js";
import { JsonlRuntimeSessionRegistry } from "./registry.js";
import { JsonlRuntimeProjectRegistry } from "./projects.js";
import { EncryptedProviderConfigStore, validateProviderConfig, type RuntimeProviderConfig } from "./provider-config.js";

type ProviderKind = "openai-compatible" | "anthropic" | "ollama";
const defaults: Record<ProviderKind, { baseUrl: string; model: string }> = {
  "openai-compatible": { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-3-5-haiku-latest" },
  ollama: { baseUrl: "http://127.0.0.1:11434", model: "llama3.2" },
};
function providerFromEnvironment(): RuntimeProviderConfig {
  const kind = (process.env.M1CRO_PROVIDER ?? "openai-compatible") as ProviderKind;
  if (!(kind in defaults)) throw new Error("M1CRO_PROVIDER must be openai-compatible, anthropic or ollama");
  const config = defaults[kind];
  const baseUrl = process.env.M1CRO_BASE_URL ?? config.baseUrl;
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error("M1CRO_BASE_URL must use http or https");
  const apiKey = kind === "anthropic" ? process.env.ANTHROPIC_API_KEY : kind === "ollama" ? undefined : process.env.OPENAI_API_KEY;
  return { kind, model: process.env.M1CRO_MODEL ?? config.model, baseUrl, ...(apiKey ? { apiKey } : {}) };
}
function createProvider(config: RuntimeProviderConfig): ModelProvider {
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
  await projectStore.ensureDefault("local-user", "default", "Default workspace", workspaceRoot);
  const providerConfigStore = new EncryptedProviderConfigStore(path.join(storageRoot, "provider-config.json.enc"), process.env.M1CRO_PROVIDER_CONFIG_KEY);
  let activeProviderConfig = await providerConfigStore.load() ?? providerFromEnvironment();
  let activeProvider = createProvider(activeProviderConfig);
  const host = createLocalRuntimeHost({
    token,
    sessionStore,
    registryStore,
    projectStore,
    providerStatus: () => providerStatus(activeProviderConfig),
    updateProviderConfig: async value => {
      const next = validateProviderConfig(value);
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
