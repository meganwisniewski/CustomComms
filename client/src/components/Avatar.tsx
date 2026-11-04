import type { Contact } from "../types";
import { useStore } from "../store/useStore";
import { colorFor, initials } from "../lib/format";

export function Avatar({ contact, size }: { contact: Contact; size?: "s1" | "s2" | "s3" }) {
  const override = useStore((s) => s.avatarOverrides[contact.id]);
  const emoji = override ?? contact.emoji;
  const cls = `av${size ? " " + size : ""}${emoji ? " em" : ""}`;
  const bg = emoji ? "var(--surface-3)" : colorFor(contact.name);
  return (
    <div className={cls} style={{ background: bg }}>
      {emoji ?? initials(contact.name)}
    </div>
  );
}
