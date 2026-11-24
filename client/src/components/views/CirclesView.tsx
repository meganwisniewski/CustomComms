import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import { Avatar } from "../Avatar";
import type { Ring } from "../../types";

interface NodePos {
  id: string;
  x: number;
  y: number;
  ring: Ring;
}

const RING_LABELS = ["closest", "close", "orbit"];
// Dock-style fisheye: faces rest small (so a crowded ring never overlaps) and
// swell up — with their name — near the cursor/finger.
const REST = 0.72; // resting scale
const PEAK = 1.85; // magnified scale right under the pointer
const LABEL_AT = 1.3; // only name a face once it's magnified past this

export function CirclesView() {
  const ref = useRef<HTMLDivElement>(null);
  const circlePos = useStore((s) => s.circlePos);
  const setCirclePos = useStore((s) => s.setCirclePos);
  const openContact = useStore((s) => s.openContact);
  const contacts = useStore((s) => s.contacts);
  const PEOPLE = useMemo(() => contacts.filter((c) => c.lane === "people"), [contacts]);

  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [positions, setPositions] = useState<NodePos[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: string; moved: boolean; sx: number; sy: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const radii = useCallback((R: number) => [R * 0.4, R * 0.66, R * 0.92], []);

  useEffect(() => {
    const { w, h } = dims;
    if (!w || !h) return;
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 52;
    const rs = radii(R);
    const next: NodePos[] = [];
    ([1, 2, 3] as Ring[]).forEach((level) => {
      const grp = PEOPLE.filter((c) => (circlePos[c.id]?.c ?? c.closeness) === level);
      grp.forEach((c, idx) => {
        const r = rs[level - 1];
        // Evenly distribute around the ring; dragging changes the ring, not the angle.
        const ang = -Math.PI / 2 + idx * ((2 * Math.PI) / Math.max(grp.length, 1));
        next.push({ id: c.id, x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), ring: level });
      });
    });
    setPositions(next);
  }, [dims, circlePos, radii, PEOPLE]);

  // The "lens" reach — scales with the dial so it feels right on phone and desktop.
  const FOCUS_R = Math.max(86, (Math.min(dims.w, dims.h) / 2) * 0.52);
  const scaleFor = (p: NodePos) => {
    if (!focus) return REST;
    const d = Math.hypot(p.x - focus.x, p.y - focus.y);
    if (d >= FOCUS_R) return REST;
    const t = 1 - d / FOCUS_R;
    const eased = t * t * (3 - 2 * t); // smoothstep
    return REST + (PEAK - REST) * eased;
  };

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { id, moved: false, sx: e.clientX, sy: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setFocus({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) {
      d.moved = true;
      setDraggingId(d.id);
    }
    if (d.moved && rect) {
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      setPositions((ps) => ps.map((p) => (p.id === d.id ? { ...p, x, y } : p)));
    }
  };
  const endInteraction = () => {
    drag.current = null;
    setDraggingId(null);
    setFocus(null);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) {
      setFocus(null);
      return;
    }
    if (!d.moved) {
      endInteraction();
      openContact(d.id);
      return;
    }
    const { w, h } = dims;
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 52;
    const rect = ref.current!.getBoundingClientRect();
    const px = e.clientX - rect.left - cx, py = e.clientY - rect.top - cy;
    const rs = radii(R);
    const dist = Math.hypot(px, py);
    let best = 0, bd = Infinity;
    rs.forEach((r, i) => {
      if (Math.abs(dist - r) < bd) {
        bd = Math.abs(dist - r);
        best = i;
      }
    });
    setCirclePos(d.id, { c: (best + 1) as Ring, a: Math.atan2(py, px) });
    endInteraction();
  };

  const { w, h } = dims;
  const cy = h / 2, R = Math.min(w, h) / 2 - 52;
  const rs = radii(R);

  // Only the single face nearest the pointer is named (Dock-style), so labels
  // never collide even when several faces are enlarged at once.
  let primaryId: string | null = null;
  if (focus) {
    let best = LABEL_AT;
    for (const p of positions) {
      const s = scaleFor(p);
      if (s >= best) {
        best = s;
        primaryId = p.id;
      }
    }
  }

  return (
    <>
      <div className="subcap">
        Sweep across the dial to magnify a face; tap to open; drag a face in or out to change its ring.
      </div>
      <div
        className="circles"
        ref={ref}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setFocus(null)}
        onPointerCancel={endInteraction}
      >
        {w > 0 &&
          rs.map((r, i) => (
            <div key={i}>
              <div className="ringc" style={{ width: r * 2, height: r * 2 }} />
              <div className="ringlbl" style={{ top: cy - r - 14 }}>
                {RING_LABELS[i]}
              </div>
            </div>
          ))}
        {w > 0 && <div className="center">you</div>}
        {positions.map((p) => {
          const c = PEOPLE.find((x) => x.id === p.id);
          if (!c) return null;
          const s = draggingId === p.id ? PEAK : scaleFor(p);
          const mag = p.id === primaryId || draggingId === p.id;
          return (
            <div
              key={p.id}
              className={"node" + (draggingId === p.id ? " dragging" : "") + (mag ? " mag" : "")}
              style={{
                left: p.x,
                top: p.y,
                transform: `translate(-50%, -50%) scale(${s.toFixed(3)})`,
                zIndex: draggingId === p.id ? 30 : mag ? 20 : 3,
              }}
              onPointerDown={(e) => onPointerDown(e, p.id)}
            >
              <Avatar contact={c} size="s3" />
              <div className="nm">{c.name.split(" ")[0]}</div>
              {c.unread && <div className="nd" />}
            </div>
          );
        })}
      </div>
    </>
  );
}
