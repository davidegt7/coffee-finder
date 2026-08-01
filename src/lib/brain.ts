import { CATEGORIES, CLAIM_KEYS, FLAG_KEYS, type Category, type ClaimKey, type FlagKey } from "../types";
import { ITEMS } from "./items";
import type { StringKey } from "./i18n";

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

export interface BrainResearchRejection {
  name: string;
  comuna?: string;
  status: "generic" | "not_specialty" | "insufficient_evidence" | "closed";
  reason: string;
  sources: string[];
}

export interface BrainResearchLedgerItem extends BrainResearchRejection {
  reviewedAt: string;
  recheckAfter?: string;
}

/**
 * Where the place is, computed by the BRIDGE from the pasted link — never by
 * the model, which has no field for coordinates and never sees these.
 *
 * It rides alongside the suggestion rather than inside it precisely so that
 * distinction survives in the types: everything in `BrainSuggestion` is a model
 * proposal to be read sceptically; this is a regex over a URL the editor chose.
 */
export interface BrainLocation {
  lat: number;
  lng: number;
  /** False when it came from the map's viewport rather than the place's pin. */
  precise: boolean;
  address?: string;
  comuna?: string;
  /** The OSM record the coordinates reverse-geocoded to, for the source list. */
  osm?: string;
}

/**
 * A picture the café publishes of itself, found on its own page by the bridge.
 *
 * These are proposals to LOOK at, which is the whole safeguard. Nothing is
 * copied into our storage — the chosen URL is referenced where it lives, so the
 * café keeps control of its own photograph and taking it down removes it here
 * too. `kind` says how it was published: `og`/`twitter` is the image a business
 * publishes expressly for other sites to show, `logo` is their mark rather than
 * a photo of the place.
 */
export interface BrainPhoto {
  url: string;
  kind: "og" | "twitter" | "jsonld" | "img" | "logo";
  alt?: string;
  host: string;
  page: string;
}

export interface ExtractResult {
  suggestion: BrainSuggestion;
  photos?: BrainPhoto[];
  location?: BrainLocation | null;
  brain: { name: string; label: string; agentic: boolean };
  hadStructuredData: boolean;
}

/**
 * Thrown with a `code` the UI can translate, and the `hint` that failed.
 *
 * The codes are narrow on purpose. A single "google_maps" code once covered
 * three different situations, so the panel showed one generic sentence for all
 * of them — including, after Maps links started working, advice to go and do
 * the thing the panel had just done. A message that doesn't distinguish "that
 * link has no name in it" from "OpenStreetMap doesn't know that café" tells the
 * editor nothing about which of the two to fix.
 */
export class BrainError extends Error {
  code?: string;
  hint?: string;
  constructor(message: string, code?: string, hint?: string) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

/**
 * One place that turns a bridge failure into something an editor can act on.
 *
 * Both panels used to inline their own `if (code === …)` chain, which is how
 * one of them ended up telling people to go and use the other panel for Google
 * Maps links long after this one had learned to handle them.
 */
export function brainErrorText(
  e: unknown,
  t: (key: StringKey, vars?: Record<string, string | number>) => string,
): string {
  if (e instanceof BrainError) {
    if (e.code === "maps_no_name") return t("brain.errMapsNoName");
    if (e.code === "maps_no_match") return t("brain.errMapsNoMatch", { name: e.hint ?? "" });
    if (e.code === "google_maps") return t("brain.errGoogleMaps");
    if (e.code === "bad_url") return t("brain.errBadUrl");
  }
  return e instanceof Error ? e.message : String(e);
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 0): Promise<T> {
  const controller = new AbortController();
  // Brain research has no deadline by default. Fast operational calls such as
  // /health and /provider pass an explicit timeout below.
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let res: Response;
  try {
    res = await fetch(`${BRIDGE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new BrainError(body.error ?? `bridge HTTP ${res.status}`, body.code, body.hint);
  }
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
const vocab = () => ({
  categories: CATEGORIES,
  claims: CLAIM_KEYS,
  flags: FLAG_KEYS,
  items: ITEMS.map((i) => i.id),
});

export async function extract(url: string): Promise<ExtractResult> {
  return call<ExtractResult>("/extract", {
    method: "POST",
    body: JSON.stringify({ url, vocab: vocab() }),
  });
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** A turn as the panel keeps it: the prose, plus any place drafts it produced. */
export interface ChatMessage extends ChatTurn {
  id: string;
  drafts?: BrainSuggestion[];
  /** Older bridge replies used one draft. Kept while a running bridge restarts. */
  draft?: BrainSuggestion | null;
  location?: BrainLocation | null;
}

export interface ChatResult {
  reply: string;
  /** Opaque. Claude resumes its own session with it; others just echo it back. */
  sessionId?: string;
  /** Every place proposed by this turn. */
  drafts: BrainSuggestion[];
  /** Backward compatibility with a bridge that was already running. */
  draft: BrainSuggestion | null;
  /** Present when a Maps link in the message carried a pin. */
  location?: BrainLocation | null;
  photos?: BrainPhoto[];
  /** Candidates investigated but rejected, ready for the private ledger. */
  rejections: BrainResearchRejection[];
  brain: { name: string; label: string; agentic: boolean };
}

/**
 * One conversational turn.
 *
 * History is sent as well as `sessionId` because the two mechanisms belong to
 * different brains: Claude's CLI resumes its own session and ignores the
 * replay, while the generic CLI and chat-API providers have no session and need
 * it. Sending both is what lets the editor switch brains mid-conversation and
 * keep the thread.
 */
export async function chat(
  message: string,
  history: ChatTurn[],
  sessionId?: string,
  ledger: BrainResearchLedgerItem[] = [],
): Promise<ChatResult> {
  return call<ChatResult>("/chat", {
    method: "POST",
    body: JSON.stringify({ message, history, sessionId, ledger, vocab: vocab() }),
  });
}
