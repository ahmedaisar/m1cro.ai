import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EncryptedProviderConfigStore, validateProviderConfig } from "./provider-config.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() { const root = await mkdtemp(join(tmpdir(), "m1cro-provider-")); roots.push(root); return { root, file: join(root, "provider.enc") }; }
const key = "a".repeat(64);

describe("encrypted provider configuration", () => {
  it("encrypts credentials at rest and restores them with the same key", async () => {
    const { file } = await fixture();
    const config = { kind: "openai-compatible", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1", apiKey: "sk-test-secret-key" } as const;
    await new EncryptedProviderConfigStore(file, key).save(config);
    const raw = await readFile(file, "utf8");
    expect(raw).not.toContain(config.apiKey);
    expect(await new EncryptedProviderConfigStore(file, key).load()).toEqual(config);
  });

  it("rejects wrong keys and tampered ciphertext", async () => {
    const { file } = await fixture();
    await new EncryptedProviderConfigStore(file, key).save({ kind: "anthropic", model: "claude-sonnet", baseUrl: "https://api.anthropic.com", apiKey: "sk-ant-secret" });
    await expect(new EncryptedProviderConfigStore(file, "b".repeat(64)).load()).rejects.toThrow("could not be decrypted");
    const raw = JSON.parse(await readFile(file, "utf8")); raw.data = Buffer.from("tampered").toString("base64");
    const { writeFile: write } = await import("node:fs/promises"); await write(file, JSON.stringify(raw));
    await expect(new EncryptedProviderConfigStore(file, key).load()).rejects.toThrow("could not be decrypted");
  });

  it("requires encryption for persistent credentials", async () => {
    const { file } = await fixture();
    await expect(new EncryptedProviderConfigStore(file, undefined).save({ kind: "ollama", model: "qwen2.5", baseUrl: "http://127.0.0.1:11434" })).rejects.toThrow("not configured");
  });

  it("rejects unsafe endpoints and missing keys", () => {
    expect(() => validateProviderConfig({ kind: "openai-compatible", model: "x", baseUrl: "https://api.example.com" })).toThrow("API key is required");
    expect(() => validateProviderConfig({ kind: "ollama", model: "x", baseUrl: "https://user:pass@example.com" })).toThrow("without credentials");
    expect(() => validateProviderConfig({ kind: "anthropic", model: "x", baseUrl: "file:///etc/passwd", apiKey: "sk-ant-key" })).toThrow("HTTP(S)");
  });

  it("rejects symlinked config files", async () => {
    const { root, file } = await fixture();
    const outside = join(root, "outside"); await import("node:fs/promises").then(fs => fs.writeFile(outside, "{}"));
    await symlink(outside, file);
    await expect(new EncryptedProviderConfigStore(file, key).load()).rejects.toThrow("regular file");
  });
});


describe("Runpod provider configuration", () => {
  it("accepts the official Serverless OpenAI-compatible endpoint shape", () => {
    expect(validateProviderConfig({
      kind: "runpod",
      model: "Qwen/Qwen3-32B-AWQ",
      baseUrl: "https://api.runpod.ai/v2/endpoint_123/openai/v1",
      apiKey: "runpod-secret-key",
    })).toEqual({
      kind: "runpod",
      model: "Qwen/Qwen3-32B-AWQ",
      baseUrl: "https://api.runpod.ai/v2/endpoint_123/openai/v1",
      apiKey: "runpod-secret-key",
    });
  });

  it("rejects non-Runpod hosts, non-HTTPS URLs and malformed endpoint paths", () => {
    const base = { kind: "runpod", model: "model", apiKey: "runpod-secret-key" };
    expect(() => validateProviderConfig({ ...base, baseUrl: "https://attacker.example/v2/endpoint/openai/v1" })).toThrow("Runpod base URL");
    expect(() => validateProviderConfig({ ...base, baseUrl: "http://api.runpod.ai/v2/endpoint/openai/v1" })).toThrow("Runpod base URL");
    expect(() => validateProviderConfig({ ...base, baseUrl: "https://api.runpod.ai/v2/endpoint/other" })).toThrow("Runpod base URL");
  });
});


it("encrypts Runpod API keys in the provider config store", async () => {
  const { file } = await fixture();
  const config = {
    kind: "runpod",
    model: "Qwen/Qwen3-32B-AWQ",
    baseUrl: "https://api.runpod.ai/v2/endpoint_123/openai/v1",
    apiKey: "runpod-secret-key",
  } as const;
  await new EncryptedProviderConfigStore(file, key).save(config);
  const raw = await readFile(file, "utf8");
  expect(raw).not.toContain(config.apiKey);
  expect(await new EncryptedProviderConfigStore(file, key).load()).toEqual(config);
});
