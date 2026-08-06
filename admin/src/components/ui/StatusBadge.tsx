type Tone = "default" | "ok" | "warn" | "accent";

const toneClass: Record<Tone, string> = {
  default: "badge",
  ok: "badge badgeOk",
  warn: "badge badgeWarn",
  accent: "badge badgeAccent",
};

export function StatusBadge({
  children,
  tone = "default",
}: {
  children: string;
  tone?: Tone;
}) {
  return <span className={toneClass[tone]}>{children}</span>;
}
