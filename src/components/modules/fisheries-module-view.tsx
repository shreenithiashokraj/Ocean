"use client";

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import {
  Fish,
  Scale,
  Calendar,
  MapPin,
  TrendingUp,
  Upload,
  Plus,
  LifeBuoy,
  Waves,
  Search,
  Download,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/common/stat-card";
import { LoadingState } from "@/components/common/states";
import { useAppStore } from "@/lib/store";
import { api } from "@/lib/api";
import type { CatchRecord } from "@/lib/types";

export function FisheriesModuleView() {
  const [catches, setCatches] = useState<CatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "log" | "upload" | "safety">("overview");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [csvText, setCsvText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states for quick logging
  const [species, setSpecies] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [submitting, setSubmitting] = useState(false);

  const setView = useAppStore((s) => s.setView);
  const user = useAppStore((s) => s.user);

  const loadCatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listCatches();
      setCatches((res.catches as CatchRecord[]) || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatches();
  }, [loadCatches]);

  async function handleQuickLog(e: React.FormEvent) {
    e.preventDefault();
    if (!species.trim() || !quantity || !location.trim()) {
      toast.error("Please fill species, quantity, and location");
      return;
    }
    setSubmitting(true);
    try {
      const parsedQty = parseFloat(quantity);
      await api.createCatch({
        species: species.trim(),
        quantity: parsedQty,
        unit,
        location: location.trim(),
        date,
        catchType: "CATCH",
      });
      toast.success("Catch record successfully logged to persistent database!");
      setSpecies("");
      setQuantity("");
      setLocation("");
      void loadCatches();
      setActiveTab("overview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record catch");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCsvUpload() {
    if (!csvText.trim()) {
      toast.error("Please provide CSV content");
      return;
    }
    setIsUploading(true);
    try {
      const res = await fetch("/api/catches/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText, filename: "fisheries_catch_import.csv" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");

      toast.success(json.message);
      setCsvText("");
      setUploadModalOpen(false);
      void loadCatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload error");
    } finally {
      setIsUploading(false);
    }
  }

  // Filtered catch records
  const filteredCatches = useMemo(() => {
    return catches.filter((c) => {
      const q = search.toLowerCase();
      return (
        !search ||
        c.species.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q) ||
        (c.notes && c.notes.toLowerCase().includes(q))
      );
    });
  }, [catches, search]);

  // Aggregate statistics
  const stats = useMemo(() => {
    const totalWeightKg = catches
      .filter((c) => c.unit === "kg")
      .reduce((sum, c) => sum + c.quantity, 0);

    const speciesMap: Record<string, number> = {};
    for (const c of catches) {
      speciesMap[c.species] = (speciesMap[c.species] || 0) + (c.unit === "kg" ? c.quantity : 10);
    }

    const speciesChartData = Object.entries(speciesMap)
      .map(([name, weight]) => ({ name: name.split("(")[0].trim(), weight: Math.round(weight) }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6);

    const distinctSpecies = Object.keys(speciesMap).length;
    const bycatchCount = catches.filter((c) => c.catchType === "BYCATCH").length;

    return {
      totalRecords: catches.length,
      totalWeightKg: Math.round(totalWeightKg),
      distinctSpecies,
      bycatchCount,
      speciesChartData,
    };
  }, [catches]);

  function exportCatchesCsv() {
    if (!catches.length) return;
    const headers = ["Date", "Species", "Quantity", "Unit", "Location", "Catch Type", "Average Size (cm)", "Notes"];
    const rows = filteredCatches.map((c) => [
      c.date.split("T")[0],
      `"${c.species.replace(/"/g, '""')}"`,
      c.quantity,
      c.unit,
      `"${c.location.replace(/"/g, '""')}"`,
      c.catchType,
      c.averageSize ?? "",
      `"${(c.notes || "").replace(/"/g, '""')}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.href = encodedUri;
    link.download = `fisheries_catch_records_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Catch records exported to CSV");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-300 font-medium">
              Module 2: Fisheries Intelligence
            </Badge>
            <span className="text-xs text-muted-foreground">· Catch Yield & Commercial Harbours</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
            Fisheries Data, Catch Logging & Commercial Insights
          </h1>
          <p className="text-sm text-muted-foreground">
            Daily catch logging, commercial species analytics, persistent catch history, and marine safety integration.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setUploadModalOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Upload className="size-3.5" />
            Upload Dataset
          </Button>
          <Button
            size="sm"
            onClick={() => setActiveTab("log")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs"
          >
            <Plus className="size-3.5" />
            Log New Catch
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setView("fisherman.sos-emergency")}
            className="gap-1.5 text-xs"
          >
            <LifeBuoy className="size-3.5" />
            SOS Distress
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
            activeTab === "overview"
              ? "bg-emerald-500/15 text-emerald-700 border border-emerald-300"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Analytics & Catch Archive
        </button>
        <button
          onClick={() => setActiveTab("log")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
            activeTab === "log"
              ? "bg-emerald-500/15 text-emerald-700 border border-emerald-300"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Daily Catch Logger
        </button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Scale}
          label="Total Landed Volume"
          value={`${stats.totalWeightKg} kg`}
          hint="Across logged trips"
          color="emerald"
        />
        <StatCard
          icon={Fish}
          label="Commercial Taxa"
          value={stats.distinctSpecies}
          hint="Distinct fish species"
          color="cyan"
        />
        <StatCard
          icon={Calendar}
          label="Catch Log Entries"
          value={stats.totalRecords}
          hint="Persisted in SQLite database"
          color="blue"
        />
        <StatCard
          icon={AlertTriangle}
          label="Bycatch Reports"
          value={stats.bycatchCount}
          hint="Incidental captures"
          color="amber"
        />
      </div>

      {activeTab === "log" ? (
        /* Daily Catch Logger Form */
        <Card className="max-w-2xl mx-auto shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Plus className="size-4 text-emerald-600" />
              Log Daily Catch Entry
            </CardTitle>
            <CardDescription className="text-xs">
              Saves records directly to the persistent database. Real-time data validation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleQuickLog} className="space-y-4 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Date of Catch</label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Species Name</label>
                  <Input
                    placeholder="e.g. Yellowfin Tuna, Indian Mackerel"
                    value={species}
                    onChange={(e) => setSpecies(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Catch Quantity</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 150"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                      className="text-xs flex-1"
                    />
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="kg">kg</option>
                      <option value="count">count</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Fishing Ground / Harbour</label>
                  <Input
                    placeholder="e.g. Chennai Offshore (13.08°N, 80.27°E)"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab("overview")}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {submitting ? "Saving to Database…" : "Submit Catch Record"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Species Breakdown Chart */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="size-4 text-emerald-600" />
                Fisheries Landings by Species (kg)
              </CardTitle>
              <CardDescription className="text-xs">
                Catch volume distribution across dominant commercial marine species
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.speciesChartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit=" kg" />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="weight" name="Landed Weight (kg)" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Historical Catch Records Table */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Fish className="size-4 text-emerald-600" />
                    Persistent Catch Log Records ({filteredCatches.length})
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Verified catch logbook stored in SQLite database
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-48 sm:w-60">
                    <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filter species or location..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>

                  <Button size="sm" variant="outline" onClick={exportCatchesCsv} className="h-8 text-xs gap-1.5">
                    <Download className="size-3.5" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 text-xs">
                      <TableHead>Date</TableHead>
                      <TableHead>Species</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Ground / Location</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Avg Size</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCatches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-xs">
                          No catch records found. Log your first catch above.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCatches.map((c) => (
                        <TableRow key={c.id} className="text-xs hover:bg-muted/30">
                          <TableCell className="font-medium text-foreground">
                            {new Date(c.date).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {c.species}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {c.quantity} {c.unit}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{c.location}</TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`text-[10px] ${
                                c.catchType === "BYCATCH"
                                  ? "bg-amber-500/10 text-amber-700 border-amber-300"
                                  : "bg-emerald-500/10 text-emerald-700"
                              }`}
                            >
                              {c.catchType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {c.averageSize ? `${c.averageSize} cm` : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-[11px] truncate max-w-48">
                            {c.notes || "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Fisheries CSV Dataset Upload Modal */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-5 text-emerald-600" />
              Upload Fisheries Dataset (CSV)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Batch import historical or commercial catch datasets into the platform.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                Paste CSV Data (with header)
              </label>
              <textarea
                placeholder="species,quantity,unit,date,location&#10;Yellowfin Tuna,120,kg,2026-09-20,Chennai Offshore&#10;Indian Mackerel,250,kg,2026-09-21,Coromandel Coast"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={6}
                className="w-full font-mono text-xs rounded-md border border-input p-2.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground">Required Columns:</div>
              <div>• <strong>species</strong>: Species common or scientific name</div>
              <div>• <strong>quantity</strong>: Landed weight or count</div>
              <div>• <strong>unit</strong>: &apos;kg&apos; or &apos;count&apos;</div>
              <div>• <strong>date</strong>: YYYY-MM-DD</div>
              <div>• <strong>location</strong>: Coastal harbour or coordinates</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setUploadModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCsvUpload}
                disabled={isUploading || !csvText.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isUploading ? "Importing…" : "Validate & Import"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
