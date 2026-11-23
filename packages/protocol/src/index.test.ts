import { describe, expect, it } from "vitest";
import { createSessionDeepLink, readSessionDeepLink, RuntimeEventSequencer, isRuntimeEventEnvelope, RUNTIME_PROTOCOL_NAME, RUNTIME_PROTOCOL_VERSION } from "./index.js";

describe("versioned runtime client protocol", () => {
  it("wraps events in a versioned session envelope", () => {
    const sequencer = new RuntimeEventSequencer();
    expect(sequencer.wrap("session-a", { type: "text.delta", turnId: "turn-1", delta: "hello" })).toEqual({
      protocol: RUNTIME_PROTOCOL_NAME, version: RUNTIME_PROTOCOL_VERSION, sessionId: "session-a", sequence: 1,
      event: { type: "text.delta", turnId: "turn-1", delta: "hello" }
    });
  });
  it("increments sequence per session independently", () => {
    const sequencer = new RuntimeEventSequencer();
    expect(sequencer.wrap("a", { type: "turn.status", turnId: "t", status: "running" }).sequence).toBe(1);
    expect(sequencer.wrap("b", { type: "turn.status", turnId: "t", status: "running" }).sequence).toBe(1);
    expect(sequencer.wrap("a", { type: "turn.status", turnId: "t", status: "completed" }).sequence).toBe(2);
  });
  it("resets sequence only for the requested session", () => {
    const sequencer = new RuntimeEventSequencer();
    sequencer.wrap("a", { type: "turn.status", turnId: "t", status: "running" });
    sequencer.wrap("b", { type: "turn.status", turnId: "t", status: "running" });
    sequencer.reset("a");
    expect(sequencer.wrap("a", { type: "turn.status", turnId: "t", status: "completed" }).sequence).toBe(1);
    expect(sequencer.wrap("b", { type: "turn.status", turnId: "t", status: "completed" }).sequence).toBe(2);
  });
  it("rejects malformed or unsupported envelopes", () => {
    expect(isRuntimeEventEnvelope({ protocol: RUNTIME_PROTOCOL_NAME, version: 1, sessionId: "s", sequence: 1, event: { type: "text.delta" } })).toBe(true);
    expect(isRuntimeEventEnvelope({ protocol: RUNTIME_PROTOCOL_NAME, version: 2, sessionId: "s", sequence: 1, event: { type: "text.delta" } })).toBe(false);
    expect(isRuntimeEventEnvelope({ protocol: RUNTIME_PROTOCOL_NAME, version: 1, sessionId: "", sequence: 1, event: { type: "text.delta" } })).toBe(false);
    expect(isRuntimeEventEnvelope({ protocol: RUNTIME_PROTOCOL_NAME, version: 1, sessionId: "s", sequence: 0, event: { type: "text.delta" } })).toBe(false);
    expect(isRuntimeEventEnvelope(null)).toBe(false);
  });
});


describe("cross-client session deep links", () => {
  it("creates a URL with a stable session query parameter and preserves other query values", () => {
    expect(createSessionDeepLink("https://app.m1cro.ai/?source=editor", "session-123"))
      .toBe("https://app.m1cro.ai/?source=editor&session=session-123");
  });

  it("encodes session identifiers and reads them back", () => {
    const link = createSessionDeepLink("https://app.m1cro.ai", "session/with spaces");
    expect(readSessionDeepLink(link)).toBe("session/with spaces");
  });

  it("returns null for missing or invalid session links", () => {
    expect(readSessionDeepLink("https://app.m1cro.ai")).toBeNull();
    expect(readSessionDeepLink("not a url")).toBeNull();
    expect(readSessionDeepLink("https://app.m1cro.ai/?session=%20%20")).toBeNull();
  });

  it("rejects empty session identifiers when creating links", () => {
    expect(() => createSessionDeepLink("https://app.m1cro.ai", "  ")).toThrow("sessionId must not be empty");
  });
});
