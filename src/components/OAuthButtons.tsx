import { useState } from "react";
import { OAUTH_PROVIDERS, signInWithProvider, type OAuthProvider } from "../lib/auth";
import { useT } from "../lib/useT";

const LABEL_KEY = { google: "auth.google", apple: "auth.apple" } as const;
const MARK: Record<OAuthProvider, string> = { google: "G", apple: "" };

/**
 * Rendered above the magic-link form. Nothing here renders if OAUTH_PROVIDERS
 * is empty, so a project with no OAuth configured degrades to email-only rather
 * than showing buttons that error on click.
 */
export function OAuthButtons() {
  const { t } = useT();
  const [err, setErr] = useState<string | null>(null);

  if (OAUTH_PROVIDERS.length === 0) return null;

  return (
    <div className="oauth">
      {OAUTH_PROVIDERS.map((p) => (
        <button
          key={p}
          type="button"
          className={`oauth__btn oauth__btn--${p}`}
          onClick={async () => {
            const { error } = await signInWithProvider(p);
            if (error) setErr(error);
          }}
        >
          <span className="oauth__mark" aria-hidden="true">
            {MARK[p]}
          </span>
          {t(LABEL_KEY[p])}
        </button>
      ))}
      {err && <p className="field__err">{err}</p>}
      <p className="oauth__or">{t("auth.or")}</p>
    </div>
  );
}
