// Pluggable LLM backends for the bridge. Each provider takes the composed
// prompt (user message + timeline state) plus the system prompt and returns
// { text, sessionId }. The panel is unchanged — sessionId is opaque and just
// round-trips for multi-turn memory.
//
// Two capability tiers, and the difference is real:
//
//   AGENTIC CLI (claude, and optionally codex/gemini): the model has its
//   own tool loop — Bash, file read/write. This is what lets it run ffmpeg
//   to SEE footage, read transcripts, and search the filesystem. Full power.
//
//   PLAIN CHAT API (openai / grok / gemini-api / ollama): a stateless
//   chat-completion call. The model can still read the timeline state we
//   send and emit valid edit plans, but it CANNOT see footage, run ffmpeg,
//   read transcript files, or touch the filesystem — there's no tool loop.
//   Editing works; perception does not.

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

const MAX_HISTORY_MESSAGES = 24; // keep replayed context bounded

// --------------------------------------------------------- CLI (agentic)

function runCli(command, args, stdin, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // CLI warnings can be verbose; actionable API errors are usually last.
      if (code !== 0) reject(new Error(`${command} exited ${code}: ${err.slice(-1500)}`));
      else resolve(out);
    });
    child.stdin.end(stdin);
  });
}

// Claude Code — native session resume + agentic tools.
function claudeProvider(env) {
  const model = env.BRIDGE_MODEL ?? "sonnet";
  const autonomous = env.BRIDGE_AUTONOMOUS !== "false";
  return {
    label: `claude (${model}${autonomous ? ", autonomous" : ""})`,
    agentic: true,
    async run({ systemPrompt, userContent, sessionId, timeoutMs }) {
      const args = [
        "-p",
        "--output-format", "json",
        "--model", model,
        "--append-system-prompt", systemPrompt,
      ];
      if (autonomous) args.push("--dangerously-skip-permissions");
      if (sessionId) args.push("--resume", sessionId);
      const raw = await runCli("claude", args, userContent, timeoutMs);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`unparseable claude output: ${raw.slice(0, 300)}`);
      }
      return { text: parsed.result ?? "", sessionId: parsed.session_id, isError: Boolean(parsed.is_error) };
    },
  };
}

// Named presets for known agentic CLIs, so the panel's brain picker can
// offer them directly without env plumbing. Best-effort default args —
// override with CLI_ARGS if a CLI's headless invocation differs.
function resolveCodexCommand(env) {
  if (env.CODEX_CLI_PATH) return env.CODEX_CLI_PATH;
  const bundled = [
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    "/Applications/Codex.app/Contents/Resources/codex",
  ];
  for (const candidate of bundled) {
    if (existsSync(candidate)) return candidate;
  }
  return "codex";
}

const CLI_PRESETS = {
  // The distributable bridge commonly runs from ~/.premiere-ai-panel-bridge,
  // which is intentionally not a Git repository. Codex otherwise refuses to
  // start before it can review a classifier prompt.
  codex: {
    resolveCommand: resolveCodexCommand,
    labelCommand: "codex",
    args: ["exec", "--skip-git-repo-check", "-"],
  },
  "gemini-cli": { command: "gemini", args: [] }, // gemini CLI reads stdin when non-interactive
};

// Generic agentic CLI (codex, gemini, or anything that takes a prompt on
// stdin and prints a reply). Fully configurable so any CLI can be wired in.
// Multi-turn is handled by the bridge replaying history into the prompt,
// since we can't assume the CLI has its own --resume.
function genericCliProvider(env, preset) {
  const command = preset?.resolveCommand?.(env) ?? preset?.command ?? env.CLI_COMMAND;
  if (!command) throw new Error('provider "cli" requires CLI_COMMAND (e.g. "codex", "gemini")');
  let args = preset?.args ?? [];
  if (env.CLI_ARGS) {
    try {
      args = JSON.parse(env.CLI_ARGS);
      if (!Array.isArray(args)) throw new Error("not an array");
    } catch (e) {
      throw new Error(`CLI_ARGS must be a JSON array of strings: ${e.message}`);
    }
  }
  return {
    label: `cli (${preset?.labelCommand ?? command} ${args.join(" ")})`.trim(),
    agentic: true, // assumed — depends on the CLI's own flags/permissions
    usesHistory: true,
    async run({ systemPrompt, userContent, history, sessionId, timeoutMs }) {
      const parts = [systemPrompt, ""];
      for (const m of history) parts.push(`${m.role.toUpperCase()}: ${m.content}`);
      parts.push(`USER: ${userContent}`);
      const text = (await runCli(command, args, parts.join("\n\n"), timeoutMs)).trim();
      return { text, sessionId: sessionId ?? randomUUID() };
    },
  };
}

// --------------------------------------------------- OpenAI-compatible HTTP

