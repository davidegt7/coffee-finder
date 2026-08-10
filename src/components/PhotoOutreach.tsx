import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { useT } from "../lib/useT";
import type { StringKey } from "../lib/i18n";
import {
  PHOTO_PERMISSION_STATUSES,
  blankPhotoPermission,
  followUpDate,
  loadPhotoPermissions,
  photoPermissionEmail,
  savePhotoPermission,
  type PhotoPermission,
  type PhotoPermissionStatus,
} from "../lib/photoPermissions";

const STATUS_KEYS: Record<PhotoPermissionStatus, StringKey> = {
  not_contacted: "outreach.statusNotContacted",
  sent: "outreach.statusSent",
  follow_up: "outreach.statusFollowUp",
  approved: "outreach.statusApproved",
  declined: "outreach.statusDeclined",
  no_response: "outreach.statusNoResponse",
};

const today = () => new Date().toISOString().slice(0, 10);

/** Editor-only operating queue for asking cafés to license their own photos. */
export function PhotoOutreach() {
  const places = useStore((s) => s.places);
  const setEditing = useStore((s) => s.setEditing);
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<PhotoPermission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PhotoPermission | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PhotoPermissionStatus | "all">("all");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const byPlace = useMemo(
    () => new Map(records.map((record) => [record.placeId, record])),
    [records],
  );

  const dueCount = useMemo(
    () =>
      records.filter(
        (record) =>
          (record.status === "sent" || record.status === "follow_up") &&
          record.followUpDueAt &&
          record.followUpDueAt <= today(),
      ).length,
    [records],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return places.filter((place) => {
      const record = byPlace.get(place.id) ?? blankPhotoPermission(place.id);
      if (statusFilter !== "all" && record.status !== statusFilter) return false;
      return !q || [place.name, place.city, place.comuna, record.contactEmail]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(q);
    });
  }, [byPlace, places, query, statusFilter]);

  const selectedPlace = places.find((place) => place.id === selectedId) ?? null;
  const email = selectedPlace && draft ? photoPermissionEmail(selectedPlace, draft, lang) : null;

  const refresh = async () => {
    setLoading(true);
    setError(null);
    const result = await loadPhotoPermissions();
    setRecords(result.records);
    setError(result.error);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open]);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      return;
    }
    setDraft({ ...(byPlace.get(selectedId) ?? blankPhotoPermission(selectedId)) });
    setSaved(false);
  }, [byPlace, selectedId]);

  const persist = async (next: PhotoPermission) => {
    if (next.status === "approved" && !next.evidence?.trim()) {
      setError(t("outreach.approvalNeedsEvidence"));
      return false;
    }
    if (
      next.status === "approved" &&
      next.permissionScope === "specific" &&
      !next.photoUrls.some((url) => url.trim())
    ) {
      setError(t("outreach.approvalNeedsPhoto"));
      return false;
    }
    setBusy(true);
    setError(null);
    const result = await savePhotoPermission(next);
    setBusy(false);
    if (result.error || !result.record) {
      setError(result.error ?? t("outreach.saveError"));
      return false;
    }
    setRecords((current) => [
      result.record!,
      ...current.filter((record) => record.placeId !== result.record!.placeId),
    ]);
    setDraft(result.record);
    setSaved(true);
    return true;
  };

  const markSent = async () => {
    if (!draft?.contactEmail?.trim()) {
      setError(t("outreach.emailRequired"));
      return;
    }
    const now = new Date();
    await persist({
      ...draft,
      status: draft.status === "follow_up" ? "follow_up" : "sent",
      lastContactedAt: now.toISOString(),
      followUpDueAt: followUpDate(now),
    });
  };

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        {t("outreach.open")}
        {dueCount > 0 && <span className="menu-btn__count">{dueCount}</span>}
      </button>

      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(false)} />
          <div className="sheet sheet--ops" role="dialog" aria-label={t("outreach.title")}>
            <button className="sheet__close" onClick={() => setOpen(false)} aria-label={t("common.close")}>
              ✕
            </button>
            <header className="sheet__head">
              <span className="sheet__cat">{t("outreach.eyebrow")}</span>
              <h2>{t("outreach.title")}</h2>
              <p className="ops__intro">{t("outreach.intro")}</p>
            </header>

            {error && (
              <div className="ops__error">
                <p>{error}</p>
                {error.toLowerCase().includes("photo_permissions") && (
                  <small>{t("outreach.runMigration")}</small>
                )}
              </div>
            )}

            <div className="ops__toolbar">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("outreach.search")}
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as PhotoPermissionStatus | "all")}
                aria-label={t("outreach.filterStatus")}
              >
                <option value="all">{t("outreach.statusAll")}</option>
                {PHOTO_PERMISSION_STATUSES.map((status) => (
                  <option key={status} value={status}>{t(STATUS_KEYS[status])}</option>
                ))}
              </select>
              <button className="btn" onClick={() => void refresh()} disabled={loading}>
                {loading ? "…" : t("outreach.refresh")}
              </button>
            </div>

            <div className="ops__layout">
              <div className="ops__list" aria-label={t("outreach.places")}>
                {visible.map((place) => {
                  const record = byPlace.get(place.id) ?? blankPhotoPermission(place.id);
                  const isDue =
                    (record.status === "sent" || record.status === "follow_up") &&
                    record.followUpDueAt &&
                    record.followUpDueAt <= today();
                  return (
                    <button
                      key={place.id}
                      className={`ops__row ${selectedId === place.id ? "is-on" : ""}`}
                      onClick={() => setSelectedId(place.id)}
                    >
                      <span><strong>{place.name}</strong><small>{place.city}</small></span>
                      <span className={`ops__status ops__status--${record.status}`}>
                        {isDue ? t("outreach.due") : t(STATUS_KEYS[record.status])}
                      </span>
                    </button>
                  );
                })}
                {!loading && visible.length === 0 && <p className="field__hint">{t("outreach.empty")}</p>}
              </div>

              <div className="ops__detail">
                {!selectedPlace || !draft ? (
                  <p className="ops__empty">{t("outreach.pickPlace")}</p>
                ) : (
                  <>
                    <div className="ops__detail-head">
                      <div>
                        <span className="sheet__cat">{selectedPlace.city}</span>
                        <h3>{selectedPlace.name}</h3>
                      </div>
                      <button
                        className="btn"
                        onClick={() => {
                          setOpen(false);
                          setEditing(selectedPlace);
                        }}
                      >
                        {t("outreach.editListing")}
                      </button>
                    </div>

                    <div className="field-row">
                      <label className="field">
                        <span>{t("outreach.contactName")}</span>
                        <input
                          value={draft.contactName ?? ""}
                          onChange={(event) => setDraft({ ...draft, contactName: event.target.value || undefined })}
                        />
                      </label>
                      <label className="field">
                        <span>{t("outreach.contactEmail")}</span>
                        <input
                          type="email"
                          value={draft.contactEmail ?? ""}
                          onChange={(event) => setDraft({ ...draft, contactEmail: event.target.value || undefined })}
                        />
                      </label>
                    </div>

                    <label className="field">
                      <span>{t("outreach.photoUrls")}</span>
                      <textarea
                        rows={3}
                        value={draft.photoUrls.join("\n")}
                        onChange={(event) => setDraft({
                          ...draft,
                          photoUrls: event.target.value.split("\n").map((url) => url.trim()).filter(Boolean),
                        })}
                        placeholder="https://…"
                      />
                      <small>{t("outreach.photoUrlsHint")}</small>
                    </label>

                    <div className="ops__email-actions">
                      <a
                        className={`btn btn--primary ${draft.contactEmail?.trim() ? "" : "is-disabled"}`}
                        href={draft.contactEmail?.trim() ? email?.mailto : undefined}
                      >
                        {t("outreach.openEmail")}
                      </a>
                      <button
                        className="btn"
                        disabled={!email}
                        onClick={() => email && void navigator.clipboard.writeText(`${email.subject}\n\n${email.body}`)}
                      >
                        {t("outreach.copyEmail")}
                      </button>
                      <button className="btn" onClick={() => void markSent()} disabled={busy}>
                        {t("outreach.markSent")}
                      </button>
                    </div>
                    <p className="field__hint">{t("outreach.sentHint")}</p>

                    <div className="field-row">
                      <label className="field">
                        <span>{t("outreach.status")}</span>
                        <select
                          value={draft.status}
                          onChange={(event) => {
                            const status = event.target.value as PhotoPermissionStatus;
                            setDraft({
                              ...draft,
                              status,
                              respondedAt:
                                ["approved", "declined"].includes(status) && !draft.respondedAt
                                  ? new Date().toISOString()
                                  : draft.respondedAt,
                            });
                          }}
                        >
                          {PHOTO_PERMISSION_STATUSES.map((status) => (
                            <option key={status} value={status}>{t(STATUS_KEYS[status])}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>{t("outreach.followUpDate")}</span>
                        <input
                          type="date"
                          value={draft.followUpDueAt ?? ""}
                          onChange={(event) => setDraft({ ...draft, followUpDueAt: event.target.value || undefined })}
                        />
                      </label>
                    </div>

                    <fieldset className="ops__scope">
                      <legend>{t("outreach.permissionScope")}</legend>
                      <label>
                        <input
                          type="radio"
                          checked={draft.permissionScope === "specific"}
                          onChange={() => setDraft({ ...draft, permissionScope: "specific" })}
                        />
                        {t("outreach.scopeSpecific")}
                      </label>
                      <label>
                        <input
                          type="radio"
                          checked={draft.permissionScope === "general"}
                          onChange={() => setDraft({ ...draft, permissionScope: "general" })}
                        />
                        {t("outreach.scopeGeneral")}
                      </label>
                    </fieldset>

                    <label className="field">
                      <span>{t("outreach.evidence")}</span>
                      <textarea
                        rows={2}
                        value={draft.evidence ?? ""}
                        onChange={(event) => setDraft({ ...draft, evidence: event.target.value || undefined })}
                        placeholder={t("outreach.evidencePlaceholder")}
                      />
                      <small>{t("outreach.evidenceHint")}</small>
                    </label>
                    <label className="field">
                      <span>{t("outreach.notes")}</span>
                      <textarea
                        rows={2}
                        value={draft.notes ?? ""}
                        onChange={(event) => setDraft({ ...draft, notes: event.target.value || undefined })}
                      />
                    </label>

                    <button className="btn btn--primary ops__save" onClick={() => void persist(draft)} disabled={busy}>
                      {busy ? t("outreach.saving") : saved ? t("outreach.saved") : t("outreach.save")}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
