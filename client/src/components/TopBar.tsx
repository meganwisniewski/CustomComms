import { useStore } from "../store/useStore";

// null = Synthwave (the default theme).
const THEME_META = {
  synth: { glyph: "✦", title: "Theme: Synthwave — click for Light" },
  light: { glyph: "☀", title: "Theme: Light — click for Dark" },
  dark: { glyph: "☾", title: "Theme: Dark — click for Synthwave" },
} as const;

export function TopBar() {
  const calm = useStore((s) => s.calm);
  const toggleCalm = useStore((s) => s.toggleCalm);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const theme = useStore((s) => s.theme);
  const tm = THEME_META[theme ?? "synth"];
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
        <button className="btn iconbtn" onClick={toggleTheme} aria-label={tm.title} title={tm.title}>
          {tm.glyph}
        </button>
      </div>
    </div>
  );
}
