type ClaudeMessage = {
  role: "user" | "assistant";
  content: unknown;
};

const defaultSystemPrompt =
  "You are a general-purpose AI assistant behind an HTTP API. Answer the user's request directly and follow any developer or user instructions in the request. Do not mention local files, working directories, terminals, tools, Claude Code, or runtime environment details unless the user explicitly asks about the service infrastructure.";

export const messagesToPrompt = (payload: Record<string, unknown>) => {
  const messages = Array.isArray(payload.messages)
    ? (payload.messages as ClaudeMessage[])
    : [];

  const transcript = messagesToTranscript(messages);

  return transcript || "Hello";
};

export const systemPromptFromPayload = (payload: Record<string, unknown>) => {
  const system = stringifyContent(payload.system);
  return system || defaultSystemPrompt;
};

const messagesToTranscript = (messages: ClaudeMessage[]) => {
  if (messages.length === 1 && messages[0]?.role === "user") {
    return stringifyContent(messages[0].content);
  }

  return messages
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      return `${role}:\n${stringifyContent(message.content)}`;
    })
    .join("\n\n");
};

const stringifyContent = (content: unknown) => {
  if (content === null || content === undefined) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((block: any) => {
        if (typeof block === "string") {
          return block;
        }

        if (block?.type === "text") {
          return block.text ?? "";
        }

        return JSON.stringify(block);
      })
      .filter(Boolean)
      .join("\n");
  }

  return JSON.stringify(content);
};
