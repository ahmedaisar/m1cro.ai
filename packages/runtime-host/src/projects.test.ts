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
    const { registry } = await fixture();
    await expect(registry.create("alice", "../outside")).rejects.toThrow("Project name");
    await expect(registry.create("alice", "/tmp/escape")).rejects.toThrow("Project name");
    await expect(registry.create("alice", "..\\\\outside")).rejects.toThrow("Project name");
  });

  it("rejects a projects root that is a symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "m1cro-project-root-")); roots.push(root);
    const outside = await mkdtemp(join(tmpdir(), "m1cro-outside-")); roots.push(outside);
    const link = join(root, "linked-workspaces"); await symlink(outside, link);
    const registry = new JsonlRuntimeProjectRegistry(join(root, "data", "projects.jsonl"), link);
    await expect(registry.create("alice", "Escaped")).rejects.toThrow("real directory");
  });

  it("rejects a persisted workspace that is replaced by a symlink escape", async () => {
    const { root, registry } = await fixture();
    const created = await registry.create("alice", "Safe");
    const outside = await mkdtemp(join(tmpdir(), "m1cro-escaped-")); roots.push(outside);
    await rm(created.workspacePath, { recursive: true, force: true });
    await symlink(outside, created.workspacePath);
    await expect(registry.get(created.id)).rejects.toThrow("escaped");
  });
});
