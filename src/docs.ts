import { config, missingConfig } from "./config.js";

export const docsHtml = () => {
  const missing = missingConfig();
  const status = missing.length === 0 ? "Ready" : "Needs setup";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Claude Subscription API Gateway</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #f7f4ef;
        --ink: #1f2933;
        --muted: #5f6c7b;
        --line: #d8d2c7;
        --panel: #ffffff;
        --accent: #0f766e;
        --accent-dark: #115e59;
        --code: #111827;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #111418;
          --ink: #edf2f7;
          --muted: #a8b3c2;
          --line: #2f3742;
          --panel: #181d23;
          --accent: #2dd4bf;
          --accent-dark: #5eead4;
          --code: #05070a;
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.5;
      }

      main {
        max-width: 1080px;
        margin: 0 auto;
        padding: 48px 24px 72px;
      }

      header {
        display: grid;
        gap: 16px;
        padding-bottom: 32px;
        border-bottom: 1px solid var(--line);
      }

      h1 {
        max-width: 760px;
        margin: 0;
        font-size: clamp(2rem, 5vw, 4.5rem);
        line-height: 0.95;
        letter-spacing: 0;
      }

      h2 {
        margin: 0 0 12px;
        font-size: 1.35rem;
        letter-spacing: 0;
      }

      p {
        margin: 0;
        color: var(--muted);
      }

      a {
        color: var(--accent-dark);
      }

      .status {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 12px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--panel);
        color: var(--ink);
        font-size: 0.92rem;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        margin-top: 28px;
      }

      section {
        padding: 22px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }

      pre {
        overflow-x: auto;
        margin: 14px 0 0;
        padding: 16px;
        border-radius: 8px;
        background: var(--code);
        color: #f8fafc;
        font-size: 0.9rem;
      }

      code {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      }

      ul {
        margin: 12px 0 0;
        padding-left: 20px;
        color: var(--muted);
      }

      li + li {
        margin-top: 6px;
      }

      @media (max-width: 760px) {
        main {
          padding: 32px 16px 56px;
        }

        .grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div class="status">
          <span class="pill">Status: ${escapeHtml(status)}</span>
          <span class="pill">Provider: ${escapeHtml(config.provider)}</span>
          <span class="pill">Model: ${escapeHtml(config.defaultModel)}</span>
        </div>
        <h1>Claude Subscription API Gateway</h1>
        <p>Backend API for your platform. Calls are protected by your gateway bearer token and routed through the configured Claude provider.</p>
      </header>

      <div class="grid">
        <section>
          <h2>Endpoints</h2>
          <ul>
            <li><code>GET /health</code> returns service readiness.</li>
            <li><code>POST /v1/messages</code> accepts Anthropic Messages-style requests.</li>
            <li><code>POST /v1/chat/completions</code> accepts OpenAI-style chat requests.</li>
            <li><code>GET /v1/usage</code> returns in-memory request and token totals.</li>
          </ul>
        </section>

        <section>
          <h2>Claude Login</h2>
          <p>This server does not collect Claude passwords. In subscription mode, authenticate with an approved Claude Code OAuth token on the protected <a href="/login">login setup page</a>, or sign in with Claude Code on the host.</p>
          <pre><code>claude auth status
claude auth login --claudeai

# For hosted or CI deployment:
CLAUDE_CODE_OAUTH_TOKEN=your-approved-token</code></pre>
        </section>

        <section>
          <h2>Anthropic Request</h2>
          <pre><code>curl https://apianthropic.rolecolor.com/v1/messages \\
  -H "Authorization: Bearer $GATEWAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "user", "content": "Write one sentence." }
    ],
    "max_tokens": 256
  }'</code></pre>
        </section>

        <section>
          <h2>OpenAI-Style Request</h2>
          <pre><code>curl https://apianthropic.rolecolor.com/v1/chat/completions \\
  -H "Authorization: Bearer $GATEWAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "user", "content": "Say hello." }
    ]
  }'</code></pre>
        </section>
      </div>
    </main>
  </body>
</html>`;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
