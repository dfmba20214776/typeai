import EditorSurface from "../components/EditorSurface";
import GhostOverlay from "../components/GhostOverlay";
import SuggestionsPanel from "../components/SuggestionsPanel";
import SentenceSuggestionsPanel from "../components/SentenceSuggestionsPanel";
import DebugPanel from "../components/DebugPanel";

export default function Home() {
  return (
    <main className="app">
      <div className="editor-column">
        <div className="editor-wrap">
          <EditorSurface />
          <GhostOverlay />
        </div>
        <SentenceSuggestionsPanel />
      </div>
      <SuggestionsPanel />
      <DebugPanel />
    </main>
  );
}
