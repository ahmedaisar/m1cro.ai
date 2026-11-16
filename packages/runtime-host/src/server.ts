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
  const apiKey¶»§q«^