import { useStore } from "../store/useStore";

export function TopBar() {
  const calm = useStore((s) => s.calm);
  const toggleCalm = useStore((s) => s.toggleCalm);
  const toggleTheme = useStore((s) => s.toggleTheme);
  return (
    <div className="topbar">
      <div className="brand">
        <h1>
          CustomComms<span className="dot">.</span>
        </h1>
      </div>
      <div className="controls">
        <button className="btn" aria-pressed={calm} onClick={toggleCalm} title="Lower visual stimulation">
          ◖ Calm
        </button>
        <button className="btn iconbtn" onClick={toggleTheme} aria-label="Toggle light / dark">
          ◐
        </button>
      </div>
    </div>
  );
}
