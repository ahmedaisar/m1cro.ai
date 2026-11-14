import { describe, expect, it } from "vitest";
import { capabilityState, evaluateModelCapabilities, ModelCatalog, partitionModelsByCapabilities } from "./index.js";

describe("ModelCatalog", () => {
  it("preserves the provider's exact model identifier", () => {
    const catalog = new ModelCatalog();
    catalog.register({ provider: "openai-compatible", id: "vendor/model-v2:latest", capabilities: {} });
    expect(catalog.get("openai-compatible", "vendor/model-v2:latest")?.id).toBe("vendor/model-v2:latest");
    expect(catalog.get("openai-compatible", "vendor/model-v2")).toBeUndefined();
  });

  it("keeps unknown distinct from supported and unsupported", () => {
    const catalog = new ModelCatalog();
    const model = catalog.merge("local", "qwen-local", { capabilities: { vision: "unknown" } });
    expect(capabilityState(model, "vision")).toBe("unknown");
    expect(capabilityState(model, "toolCalling")).toBe("unknown");
  });

  it("does not let inferred metadata overwrite provider facts", () => {
    const catalog = new ModelCatalog();
    catalog.merge("provider", "model", { capabilities: { vision: "unsupported" } }, "provider");
    catalog.merge("provider", "model", { capabilities: { vision: "supported" } }, "inferred");
    expect(capabilityState(catalog.get("provider", "model")!, "vision")).toBe("unsupported");
  });

  it("allows provider metadata to supersede inferred metadata", () => {
    const catalog = new ModelCatalog();
    catalog.merge("provider", "model", { capabilities: { toolCalling: "unknown" } }, "inferred");
    catalog.merge("provider", "model", { capabilities: { toolCalling: "supported" } }, "provider");
    expect(capabilityState(catalog.get("provider", "model")!, "toolCalling")).toBe("supported");
  });

  it("validates numeric metadata", () => {
    const catalog = new ModelCatalog();
    expect(() => catalog.register({
      provider: "p", id: "m", contextWindow: -1, capabilities: {},
    })).toThrow("contextWindow");
  });
});


describe("capability-aware model evaluation", () => {
  it("only treats explicit support for every requirement as compatible", () => {
    const catalog = new ModelCatalog();
    const compatible = catalog.merge("p", "complete", {
      capabilities: { toolCalling: "supported", vision: "supported" },
    });
    const unknown = catalog.merge("p", "partial", {
      capabilities: { toolCalling: "supported" },
    });
    const incompatible = catalog.merge("p", "no-vision", {
      capabilities: { toolCalling: "supported", vision: "unsupported" },
    });
    expect(evaluateModelCapabilities(compatible, ["toolCalling", "vision"]).status).toBe("compatible");
    expect(evaluateModelCapabilities(unknown, ["toolCalling", "vision"])).toMatchObject({
      status: "unknown", supported: ["toolCalling"], unknown: ["vision"], unsupported: [],
    });
    expect(evaluateModelCapabilities(incompatible, ["toolCalling", "vision"])).toMatchObject({
      status: "incompatible", unsupported: ["vision"],
    });
  });

  it("partitions candidates without guessing from model names and preserves candidate order", () => {
    const catalog = new ModelCatalog();
    catalog.register({ provider: "p", id: "vision-ready", capabilities: { vision: { state: "supported", source: "provider" } } });
    catalog.register({ provider: "p", id: "unknown-vision-model", capabilities: {} });
    catalog.register({ provider: "p", id: "text-only", capabilities: { vision: { state: "unsupported", source: "provider" } } });
    const groups = partitionModelsByCapabilities(catalog.list(), ["vision"]);
    expect(groups.compatible.map((model) => model.id)).toEqual(["vision-ready"]);
    expect(groups.needsVerification.map((model) => model.id)).toEqual(["unknown-vision-model"]);
    expect(groups.incompatible.map((model) => model.id)).toEqual(["text-only"]);
  });

  it("deduplicates repeated requirements and allows an empty requirement set", () => {
    const catalog = new ModelCatalog();
    const evaluation = evaluateModelCapabilities({ provider: "p", id: "any", capabilities: {} }, ["text", "text"]);
    expect(evaluation.required).toEqual(["text"]);
    expect(evaluation.status).toBe("unknown");
    expect(evaluateModelCapabilities({ provider: "p", id: "any", capabilities: {} }, []).status).toBe("compatible");
  });
});
