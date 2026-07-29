import type { Session, SupabaseClient } from "@supabase/supabase-js";

/**
 * Sign-in for Coffee Finder — editors only.
 *
 * Nobody needs an account to USE the map, and they never will: it's free and
 * public, and asking a stranger to sign in to find a coeliac bakery would be
 * absurd. Sign-in exists for exactly one reason — so that "someone verified
 * this" has a someone attached to it.
 *
 * Magic link rather than passwords: it's the least friction real identity can
 * have, and there's no password to leak, reset, or store.
 *
 * Being signed in is NOT permission. The `editors` allowlist in Postgres is,
 * enforced by RLS. A stranger can sign up and get precisely nothing.
 *
 * Config is baked at build time (static host, no server to ask):
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 * The anon key ships in client code by design — it is not a secret. RLS is what
 * protects the data.
 *
 * supabase-js is ~57kB gzipped, so it loads on demand: a visitor who never
 * opens admin mode never downloads it.
 */

const URL_ = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

/** False until the Supabase project exists and the two vars are set. */
export function isSupabaseConfigured(): boolean {
  return Boolean(URL_ && ANON);
}

let clientPromise: Promise<SupabaseClient> | null = null;

/** Null when unconfigured — callers must handle it rather than crash the app. */
export async function supabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(URL_, ANON, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Magic links land back here with tokens in the URL.
          detectSessionInUrl: true,
        },
      }),
    );
  }
  return clientPromise;
}

export async function getSession(): Promise<Session | null> {
  const sb = await supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function onAuthChange(cb: (session: Session | null) => void): Promise<() => void> {
  const sb = await supabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function signInWithEmail(email: string): Promise<{ error: string | null }> {
  const sb = await supabase();
  if (!sb) return { error: "Sign-in no está configurado todavía." };
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.href.split("#")[0] },
  });
  return { error: error?.message ?? null };
}

/**
 * OAuth providers offered alongside the magic link.
 *
 * Google only, for now, and the reason is money rather than code: Sign in with
 * Apple requires a paid Apple Developer membership (~USD 99/year), while Google
 * costs nothing beyond creating credentials. Adding "apple" to this array is the
 * entire client-side change once that account exists and the provider is enabled
 * in the Supabase dashboard.
 *
 * A provider listed here but not enabled in Supabase renders a button that
 * errors on click, so this list must mirror the dashboard.
 */
export type OAuthProvider = "google" | "apple";

export const OAUTH_PROVIDERS: OAuthProvider[] = ["google"];

export async function signInWithProvider(
  provider: OAuthProvider,
): Promise<{ error: string | null }> {
  const sb = await supabase();
  if (!sb) return { error: "Sign-in no está configurado todavía." };
  const { error } = await sb.auth.signInWithOAuth({
    provider,
    // Land back exactly where the user was, minus any stale auth fragment.
    options: { redirectTo: window.location.href.split("#")[0] },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  const sb = await supabase();
  await sb?.auth.signOut();
}

/**
 * Asks the database, never the client.
 *
 * The allowlist is readable only by editors, so a non-editor's SELECT returns
 * zero rows — which is the answer. Deciding this client-side would be a lie
 * anyone could edit in devtools; here the worst a faker achieves is an admin
 * form whose every write RLS rejects.
 */
export async function checkIsEditor(): Promise<boolean> {
  const sb = await supabase();
  if (!sb) return false;
  const { data, error } = await sb.from("editors").select("email").limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
