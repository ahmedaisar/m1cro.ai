import { chmod, lstat, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentRuntime } from "@m1cro/core";
import { DefaultPolicy } from "@m1cro/policy";
import { AnthropicProvider, OllamaProvider, OpenAICompatibleProvider, type ModelProvider } from "@m1cro/providers";
import { JsonlSessionStore } from "@m1cro/sessions";
import { registerFilesystemTools, ToolRegistry, Workspace } from "@m1cro/tools";
import { createLocalRuntimeHost } from "./index.js";

type ProviderKind = "openai-compatible" | "anthropic" | "ollama";
const defaults: Record<ProviderKind, { baseUrl: string; model: string }> = {
  "openai-compatible": { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-3-5-haiku-latest" },
  ollama: { baseUrl: "http://127.0.0.1:11434", model: "llama3.2" },
};
function providerFromEnvironment(): { provider: ModelProvider; model: string } {
  const kind = (process.env.M1CRO_PROVIDER ?? "openai-compatible") as ProviderKind;
  if (!(kind in defaults)) throw new Error("M1CRO_PROVIDER must be openai-compatible, anthropic or ollama");
  const config = defaults[kind];
  const baseUrl = process.env.M1CRO_BASE_URL ?? config.baseUrl;
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error("M1CRO_BASE_URL must use http or https");
  const apiKey = kind === "anthropic" ? process.env.ANTHROPIC_API_KEY : kind === "ollama" ? undefined : process.env.OPENAI_API_KEY;
  if (kind !== "ollama" && !apiKey) throw new Error(kind === "anthropic" ? "ANTHROPIC_API_KEY is required" : "OPENAI_API_KEY is required");
  const provider = kind === "anthropic"
    ? new AnthropicProvider({ baseUrl, ...(apiKey ? { apiKey } : {}) })
    : kind === "ollama"
      ? new OllamaProvider({ baseUrl })
      : new OpenAICompatibleProvider({ baseUrl, ...(apiKey ? { apiKey } : {}) });
  return { provider, model: process.env.M1CRO_MODEL ?? config.model };
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
  await preparePrivateDirectory(storageRoot);
  await preparePrivateDirectory(sessionRoot);
  const sessionStore = new JsonlSessionStore(id => path.join(sessionRoot, id + ".jsonl"));
  const configured = providerFromEnvironment();
  const host = createLocalRuntimeHost({
    token,
    sessionStore,
    corsOrigins: (process.env.M1CRO_CORS_ORIGINS ?? "http://localhost:3000").split(",").map(value => value.trim()).filter(Boolean),
    host: process.env.M1CRO_RUNTIME_HOST ?? "127.0.0.1",
    port: Number(process.env.M1CRO_RUNTIME_PORT ?? "8787"),
    createAgent: (approval, store) => {
      const tools = new ToolRegistry();
      registerFilesystemTools(tools, new Workspace({ root: workspaceRoot }));
      return new AgentRuntime({ provider: configured.provider, model: configured.model, tools, policy: new DefaultPolicy(), approval, sessionStore: store });
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
