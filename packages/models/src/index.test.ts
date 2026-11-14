import { describe, expect, it } from "vitest";
import { capabilityState, ModelCatalog } from "./index.js";

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
