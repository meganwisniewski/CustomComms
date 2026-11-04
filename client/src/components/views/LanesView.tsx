import { useStore } from "../../store/useStore";
import { CONTACTS } from "../../data/sampleData";
import { ageLabel } from "../../lib/format";
import { Avatar } from "../Avatar";
import type { Lane } from "../../types";

const LANES: [Lane, string][] = [
  ["people", "People you want to hear from"],
  ["feed", "The feed — browse when you have time"],
  ["trail", "Paper trail — codes, receipts, rarely"],
];

export function LanesView() {
  const open = useStore((s) => s.openContact);
  return (
    <>
      <div className="subcap">Sorted by what it is — real people up top, noise tucked away.</div>
      <div className="lanes">
        {LANES.map(([lane, title]) => {
          const items = CONTACTS.filter((c) => c.lane === lane);
          if (!items.length) return null;
          return (
            <div className="lane" key={lane}>
              <div className="lh">{title}</div>
              {items.map((c) => (
                <div className="lrow" key={c.id} onClick={() => open(c.id)}>
                  <Avatar contact={c} />
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{c.name}</div>
                    <div className="sn">{c.snippet}</div>
                  </div>
                  <div className="rt">{ageLabel(c.age)}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
