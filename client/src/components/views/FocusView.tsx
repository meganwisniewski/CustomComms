import { useState } from "react";
import { useStore } from "../../store/useStore";
import { PEOPLE } from "../../data/sampleData";
import { lastLine } from "../../lib/format";
import { Avatar } from "../Avatar";

export function FocusView() {
  const open = useStore((s) => s.openContact);
  const list = PEOPLE.filter((c) => c.last === "them");
  const [idx, setIdx] = useState(0);

  const sub = <div className="subcap">One at a time — no list, no scrolling. Reply, or set it down for later.</div>;

  if (idx >= list.length) {
    return (
      <>
        {sub}
        <div className="focus">
          <div className="fdone">
            <div className="big">🌿</div>
            <h3>You're all caught up</h3>
            <p style={{ marginTop: 6, fontSize: 13 }}>Nothing waiting. Come back whenever.</p>
          </div>
        </div>
      </>
    );
  }

  const c = list[idx];
  const ll = lastLine(c);
  return (
    <>
      {sub}
      <div className="focus">
        <div className="fcnt">
          {idx + 1} OF {list.length}
        </div>
        <div className="fcard">
          <Avatar contact={c} />
          <div className="fn">{c.name}</div>
          <div className="fm">"{c.thread[c.thread.length - 1].text}"</div>
          <div className="fl">
            {ll.arrow} {ll.text} · {ll.t}
          </div>
        </div>
        <div className="facts">
          <button className="pri" onClick={() => open(c.id)}>
            Reply
          </button>
          <button onClick={() => setIdx((i) => i + 1)}>Later</button>
          <button onClick={() => setIdx((i) => i + 1)}>Done</button>
        </div>
        <div className="fhint">one decision, then the next.</div>
      </div>
    </>
  );
}
