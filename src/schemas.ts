import { z } from "zod";

const contentSchema = z.union([z.string(), z.array(z.unknown()), z.unknown()]);

export const anthropicMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: contentSchema
});

export const anthropicMessagesRequestSchema = z
  .object({
    model: z.string().min(1).optional(),
    max_tokens: z.number().int().positive().max(200_000).optional(),
    messages: z.array(anthropicMessageSchema).min(1),
    system: z.union([z.string(), z.array(z.unknown())]).optional(),
    stream: z.boolean().optional(),
    stop_sequences: z.array(z.string()).optional(),
    tools: z.array(z.unknown()).optional(),
    tool_choice: z.unknown().optional(),
    metadata: z.unknown().optional(),
    thinking: z.unknown().optional(),
    output_config: z.unknown().optional()
  })
  .passthrough();

export const openAiChatRequestSchema = z
  .object({
    model: z.string().min(1).optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant", "tool"]),
          content: z.union([z.string(), z.array(z.unknown()), z.null()]).optional()
        })
      )
      .min(1),
    max_tokens: z.number().int().positive().max(200_000).optional(),
    max_completion_tokens: z.number().int().positive().max(200_000).optional(),
    stream: z.boolean().optional(),
    temperature: z.number().min(0).max(1).optional()
  })
  .passthrough();
