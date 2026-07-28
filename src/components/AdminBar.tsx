import { useState } from "react";
import { useStore } from "../store";
import { isSupabaseConfigured, signInWithEmail, signOut } from "../lib/auth";
import { useT } from "../lib/useT";

/**
 * The admin strip. Only rendered when ?admin=1 is in the URL.
 *
 * That flag is not a secret and isn't pretending to be one — it ships in the
 * bundle, and anyone can add it. It's a way to keep admin chrome out of a
 * visitor's face, nothing more. The actual gate is Postgres: an impostor who
 * finds the flag, signs up, and fills in the form gets every write rejected by
 * RLS, because their email isn't in `editors`.
 *
 * This is why there's no secret code. A shared code would be a password that
 * can't be revoked, can't be attributed, and leaks the first time someone
 * screenshots it — and "verified by nobody in particular" is worth nothing on a
 * map people trust with a coeliac diagnosis.
 */
export function AdminBar() {
  const { adminMode, session, isEditor, authReady, setEditing, refreshAuth } = useStore();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!adminMode) return null;

  if (!isSupabaseConfigured()) {
    return (
      <div className="admin admin--warn">
        <strong>{t("admin.notConfiguredLead")}</strong> {t("admin.notConfigured")}
      </div>
    );
  }

  if (!authReady) return <div className="admin">{t("admin.checking")}</div>;

  if (!session) {
    return (
      <div className="admin">
        {sent ? (
          <p className="admin__msg">
            {t("admin.linkSentA")} <strong>{email}</strong>
            {t("admin.linkSentB")}
          </p>
        ) : (
          <form
            className="admin__signin"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErr(null);
              const { error } = await signInWithEmail(email);
              setBusy(false);
              if (error) setErr(error);
              else setSent(true);
            }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("admin.emailPlaceholder")}
              aria-label="Email"
            />
            <button className="btn btn--primary" disabled={busy}>
              {busy ? "…" : t("admin.enter")}
            </button>
          </form>
        )}
        {err && <p className="field__err">{err}</p>}
      </div>
    );
  }

  if (!isEditor) {
    return (
      <div className="admin admin--warn">
        <span>
          <strong>{session.user.email}</strong> {t("admin.notEditor")}
        </span>
        <button className="btn" onClick={async () => { await signOut(); await refreshAuth(); }}>
          {t("admin.signOut")}
        </button>
      </div>
    );
  }

  return (
    <div className="admin admin--ok">
      <span className="admin__who">✎ {session.user.email}</span>
      <button className="btn btn--primary" onClick={() => setEditing("new")}>
        {t("admin.addPlace")}
      </button>
      <button className="btn" onClick={async () => { await signOut(); await refreshAuth(); }}>
        {t("admin.signOut")}
      </button>
    </div>
  );
}
