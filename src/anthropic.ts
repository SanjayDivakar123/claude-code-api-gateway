import type { Response as ExpressResponse } from "express";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { mapStopReason, openAiChunk } from "./openai-compat.js";
import { recordUsage } from "./usage.js";

export const callAnthropicMessages = async (payload: Record<string, unknown>) => {
  if (!config.anthropicApiKey) {
    throw new HttpError(500, "Gateway is missing ANTHROPIC_API_KEY");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(`${config.anthropicBaseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.anthropicApiKey,
        "anthropic-version": config.anthropicVersion
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new HttpError(
        response.status,
        "Anthropic API request failed",
        await safeJson(response)
      );
    }

    return response;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(504, "Anthropic API request timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const readAnthropicJson = async (payload: Record<string, unknown>) => {
  const response = await callAnthropicMessages({ ...payload, stream: false });
  const json = await response.json();
  recordUsage(json.usage);
  return json;
};

export const pipeAnthropicStream = async (
  payload: Record<string, unknown>,
  res: ExpressResponse
) => {
  const response = await callAnthropicMessages({ ...payload, stream: true });

  if (!response.body) {
    throw new HttpError(502, "Anthropic API returned an empty stream");
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });

  const reader = response.body.getReader();

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    res.write(Buffer.from(value));
  }

  res.end();
};

export const pipeOpenAiStream = async (
  payload: Record<string, unknown>,
  res: ExpressResponse
) => {
  const response = await callAnthropicMessages({ ...payload, stream: true });

  if (!response.body) {
    throw new HttpError(502, "Anthropic API returned an empty stream");
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let completionId = `chatcmpl_${crypto.randomUUID()}`;
  let model = String(payload.model ?? config.defaultModel);
  let finishReason: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const event = parseSseFrame(frame);

      if (!event?.data || event.data === "[DONE]") {
        continue;
      }

      const data = JSON.parse(event.data);

      if (event.event === "message_start") {
        completionId = `chatcmpl_${data.message.id}`;
        model = data.message.model ?? model;
        inputTokens = data.message.usage?.input_tokens ?? inputTokens;
      }

      if (
        event.event === "content_block_delta" &&
        data.delta?.type === "text_delta"
      ) {
        res.write(
          `data: ${JSON.stringify(
            openAiChunk(completionId, model, data.delta.text)
          )}\n\n`
        );
      }

      if (event.event === "message_delta") {
        finishReason = mapStopReason(data.delta?.stop_reason);
        outputTokens = data.usage?.output_tokens ?? outputTokens;
      }
    }

    if (done) {
      break;
    }
  }

  recordUsage({
    input_tokens: inputTokens,
    output_tokens: outputTokens
  });

  res.write(
    `data: ${JSON.stringify(openAiChunk(completionId, model, "", finishReason))}\n\n`
  );
  res.write("data: [DONE]\n\n");
  res.end();
};

const safeJson = async (response: globalThis.Response) => {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const parseSseFrame = (frame: string) => {
  const lines = frame.split("\n");
  let event = "";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  if (!event && dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: dataLines.join("\n")
  };
};
