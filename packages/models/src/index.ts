export type CapabilityState = "supported" | "unsupported" | "unknown";
export type ModelCapability =
  | "text"
  | "toolCalling"
  | "vision"
  | "jsonMode"
  | "streaming"
  | "reasoning"
  | "embeddings";

export interface CapabilityValue {
  state: CapabilityState;
  source: "provider" | "user" | "inferred" | "default";
}

export interface ModelRecord {
  provider: string;
  /** Provider's exact model identifier. Never normalize or rewrite this value. */
  id: string;
  displayName?: string;
  contextWindow?: number;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  capabilities: Partial<Record<ModelCapability, CapabilityValue>>;
}

export interface ModelMetadata {
  displayName?: string;
  contextWindow?: number;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  capabilities?: Partial<Record<ModelCapability, CapabilityState>>;
}

const capabilityNames: readonly ModelCapability[] = [
  "text", "toolCalling", "vision", "jsonMode", "streaming", "reasoning", "embeddings",
];

function validateNonNegative(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
}

function key(provider: string, id: string): string {
  if (!provider.trim()) throw new Error("provider must not be empty");
  if (!id.trim()) throw new Error("model id must not be empty");
  return JSON.stringify([provider, id]);
}

/** In-memory normalized catalog. Provider/model identifiers are treated as opaque strings. */
export class ModelCatalog {
  private readonly records = new Map<string, ModelRecord>();

  register(record: ModelRecord): void {
    const recordKey = key(record.provider, record.id);
    validateNonNegative(record.contextWindow, "contextWindow");
    validateNonNegative(record.inputPricePerMillion, "inputPricePerMillion");
    validateNonNegative(record.outputPricePerMillion, "outputPricePerMillion");
    for (const capability of Object.keys(record.capabilities)) {
      if (!capabilityNames.includes(capability as ModelCapability)) {
        throw new Error(`Unknown model capability: ${capability}`);
      }
      const value = record.capabilities[capability as ModelCapability];
      if (!value || !["supported", "unsupported", "unknown"].includes(value.state)) {
        throw new Error(`Invalid capability state: ${capability}`);
      }
    }
    this.records.set(recordKey, {
      ...record,
      capabilities: { ...record.capabilities },
    });
  }

  get(provider: string, id: string): ModelRecord | undefined {
    const record = this.records.get(key(provider, id));
    return record ? { ...record, capabilities: { ...record.capabilities } } : undefined;
  }

  list(provider?: string): ModelRecord[] {
    return [...this.records.values()]
      .filter((record) => provider === undefined || record.provider === provider)
      .map((record) => ({ ...record, capabilities: { ...record.capabilities } }));
  }

  /** Merge metadata without converting unknown into a boolean or overwriting provider facts. */
  merge(provider: string, id: string, metadata: ModelMetadata, source: "provider" | "user" | "inferred" = "provider"): ModelRecord {
    const existing = this.get(provider, id) ?? { provider, id, capabilities: {} };
    const capabilities = { ...existing.capabilities };
    for (const [name, state] of Object.entries(metadata.capabilities ?? {}) as [ModelCapability, CapabilityState][]) {
      const current = capabilities[name];
      const incomingRank = source === "provider" ? 3 : source === "user" ? 2 : 1;
      const currentRank = current?.source === "provider" ? 3 : current?.source === "user" ? 2 : current ? 1 : 0;
      if (!current || incomingRank >= currentRank) capabilities[name] = { state, source };
    }
    const merged: ModelRecord = {
      ...existing,
      ...(metadata.displayName !== undefined ? { displayName: metadata.displayName } : {}),
      ...(metadata.contextWindow !== undefined ? { contextWindow: metadata.contextWindow } : {}),
      ...(metadata.inputPricePerMillion !== undefined ? { inputPricePerMillion: metadata.inputPricePerMillion } : {}),
      ...(metadata.outputPricePerMillion !== undefined ? { outputPricePerMillion: metadata.outputPricePerMillion } : {}),
      capabilities,
    };
    this.register(merged);
    return this.get(provider, id)!;
  }
}

export function capabilityState(model: ModelRecord, capability: ModelCapability): CapabilityState {
  return model.capabilities[capability]?.state ?? "unknown";
}
