import { cn } from "@/lib/utils";
import type { Role } from "@/lib/store";

const ROLE_STYLES: Record<Role, string> = {
  ADMIN: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  RESEARCHER: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  FISHERMAN: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        ROLE_STYLES[role],
        className
      )}
    >
      {role}
    </span>
  );
}
