import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import { PEOPLE } from "../../data/sampleData";
import { Avatar } from "../Avatar";
import type { Ring } from "../../types";

interface NodePos {
  id: string;
  x: number;
  y: number;
  ring: Ring;
}

const RING_LABELS = ["closest", "close", "orbit"];

export function CirclesView() {
  const ref = useRef<HTMLDivElement>(null);
  const circlePos = useStore((s) => s.circlePos);
  const setCirclePos = useStore((s) => s.setCirclePos);
  const openContact = useStore((s) => s.openContact);

  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [positions, setPositions] = useState<NodePos[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
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

  const radii = useCallback((R: number) => [R * 0.34, R * 0.64, R * 0.96], []);

  useEffect(() => {
    const { w, h } = dims;
    if (!w || !h) return;
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 46;
    const rs = radii(R);
    const next: NodePos[] = [];
    ([1, 2, 3] as Ring[]).forEach((level) => {
      const grp = PEOPLE.filter((c) => (circlePos[c.id]?.c ?? c.closeness) === level);
      grp.forEach((c, idx) => {
        const r = rs[level - 1];
        const ang = circlePos[c.id]?.a ?? -Math.PI / 2 + idx * ((2 * Math.PI) / Math.max(grp.length, 1));
        next.push({ id: c.id, x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), ring: level });
      });
    });
    setPositions(next);
  }, [dims, circlePos, radii]);

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { id, moved: false, sx: e.clientX, sy: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) {
      d.moved = true;
      setDraggingId(d.id);
    }
    if (d.moved && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      setPositions((ps) => ps.map((p) => (p.id === d.id ? { ...p, x, y } : p)));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDraggingId(null);
    if (!d) return;
    if (!d.moved) {
      openContact(d.id);
      return;
    }
    const { w, h } = dims;
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 46;
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
  };

  const { w, h } = dims;
  const cy = h / 2, R = Math.min(w, h) / 2 - 46;
  const rs = radii(R);

  return (
    <>
      <div className="subcap">Arranged by closeness — drag a face toward the center or outward to change the ring.</div>
      <div
        className="circles"
        ref={ref}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDraggingId(null);
        }}
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
          const c = PEOPLE.find((x) => x.id === p.id)!;
          return (
            <div
              key={p.id}
              className={"node" + (draggingId === p.id ? " dragging" : "")}
              style={{ left: p.x, top: p.y }}
              onPointerDown={(e) => onPointerDown(e, p.id)}
            >
              <Avatar contact={c} size={("s" + p.ring) as "s1" | "s2" | "s3"} />
              <div className="nm">{c.name.split(" ")[0]}</div>
              {c.unread && <div className="nd" />}
            </div>
          );
        })}
      </div>
    </>
  );
}
