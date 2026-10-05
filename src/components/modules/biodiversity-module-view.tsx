"use client";

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Dna,
  Upload,
  Search,
  Filter,
  RefreshCw,
  MapPin,
  FileText,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Download,
  Info,
  Layers,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
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
import { LoadingState, ErrorState } from "@/components/common/states";

const LeafletMap = dynamic(
  () => import("@/components/location/leaflet-map").then((m) => m.LeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 w-full items-center justify-center rounded-xl bg-muted/40 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 size-4 animate-spin" />
        Loading Biodiversity GIS Map…
      </div>
    ),
  }
);

const SAMPLE_CSV = `species,latitude,longitude,collectionDate,abundance,targetGene,sampleId,depthM
Thunnus albacares,13.0827,80.2707,2026-09-14,4520,12S,ASV-12S-00891,25
Rastrelliger kanagurta,13.1200,80.3100,2026-09-17,8940,12S,ASV-12S-00892,15
Scomberomorus commerson,9.9655,76.2424,2026-09-21,3120,COI,ASV-COI-01204,35
Penaeus monodon,17.6868,83.2185,2026-09-24,6850,COI,ASV-COI-01205,20
Sardinella longiceps,12.8703,74.8341,2026-09-27,14200,16S,ASV-16S-00431,18
Lates calcarifer,18.9388,72.8354,2026-09-30,5100,12S,ASV-12S-00903,12
Katsuwonus pelamis,13.1500,80.4500,2026-10-01,7300,12S,ASV-12S-00911,65`;

const GENE_COLORS = ["#0284c7", "#059669", "#8b5cf6", "#f59e0b", "#ec4899"];

interface SpeciesRecord {
  id: string;
  scientificName: string;
  taxonRank: string;
  latitude: number | null;
  longitude: number | null;
  occurredAt: string | null;
  count: number;
  originTable: string;
  sourceType: "uploaded" | "curated";
}

interface AsvRecord {
  id: string;
  asvId: string;
  scientificName: string | null;
  taxonRank: string | null;
  confidence: number | null;
  targetGene: string | null;
  latitude: number | null;
  longitude: number | null;
  eventDate: string | null;
  source: string | null;
}

