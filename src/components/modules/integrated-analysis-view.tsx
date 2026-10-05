"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  Info,
  Download,
  Share2,
  Table as TableIcon,
  CheckCircle2,
  HelpCircle,
  Activity,
  Layers,
} from "lucide-react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatCard } from "@/components/common/stat-card";
import { LoadingState, ErrorState } from "@/components/common/states";

interface CorrelationData {
  varX: string;
  varY: string;
  varXLabel: string;
  varYLabel: string;
  unitX: string;
  unitY: string;
  sampleSize: number;
  r: number;
  rSquared: number;
  tStatistic: number;
  pValue: number;
  significance: string;
  interpretation: string;
  linearRegression: {
    slope: number;
    intercept: number;
    equation: string;
  };
  points: {
    x: number;
    y: number;
    label: string;
    date?: string;
    location?: string;
  }[];
  correlationMatrix: {
    variables: { id: string; label: string; unit: string }[];
    matrix: number[][];
  };
  disclaimer: string;
}

const VARIABLES_X = [
  { id: "sst", label: "Sea Surface Temperature (SST, °C)" },
  { id: "salinity", label: "Ocean Salinity (PSU)" },
  { id: "waveHeight", label: "Significant Wave Height (m)" },
  { id: "windSpeed", label: "Surface Wind Speed (km/h)" },
];

const VARIABLES_Y = [
  { id: "catchQuantity", label: "Fish Catch Volume (kg)" },
  { id: "speciesCount", label: "Species Richness (taxa)" },
  { id: "shannonH", label: "Shannon Diversity Index (H')" },
  { id: "ednaAbundance", label: "eDNA Read Abundance (reads)" },
];

