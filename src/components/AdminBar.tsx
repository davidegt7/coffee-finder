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
 *
 * The Cerebro button sits OUTSIDE all of that, next to whichever auth state is
 * showing. It was originally inside the signed-in-editor branch, which sounded
 * cautious and was in fact just wrong: the brain runs on the editor's own
 * machine, over a bridge only they can reach, and writes nothing anywhere. All
 * gating it achieved was to hide a local tool behind a remote login — and while
 * that login was misconfigured, the feature was unreachable in every state,
 * including the "Supabase isn't configured" one that local development is
 * always in. Nothing it produces can reach the database except through the
 * editor's Save, which RLS still adjudicates.
 */
export function AdminBar() {
  const { adminMode, session, isEditor, authReady, setEditing, refreshAuth, setBrainOpen } =
    useStore();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!adminMode) return null;

  let tone = "";
  let body: React.ReactNode;

  if (!isSupabaseConfigured()) {
    tone = " admin--warn";
    body = (
      <span>
        <strong>{t("admin.notConfiguredLead")}</strong> {t("admin.notConfigured")}
      </span>
    );
  } else if (!authReady) {
    body = <span>{t("admin.checking")}</span>;
  } else if (!session) {
    body = sent ? (
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
    );
  } else if (!isEditor) {
    tone = " admin--warn";
    body = (
      <>
        <span>
          <strong>{session.user.email}</strong> {t("admin.notEditor")}
        </span>
        <button className="btn" onClick={async () => { await signOut(); await refreshAuth(); }}>
          {t("admin.signOut")}
        </button>
      </>
    );
  } else {
    tone = " admin--ok";
    body = (
      <>
        <span className="admin__who">✎ {session.user.email}</span>
        <button className="btn btn--primary" onClick={() => setEditing("new")}>
          {t("admin.addPlace")}
        </button>
        <button className="btn" onClick={async () => { await signOut(); await refreshAuth(); }}>
          {t("admin.signOut")}
        </button>
      </>
    );
  }

  return (
    <div className={`admin${tone}`}>
      {body}
      {err && <p className="field__err">{err}</p>}
      {/* Shown whether or not the bridge is running. If it isn't, the panel
          says so and names the command — a button that appears only once you've
          already done the setup teaches nobody how to do the setup. */}
      <button className="btn admin__brain" onClick={() => setBrainOpen(true)}>
        {t("admin.brain")}
      </button>
    </div>
  );
}
