# Claude Code API Gateway

An API-first gateway your platform can call from a backend service. It supports two provider modes:

- `CLAUDE_PROVIDER=api`: uses a server-side Anthropic API key.
- `CLAUDE_PROVIDER=subscription`: uses an approved Claude Code subscription auth path by invoking `claude -p` non-interactively.

It exposes:

- `POST /v1/messages` for Anthropic Messages API-compatible requests.
- `POST /v1/chat/completions` for OpenAI-style chat clients.
- `GET /v1/usage` for basic in-memory token/request totals.
- `GET /health` for deployment checks.

This does not automate browser login. Subscription mode expects the host to already be authenticated with Claude Code, or to receive an approved `CLAUDE_CODE_OAUTH_TOKEN`.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```bash
CLAUDE_PROVIDER=subscription
GATEWAY_API_KEY=replace-with-a-long-random-secret
CLAUDE_CODE_OAUTH_TOKEN=your-approved-token
DEFAULT_MODEL=claude-sonnet-5
```

For regular API-key mode instead:

```bash
CLAUDE_PROVIDER=api
GATEWAY_API_KEY=replace-with-a-long-random-secret
ANTHROPIC_API_KEY=your-anthropic-api-key
DEFAULT_MODEL=claude-sonnet-5
```

## Run

```bash
npm run dev
```

The API starts on `http://localhost:8787`.

## Anthropic-style request

```bash
curl http://localhost:8787/v1/messages \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-5",
    "max_tokens": 512,
    "messages": [
      { "role": "user", "content": "Write a short onboarding email." }
    ]
  }'
```

Streaming is passed through as Anthropic server-sent events:

```bash
curl -N http://localhost:8787/v1/messages \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "stream": true,
    "max_tokens": 512,
    "messages": [
      { "role": "user", "content": "Stream a tiny haiku." }
    ]
  }'
```

In subscription mode, streaming endpoints emit SSE-compatible responses after the Claude Code run completes. Use API-key mode if you need true token-by-token passthrough streaming.

## OpenAI-style request

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-5",
    "messages": [
      { "role": "system", "content": "You are concise." },
      { "role": "user", "content": "Explain API gateways in one paragraph." }
    ]
  }'
```

Streaming is translated to OpenAI-style server-sent events:

```bash
curl -N http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "stream": true,
    "messages": [
      { "role": "user", "content": "Count to five, slowly." }
    ]
  }'
```

## Production notes

- Put this behind HTTPS.
- Use a long random `GATEWAY_API_KEY`, rotate it periodically, and store it in your platform secrets manager.
- Replace the in-memory usage counter with Postgres/Redis if you need durable billing, quotas, or per-customer limits.
- Add per-tenant auth if more than one customer or workspace will call this API.
- In subscription mode, run `claude auth status` or set `CLAUDE_CODE_OAUTH_TOKEN` before starting the server.
- Tune `MAX_CONCURRENT_CLAUDE_RUNS` to avoid spawning more Claude Code sessions than your approved usage pattern allows.
- If `ALLOW_WEB_TOKEN_SETUP=true` and `GATEWAY_ENV_FILE` is set, `/login` lets you paste an approved Claude Code OAuth token. Use your `GATEWAY_API_KEY` as the admin key.
- In subscription mode, usage totals are estimates derived from request/response text length. Do not use them for billing without adding your own metering.
- Subscription mode replaces Claude Code's default coding-agent system prompt with a neutral API prompt, or with the caller-provided system message when present.
- Check Anthropic's terms and your approval scope before using subscription mode for third-party or production platform traffic. Use `CLAUDE_PROVIDER=api` for standard API-key-backed deployments.

## License

MIT
