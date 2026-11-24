import { useMemo, useState } from "react";
import { useStore } from "../../store/useStore";
import { ageLabel } from "../../lib/format";
import { Avatar } from "../Avatar";
import type { Contact, Lane } from "../../types";

const LANES: [Lane, string][] = [
  ["people", "People you want to hear from"],
  ["feed", "The feed — browse when you have time"],
  ["trail", "Paper trail — codes, receipts, rarely"],
];

// "Your turn" = a real person wrote last, so the reply's on you. Deliberately
// scoped to people — a verification code or receipt isn't something you answer.
const isTurn = (c: Contact) => c.lane === "people" && c.last === "them";

export function LanesView() {
  const open = useStore((s) => s.openContact);
  const contacts = useStore((s) => s.contacts);
  const [turnOnly, setTurnOnly] = useState(false);

  const awaiting = useMemo(() => contacts.filter(isTurn).length, [contacts]);

  return (
    <>
      <div className="subcap">Sorted by what it is — real people up top, noise tucked away.</div>
      <div className="lanetools">
        <button className="btn" aria-pressed={turnOnly} onClick={() => setTurnOnly((v) => !v)}>
          ↩ Your turn{awaiting ? ` · ${awaiting}` : ""}
        </button>
      </div>
      <div className="lanes">
        {LANES.map(([lane, title]) => {
          let items = contacts.filter((c) => c.lane === lane);
          if (turnOnly) items = items.filter(isTurn);
          // Your-turn rows float to the top of the lane; recency order is kept within each group.
          items = [...items].sort((a, b) => Number(isTurn(b)) - Number(isTurn(a)));
          if (!items.length) return null;
          return (
            <div className="lane" key={lane}>
              <div className="lh">{title}</div>
              {items.map((c) => (
                <div
                  className={"lrow" + (isTurn(c) ? " awaits" : "")}
                  key={c.id}
                  onClick={() => open(c.id)}
                >
                  <Avatar contact={c} />
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{c.name}</div>
                    <div className="sn">{c.snippet}</div>
                  </div>
                  <div className="rmeta">
                    {isTurn(c) && <span className="turn">your turn</span>}
                    <span className="rt">{ageLabel(c.age)}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {turnOnly && awaiting === 0 && (
          <div className="subcap">You're all caught up — nothing's waiting on you.</div>
        )}
      </div>
    </>
  );
}
