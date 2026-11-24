import { useMemo, useState } from "react";
import { useStore } from "../../store/useStore";
import { ageLabel } from "../../lib/format";
import { needsTurn } from "../../lib/turn";
import { Avatar } from "../Avatar";
import type { Lane } from "../../types";

const LANES: [Lane, string][] = [
  ["people", "People you want to hear from"],
  ["feed", "The feed — browse when you have time"],
  ["trail", "Paper trail — codes, receipts, rarely"],
];

export function LanesView() {
  const open = useStore((s) => s.openContact);
  const contacts = useStore((s) => s.contacts);
  const handledTurn = useStore((s) => s.handledTurn);
  const markHandled = useStore((s) => s.markHandled);
  const [turnOnly, setTurnOnly] = useState(false);

  const isTurn = (c: (typeof contacts)[number]) => needsTurn(c, handledTurn);
  const awaiting = useMemo(() => contacts.filter(isTurn).length, [contacts, handledTurn]);

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
          items = [...items].sort((a, b) => Number(isTurn(b)) - Number(isTurn(a)));
          if (!items.length) return null;
          return (
            <div className="lane" key={lane}>
              <div className="lh">{title}</div>
              {items.map((c) => {
                const turn = isTurn(c);
                return (
                  <div className={"lrow" + (turn ? " awaits" : "")} key={c.id} onClick={() => open(c.id)}>
                    <Avatar contact={c} />
                    <div style={{ minWidth: 0 }}>
                      <div className="nm">{c.name}</div>
                      <div className="sn">{c.snippet}</div>
                    </div>
                    <div className="rmeta">
                      {turn && (
                        <div className="turnrow">
                          <button
                            className="handled"
                            title="No reply needed — clear 'your turn'"
                            aria-label="Mark handled — no reply needed"
                            onClick={(e) => {
                              e.stopPropagation(); // don't open the conversation
                              markHandled(c.id);
                            }}
                          >
                            ✓
                          </button>
                          <span className="turn">your turn</span>
                        </div>
                      )}
                      <span className="rt">{ageLabel(c.age)}</span>
                    </div>
                  </div>
                );
              })}
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
