import { describe, expect, it } from "vitest";
import { RuntimeEventSequencer, isRuntimeEventEnvelope, RUNTIME_PROTOCOL_NAME, RUNTIME_PROTOCOL_VERSION } from "./index.js";

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
