import { createHash } from "node:crypto";

export interface InferenceUsageInput {
  ownerId: string;
  requestId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  projectId?: string | null;
  organizationId?: string | null;
}

export interface UsageRecordInsert {
  id: string;
  ownerId: string;
  organizationId: string | null;
  projectId: string | null;
  metric: string;
  quantity: number;
  metadata: Record<string, string>;
}

/** Build deterministic ledger rows so retries cannot double-count the same inference request. */
export function buildInferenceUsageRows(input: InferenceUsageInput): UsageRecordInsert[] {
  for (const [field, value] of Object.entries({
    ownerId: input.ownerId,
    requestId: input.requestId,
    provider: input.provider,
    model: input.model,
  })) {
    if (!value.trim()) throw new Error(field + " must not be empty");
  }

  for (const [field, value] of Object.entries({
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(field + " must be a non-negative safe integer");
    }
  }

  const dimensions = {
    requestId: input.requestId,
    provider: input.provider,
    model: input.model,
  };
  const metrics = [
    { metric: "inference.requests", quantity: 1 },
    { metric: "inference.input_tokens", quantity: input.inputTokens },
    { metric: "inference.output_tokens", quantity: input.outputTokens },
  ];

  return metrics.map(({ metric, quantity }) => ({
    id: createHash("sha256")
      .update(JSON.stringify([input.ownerId, input.requestId, metric]))
      .digest("hex"),
    ownerId: input.ownerId,
    organizationId: input.organizationId ?? null,
    projectId: input.projectId ?? null,
    metric,
    quantity,
    metadata: dimensions,
  }));
}
