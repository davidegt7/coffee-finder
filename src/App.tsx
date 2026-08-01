import { useEffect } from "react";
import { useStore } from "./store";
import { MapView } from "./components/MapView";
import { ListSheet } from "./components/ListSheet";
import { FilterBar } from "./components/FilterBar";
import { PlaceSheet } from "./components/PlaceSheet";
import { AdminBar } from "./components/AdminBar";
import { PlaceEditor } from "./components/PlaceEditor";
import { LangToggle } from "./components/LangToggle";
import { SubmitPlace } from "./components/SubmitPlace";
import { SubmissionsQueue } from "./components/SubmissionsQueue";
import { BrainChat } from "./components/BrainChat";
import { useT } from "./lib/useT";
import "./App.css";

export default function App() {
  const {
    status,
    error,
    init,
    selectedId,
    select,
    editing,
    editSeq,
    submitOpen,
    setSubmitOpen,
    isEditor,
    brainOpen,
    setBrainOpen,
  } = useStore();
  const { t } = useT();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, select]);

  return (
    <div className="app">
      {status === "loading" && <div className="app__state">{t("app.loading")}</div>}
      {status === "error" && (
        <div className="app__state app__state--error">
          <p>{t("app.loadError")}</p>
          <code>{error}</code>
        </div>
      )}

      {status === "ready" && (
        <>
          {/* Map is the canvas, not a panel. Everything else floats on it. */}
          <MapView />

          <div className="topbar">
            <div className="topbar__brand">
              <h1>
                Coffee<span>Finder</span>
              </h1>
              <LangToggle />
            </div>
            <AdminBar />
            {isEditor && <SubmissionsQueue />}
            <FilterBar />
          </div>

          <ListSheet />
        </>
      )}

      {selectedId && !editing && (
        <>
          <div className="scrim" onClick={() => select(null)} />
          <PlaceSheet />
        </>
      )}

      {submitOpen && (
        <>
          <div className="scrim" onClick={() => setSubmitOpen(false)} />
          <SubmitPlace />
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
