import type { z } from "zod";
import type { openAiChatRequestSchema } from "./schemas.js";

type OpenAiChatRequest = z.infer<typeof openAiChatRequestSchema>;

const stringifyContent = (content: unknown) => {
  if (content === null || content === undefined) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  return JSON.stringify(content);
};

export const toAnthropicRequest = (
  body: OpenAiChatRequest,
  defaultModel: string
) => {
  const system = body.messages
    .filter((message) => message.role === "system")
    .map((message) => stringifyContent(message.content))
    .filter(Boolean)
    .join("\n\n");

  const messages = body.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content:
        message.role === "tool"
          ? `Tool result:\n${stringifyContent(message.content)}`
          : stringifyContent(message.content)
    }));

  const mergedMessages = mergeAdjacentMessages(messages);

  return {
    model: body.model ?? defaultModel,
    max_tokens: body.max_tokens ?? body.max_completion_tokens ?? 1024,
    messages: mergedMessages,
    system: system || undefined,
    stream: body.stream ?? false,
    temperature: body.temperature
  };
};

export const toOpenAiCompletion = (anthropicResponse: any) => {
  const text = extractText(anthropicResponse.content);
  const inputTokens = anthropicResponse.usage?.input_tokens ?? 0;
  const outputTokens = anthropicResponse.usage?.output_tokens ?? 0;

  return {
    id: `chatcmpl_${anthropicResponse.id}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: anthropicResponse.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text
        },
        finish_reason: mapStopReason(anthropicResponse.stop_reason)
      }
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens
    },
    usage_source: anthropicResponse.usage_source
  };
};

export const openAiChunk = (
  id: string,
  model: string,
  content: string,
  finishReason: string | null = null
) => ({
  id,
  object: "chat.completion.chunk",
  created: Math.floor(Date.now() / 1000),
  model,
  choices: [
    {
      index: 0,
      delta: content ? { content } : {},
      finish_reason: finishReason
    }
  ]
});

export const extractText = (content: unknown) => {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block: any) => (block?.type === "text" ? block.text : ""))
    .join("");
};

export const mapStopReason = (reason: string | undefined) => {
  switch (reason) {
    case "end_turn":
      return "stop";
    case "max_tokens":
      return "length";
    case "stop_sequence":
      return "stop";
    case "tool_use":
      return "tool_calls";
    default:
      return reason ?? null;
  }
};

const mergeAdjacentMessages = (
  messages: Array<{ role: "user" | "assistant"; content: string }>
) => {
  const merged: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of messages) {
    const last = merged.at(-1);

    if (last?.role === message.role) {
      last.content = `${last.content}\n\n${message.content}`;
    } else {
      merged.push(message);
    }
  }

  return merged.length > 0
    ? merged
    : [{ role: "user" as const, content: "Continue." }];
};
