import type { Contact } from "../types";

/**
 * "Your turn" = a real person wrote last and you haven't marked it handled.
 *
 * Marking handled is tied to the *current* last message (its timestamp), so it
 * only silences this message — if they send a new one, the marker no longer
 * matches and the cue returns. This keeps "no reply needed" from permanently
 * hiding a future message that does need a reply. Scoped to people, so a
 * verification code or receipt is never flagged.
 */
export function turnMarker(c: Contact): number {
  return c.lastDate ?? 0;
}

export function needsTurn(c: Contact, handled: Record<string, number>): boolean {
  return c.lane === "people" && c.last === "them" && handled[c.id] !== turnMarker(c);
}