export function IntegratedAnalysisView() {
  const [varX, setVarX] = useState("sst");
  const [varY, setVarY] = useState("catchQuantity");
  const [data, setData] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCorrelation = useCallback(async (x: string, y: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analysis/correlation?varX=${x}&varY=${y}`);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || `Server error (${res.status})`);
      }
      const json: CorrelationData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to compute correlation analysis");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCorrelation(varX, varY);
  }, [fetchCorrelation, varX, varY]);

  // Generate regression line endpoints for chart overlay
  const regressionLineData = data?.points.length
    ? (() => {
        const xVals = data.points.map((p) => p.x);
        const minX = Math.min(...xVals);
        const maxX = Math.max(...xVals);
        const { slope, intercept } = data.linearRegression;
        return [
          { x: minX, yRegression: Math.round((slope * minX + intercept) * 100) / 100 },
          { x: maxX, yRegression: Math.round((slope * maxX + intercept) * 100) / 100 },
        ];
      })()
    : [];

  function exportReport() {
    if (!data) return;
    const reportText = `AI-Driven Marine Data Intelligence Platform
Cross-Domain Statistical Correlation Report
Date: ${new Date().toISOString()}

=========================================
ANALYSIS CONFIGURATION
Independent Variable (X): ${data.varXLabel} (${data.unitX})
Dependent Variable (Y):   ${data.varYLabel} (${data.unitY})
Sample Size (N):          ${data.sampleSize} matched observations

STATISTICAL METRICS
Pearson r:                ${data.r}
Coefficient of Det. (R²): ${(data.rSquared * 100).toFixed(1)}%
t-Statistic:              ${data.tStatistic}
p-Value (two-tailed):     ${data.pValue}
Significance:             ${data.significance}
Linear Regression:        ${data.linearRegression.equation}

SCIENTIFIC INTERPRETATION:
${data.interpretation}

IMPORTANT SCIENTIFIC DISCLAIMER:
${data.disclaimer}
`;

    const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `correlation_report_${data.varX}_vs_${data.varY}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Analysis report downloaded");
  }

  function getMatrixColor(val: number) {
    if (val === 1.0) return "bg-sky-100 dark:bg-sky-950 font-bold text-sky-800 dark:text-sky-300";
    if (val >= 0.7) return "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold";
    if (val >= 0.3) return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400";
    if (val <= -0.7) return "bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-semibold";
    if (val <= -0.3) return "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400";
    return "text-muted-foreground";
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-indigo-500/10 text-indigo-700 border-indigo-300 font-medium">
              Module 4: AI & Statistical Integration
            </Badge>
            <span className="text-xs text-muted-foreground">· Cross-Domain Pearson Correlation Engine</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
            Integrated Oceanographic, Fisheries & Biodiversity Analysis
          </h1>
          <p className="text-sm text-muted-foreground">
            Bivariate statistical correlation connecting physical oceanography (SST, Salinity, Waves) with catch yield and eDNA richness.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportReport} disabled={!data} className="gap-1.5 text-xs">
            <Download className="size-3.5" />
            Export Report
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchCorrelation(varX, varY)}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Recalculate
          </Button>
        </div>
      </div>

      {/* Mandatory Scientific Disclaimer Banner */}
      <div className="rounded-xl border border-amber-300 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-1 text-xs sm:text-sm">
            <div className="font-bold">CRITICAL SCIENTIFIC PRINCIPLE: Correlation Does Not Establish Causation</div>
            <p className="text-xs leading-relaxed opacity-90">
              {data?.disclaimer ||
                "Statistical correlation between oceanographic parameters and biological observations reflects co-occurring ecological patterns, seasonal fishing pressure, and regional hydrodynamics. It must not be interpreted as direct biological cause without controlled experimental corroboration."}
            </p>
          </div>
        </div>
      </div>

      {/* Variable Selector Controls */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Layers className="size-4 text-indigo-600" />
            Select Bivariate Analysis Dimensions
          </CardTitle>
          <CardDescription className="text-xs">
            Choose an environmental driver (X) and an ecological response indicator (Y)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Independent Variable (X) — Physical Environmental Parameter
              </label>
              <select
                value={varX}
                onChange={(e) => setVarX(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-medium"
              >
                {VARIABLES_X.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Dependent Variable (Y) — Biological / Fisheries Indicator
              </label>
              <select
                value={varY}
                onChange={(e) => setVarY(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-medium"
              >
                {VARIABLES_Y.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Statistical Outputs (4 KPI cards) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Pearson r"
          value={data?.r != null ? data.r.toFixed(3) : "—"}
          hint={data?.significance || "Calculated from sample data"}
          color={Math.abs(data?.r ?? 0) >= 0.5 ? "emerald" : "blue"}
        />
        <StatCard
          icon={Sparkles}
          label="Coefficient (R²)"
          value={data?.rSquared != null ? `${(data.rSquared * 100).toFixed(1)}%` : "—"}
          hint="Explained variance in Y"
          color="purple"
        />
        <StatCard
          icon={Activity}
          label="t-Statistic"
          value={data?.tStatistic != null ? data.tStatistic.toFixed(2) : "—"}
          hint={`p-value: ${data?.pValue ?? "N/A"}`}
          color="indigo"
        />
        <StatCard
          icon={CheckCircle2}
          label="Paired Sample Size"
          value={data?.sampleSize ?? 0}
          hint="Spatially matched observations"
          color="cyan"
        />
      </div>

      {/* Main Scatter Plot with Linear Regression */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="size-4 text-indigo-600" />
                  Scatter Plot & Regression Trendline
                </CardTitle>
                <CardDescription className="text-xs">
                  {data?.varXLabel} vs {data?.varYLabel} ({data?.linearRegression.equation})
                </CardDescription>
              </div>
              <Badge variant="outline" className="font-mono text-xs w-fit">
                {data?.linearRegression.equation}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={data?.points || []}
                  margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="x"
                    name={data?.varXLabel}
                    unit={` ${data?.unitX}`}
                    type="number"
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    dataKey="y"
                    name={data?.varYLabel}
                    unit={` ${data?.unitY}`}
                    type="number"
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    formatter={(val: any, name: any) => [
                      `${val} ${name === "x" ? data?.unitX : data?.unitY}`,
                      name === "x" ? data?.varXLabel : data?.varYLabel,
                    ]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.label || "Observation"}
                  />
                  <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: 12 }} />
                  <Scatter
                    name={`${data?.varXLabel} vs ${data?.varYLabel}`}
                    data={data?.points || []}
                    fill="#6366f1"
                  />
                  {/* Regression line representation */}
                  <Line
                    data={regressionLineData}
                    type="monotone"
                    dataKey="yRegression"
                    stroke="#0284c7"
                    strokeWidth={2}
                    dot={false}
                    name="Linear Fit Line"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Statistical Summary & Interpretation Card */}
        <Card className="shadow-sm flex flex-col">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Info className="size-4 text-sky-600" />
              Automated Statistical Interpretation
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4 text-xs flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="rounded-lg bg-sky-500/10 p-3 border border-sky-200">
                <div className="font-semibold text-sky-900 dark:text-sky-200 mb-1">
                  Analysis Conclusion:
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  {data?.interpretation || "Calculating bivariate metrics..."}
                </p>
              </div>

              <div className="space-y-1.5 text-muted-foreground">
                <div className="flex justify-between py-1 border-b">
                  <span>Linear Slope (m):</span>
                  <span className="font-mono text-foreground font-semibold">
                    {data?.linearRegression.slope}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span>Y-Intercept (c):</span>
                  <span className="font-mono text-foreground font-semibold">
                    {data?.linearRegression.intercept}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span>Significance Assessment:</span>
                  <span className="font-semibold text-foreground">
                    {data?.significance}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span>Degrees of Freedom (df):</span>
                  <span className="font-mono text-foreground">
                    {data ? data.sampleSize - 2 : "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-muted-foreground italic">
              Computed server-side using standard Pearson product-moment algorithm (no fabricated parameters).
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cross-Correlation Matrix Grid (Heatmap) */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TableIcon className="size-4 text-indigo-600" />
            Cross-Correlation Matrix (All Parameters)
          </CardTitle>
          <CardDescription className="text-xs">
            Pairwise Pearson coefficients across environmental, fisheries catch, and biodiversity variables
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-center text-xs border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="p-2.5 text-left font-semibold">Parameter</th>
                {data?.correlationMatrix.variables.map((v) => (
                  <th key={v.id} className="p-2.5 font-semibold">
                    {v.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.correlationMatrix.variables.map((rowVar, i) => (
                <tr key={rowVar.id} className="hover:bg-muted/30">
                  <td className="p-2.5 text-left font-semibold bg-muted/20 text-foreground">
                    {rowVar.label} ({rowVar.unit})
                  </td>
                  {data?.correlationMatrix.matrix[i]?.map((val, j) => (
                    <td
                      key={`${i}-${j}`}
                      className={`p-2.5 font-mono text-[11px] transition ${getMatrixColor(val)}`}
                    >
                      {val.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
