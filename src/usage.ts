export type UsageRecord = {
  input_tokens?: number;
  output_tokens?: number;
};

const totals = {
  requests: 0,
  input_tokens: 0,
  output_tokens: 0,
  last_request_at: null as string | null
};

export const recordUsage = (usage?: UsageRecord) => {
  totals.requests += 1;
  totals.input_tokens += usage?.input_tokens ?? 0;
  totals.output_tokens += usage?.output_tokens ?? 0;
  totals.last_request_at = new Date().toISOString();
};

export const usageSnapshot = () => ({
  ...totals,
  total_tokens: totals.input_tokens + totals.output_tokens
});
