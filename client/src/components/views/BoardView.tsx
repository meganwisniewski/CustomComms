import { useMemo } from "react";
import { normalizeBoard, useStore } from "../../store/useStore";
import { CONTACTS_BY_ID } from "../../data/sampleData";
import { lastLine } from "../../lib/format";
import { Avatar } from "../Avatar";
import type { Contact } from "../../types";

function Tile({ c }: { c: Contact }) {
  const open = useStore((s) => s.openContact);
  const ll = lastLine(c);
  return (
    <div
      className="tile"
      role="button"
      tabIndex={0}
      onClick={() => open(c.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(c.id);
        }
      }}
    >
      <div className="top">
        <Avatar contact={c} />
        <div className="who">
          <div className="nm">{c.name}</div>
        </div>
        {c.unread && <span className="unread" />}
      </div>
      <div className="snippet">{c.snippet}</div>
      <div className="lastline">
        <span className="arw">{ll.arrow}</span> {ll.text} <span className="t">· {ll.t}</span>
      </div>
    </div>
  );
}

export function BoardView() {
  const board = useStore((s) => s.board);
  const groups = useMemo(() => normalizeBoard(board), [board]);
  return (
    <>
      <div className="subcap">Your people, grouped into boards you control. (Drag-to-reorder lands in the next build.)</div>
      <div className="boards">
        {groups.map((g) => (
          <div key={g.name}>
            <div className="bhead">
              {g.name} <span className="bcount">{g.ids.length}</span>
            </div>
            <div className="bgrid">
              {g.ids.map((id) => {
                const c = CONTACTS_BY_ID[id];
                return c ? <Tile key={id} c={c} /> : null;
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
