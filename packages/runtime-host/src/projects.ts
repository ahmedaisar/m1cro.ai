import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, realpath } from "node:fs/promises";
import path from "node:path";

export interface RuntimeProjectRecord {
  id: string;
  name: string;
  ownerId: string;
  workspacePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeProjectRegistry {
  list(ownerId: string): Promise<RuntimeProjectRecord[]>;
  get(id: string): Promise<RuntimeProjectRecord | undefined>;
  create(ownerId: string, name: string): Promise<RuntimeProjectRecord>;
  ensureDefault(ownerId: string, id: string, name: string, workspacePath: string): Promise<RuntimeProjectRecord>;
}

function validRecord(value: unknown): value is RuntimeProjectRecord {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(v.id)
    && typeof v.name === "string" && typeof v.ownerId === "string"
    && typeof v.workspacePath === "string" && path.isAbsolute(v.workspacePath)
    && typeof v.createdAt === "string" && typeof v.updatedAt === "string";
}

export class JsonlRuntimeProjectRegistry implements RuntimeProjectRegistry {
  private writes: Promise<void> = Promise.resolve();
  private creations: Promise<void> = Promise.resolve();
  private readonly file: string;
  private readonly root: string;
  constructor(file: string, projectsRoot: string) {
    this.file = path.resolve(file);
    this.root = path.resolve(projectsRoot);
  }

  async list(ownerId: string): Promise<RuntimeProjectRecord[]> {
    const records = await this.readAll();
    return records.filter(project => project.ownerId === ownerId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async get(id: string): Promise<RuntimeProjectRecord | undefined> {
    return (await this.readAll()).find(project => project.id === id);
  }

  async create(ownerId: string, name: string): Promise<RuntimeProjectRecord> {
    const operation = this.creations.then(() => this.createExclusive(ownerId, name));
    this.creations = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async createExclusive(ownerId: string, name: string): Promise<RuntimeProjectRecord> {
    const normalized = name.trim().replace(/\s+/g, " ");
    if (!ownerId || ownerId.length > 160) throw new Error("Invalid project owner");
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/.test(normalized) || normalized === "." || normalized === "..") {
      throw new Error("Project name must be 1-64 safe letters, numbers, spaces, dots, underscores or hyphens");
    }
    const existing = await this.list(ownerId);
    if (existing.some(project => project.name.toLowerCase() === normalized.toLowerCase())) throw new Error("A project with this name already exists");
    await this.ensureRoot();
    const id = randomUUID().replaceAll("-", "");
    const workspacePath = path.join(this.root, id);
    await mkdir(workspacePath, { mode: 0o700 });
    await chmod(workspacePath, 0o700);
    await this.assertContained(workspacePath);
    const now = new Date().toISOString();
    const record: RuntimeProjectRecord = { id, name: normalized, ownerId, workspacePath, createdAt: now, updatedAt: now };
    await this.append(record);
    return record;
  }

  async ensureDefault(ownerId: string, id: string, name: string, workspacePath: string): Promise<RuntimeProjectRecord> {
    const existing = await this.get(id);
    if (existing) return existing;
    const resolved = await realpath(path.resolve(workspacePath));
    const now = new Date().toISOString();
    const record: RuntimeProjectRecord = { id, name, ownerId, workspacePath: resolved, createdAt: now, updatedAt: now };
    await this.append(record);
    return record;
  }

  private async readAll(): Promise<RuntimeProjectRecord[]> {
    await this.ensureRoot();
    let contents: string;
    try {
      const stat = await lstat(this.file);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Project registry must be a regular file");
      contents = await readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const latest = new Map<string, RuntimeProjectRecord>();
    for (const line of contents.split("\n")) {
      if (!line.trim()) continue;
      let value: unknown;
      try { value = JSON.parse(line); } catch { throw new Error("Project registry contains malformed JSON"); }
      if (!validRecord(value)) throw new Error("Project registry contains an invalid record");
      latest.set(value.id, value);
    }
    const records = [...latest.values()];
    for (const record of records) if (record.id !== "default") await this.assertContained(record.workspacePath);
    return records;
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Projects root must be a real directory");
    await chmod(this.root, 0o700);
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const parent = await lstat(path.dirname(this.file));
    if (parent.isSymbolicLink() || !parent.isDirectory()) throw new Error("Project registry parent must be a real directory");
  }

  private async assertContained(candidate: string): Promise<void> {
    const [root, actual] = await Promise.all([realpath(this.root), realpath(candidate)]);
    const relative = path.relative(root, actual);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Project workspace escaped the configured projects root");
  }

  private async append(record: RuntimeProjectRecord): Promise<void> {
    const operation = this.writes.then(async () => {
      await this.ensureRoot();
      const handle = await open(this.file, "a", 0o600);
      try { await handle.writeFile(JSON.stringify(record) + "\n", "utf8"); } finally { await handle.close(); }
      await chmod(this.file, 0o600);
    });
    this.writes = operation.catch(() => undefined);
    await operation;
  }
}
