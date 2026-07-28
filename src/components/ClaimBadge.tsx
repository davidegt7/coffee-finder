import type { Claim, ClaimKey } from "../types";
import { CLAIM_LABELS } from "../types";
import { useT } from "../lib/useT";

/**
 * Splits the two axes across two channels so the badge stays short enough for a
 * list row: the *text* carries scope, the *colour and mark* carry confidence.
 *
 * Composes on the label ("<label> · 100%") rather than wrapping it in a
 * sentence, because no single sentence template fits "Tuesta acá" and "Sin
 * gluten" grammatically in both languages.
 */
export function ClaimBadge({ claimKey, claim }: { claimKey: ClaimKey; claim: Claim }) {
  const { t, lang } = useT();
  if (claim.scope === "unknown" || claim.confidence === "unverified") return null;

  const label = CLAIM_LABELS[claimKey][lang];
  const text =
    claim.scope === "all"
      ? `${label} ${t("badge.scope100")}`
      : claim.scope === "some"
        ? `${label} ${t("badge.scopeOptions")}`
        : claim.scope === "none"
          ? t("badge.scopeNone", { label: label.toLowerCase() })
          : null;
  if (!text) return null;

  const tone = claim.scope === "none" ? "no" : claim.confidence;
  const title = claim.confidence === "verified" ? t("badge.titleVerified") : t("badge.titleClaimed");

  return (
    <span className={`badge badge--${tone}`} title={[title, claim.note].filter(Boolean).join(" ")}>
      {text}
      <span className="badge__mark" aria-hidden="true">
        {claim.confidence === "verified" ? "✓" : "?"}
      </span>
      <span className="sr-only">
        {claim.confidence === "verified" ? t("badge.srVerified") : t("badge.srUnverified")}
      </span>
    </span>
  );
}

export function ClaimRow({ claimKey, claim }: { claimKey: ClaimKey; claim: Claim }) {
  const { t, lang } = useT();
  const label = CLAIM_LABELS[claimKey][lang];

  const status = (() => {
    if (claim.scope === "unknown") return { text: t("claim.uncheckedStatus"), tone: "unknown" };
    if (claim.scope === "none") return { text: t("claim.no"), tone: "no" };
    const scope = claim.scope === "all" ? t("claim.scopeAll") : t("claim.scopeSome");
    const conf =
      claim.confidence === "verified"
        ? t("claim.confVerified")
        : claim.confidence === "claimed"
          ? t("claim.confClaimed")
          : t("claim.confUnverified");
    return { text: `${scope} — ${conf}`, tone: claim.confidence };
  })();

  return (
    <div className="claim-row">
      <div className="claim-row__head">
        <span className="claim-row__label">{label}</span>
        <span className={`claim-row__status claim-row__status--${status.tone}`}>{status.text}</span>
      </div>
      {claim.note && <p className="claim-row__note">{claim.note}</p>}
      {claim.scope === "unknown" ? (
        <p className="claim-row__gap">{t("claim.gap")}</p>
      ) : (
        claim.source && (
          <p className="claim-row__source">
            {t("claim.source")}{" "}
            {claim.source.startsWith("http") ? (
              <a href={claim.source} target="_blank" rel="noopener noreferrer">
                {new URL(claim.source).hostname.replace(/^www\./, "")}
              </a>
            ) : (
              claim.source
            )}
            {claim.checkedAt && ` · ${claim.checkedAt}`}
          </p>
        )
      )}
    </div>
  );
}
