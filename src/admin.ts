import { promises as fs } from "node:fs";
import type { Request, Response } from "express";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

export const loginPage = (_req: Request, res: Response) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Claude Login Setup</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #f7f4ef;
        --ink: #1f2933;
        --muted: #5f6c7b;
        --line: #d8d2c7;
        --panel: #fff;
        --accent: #0f766e;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #111418;
          --ink: #edf2f7;
          --muted: #a8b3c2;
          --line: #2f3742;
          --panel: #181d23;
          --accent: #2dd4bf;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.5;
      }
      main {
        max-width: 720px;
        margin: 0 auto;
        padding: 48px 20px;
      }
      form {
        display: grid;
        gap: 16px;
        margin-top: 24px;
        padding: 22px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }
      label {
        display: grid;
        gap: 8px;
        font-weight: 700;
      }
      input {
        width: 100%;
        min-height: 44px;
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 10px 12px;
        font: inherit;
      }
      button {
        min-height: 44px;
        border: 0;
        border-radius: 6px;
        padding: 0 16px;
        background: var(--accent);
        color: #fff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      p, li {
        color: var(--muted);
      }
      code {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Claude Login Setup</h1>
      <p>Paste an approved Claude Code OAuth token. This page does not accept Claude usernames or passwords.</p>
      <ul>
        <li>Generate a token from a machine already logged into Claude Code with <code>claude setup-token</code>.</li>
        <li>Use your gateway bearer key as the admin key.</li>
        <li>The service saves the token, then restarts so new API calls use subscription mode.</li>
      </ul>
      <form method="post" action="/login">
        <label>
          Admin key
          <input name="admin_key" type="password" autocomplete="off" required />
        </label>
        <label>
          Claude Code OAuth token
          <input name="claude_code_oauth_token" type="password" autocomplete="off" required />
        </label>
        <button type="submit">Save Token</button>
      </form>
    </main>
  </body>
</html>`);
};

export const saveClaudeToken = async (req: Request, res: Response) => {
  if (!config.allowWebTokenSetup || !config.gatewayEnvFile) {
    throw new HttpError(404, "Web token setup is disabled");
  }

  if (req.body.admin_key !== config.gatewayApiKey) {
    throw new HttpError(401, "Invalid admin key");
  }

  const token = String(req.body.claude_code_oauth_token ?? "").trim();

  if (!token.startsWith("sk-ant-oat01-") || /\s/.test(token)) {
    throw new HttpError(
      400,
      "Invalid Claude Code OAuth token format. Use the final token printed by `claude setup-token`, not the browser authorization code."
    );
  }

  const current = await fs.readFile(config.gatewayEnvFile, "utf8");
  const next = upsertEnv(current, "CLAUDE_CODE_OAUTH_TOKEN", token);
  await fs.writeFile(config.gatewayEnvFile, next, { mode: 0o600 });

  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Claude Token Saved</title>
  </head>
  <body>
    <main style="font-family: system-ui, sans-serif; max-width: 680px; margin: 48px auto; padding: 0 20px;">
      <h1>Token saved</h1>
      <p>The gateway is restarting. Try <a href="/health">/health</a> in a few seconds, then call the API.</p>
    </main>
  </body>
</html>`);

  setTimeout(() => {
    process.exit(0);
  }, 500);
};

const upsertEnv = (input: string, key: string, value: string) => {
  const line = `${key}=${value}`;
  const lines = input.split("\n");
  const index = lines.findIndex((candidate) => candidate.startsWith(`${key}=`));

  if (index >= 0) {
    lines[index] = line;
  } else {
    lines.push(line);
  }

  return `${lines.filter((candidate, i) => candidate || i < lines.length - 1).join("\n")}\n`;
};
