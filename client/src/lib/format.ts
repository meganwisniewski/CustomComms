import type { Contact } from "../types";

const PALETTE = [
  "#8C7382", "#627C87", "#78748E", "#92806D",
  "#6F8A7B", "#8A757A", "#6F7A86", "#857C68",
];

export function colorFor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initials(name: string): string {
  return name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function ageLabel(d: number): string {
  if (d < 1) return "today";
  if (d < 7) return `${d}d`;
  if (d < 30) return `${Math.round(d / 7)}w`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${Math.round(d / 365)}y`;
}

/** Purely informational last-message line: who wrote last, how long ago. */
export function lastLine(c: Contact): { arrow: string; text: string; t: string } {
  const t = ageLabel(c.age);
  if (c.last === "group") return { arrow: "•", text: "active", t };
  if (c.last === "them") return { arrow: "↩", text: "they wrote", t };
  return { arrow: "↪", text: "you wrote", t };
}
