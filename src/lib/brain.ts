import { CATEGORIES, CLAIM_KEYS, FLAG_KEYS, type Category, type ClaimKey, type FlagKey } from "../types";
import { ITEMS } from "./items";

/**
 * Client for the local brain bridge (bridge/server.mjs, port 3119).
 *
 * The bridge runs on the editor's own machine and talks to a CLI they're
 * already logged into — no API key ever exists in this code. When it isn't
 * running, every call here returns null and the panel simply doesn't render.
 * A visitor to the deployed site never learns this feature exists.
 *
 * Note what `BrainSuggestion` CANNOT express: coordinates, a photo, and a
 * claim's confidence or source. Those aren't validated away — there is nowhere
 * to put them. Everything the brain proposes becomes `confidence: "claimed"`
 * sourced to the link, because a website saying something is exactly what
 * "claimed" means. Promoting it to "verified" takes a person in the café.
 */

const BRIDGE = import.meta.env.VITE_BRAIN_BRIDGE ?? "http://127.0.0.1:3119";

export interface Brain {
  name: string;
  label: string;
  agentic: boolean;
  ready: boolean;
  needs: string;
  defaultModel?: string;
  models: string[];
}

export interface BrainHealth {
  ok: boolean;
  provider: string;
  name: string;
  model?: string;
  agentic: boolean;
  brains: Brain[];
}

/** Scope only — `unknown` isn't offered, an omitted claim says the same thing. */
export interface SuggestedClaim {
  scope: "all" | "some" | "none";
  note?: string;
}

export interface BrainSuggestion {
  name?: string;
  category?: Category;
  address?: string;
  comuna?: string;
  city?: string;
  website?: string;
  instagram?: string;
  /** Item ids from `ITEMS`; the editor stores their canonical Spanish labels. */
  items: string[];
  claims: Partial<Record<ClaimKey, SuggestedClaim>>;
  flags: FlagKey[];
  caveat?: string;
  /** The link, plus any page the brain reported actually reading. */
  sources: string[];
  /** For the editor, not the public: what it looked for and couldn't find. */
  notes?: string;
}

export interface ExtractResult {
  suggestion: BrainSuggestion;
  brain: { name: string; label: string; agentic: boolean };
  hadStructuredData: boolean;
}

/** Thrown with `code` for the refusals that are policy, so the UI can translate them. */
export class BrainError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 300_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${BRIDGE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new BrainError(body.error ?? `bridge HTTP ${res.status}`, body.code);
  return body as T;
}

/**
 * Is the bridge up? Fast timeout and a null on any failure — this runs on every
 * editor open and must never make the editor feel slow or broken when the
 * answer is simply "David isn't running the bridge right now".
 */
export async function brainHealth(): Promise<BrainHealth | null> {
  try {
    return await call<BrainHealth>("/health", { method: "GET" }, 2_000);
  } catch {
    return null;
  }
}

export async function setBrain(provider: string, model?: string): Promise<void> {
  await call("/provider", { method: "POST", body: JSON.stringify({ provider, model }) }, 10_000);
}

/**
 * The vocabulary travels with the request so the bridge holds no second copy of
 * the data model. types.ts stays the only place these ids are defined.
 */
export async function extract(url: string): Promise<ExtractResult> {
  return call<ExtractResult>("/extract", {
    method: "POST",
    body: JSON.stringify({
      url,
      vocab: {
        categories: CATEGORIES,
        claims: CLAIM_KEYS,
        flags: FLAG_KEYS,
        items: ITEMS.map((i) => i.id),
      },
    }),
  });
}
