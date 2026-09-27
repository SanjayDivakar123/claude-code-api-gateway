import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";
import helmet from "helmet";
import morgan from "morgan";
import { loginPage, saveClaudeToken } from "./admin.js";
import {
  pipeAnthropicStream,
  pipeOpenAiStream,
  readAnthropicJson
} from "./anthropic.js";
import { requireGatewayAuth } from "./auth.js";
import {
  pipeClaudeCliAnthropicStream,
  pipeClaudeCliOpenAiStream,
  readClaudeCliJson
} from "./claude-cli.js";
import { config, missingConfig } from "./config.js";
import { docsHtml } from "./docs.js";
import { HttpError, sendError } from "./errors.js";
import { toAnthropicRequest, toOpenAiCompletion } from "./openai-compat.js";
import {
  anthropicMessagesRequestSchema,
  openAiChatRequestSchema
} from "./schemas.js";
import { usageSnapshot } from "./usage.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
app.use(morgan("tiny"));

app.get("/", (_req, res) => {
  res.type("html").send(docsHtml());
});

app.get("/docs", (_req, res) => {
  res.type("html").send(docsHtml());
});

app.get("/login", loginPage);
app.post("/login", asyncHandler(saveClaudeToken));

app.get("/health", (_req, res) => {
  const missing = missingConfig();

  res.status(missing.length > 0 ? 503 : 200).json({
    ok: missing.length === 0,
    missing,
    provider: config.provider,
    model: config.defaultModel
  });
});

app.use("/v1", requireGatewayAuth);

app.get("/v1/usage", (_req, res) => {
  res.json(usageSnapshot());
});

app.post("/v1/messages", asyncHandler(async (req, res) => {
  const parsed = anthropicMessagesRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, "Invalid Anthropic messages request", parsed.error.flatten());
  }

  const payload = {
    max_tokens: 1024,
    ...parsed.data,
    model: parsed.data.model ?? config.defaultModel
  };

  if (payload.stream) {
    if (config.provider === "subscription") {
      await pipeClaudeCliAnthropicStream(payload, res);
    } else {
      await pipeAnthropicStream(payload, res);
    }
    return;
  }

  res.json(
    config.provider === "subscription"
      ? await readClaudeCliJson(payload)
      : await readAnthropicJson(payload)
  );
}));

app.post("/v1/chat/completions", asyncHandler(async (req, res) => {
  const parsed = openAiChatRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, "Invalid chat completions request", parsed.error.flatten());
  }

  const anthropicPayload = toAnthropicRequest(parsed.data, config.defaultModel);

  if (anthropicPayload.stream) {
    if (config.provider === "subscription") {
      await pipeClaudeCliOpenAiStream(anthropicPayload, res);
    } else {
      await pipeOpenAiStream(anthropicPayload, res);
    }
    return;
  }

  const anthropicResponse =
    config.provider === "subscription"
      ? await readClaudeCliJson(anthropicPayload)
      : await readAnthropicJson(anthropicPayload);
  res.json(toOpenAiCompletion(anthropicResponse));
}));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) {
    return;
  }

  if (err instanceof HttpError) {
    sendError(res, err.status, err.message, err.details);
    return;
  }

  console.error(err);
  sendError(res, 500, "Internal server error");
});

app.listen(config.port, () => {
  console.log(`Claude API gateway listening on http://localhost:${config.port}`);
});

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
