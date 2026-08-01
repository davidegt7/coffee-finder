import { isSupabaseConfigured, supabase } from "./auth";
import type { BrainResearchRejection, BrainResearchLedgerItem } from "./brain";

interface LedgerRow {
  name: string;
  name_key: string;
  comuna: string | null;
  comuna_key: string;
  status: BrainResearchRejection["status"];
  reason: string;
  sources: string[] | null;
  reviewed_at: string;
  recheck_after: string | null;
}

/** Stable enough to match accents, punctuation and capitalization variations. */
const keyFor = (value?: string) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const recheckDays = (status: BrainResearchRejection["status"]) => {
  if (status === "insufficient_evidence") return 180;
  if (status === "closed") return 120;
  return 365;
};

/** Active editor-only exclusions sent to the Brain before a discovery turn. */
export async function loadResearchLedger(): Promise<BrainResearchLedgerItem[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = await supabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("research_ledger")
    .select("name,comuna,status,reason,sources,reviewed_at,recheck_after")
    .order("reviewed_at", { ascending: false })
    .limit(500);
  if (error) return [];
  const now = Date.now();
  return (data as LedgerRow[])
    .filter((row) => !row.recheck_after || Date.parse(row.recheck_after) > now)
    .map((row) => ({
      name: row.name,
      comuna: row.comuna ?? undefined,
      status: row.status,
      reason: row.reason,
      sources: row.sources ?? [],
      reviewedAt: row.reviewed_at,
      recheckAfter: row.recheck_after ?? undefined,
    }));
}

/** Upsert means seeing the same rejection again refreshes its evidence/date. */
export async function saveResearchRejections(
  rejections: BrainResearchRejection[],
): Promise<{ error: string | null }> {
  if (!rejections.length) return { error: null };
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  const sb = await supabase();
  if (!sb) return { error: "Supabase is not configured." };

  const reviewedAt = new Date();
  const rows = rejections
    .filter((entry) => keyFor(entry.name))
    .map((entry) => ({
      name: entry.name.trim(),
      name_key: keyFor(entry.name),
      comuna: entry.comuna?.trim() || null,
      comuna_key: keyFor(entry.comuna),
      status: entry.status,
      reason: entry.reason.trim(),
      sources: entry.sources,
      reviewed_at: reviewedAt.toISOString(),
      recheck_after: new Date(
        reviewedAt.getTime() + recheckDays(entry.status) * 86_400_000,
      ).toISOString(),
    }));
  if (!rows.length) return { error: null };

  const { error } = await sb
    .from("research_ledger")
    .upsert(rows, { onConflict: "name_key,comuna_key" });
  return { error: error?.message ?? null };
}
