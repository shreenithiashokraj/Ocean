"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "RESEARCHER" | "FISHERMAN";
  isActive: boolean;
  createdAt: string;
  phone: string | null;
}

const ROLE_OPTIONS = ["ADMIN", "RESEARCHER", "FISHERMAN"] as const;
const FILTER_OPTIONS = ["ALL", "ADMIN", "RESEARCHER", "FISHERMAN"] as const;

const ROLE_BADGE_STYLES: Record<string, string> = {
  ADMIN: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  RESEARCHER: "border-purple-500/40 bg-purple-500/15 text-purple-300",
  FISHERMAN: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300",
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function AdminUsersView() {
  const me = useAppStore((s) => s.user);

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<(typeof FILTER_OPTIONS)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  // Per-row pending edits keyed by user id.
  const [pending, setPending] = useState<
    Record<string, { role: string; isActive: boolean } | undefined>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.listUsers();
      setUsers(r.users as AdminUser[]);
      setPending({});
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load users";
      setError(msg);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const list = users ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((u) => {
      if (filterRole !== "ALL" && u.role !== filterRole) return false;
      if (q && !u.email.toLowerCase().includes(q) && !u.name.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [users, filterRole, search]);

  function setPendingFor(id: string, patch: Partial<{ role: string; isActive: boolean }>) {
    setPending((p) => {
      const u = users?.find((x) => x.id === id);
      if (!u) return p;
      const cur = p[id] ?? { role: u.role, isActive: u.isActive };
      return { ...p, [id]: { ...cur, ...patch } };
    });
  }

  function isDirty(id: string): boolean {
    const u = users?.find((x) => x.id === id);
    const pend = pending[id];
    if (!u || !pend) return false;
    return pend.role !== u.role || pend.isActive !== u.isActive;
  }

  async function saveRow(id: string) {
    const pend = pending[id];
    if (!pend) return;
    setSavingId(id);
    try {
      await api.updateUserRole(id, pend.role, pend.isActive);
      // Apply the change locally so the table reflects it instantly.
      setUsers((list) =>
        (list ?? []).map((u) =>
          u.id === id ? { ...u, role: pend.role as AdminUser["role"], isActive: pend.isActive } : u
        )
      );
      setPending((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
      toast.success("User updated");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to update user";
      toast.error(msg);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users &amp; Roles</h1>
          <p className="text-sm text-muted-foreground">
            Manage every account, its role, and active status.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </header>

      {/* Filters */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email or name…"
            className="pl-9"
            aria-label="Search users"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filter</span>
          <Select value={filterRole} onValueChange={(v) => setFilterRole(v as typeof filterRole)}>
            <SelectTrigger size="sm" className="w-[150px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r === "ALL" ? "All roles" : r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="glass-card mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-primary" />
            {users ? `${filtered.length} of ${users.length} users` : "Users"}
          </CardTitle>
          <CardDescription>
            Change role or active status, then click Save per row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : loading && !users ? (
            <LoadingState label="Loading users…" />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No matching users"
              description="Try clearing the search or role filter."
              icon={Users}
            />
          ) : (
            <div className="scroll-ocean max-h-[28rem] overflow-y-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] uppercase">Name</TableHead>
                    <TableHead className="text-[11px] uppercase">Email</TableHead>
                    <TableHead className="text-[11px] uppercase">Role</TableHead>
                    <TableHead className="text-[11px] uppercase">Active</TableHead>
                    <TableHead className="text-[11px] uppercase">Created</TableHead>
                    <TableHead className="text-[11px] uppercase text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => {
                    const pend = pending[u.id] ?? { role: u.role, isActive: u.isActive };
                    const dirty = isDirty(u.id);
                    const isSelf = me?.id === u.id;
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.name}
                          {isSelf && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              you
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Select
                            value={pend.role}
                            onValueChange={(v) => setPendingFor(u.id, { role: v })}
                          >
                            <SelectTrigger size="sm" className="h-8 w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLE_OPTIONS.map((r) => (
                                <SelectItem key={r} value={r}>
                                  <Badge
                                    variant="outline"
                                    className={cn("mr-1 text-[10px]", ROLE_BADGE_STYLES[r])}
                                  >
                                    {r}
                                  </Badge>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={pend.isActive}
                              onCheckedChange={(v) => setPendingFor(u.id, { isActive: v })}
                              disabled={isSelf && !pend.isActive}
                              aria-label={`Active for ${u.email}`}
                            />
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                pend.isActive
                                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                  : "border-rose-500/40 bg-rose-500/15 text-rose-300"
                              )}
                            >
                              {pend.isActive ? "active" : "disabled"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {fmtDate(u.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="default"
                            disabled={!dirty || savingId === u.id}
                            onClick={() => void saveRow(u.id)}
                          >
                            {savingId === u.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <aside
        role="note"
        className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200"
      >
        You cannot deactivate your own account. Role changes are applied
        immediately and affect which portals the user can reach on next sign-in.
      </aside>
    </div>
  );
}

export default AdminUsersView;
