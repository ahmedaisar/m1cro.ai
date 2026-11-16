import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlRuntimeProjectRegistry } from "./projects.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "m1cro-projects-")); roots.push(root);
  const registry = new JsonlRuntimeProjectRegistry(join(root, "data", "projects.jsonl"), join(root, "workspaces"));
  return { root, registry };
}

describe("JsonlRuntimeProjectRegistry", () => {
  it("creates private project workspaces and persists them across instances", async () => {
    const { root, registry } = await fixture();
    const created = await registry.create("alice", "Website Refactor");
    expect(created.workspacePath).toBe(join(root, "workspaces", created.id));
    expect((await registry.list("alice")).map(project => project.id)).toEqual([created.id]);
    expect(await new JsonlRuntimeProjectRegistry(join(root, "data", "projects.jsonl"), join(root, "workspaces")).get(created.id)).toEqual(created);
    expect((await registry.list("bob"))).toEqual([]);
    expect((await readFile(join(root, "data", "projects.jsonl"), "utf8"))).toContain("Website Refactor");
  });

  it("rejects traversal and unsafe project names", async () => {
    const { registry } = awa¶»§q«^