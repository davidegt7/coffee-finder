import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import {
  brainErrorText,
  brainHealth,
  chat,
  setBrain,
  type BrainHealth,
  type ChatMessage,
  type BrainSuggestion,
} from "../lib/brain";
import { applyDraft, blankPlace, draftSummary } from "../lib/draft";
import { useT } from "../lib/useT";
import { useSwipeToDismiss } from "../lib/useSwipeToDismiss";
import { CATEGORY_LABELS } from "../types";
import { loadResearchLedger, saveResearchRejections } from "../lib/researchLedger";

/**
 * "Cerebro" — a conversation with the local brain bridge.
 *
 * This exists because the one-shot extractor answered the wrong question. It
 * could turn a link into fields, but only from inside the place editor, which
 * you can only open by first creating a place — so there was nowhere to simply
 * ask about a café, and no way to say "that address is wrong" or "check their
 * Instagram too". You could feed it a link; you could not talk to it.
 *
 * A draft arrives as a card, not as applied fields. Pressing it opens the place
 * editor already filled, for review — the editor is where a human reads the
 * whole record before `persistPlace`, and that click is still the only path
 * into the database.
 *
 * Renders nothing when the bridge isn't running, which is its state for anyone
 * who isn't David with `npm run bridge` going.
 */
export function BrainChat() {
  const { t, lang } = useT();
  const brainOpen = useStore((s) => s.brainOpen);
  const setBrainOpen = useStore((s) => s.setBrainOpen);
  const thread = useStore((s) => s.brainThread);
  const session = useStore((s) => s.brainSession);
  const input = useStore((s) => s.brainInput);
  const setInput = useStore((s) => s.setBrainInput);
  const addTurn = useStore((s) => s.addBrainTurn);
  const clearThread = useStore((s) => s.clearBrainThread);
  const setEditing = useStore((s) => s.setEditing);
  const startDraftBatch = useStore((s) => s.startDraftBatch);
  const swipe = useSwipeToDismiss(() => setBrainOpen(false));

  const [health, setHealth] = useState<BrainHealth | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (brainOpen) void brainHealth().then(setHealth);
  }, [brainOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread.length, busy]);

  if (!brainOpen) return null;
  // Checking, or no bridge: say so rather than showing a chat that can't send.
  if (health === undefined) return null;

  const send = async () => {
    const message = input.trim();
    if (!message || busy) return;
    setErr(null);
    setInput("");
    addTurn({ id: `u${Date.now()}`, role: "user", content: message });
    setBusy(true);
    try {
      // The history sent is the thread as it stood BEFORE this message — the
      // bridge appends the new one itself, and sending it twice makes the brain
      // answer a question it thinks it already saw.
      const ledger = await loadResearchLedger();
      const res = await chat(
        message,
        thread.map((m) => ({ role: m.role, content: m.content })),
        session,
        ledger,
      );
      addTurn(
        {
          id: `a${Date.now()}`,
          role: "assistant",
          content: res.reply,
          drafts: res.drafts?.length ? res.drafts : res.draft ? [res.draft] : [],
          draft: res.draft,
          location: res.location,
        },
        res.sessionId,
      );
      // The reply and drafts stay usable even if the private ledger write has
      // a transient problem; it will simply be researched again next time.
      if (res.rejections?.length) void saveResearchRejections(res.rejections);
      if (res.brain.name !== health?.name) setHealth(await brainHealth());
    } catch (e) {
      setErr(brainErrorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const swapBrain = async (name: string) => {
    setErr(null);
    try {
      await setBrain(name);
      setHealth(await brainHealth());
    } catch (e) {
      setErr(brainErrorText(e, t));
    }
  };

  const draftsFor = (m: ChatMessage): BrainSuggestion[] =>
    m.drafts?.length ? m.drafts : m.draft ? [m.draft] : [];

  const openInEditor = (m: ChatMessage, draft: BrainSuggestion) => {
    const drafts = draftsFor(m);
    setEditing(applyDraft(blankPlace(), draft, drafts.length === 1 ? m.location : null));
    setBrainOpen(false);
  };

  const reviewBatch = (m: ChatMessage) => {
    const drafts = draftsFor(m);
    startDraftBatch(drafts.map((draft) => applyDraft(blankPlace(), draft)));
  };

  /** The last draft-bearing turn is live — earlier proposals are superseded. */
  const liveDraftId = [...thread].reverse().find((m) => draftsFor(m).length > 0)?.id;

  return (
    <div
      className={`sheet sheet--chat ${swipe.dragging ? "is-dragging" : ""}`}
      role="dialog"
      aria-label={t("chat.title")}
      ref={swipe.ref}
      style={swipe.style}
    >
      <div className="sheet__drag" {...swipe.handlers}>
        <span className="sheet__grip" aria-hidden="true" />
      </div>
      <button className="sheet__close" onClick={() => setBrainOpen(false)} aria-label={t("common.close")}>
        ✕
      </button>

      <header className="sheet__head" {...swipe.handlers}>
        <span className="sheet__cat">{t("chat.eyebrow")}</span>
        <h2>{t("chat.title")}</h2>
      </header>

      {health === null ? (
        <div className="chat__offline">
          <p>{t("chat.offline")}</p>
          <code>npm run bridge</code>
        </div>
      ) : (
        <>
          <div className="chat__bar">
            <label className="brain__pick-label">
              <span>{t("brain.brainLabel")}</span>
              <select value={health.name} onChange={(e) => void swapBrain(e.target.value)} disabled={busy}>
                {health.brains.map((b) => (
                  <option key={b.name} value={b.name} disabled={!b.ready}>
                    {b.label}
                    {b.ready ? "" : ` — ${t("brain.notReady", { needs: b.needs })}`}
                  </option>
                ))}
              </select>
            </label>
            {thread.length > 0 && (
              <button className="btn" onClick={clearThread} disabled={busy}>
                {t("chat.clear")}
              </button>
            )}
          </div>

          {!health.agentic && <p className="field__hint">{t("chat.notAgentic")}</p>}

          <div className="chat__thread">
            {thread.length === 0 && (
              <div className="chat__empty">
                <p>{t("chat.emptyLead")}</p>
                <ul>
                  <li>{t("chat.example1")}</li>
                  <li>{t("chat.example2")}</li>
                  <li>{t("chat.example3")}</li>
                </ul>
              </div>
            )}

            {thread.map((m) => (
              <div key={m.id} className={`chat__msg chat__msg--${m.role}`}>
                <p className="chat__text">{m.content}</p>

                {draftsFor(m).map((draft, index) => (
                  <div
                    key={`${m.id}:${index}`}
                    className={`chat__draft ${m.id === liveDraftId ? "" : "is-stale"}`}
                  >
                    <div className="chat__draft-head">
                      <strong>{draft.name || t("chat.draftUnnamed")}</strong>
                      {draft.category && (
                        <span className="chat__draft-cat">
                          {CATEGORY_LABELS[draft.category].icon}{" "}
                          {CATEGORY_LABELS[draft.category][lang]}
                        </span>
                      )}
                    </div>
                    {draftSummary(draft).length > 0 && (
                      <p className="chat__draft-bits">{draftSummary(draft).join(" · ")}</p>
                    )}
                    {draft.notes && <p className="chat__draft-notes">{draft.notes}</p>}
                    <button
                      className="btn btn--primary"
                      onClick={() => openInEditor(m, draft)}
                      disabled={m.id !== liveDraftId}
                    >
                      {t("chat.openInEditor")}
                    </button>
                    {m.id !== liveDraftId && <p className="field__hint">{t("chat.superseded")}</p>}
                  </div>
                ))}
                {draftsFor(m).length > 1 && m.id === liveDraftId && (
                  <button className="btn btn--primary chat__batch" onClick={() => reviewBatch(m)}>
                    {t("chat.reviewBatch", { n: draftsFor(m).length })}
                  </button>
                )}
              </div>
            ))}

            {busy && <div className="chat__msg chat__msg--assistant chat__thinking">{t("chat.thinking")}</div>}
            <div ref={endRef} />
          </div>

          {err && <p className="field__err">{err}</p>}

          <div className="chat__composer">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("chat.placeholder")}
              rows={2}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter breaks the line. Pasting a URL and
                // hitting Enter is the whole point of this box.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button className="btn btn--primary" onClick={() => void send()} disabled={busy || !input.trim()}>
              {busy ? "…" : t("chat.send")}
            </button>
          </div>

          <p className="field__hint">{t("chat.foot")}</p>
        </>
      )}
    </div>
  );
}
