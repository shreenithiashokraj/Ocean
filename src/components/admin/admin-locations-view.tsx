"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Anchor, MapPin, RefreshCw, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState, Unavailable } from "@/components/common/states";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AdminSavedLocation {
  id: string;
  userId: string;
  name: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  category: string;
  createdAt: string;
  user: { name: string; email: string } | null;
}
interface AdminFishingSpot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  region: string | null;
  species: string | null;
  depthM: number | null;
  bottomType: string | null;
  source: string;
  createdAt: string;
}
interface AdminLocationsRecords {
  saved: AdminSavedLocation[];
  spots: AdminFishingSpot[];
}
interface AdminLocationsPayload {
  records: AdminLocationsRecords;
}

const CATEGORY_CHIP: Record<string, string> = {
  fishing: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  harbor: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300",
  home: "border-purple-500/40 bg-purple-500/15 text-purple-300",
  waypoint: "border-amber-500/40 bg-amber-500/15 text-amber-300",
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function AdminLocationsView() {
  const [data, setData] = useState<AdminLocationsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getAdminLocations();
      // api.ts types this as `{records: unknown[]}` but our backend returns
      // `{records: {saved, spots}}` — cast accordingly.
      const rec = (r as unknown as { records: AdminLocationsRecords }).records;
      if (rec && typeof rec === "object" && Array.isArray(rec.saved) && Array.isArray(rec.spots)) {
        setData({ records: rec });
      } else {
        setData({ records: { saved: [], spots: [] } });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load locations";
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saved = data?.records.saved ?? [];
  const spots = data?.records.spots ?? [];

  const savedStats = useMemo(
    () => ({
      total: saved.length,
      byCategory: (["fishing", "harbor", "home", "waypoint"] as const).reduce(
        (acc, c) => ({ ...acc, [c]: saved.filter((s) => s.category === c).length }),
        {} as Record<string, number>
      ),
    }),
    [saved]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fishing Locations</h1>
          <p className="text-sm text-muted-foreground">
            All users&apos; saved locations + the curated public fishing-spot catalog.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </header>

      {error ? (
        <div className="mt-4">
          <ErrorState message={error} onRetry={() => void load()} />
        </div>
      ) : loading && !data ? (
        <div className="mt-6">
          <LoadingState label="Loading locations…" />
        </div>
      ) : data ? (
        <Tabs defaultValue="saved" className="mt-4">
          <TabsList className="w-full max-w-md">
            <TabsTrigger value="saved">
              Saved Locations
              <Badge variant="outline" className="ml-2 text-[10px]">
                {savedStats.total}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="spots">
              Fishing Spots
              <Badge variant="outline" className="ml-2 text-[10px]">
                {spots.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* Saved Locations tab */}
          <TabsContent value="saved" className="mt-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="size-4 text-primary" />
                  All Users&apos; Saved Locations
                </CardTitle>
                <CardDescription>
                  Read-only view. Use the Location &amp; Navigation module to
                  add or remove entries per user.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {saved.length === 0 ? (
                  <EmptyState
                    title="No saved locations yet"
                    description="Saved locations appear once users save a point."
                    icon={MapPin}
                  />
                ) : (
                  <div className="scroll-ocean max-h-[32rem] overflow-y-auto overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[11px] uppercase">Name</TableHead>
                          <TableHead className="text-[11px] uppercase">Coords</TableHead>
                          <TableHead className="text-[11px] uppercase">Category</TableHead>
                          <TableHead className="text-[11px] uppercase">User</TableHead>
                          <TableHead className="text-[11px] uppercase">Notes</TableHead>
                          <TableHead className="text-[11px] uppercase">Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {saved.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                              {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  CATEGORY_CHIP[s.category] ?? ""
                                )}
                              >
                                {s.category}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {s.user ? (
                                <div className="flex items-center gap-1.5">
                                  <User className="size-3 shrink-0 text-muted-foreground" />
                                  <div className="min-w-0">
                                    <p className="truncate text-xs">{s.user.name}</p>
                                    <p className="truncate text-[10px] text-muted-foreground">
                                      {s.user.email}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] text-xs text-muted-foreground">
                              {s.notes ? (
                                <span className="truncate">{s.notes}</span>
                              ) : (
                                <Unavailable />
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {fmtTime(s.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fishing Spots tab */}
          <TabsContent value="spots" className="mt-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Anchor className="size-4 text-primary" />
                  Curated Fishing Spots
                </CardTitle>
                <CardDescription>
                  Public catalog of well-known ports and harbors. Read-only.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {spots.length === 0 ? (
                  <EmptyState
                    title="No fishing spots"
                    description="Run the seed script to populate the curated catalog."
                    icon={Anchor}
                  />
                ) : (
                  <div className="scroll-ocean max-h-[32rem] overflow-y-auto overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[11px] uppercase">Name</TableHead>
                          <TableHead className="text-[11px] uppercase">Region</TableHead>
                          <TableHead className="text-[11px] uppercase">Coords</TableHead>
                          <TableHead className="text-[11px] uppercase">Depth</TableHead>
                          <TableHead className="text-[11px] uppercase">Bottom</TableHead>
                          <TableHead className="text-[11px] uppercase">Species</TableHead>
                          <TableHead className="text-[11px] uppercase">Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {spots.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {s.region ?? "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                              {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {s.depthM != null ? `${s.depthM} m` : <Unavailable />}
                            </TableCell>
                            <TableCell>
                              {s.bottomType ? (
                                <Badge variant="outline" className="text-[10px]">
                                  {s.bottomType}
                                </Badge>
                              ) : (
                                <Unavailable />
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] text-xs text-muted-foreground">
                              {s.species ? (
                                <span className="truncate">{s.species}</span>
                              ) : (
                                <Unavailable />
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {s.source}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}

export default AdminLocationsView;
