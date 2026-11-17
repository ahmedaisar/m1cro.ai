import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type RuntimeSessionStatus = "idle" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled";
export interface RuntimeSessionRecord {
  id: string;
  projectId: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  activeTurnId: string | undefined;
  status: RuntimeSessionStatus;
}
export interface RuntimeSessionRegistry {
  list(): Promise<RuntimeSessionRecord[]>;
  save(session: RuntimeSessionRecord): Promise<void>;
}

/** Append-only snapshots: the latest valid record for each session is authoritative. */
export class JsonlRuntimeSessionRegistry implements RuntimeSessionRegistry {
  private writes: Promise<void> = Promise.resolve();
  private readonly file: string;
  constructor(file: string) { this.file = resolve(file); }

  async list(): Promise<RuntimeSessionRecord[]> {
    await this.ensureDirectory();
    let contents: string;
    try {
      const stat = await lstat(this.file);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Session registry must be a regular file");
      contents = await readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const latest = new Map<string, RuntimeSessionRecord>();
    for (const line of contents.split("\n")) {
      if (!line.trim()) continue;
      let value: unknown;
      try { value = JSON.parse(line); } catch { throw new Error("Session registry contains malformed JSON"); }
      if (!isSessionRecord(value)) throw new Error("Session registry contains an invalid record");
      latest.set(value.id, value);
    }
    return [...latest.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async save(session: RuntimeSessionRecord): Promise<void> {
    if (!isSessionRecord(session)) throw new Error("Invalid runtime session record");
    const write = this.writes.then(async () => {
      await this.ensureDirectory();
      try {
        const stat = await lstat(this.file);
        if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Session registry must be a regular file");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0);
      const handle = await open(this.file, flags, 0o600);
      try {
        if (!(await handle.stat()).isFile()) throw new Error("Session registry must be a regular file");
        await handle.chmod(0o600);
        await handle.writeFile(JSON.stringify(session) + "\n", "utf8");
        await handle.sync();
      } finally { await handle.close(); }
    });
    this.writes = write.catch(() => {});
    await write;
  }

  private async ensureDirectory(): Promise<void> {
    const directory = dirname(this.file);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Session registry directory must be a real directory");
    await chmod(directory, 0o700);
  }
}

function isSessionRecord(value: unknown): value is RuntimeSessionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<RuntimeSessionRecord>;
  return typeof record.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(record.id)
    && typeof record.projectId === "string" && record.projectId.length > 0
    && typeof record.ownerId === "string" && record.ownerId.length > 0
    && typeof record.createdAt === "string" && typeof record.updatedAt === "string"
    && (record.activeTurnId === undefined || typeof record.activeTurnId === "string")
    && ["idle", "running", "awaiting_approval", "completed", "failed", "cancelled"].includes(String(record.status));
}
