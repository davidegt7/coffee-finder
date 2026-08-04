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
import { BeansSheet } from "./components/BeansSheet";
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
    syncFromUrl,
    editing,
    editSeq,
    submitOpen,
    setSubmitOpen,
    beansOpen,
    setBeansOpen,
    isEditor,
    brainOpen,
    setBrainOpen,
  } = useStore();
  const { t } = useT();

  useEffect(() => {
    void init();
  }, [init]);

  // Back/forward — including the phone's back gesture — moves between places
  // rather than leaving the app, which is what someone who just tapped into a
  // café expects "back" to undo.
  useEffect(() => {
    const onPop = () => syncFromUrl();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [syncFromUrl]);

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
              {/* Wordmark and subtitle share one pill. The pill exists so the
                  brand stays legible over whatever the map is showing beneath
                  it, and a subtitle sitting outside it would be the one bit of
                  text that isn't. */}
              <div className="brandmark">
                <h1>
                  Coffee<span>Finder</span>
                </h1>
                <p className="brandmark__sub">{t("app.subtitle")}</p>
              </div>
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
