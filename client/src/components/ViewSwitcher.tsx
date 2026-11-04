import { useStore } from "../store/useStore";
import type { ViewId } from "../types";

const VIEWS: [ViewId, string, string][] = [
  ["circles", "◎", "Circles"],
  ["board", "▦", "Board"],
  ["focus", "◉", "Focus"],
  ["lanes", "☰", "Lanes"],
];

export function ViewSwitcher() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  return (
    <div className="views" role="group" aria-label="View">
      {VIEWS.map(([id, ic, label]) => (
        <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>
          <span className="ic">{ic}</span>
          {label}
        </button>
      ))}
    </div>
  );
}