export function BiodiversityModuleView() {
  const [asvs, setAsvs] = useState<AsvRecord[]>([]);
  const [species, setSpecies] = useState<SpeciesRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [geneFilter, setGeneFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<AsvRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [asvRes, specRes] = await Promise.all([
        fetch("/api/marine/edna/asvs?pageSize=100"),
        fetch("/api/marine/biodiversity/species?pageSize=100"),
      ]);

      if (!asvRes.ok) throw new Error("Failed to load eDNA ASV records");
      const asvJson = await asvRes.json();
      setAsvs(asvJson.asvs ?? []);

      if (specRes.ok) {
        const specJson = await specRes.json();
        const mapped = (specJson.species ?? []).map((s: any) => ({
          id: s.id,
          scientificName: s.scientificName || "Undetermined",
          taxonRank: s.taxonRank || "species",
          latitude: s.latitude,
          longitude: s.longitude,
          occurredAt: s.occurredAt,
          count: s.count ?? 1,
          originTable: s.originTable,
          sourceType: s.originTable === "uploaded-csv" ? "uploaded" : "curated",
        }));
        setSpecies(mapped);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load biodiversity records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle CSV file selection
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name.replace(/\.[^/.]+$/, ""));

      const res = await fetch("/api/marine/biodiversity/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");

      toast.success(json.message);
      void loadData();
      setUploadModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "CSV Upload error");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Handle manual paste upload
  const handlePasteUpload = async () => {
    if (!uploadText.trim()) {
      toast.error("Please paste CSV data");
      return;
    }
    setIsUploading(true);
    try {
      const res = await fetch("/api/marine/biodiversity/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText: uploadText,
          filename: "manual_upload.csv",
          name: "eDNA Batch Ingest",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");

      toast.success(json.message);
      setUploadText("");
      setUploadModalOpen(false);
      void loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload error");
    } finally {
      setIsUploading(false);
    }
  };

  // Filtered records
  const filteredAsvs = useMemo(() => {
    return asvs.filter((a) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        (a.scientificName?.toLowerCase().includes(q) ?? false) ||
        (a.asvId?.toLowerCase().includes(q) ?? false) ||
        (a.source?.toLowerCase().includes(q) ?? false);

      const matchGene = geneFilter === "all" || a.targetGene?.toUpperCase() === geneFilter.toUpperCase();

      const isUploaded = a.source?.startsWith("Uploaded:");
      const matchSource =
        sourceFilter === "all" ||
        (sourceFilter === "uploaded" && isUploaded) ||
        (sourceFilter === "curated" && !isUploaded);

      return matchSearch && matchGene && matchSource;
    });
  }, [asvs, search, geneFilter, sourceFilter]);

  // Aggregate stats & Shannon diversity
  const stats = useMemo(() => {
    const totalAsvs = asvs.length;
    const speciesSet = new Set(asvs.map((a) => a.scientificName).filter(Boolean));
    const totalSpecies = speciesSet.size;

    // Gene distribution
    const genes: Record<string, number> = {};
    for (const a of asvs) {
      const g = a.targetGene || "Other";
      genes[g] = (genes[g] || 0) + 1;
    }
    const geneChartData = Object.entries(genes).map(([name, count]) => ({ name, count }));

    // Species frequency for top species chart
    const speciesFreq: Record<string, number> = {};
    for (const a of asvs) {
      if (a.scientificName) {
        speciesFreq[a.scientificName] = (speciesFreq[a.scientificName] || 0) + 1;
      }
    }
    const topSpeciesChartData = Object.entries(speciesFreq)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);

    // Shannon Diversity Index H' = - sum(pi * ln(pi))
    let shannonH = 0;
    if (totalAsvs > 0) {
      for (const count of Object.values(speciesFreq)) {
        const p = count / totalAsvs;
        if (p > 0) shannonH -= p * Math.log(p);
      }
    }

    return {
      totalAsvs,
      totalSpecies,
      shannonH: Math.round(shannonH * 100) / 100,
      geneChartData,
      topSpeciesChartData,
      uploadedCount: asvs.filter((a) => a.source?.startsWith("Uploaded:")).length,
      curatedCount: asvs.filter((a) => !a.source?.startsWith("Uploaded:")).length,
    };
  }, [asvs]);

  // Map markers from eDNA coordinates
  const mapMarkers = useMemo(() => {
    return asvs
      .filter((a) => a.latitude !== null && a.longitude !== null)
      .map((a) => ({
        id: a.id,
        lat: a.latitude!,
        lng: a.longitude!,
        title: a.scientificName || a.asvId,
        notes: `Gene: ${a.targetGene ?? "Unknown"} · Source: ${a.source ?? "eDNA Biomonitoring"}`,
        category: "fishing" as const,
      }));
  }, [asvs]);

  function downloadTemplate() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "marine_edna_biodiversity_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("eDNA CSV Template downloaded");
  }

  function exportRecordsCsv() {
    if (!filteredAsvs.length) return;
    const headers = [
      "ASV ID",
      "Scientific Name",
      "Taxon Rank",
      "Target Gene",
      "Confidence",
      "Latitude",
      "Longitude",
      "Collection Date",
      "Provenance / Source",
      "Category",
    ];
    const rows = filteredAsvs.map((a) => [
      a.asvId,
      `"${(a.scientificName || "").replace(/"/g, '""')}"`,
      a.taxonRank || "",
      a.targetGene || "",
      a.confidence ?? "",
      a.latitude ?? "",
      a.longitude ?? "",
      a.eventDate ? a.eventDate.split("T")[0] : "",
      `"${(a.source || "").replace(/"/g, '""')}"`,
      a.source?.startsWith("Uploaded:") ? "Uploaded CSV" : "Curated Dataset",
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `biodiversity_records_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exported biodiversity records to CSV");
  }

  if (loading && asvs.length === 0) {
    return <LoadingState message="Loading molecular biodiversity & eDNA catalogue..." />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-purple-500/10 text-purple-700 border-purple-300 font-medium">
              Module 3: Molecular Biodiversity
            </Badge>
            <span className="text-xs text-muted-foreground">· eDNA Sequence & Taxon Intelligence</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
            Molecular Biodiversity & Environmental DNA (eDNA) Insights
          </h1>
          <p className="text-sm text-muted-foreground">
            Sequence-derived taxonomic detections (12S, 16S, COI markers), Darwin Core mappings, and Shannon diversity indexing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={downloadTemplate} className="gap-1.5 text-xs">
            <Download className="size-3.5" />
            CSV Template
          </Button>
          <Button
            size="sm"
            onClick={() => setUploadModalOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 text-xs"
          >
            <Upload className="size-3.5" />
            Upload eDNA Dataset
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Dna}
          label="Identified Species"
          value={stats.totalSpecies}
          hint="Distinct scientific taxa"
          color="purple"
        />
        <StatCard
          icon={Sparkles}
          label="Total ASVs / Detections"
          value={stats.totalAsvs}
          hint={`${stats.uploadedCount} uploaded · ${stats.curatedCount} curated`}
          color="cyan"
        />
        <StatCard
          icon={BarChart3}
          label="Shannon Diversity (H')"
          value={stats.shannonH}
          hint="H = -Σ pi ln(pi)"
          color="emerald"
        />
        <StatCard
          icon={MapPin}
          label="Georeferenced Sites"
          value={mapMarkers.length}
          hint="Sampling stations mapped"
          color="indigo"
        />
      </div>

      {/* Charts Section: Gene Breakdown & Species Abundance */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Species Abundance Bar Chart */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="size-4 text-purple-600" />
              Species Occurrence & Detection Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Frequency of positive amplicon sequence detections across sample stations
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.topSpeciesChartData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    formatter={(val: any) => [`${val} detections`, "Abundance"]}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Marker Gene Distribution Pie Chart */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Dna className="size-4 text-sky-600" />
              Amplicon Target Gene Distribution (12S, 16S, COI)
            </CardTitle>
            <CardDescription className="text-xs">
              Mitochondrial & ribosomal barcode primer targets utilized in molecular assays
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.geneChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="count"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {stats.geneChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={GENE_COLORS[index % GENE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leaflet GIS Map for eDNA Sample Locations */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <MapPin className="size-4 text-purple-600" />
                eDNA Sampling Stations & Occurrence Coordinates
              </CardTitle>
              <CardDescription className="text-xs">
                Georeferenced biological sampling locations mapped via Leaflet GIS
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground">
              {mapMarkers.length} stations plotted across coastal & deep-water sites
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-80 w-full">
            <LeafletMap center={[13.0827, 80.2707]} zoom={5} markers={mapMarkers} className="h-full w-full" />
          </div>
        </CardContent>
      </Card>

      {/* Filterable Species & ASV Records Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="size-4 text-purple-600" />
                Molecular Biodiversity Records ({filteredAsvs.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Searchable ASV/OTU entries with honest distinction between uploaded observations and curated reference data
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-44 sm:w-56">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search species, ASV ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <select
                value={geneFilter}
                onChange={(e) => setGeneFilter(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All Genes</option>
                <option value="12S">12S Marker</option>
                <option value="16S">16S Marker</option>
                <option value="COI">COI Barcode</option>
              </select>

              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All Sources</option>
                <option value="uploaded">Uploaded CSV Observations</option>
                <option value="curated">Curated Reference Biome</option>
              </select>

              <Button size="sm" variant="outline" onClick={exportRecordsCsv} className="h-8 text-xs gap-1.5">
                <Download className="size-3.5" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-xs">
                  <TableHead>ASV / Occurrence ID</TableHead>
                  <TableHead>Scientific Name</TableHead>
                  <TableHead>Taxon Rank</TableHead>
                  <TableHead>Target Gene</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Coordinates</TableHead>
                  <TableHead>Event Date</TableHead>
                  <TableHead>Provenance & Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAsvs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
                      No molecular biodiversity records match the selected filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAsvs.map((a) => {
                    const isUploaded = a.source?.startsWith("Uploaded:");
                    return (
                      <TableRow key={a.id} className="text-xs hover:bg-muted/30">
                        <TableCell className="font-mono text-purple-700 font-semibold">{a.asvId}</TableCell>
                        <TableCell className="font-semibold italic text-foreground">
                          {a.scientificName || "Undetermined taxon"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] uppercase font-mono">
                            {a.taxonRank || "species"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-[10px] font-bold ${
                              a.targetGene === "12S"
                                ? "bg-sky-100 text-sky-800 border-sky-300"
                                : a.targetGene === "COI"
                                ? "bg-purple-100 text-purple-800 border-purple-300"
                                : "bg-emerald-100 text-emerald-800 border-emerald-300"
                            }`}
                          >
                            {a.targetGene || "N/A"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono">
                          {a.confidence != null ? `${(a.confidence * 100).toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-[11px]">
                          {a.latitude != null && a.longitude != null
                            ? `${a.latitude.toFixed(2)}°, ${a.longitude.toFixed(2)}°`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[11px]">
                          {a.eventDate ? new Date(a.eventDate).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-foreground truncate max-w-44">{a.source}</span>
                            <Badge
                              variant="secondary"
                              className={`text-[9px] w-fit font-medium ${
                                isUploaded
                                  ? "bg-amber-500/10 text-amber-700 border border-amber-300"
                                  : "bg-blue-500/10 text-blue-700 border border-blue-200"
                              }`}
                            >
                              {isUploaded ? "Uploaded Observation" : "Curated Sample Data"}
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* CSV Dataset Upload Modal */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-5 text-purple-600" />
              Upload eDNA / Biodiversity CSV Dataset
            </DialogTitle>
            <DialogDescription className="text-xs">
              Ingest sequence occurrences with column validation. Uploaded data is marked as user-provided observations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* File Drag / Select */}
            <div className="rounded-lg border-2 border-dashed border-border p-6 text-center hover:bg-muted/20 transition">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
                id="edna-file-input"
              />
              <label htmlFor="edna-file-input" className="cursor-pointer flex flex-col items-center gap-2">
                <div className="p-3 bg-purple-500/10 text-purple-600 rounded-full">
                  <Upload className="size-6" />
                </div>
                <div className="font-semibold text-sm">Click to choose a CSV file</div>
                <div className="text-xs text-muted-foreground">Supported format: .csv with comma separator</div>
              </label>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or paste CSV content below</span>
              </div>
            </div>

            {/* Paste Box */}
            <div>
              <textarea
                placeholder="species,latitude,longitude,collectionDate,abundance,targetGene&#10;Thunnus albacares,13.08,80.27,2026-09-15,4500,12S"
                value={uploadText}
                onChange={(e) => setUploadText(e.target.value)}
                rows={5}
                className="w-full font-mono text-xs rounded-md border border-input p-2.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Info className="size-3.5 text-purple-600" />
                Required & Optional CSV Columns:
              </div>
              <div>• <strong>species</strong> (or <em>scientificName</em>): Binomial name (Required)</div>
              <div>• <strong>latitude</strong> & <strong>longitude</strong>: Decimal degrees (Required for GIS mapping)</div>
              <div>• <strong>collectionDate</strong> (or <em>date</em>): YYYY-MM-DD format</div>
              <div>• <strong>abundance</strong> (or <em>count</em>, <em>readsCount</em>): Numeric detection magnitude</div>
              <div>• <strong>targetGene</strong>: 12S, 16S, COI, etc.</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setUploadModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handlePasteUpload}
                disabled={isUploading || !uploadText.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isUploading ? "Validating & Ingesting…" : "Validate & Ingest CSV"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
