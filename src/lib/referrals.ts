import { isSupabaseConfigured, supabase } from "./auth";

export type RoasterReferralChannel = "shop" | "website";

interface ReferralRow {
  roaster_id: string;
  channel: RoasterReferralChannel;
  clicked_on: string;
  clicks: number;
  last_click_at: string;
}

export interface RoasterReferralStat {
  roasterId: string;
  allTime: number;
  last30Days: number;
  shopClicks: number;
  websiteClicks: number;
  lastClickAt?: string;
}

/** Add transparent attribution without replacing query params a roaster already uses. */
export function trackedRoasterUrl(
  raw: string,
  roasterId: string,
  channel: RoasterReferralChannel,
): string {
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return raw;
    url.searchParams.set("utm_source", "coffee_finder");
    url.searchParams.set("utm_medium", "referral");
    url.searchParams.set("utm_campaign", "roaster_directory");
    url.searchParams.set("utm_content", `${roasterId}:${channel}`);
    return url.toString();
  } catch {
    return raw;
  }
}

/** Fire-and-forget: analytics must never delay or block the visitor's link. */
export async function recordRoasterReferral(
  roasterId: string,
  channel: RoasterReferralChannel,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = await supabase();
  if (!sb) return;
  await sb.rpc("record_roaster_referral", {
    p_roaster_id: roasterId,
    p_channel: channel,
  });
}

export async function loadRoasterReferralStats(): Promise<{
  stats: RoasterReferralStat[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) return { stats: [], error: "Supabase is not configured." };
  const sb = await supabase();
  if (!sb) return { stats: [], error: "Supabase is not configured." };
  const { data, error } = await sb
    .from("roaster_referral_daily")
    .select("roaster_id,channel,clicked_on,clicks,last_click_at")
    .order("clicked_on", { ascending: false })
    .limit(5000);
  if (error) return { stats: [], error: error.message };

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 29);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const byRoaster = new Map<string, RoasterReferralStat>();
  for (const row of data as ReferralRow[]) {
    const stat = byRoaster.get(row.roaster_id) ?? {
      roasterId: row.roaster_id,
      allTime: 0,
      last30Days: 0,
      shopClicks: 0,
      websiteClicks: 0,
    };
    stat.allTime += Number(row.clicks) || 0;
    if (row.clicked_on >= cutoffDate) stat.last30Days += Number(row.clicks) || 0;
    if (row.channel === "shop") stat.shopClicks += Number(row.clicks) || 0;
    else stat.websiteClicks += Number(row.clicks) || 0;
    if (!stat.lastClickAt || row.last_click_at > stat.lastClickAt) stat.lastClickAt = row.last_click_at;
    byRoaster.set(row.roaster_id, stat);
  }
  return {
    stats: [...byRoaster.values()].sort(
      (a, b) => b.last30Days - a.last30Days || b.allTime - a.allTime,
    ),
    error: null,
  };
}