// One implementation covers OpenAI, xAI Grok, Google Gemini (OpenAI-compat
// endpoint), Ollama, and anything else speaking /chat/completions. Plain
// chat — no tool loop, no perception. Presets just set base URL + env key.
const OPENAI_PRESETS = {
  openai: { baseUrl: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY", model: "gpt-4o" },
  grok: { baseUrl: "https://api.x.ai/v1", keyEnv: "XAI_API_KEY", model: "grok-2-latest" },
  "gemini-api": {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    model: "gemini-2.0-flash",
  },
  ollama: { baseUrl: "http://localhost:11434/v1", keyEnv: null, model: "llama3.1" },
};

function openaiProvider(env, presetName) {
  const preset = OPENAI_PRESETS[presetName] ?? OPENAI_PRESETS.openai;
  const baseUrl = (env.OPENAI_BASE_URL ?? preset.baseUrl).replace(/\/$/, "");
  const model = env.OPENAI_MODEL ?? preset.model;
  const apiKey = preset.keyEnv ? env[preset.keyEnv] ?? env.OPENAI_API_KEY : "ollama";
  if (preset.keyEnv && !apiKey) {
    throw new Error(`provider "${presetName}" needs an API key in ${preset.keyEnv} (or OPENAI_API_KEY)`);
  }
  return {
    label: `${presetName} (${model} @ ${baseUrl})`,
    agentic: false,
    usesHistory: true,
    async run({ systemPrompt, userContent, history, sessionId, timeoutMs }) {
      const messages = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userContent },
      ];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res;
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({ model, messages, stream: false }),
        });
      } finally {
        clearTimeout(timer);
      }
      const bodyText = await res.text();
      if (!res.ok) throw new Error(`${presetName} HTTP ${res.status}: ${bodyText.slice(0, 400)}`);
      let body;
      try {
        body = JSON.parse(bodyText);
      } catch {
        throw new Error(`${presetName}: non-JSON response: ${bodyText.slice(0, 300)}`);
      }
      const text = body.choices?.[0]?.message?.content ?? "";
      return { text, sessionId: sessionId ?? randomUUID() };
    },
  };
}

// ---------------------------------------------------------------- selection

/**
 * Build a provider. `overrides.provider` / `overrides.model` (from the
 * panel's brain picker via POST /provider) take precedence over env, so the
 * brain can be swapped at runtime without restarting the bridge. Env still
 * supplies everything sensitive (API keys) — the panel never sends keys.
 */
export function makeProvider(env = process.env, overrides = {}) {
  const name = (overrides.provider ?? env.BRIDGE_PROVIDER ?? "codex").toLowerCase();
  const effEnv = overrides.model
    ? { ...env, BRIDGE_MODEL: overrides.model, OPENAI_MODEL: overrides.model }
    : env;
  if (name === "claude") return claudeProvider(effEnv);
  if (name in CLI_PRESETS) return genericCliProvider(effEnv, CLI_PRESETS[name]);
  if (name === "cli") return genericCliProvider(effEnv);
  if (name in OPENAI_PRESETS || name === "openai-compat") return openaiProvider(effEnv, name);
  throw new Error(
    `unknown provider "${name}". Options: claude, codex, gemini-cli, cli, openai, grok, gemini-api, ollama`
  );
}

function commandExists(cmd) {
  try {
    if (cmd.includes("/")) return existsSync(cmd);
    return spawnSync("which", [cmd], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

// Curated model choices per brain, for the picker's nested menu. These are
// suggestions, not gates — the panel's free-text model field passes anything
// through, so drift here never blocks a model. CLI brains (codex/gemini-cli)
// pick their model in their own config, so they list none.
const BRAIN_MODELS = {
  claude: ["sonnet", "opus", "haiku"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3"],
  grok: ["grok-4", "grok-3", "grok-2-latest"],
  "gemini-api": ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
};

// Ollama can tell us what's ACTUALLY installed — better than a stale list.
async function listOllamaModels(baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_200);
  try {
    const res = await fetch(`${baseUrl.replace(/\/v1$/, "")}/api/tags`, {
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body.models) ? body.models.map((m) => m.name).filter(Boolean) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Catalog of selectable brains with readiness info and per-brain model
 * choices, for the panel's picker. `ready:false` options still show (grayed
 * out) with what's missing, so the fix is discoverable: install the CLI or
 * export the key, restart bridge. Async because ollama's installed models
 * are queried live (sub-second, degrades to an empty list).
 */
export async function listBrains(env = process.env) {
  const brains = [
    {
      name: "claude",
      label: "Claude Code (agentic)",
      agentic: true,
      ready: commandExists("claude"),
      needs: "claude CLI on PATH",
      defaultModel: env.BRIDGE_MODEL ?? "sonnet",
      models: BRAIN_MODELS.claude,
    },
    {
      name: "codex",
      label: "Codex CLI (agentic)",
      agentic: true,
      ready: commandExists(resolveCodexCommand(env)),
      needs: "Codex CLI in ChatGPT/Codex.app or on PATH",
      models: [],
    },
    {
      name: "gemini-cli",
      label: "Gemini CLI (agentic)",
      agentic: true,
      ready: commandExists("gemini"),
      needs: "gemini CLI on PATH",
      models: [],
    },
  ];
  for (const [name, preset] of Object.entries(OPENAI_PRESETS)) {
    const isOllama = !preset.keyEnv;
    brains.push({
      name,
      label: `${name} (chat API${isOllama ? ", local" : ""})`,
      agentic: false,
      ready: isOllama ? true : Boolean(env[preset.keyEnv] ?? env.OPENAI_API_KEY),
      needs: isOllama ? "ollama serving on :11434" : `${preset.keyEnv} env var on the bridge`,
      defaultModel: preset.model,
      models: isOllama
        ? await listOllamaModels(env.OPENAI_BASE_URL ?? preset.baseUrl)
        : BRAIN_MODELS[name] ?? [],
    });
  }
  return brains;
}

export { MAX_HISTORY_MESSAGES };
