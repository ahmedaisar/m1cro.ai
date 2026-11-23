import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type ProviderKind = "openai-compatible" | "anthropic" | "ollama";
export interface RuntimeProviderConfig {
  kind: ProviderKind;
  model: string;
  baseUrl: string;
  apiKey?: string;
}

const PROVIDERS = new Set<ProviderKind>(["openai-compatible", "anthropic", "ollama"]);

export function validateProviderConfig(value: unknown): RuntimeProviderConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provider configuration must be an object");
  const input = value as Record<string, unknown>;
  if (typeof input.kind !== "string" || !PROVIDERS.has(input.kind as ProviderKind)) throw new Error("Unsupported provider");
  const kind = input.kind as ProviderKind;
  const model = typeof input.model === "string" ? input.model.trim() : "";
  if (!model || model.length > 160 || /[\r\n\0]/.test(model)) throw new Error("Model must be between 1 and 160 characters");
  const baseUrl = typeof input.baseUrl === "string" ? input.baseUrl.trim() : "";
  let parsed: URL;
  try { parsed = new URL(baseUrl); } catch { throw new Error("A valid provider base URL is required"); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Provider base URL must be HTTP(S) without credentials, query strings or fragments");
  }
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (kind !== "ollama" && (apiKey.length < 8 || apiKey.length > 2048 || /[\r\n\0]/.test(apiKey))) {
    throw new Error("An API key is required for this provider");
  }
  if (kind === "ollama" && apiKey.length > 2048) throw new Error("API key is too long");
  return { kind, model, baseUrl: parsed.toString().replace(/\/$/, ""), ...(apiKey ? { apiKey } : {}) };
}

export class EncryptedProviderConfigStore {
  private readonly file: string;
  private readonly key: Buffer | undefined;

  constructor(file: string, keyHex: string | undefined) {
    this.file = path.resolve(file);
    if (keyHex) {
      if (!/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error("M1CRO_PROVIDER_CONFIG_KEY must be 32 bytes encoded as 64 hexadecimal characters");
      this.key = Buffer.from(keyHex, "hex");
    }
  }

  async load(): Promise<RuntimeProviderConfig | undefined> {
    let contents: string;
    try {
      const stat = await lstat(this.file);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Provider configuration must be a regular file");
      contents = await readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    if (!this.key) throw new Error("M1CRO_PROVIDER_CONFIG_KEY is required to decrypt the saved provider configuration");
    let envelope: { version?: number; iv?: string; tag?: string; data?: string };
    try { envelope = JSON.parse(contents) as typeof envelope; } catch { throw new Error("Saved provider configuration is invalid"); }
    if (envelope.version !== 1 || !envelope.iv || !envelope.tag || !envelope.data) throw new Error("Saved provider configuration is invalid");
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(envelope.iv, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString("utf8");
      return validateProviderConfig(JSON.parse(plaintext));
    } catch {
      throw new Error("Saved provider configuration could not be decrypted; verify the encryption key");
    }
  }

  async save(config: RuntimeProviderConfig): Promise<void> {
    if (!this.key) throw new Error("Provider credential storage is not configured on the runtime");
    const normalized = validateProviderConfig(config);
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(normalized), "utf8"), cipher.final()]);
    const envelope = JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") });
    const temporary = this.file + "." + randomBytes(8).toString("hex") + ".tmp";
    await writeFile(temporary, envelope, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await chmod(temporary, 0o600);
    await rename(temporary, this.file);
    await chmod(this.file, 0o600);
  }
}
