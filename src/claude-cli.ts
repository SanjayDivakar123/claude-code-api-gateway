import { spawn } from "node:child_process";
import type { Response } from "express";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { openAiChunk } from "./openai-compat.js";
import { messagesToPrompt, systemPromptFromPayload } from "./prompts.js";
import { recordUsage } from "./usage.js";

type CliCompletion = {
  id: string;
  model: string;
  text: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  usageSource: "estimated";
  raw: unknown;
};

export const readClaudeCliJson = async (
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const completion = await runClaudeCliCompletion(payload);

  return {
    id: completion.id,
    type: "message",
    role: "assistant",
    model: completion.model,
    content: [
      {
        type: "text",
        text: completion.text
      }
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: completion.usage ?? {
      input_tokens: 0,
      output_tokens: 0
    },
    usage_source: completion.usageSource
  };
};

export const pipeClaudeCliAnthropicStream = async (
  payload: Record<string, unknown>,
  res: Response
) => {
  const completion = await runClaudeCliCompletion(payload);

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });

  writeAnthropicEvent(res, "message_start", {
    type: "message_start",
    message: {
      id: completion.id,
      type: "message",
      role: "assistant",
      model: completion.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: completion.usage?.input_tokens ?? 0,
        output_tokens: 0
      }
    }
  });
  writeAnthropicEvent(res, "content_block_start", {
    type: "content_block_start",
    index: 0,
    content_block: {
      type: "text",
      text: ""
    }
  });
  writeAnthropicEvent(res, "content_block_delta", {
    type: "content_block_delta",
    index: 0,
    delta: {
      type: "text_delta",
      text: completion.text
    }
  });
  writeAnthropicEvent(res, "content_block_stop", {
    type: "content_block_stop",
    index: 0
  });
  writeAnthropicEvent(res, "message_delta", {
    type: "message_delta",
    delta: {
      stop_reason: "end_turn",
      stop_sequence: null
    },
    usage: {
      output_tokens: completion.usage?.output_tokens ?? 0
    }
  });
  writeAnthropicEvent(res, "message_stop", {
    type: "message_stop"
  });
  res.end();
};

export const pipeClaudeCliOpenAiStream = async (
  payload: Record<string, unknown>,
  res: Response
) => {
  const completion = await runClaudeCliCompletion(payload);

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });

  res.write(
    `data: ${JSON.stringify(
      openAiChunk(`chatcmpl_${completion.id}`, completion.model, completion.text)
    )}\n\n`
  );
  res.write(
    `data: ${JSON.stringify(
      openAiChunk(`chatcmpl_${completion.id}`, completion.model, "", "stop")
    )}\n\n`
  );
  res.write("data: [DONE]\n\n");
  res.end();
};

const runClaudeCliCompletion = async (
  payload: Record<string, unknown>
): Promise<CliCompletion> => {
  return withClaudeSlot(() => runClaudeCliCompletionNow(payload));
};

const runClaudeCliCompletionNow = async (
  payload: Record<string, unknown>
): Promise<CliCompletion> => {
  const prompt = messagesToPrompt(payload);
  const systemPrompt = systemPromptFromPayload(payload);
  const args = [
    "-p",
    "--safe-mode",
    "--restricted",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--system-prompt",
    systemPrompt,
    "--output-format",
    "json",
    "--no-session-persistence",
    "--permission-mode",
    "dontAsk",
    "--permission-prompts",
    "none",
    "--tools",
    "",
    "--model",
    String(payload.model ?? config.defaultModel),
    prompt
  ];

  const child = spawn(config.claudeCliPath, args, {
    cwd: config.claudeCliCwd,
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: config.claudeConfigDir,
      CLAUDE_CODE_SAFE_MODE: "1",
      CLAUDE_CODE_SKIP_PROMPT_HISTORY: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  let didTimeout = false;

  const timeout = setTimeout(() => {
    didTimeout = true;
    child.kill("SIGTERM");
  }, config.requestTimeoutMs);

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  clearTimeout(timeout);

  if (didTimeout) {
    throw new HttpError(504, "Claude CLI request timed out");
  }

  if (exitCode !== 0) {
    throw new HttpError(502, "Claude CLI request failed", stderr || stdout);
  }

  const parsed = parseCliJson(stdout);
  const text = extractCliText(parsed, stdout);
  const usage = estimateUsage(`${systemPrompt}\n\n${prompt}`, text);

  recordUsage(usage);

  return {
    id: extractCliId(parsed),
    model: String((parsed as any)?.model ?? payload.model ?? config.defaultModel),
    text,
    usage,
    usageSource: "estimated",
    raw: parsed
  };
};

let activeClaudeRuns = 0;
const waitingClaudeRuns: Array<() => void> = [];

const withClaudeSlot = async <T>(work: () => Promise<T>) => {
  await acquireClaudeSlot();

  try {
    return await work();
  } finally {
    releaseClaudeSlot();
  }
};

const acquireClaudeSlot = async () => {
  if (activeClaudeRuns < config.maxConcurrentClaudeRuns) {
    activeClaudeRuns += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    waitingClaudeRuns.push(resolve);
  });
  activeClaudeRuns += 1;
};

const releaseClaudeSlot = () => {
  activeClaudeRuns -= 1;
  const next = waitingClaudeRuns.shift();

  if (next) {
    next();
  }
};

const parseCliJson = (stdout: string) => {
  try {
    return JSON.parse(stdout);
  } catch {
    return {
      result: stdout.trim()
    };
  }
};

const extractCliText = (parsed: unknown, fallback: string) => {
  const value = parsed as any;

  if (typeof value?.result === "string") {
    return value.result;
  }

  if (typeof value?.message?.content === "string") {
    return value.message.content;
  }

  if (Array.isArray(value?.message?.content)) {
    return value.message.content
      .map((block: any) => (block?.type === "text" ? block.text : ""))
      .join("");
  }

  return fallback.trim();
};

const estimateUsage = (prompt: string, text: string) => {
  return {
    input_tokens: estimateTokens(prompt),
    output_tokens: estimateTokens(text)
  };
};

const estimateTokens = (value: string) => {
  return Math.max(1, Math.ceil(value.length / 4));
};

const extractCliId = (parsed: unknown) => {
  const value = parsed as any;
  return String(value?.session_id ?? value?.id ?? crypto.randomUUID());
};

const writeAnthropicEvent = (
  res: Response,
  event: string,
  payload: Record<string, unknown>
) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};
