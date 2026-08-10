import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { useT } from "../lib/useT";
import { loadRoasterReferralStats, type RoasterReferralStat } from "../lib/referrals";

/** Private proof of the traffic Coffee Finder sends to each roaster. */
export function ReferralDashboard() {
  const roasters = useStore((s) => s.roasters);
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<RoasterReferralStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    const result = await loadRoasterReferralStats();
    setStats(result.stats);
    setError(result.error);
    setLoading(false);
  };

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  const rows = useMemo(
    () => stats.map((stat) => ({
      ...stat,
      name: roasters.find((roaster) => roaster.id === stat.roasterId)?.name ?? stat.roasterId,
    })),
    [roasters, stats],
  );
  const totals = rows.reduce(
    (sum, row) => ({ all: sum.all + row.allTime, recent: sum.recent + row.last30Days }),
    { all: 0, recent: 0 },
  );

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>{t("referrals.open")}</button>
      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(false)} />
          <div className="sheet sheet--ops sheet--referrals" role="dialog" aria-label={t("referrals.title")}>
            <button className="sheet__close" onClick={() => setOpen(false)} aria-label={t("common.close")}>
              ✕
            </button>
            <header className="sheet__head">
              <span className="sheet__cat">{t("referrals.eyebrow")}</span>
              <h2>{t("referrals.title")}</h2>
              <p className="ops__intro">{t("referrals.intro")}</p>
            </header>

            <div className="referrals__summary">
              <div><strong>{totals.recent}</strong><span>{t("referrals.last30")}</span></div>
              <div><strong>{totals.all}</strong><span>{t("referrals.allTime")}</span></div>
            </div>

            <div className="ops__toolbar ops__toolbar--end">
              <button className="btn" onClick={() => void refresh()} disabled={loading}>
                {loading ? "…" : t("referrals.refresh")}
              </button>
            </div>

            {error && (
              <div className="ops__error">
                <p>{error}</p>
                {error.toLowerCase().includes("roaster_referral") && <small>{t("referrals.runMigration")}</small>}
              </div>
            )}

            {!loading && !error && rows.length === 0 && (
              <p className="ops__empty">{t("referrals.empty")}</p>
            )}

            {rows.length > 0 && (
              <div className="referrals__table-wrap">
                <table className="referrals__table">
                  <thead>
                    <tr>
                      <th>{t("referrals.roaster")}</th>
                      <th>{t("referrals.last30Short")}</th>
                      <th>{t("referrals.shop")}</th>
                      <th>{t("referrals.website")}</th>
                      <th>{t("referrals.total")}</th>
                      <th>{t("referrals.lastClick")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.roasterId}>
                        <td><strong>{row.name}</strong></td>
                        <td>{row.last30Days}</td>
                        <td>{row.shopClicks}</td>
                        <td>{row.websiteClicks}</td>
                        <td>{row.allTime}</td>
                        <td>{row.lastClickAt ? new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(new Date(row.lastClickAt)) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="field__hint referrals__foot">{t("referrals.privacy")}</p>
          </div>
        </>
      )}
    </>
  );
}
