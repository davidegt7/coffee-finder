import { useEffect, useState } from "react";
import { useStore } from "./store";
import { MapView } from "./components/MapView";
import { ListSheet } from "./components/ListSheet";
import { FilterBar } from "./components/FilterBar";
import { RoasterFilterBar } from "./components/RoasterFilterBar";
import { PlaceSheet } from "./components/PlaceSheet";
import { RoasterSheet } from "./components/RoasterSheet";
import { SectionToggle } from "./components/SectionToggle";
import { AdminBar } from "./components/AdminBar";
import { PlaceEditor } from "./components/PlaceEditor";
import { LangToggle } from "./components/LangToggle";
import { SubmitPlace } from "./components/SubmitPlace";
import { BeansSheet } from "./components/BeansSheet";
import { applyUpdate } from "./lib/appUpdate";
import { SubmissionsQueue } from "./components/SubmissionsQueue";
import { BrainChat } from "./components/BrainChat";
import { useT } from "./lib/useT";
import "./App.css";

export default function App() {
  const {
    status,
    error,
    init,
    section,
    selectedId,
    selectedRoasterId,
    select,
    selectRoaster,
    syncFromUrl,
    editing,
    editSeq,
    submitOpen,
    setSubmitOpen,
    beansOpen,
    setBeansOpen,
    updateReady,
    isEditor,
    brainOpen,
    setBrainOpen,
  } = useStore();
  const { t } = useT();
  // Phones should open on the map, not on a wall of controls. Search remains
  // visible in the compact state; everything else lives under Filters.
  const [mobileControlsCollapsed, setMobileControlsCollapsed] = useState(true);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.title = section === "roasters" ? "Roasters · Coffee Finder" : "Coffee Map · Coffee Finder";
  }, [section]);

  useEffect(() => {
    setMobileControlsCollapsed(true);
  }, [section]);

  // Back/forward — including the phone's back gesture — moves between places
  // rather than leaving the app, which is what someone who just tapped into a
  // café expects "back" to undo.
  useEffect(() => {
    const onPop = () => syncFromUrl();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [syncFromUrl]);

  useEffect(() => {
    if (!selectedId && !selectedRoasterId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedRoasterId) selectRoaster(null);
        else select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, selectedRoasterId, select, selectRoaster]);

  return (
    <div className={`app app--${section}`}>
      {/* A stale installed app is indistinguishable from a broken one, so say
          which it is. A prompt rather than an automatic reload: reloading
          underneath someone mid-review would be the worse bug. */}
      {updateReady && (
        <button className="app-update" onClick={applyUpdate}>
          {t("app.updateReady")} · <strong>{t("app.updateNow")}</strong>
        </button>
      )}
      {status === "loading" && <div className="app__state">{t("app.loading")}</div>}
      {status === "error" && (
        <div className="app__state app__state--error">
          <p>{t("app.loadError")}</p>
          <code>{error}</code>
        </div>
      )}

      {status === "ready" && (
        <>
          {/* The map is the canvas of the on-site product. The roaster
              directory is intentionally a different page, not a list laid
              over geography that has nothing to do with online shopping. */}
          {section === "cafes" && <MapView />}

          <div
            className={`topbar ${mobileControlsCollapsed ? "is-mobile-collapsed" : ""}`}
          >
            <div className="topbar__full">
              <div className="topbar__brand">
                {/* The wordmark stays legible over whatever the map is showing. */}
                <div className="brandmark">
                  <div className="brandmark__title">
                    <h1>
                      Coffee<span>Finder</span>
                    </h1>
                    <span className="brandmark__beta">Beta</span>
                  </div>
                </div>
                <LangToggle />
              </div>
              <button
                type="button"
                className="topbar__filter-toggle"
                onClick={() => setMobileControlsCollapsed((collapsed) => !collapsed)}
                aria-expanded={!mobileControlsCollapsed}
              >
                <span>{t("filter.open")}</span>
                <span className="topbar__filter-caret" aria-hidden="true">
                  {mobileControlsCollapsed ? "⌄" : "⌃"}
                </span>
              </button>
              <div className="topbar__collapsible">
                <div className="topbar__nav">
                  <SectionToggle />
                </div>
                {section === "cafes" ? (
                  <>
                    <button
                      type="button"
                      className="owner-cta owner-cta--topbar"
                      onClick={() => setSubmitOpen(true)}
                    >
                      ＋ {t("submit.cta")}
                    </button>
                    <AdminBar />
                    {isEditor && <SubmissionsQueue />}
                    <FilterBar onComplete={() => setMobileControlsCollapsed(true)} />
                  </>
                ) : (
                  <>
                    <AdminBar />
                    <RoasterFilterBar onComplete={() => setMobileControlsCollapsed(true)} />
                  </>
                )}
              </div>
            </div>
          </div>

          <ListSheet />
        </>
      )}

      {selectedId && !editing && section === "cafes" && (
        <>
          <div className="scrim" onClick={() => select(null)} />
          <PlaceSheet />
        </>
      )}

      {selectedRoasterId && section === "roasters" && (
        <>
          <div className="scrim" onClick={() => selectRoaster(null)} />
          <RoasterSheet />
        </>
      )}

      {submitOpen && (
        <>
          <div className="scrim" onClick={() => setSubmitOpen(false)} />
          <SubmitPlace />
        </>
      )}

      {beansOpen && (
        <>
          <div className="scrim" onClick={() => setBeansOpen(false)} />
          <BeansSheet />
        </>
      )}

      {brainOpen && (
        <>
          <div className="scrim" onClick={() => setBrainOpen(false)} />
          <BrainChat />
        </>
      )}

      {editing && (
        <>
          <div className="scrim" />
          {/* Keyed on the sequence, not the id: two drafts in a row are both
              new places with no id yet, and a shared key would keep the first
              one's form state instead of showing the second one's fields. */}
          <PlaceEditor key={editSeq} />
        </>
      )}
    </div>
  );
}
