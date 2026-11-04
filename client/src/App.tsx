import { useEffect } from "react";
import type { FC } from "react";
import { useStore } from "./store/useStore";
import { TopBar } from "./components/TopBar";
import { ViewSwitcher } from "./components/ViewSwitcher";
import { CirclesView } from "./components/views/CirclesView";
import { BoardView } from "./components/views/BoardView";
import { FocusView } from "./components/views/FocusView";
import { LanesView } from "./components/views/LanesView";
import { ConversationPanel } from "./components/ConversationPanel";
import type { ViewId } from "./types";

const VIEWS: Record<ViewId, FC> = {
  circles: CirclesView,
  board: BoardView,
  focus: FocusView,
  lanes: LanesView,
};

export function App() {
  const theme = useStore((s) => s.theme);
  const calm = useStore((s) => s.calm);
  const view = useStore((s) => s.view);

  useEffect(() => {
    const r = document.documentElement;
    if (theme) r.setAttribute("data-theme", theme);
    else r.removeAttribute("data-theme");
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-calm", calm ? "on" : "off");
  }, [calm]);

  const ViewComp = VIEWS[view];

  return (
    <>
      <div className="app">
        <TopBar />
        <ViewSwitcher />
        <div className="view">
          <ViewComp />
        </div>
        <p className="foot">
          <b>Development build.</b> Sample data — your real people &amp; messages connect once the hub is live.
        </p>
      </div>
      <div className="overlay-root">
        <ConversationPanel />
      </div>
    </>
  );
}
