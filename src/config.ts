import dotenv from "dotenv";

dotenv.config();

const toInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: toInt(process.env.PORT, 8787),
  provider: process.env.CLAUDE_PROVIDER ?? "api",
  gatewayApiKey: process.env.GATEWAY_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
  anthropicVersion: process.env.ANTHROPIC_VERSION ?? "2023-06-01",
  defaultModel: process.env.DEFAULT_MODEL ?? "claude-sonnet-5",
  claudeCliPath: process.env.CLAUDE_CLI_PATH ?? "claude",
  claudeCliCwd: process.env.CLAUDE_CLI_CWD ?? "/var/lib/llm-runtime",
  claudeConfigDir:
    process.env.CLAUDE_CONFIG_DIR ?? "/var/lib/llm-runtime/claude-config",
  gatewayEnvFile: process.env.GATEWAY_ENV_FILE,
  allowWebTokenSetup: process.env.ALLOW_WEB_TOKEN_SETUP === "true",
  maxConcurrentClaudeRuns: toInt(process.env.MAX_CONCURRENT_CLAUDE_RUNS, 2),
  requestTimeoutMs: toInt(process.env.REQUEST_TIMEOUT_MS, 600_000)
};

export const missingConfig = () => {
  const missing: string[] = [];

  if (!config.gatewayApiKey) {
    missing.push("GATEWAY_API_KEY");
  }

  if (config.provider === "api" && !config.anthropicApiKey) {
    missing.push("ANTHROPIC_API_KEY");
  }

  if (!["api", "subscription"].includes(config.provider)) {
    missing.push("CLAUDE_PROVIDER must be api or subscription");
  }

  return missing;
};
