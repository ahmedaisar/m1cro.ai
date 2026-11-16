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
  private readonly file: string;
  private readonly root: string;
  constructor(file: string, projectsRoot: string) {
    this.file = path.resolve(file);
    this.root = path.resolve(projectsRoot);
  }

  async list(ownerId: string): Pr¶»§q«^