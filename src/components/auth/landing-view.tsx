"use client";

import { useState } from "react";
import {
  Waves,
  Fish,
  Dna,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Search,
  Database,
  CheckCircle2,
  Compass,
  Thermometer,
  Layers,
  Activity,
  Globe2,
  LineChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAppStore, defaultDashboardFor } from "@/lib/store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { BrandLockup } from "@/components/brand";

const DEMO_ACCOUNTS = [
  {
    role: "FISHERMAN",
    email: "fisher@fisherman.dev",
    password: "Fisher@123",
    label: "Fisherman Portal",
    desc: "Log daily catches, view real-time sea safety alerts, AI fish identification & SOS beacon.",
    color: "border-sky-300 hover:border-sky-500 bg-sky-500/5",
    badgeColor: "bg-sky-500/10 text-sky-700",
  },
  {
    role: "RESEARCHER",
    email: "researcher@fisherman.dev",
    password: "Research@123",
    label: "Researcher Portal",
    desc: "Unified Data Explorer, CSV dataset management, GIS mapping, and cross-domain correlation reports.",
    color: "border-purple-300 hover:border-purple-500 bg-purple-500/5",
    badgeColor: "bg-purple-500/10 text-purple-700",
  },
  {
    role: "ADMIN",
    email: "admin@fisherman.dev",
    password: "Admin@123",
    label: "Administrator Portal",
    desc: "User management, role assignment, platform activity monitoring, and alert threshold configuration.",
    color: "border-amber-300 hover:border-amber-500 bg-amber-500/5",
    badgeColor: "bg-amber-500/10 text-amber-700",
  },
] as const;

export function LandingView() {
  const setView = useAppStore((s) => s.setView);
  const setUser = useAppStore((s) => s.setUser);
  const [loading, setLoading] = useState<string | null>(null);

  async function quickDemo(email: string, password: string, key: string) {
    setLoading(key);
    try {
      const { user } = await api.signIn(email, password);
      setUser(user);
      useAppStore.setState({ view: defaultDashboardFor(user.role) });
      toast.success(`Welcome, ${user.name} (${user.role})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background text-foreground flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandLockup />
          <span className="hidden md:inline-block text-xs text-muted-foreground border-l pl-3 py-0.5">
            Academic Research Edition
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="sm" onClick={() => setView("sign-in")} className="text-xs">
            Sign In
          </Button>
          <Button size="sm" onClick={() => setView("sign-up")} className="text-xs">
            Create Account
          </Button>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 space-y-12">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <Badge variant="outline" className="bg-sky-500/10 text-sky-700 border-sky-300 px-3 py-1 text-xs font-semibold">
            Unified Marine Intelligence Platform
          </Badge>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            AI-Driven Unified Marine Data Intelligence Platform
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            Integrating physical oceanographic dynamics, sustainable fisheries analytics, and molecular eDNA biodiversity into a unified scientific intelligence architecture.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              size="lg"
              onClick={() => setView("module.oceanographic")}
              className="bg-sky-600 hover:bg-sky-700 text-white shadow-sm gap-2"
            >
              Explore Oceanographic Data
              <ArrowRight className="size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setView("module.analysis")}
              className="gap-2 border-slate-300 shadow-sm"
            >
              <Sparkles className="size-4 text-indigo-600" />
              AI Integrated Analysis
            </Button>
          </div>
        </div>

        {/* ── 3 PROMINENT FUNCTIONAL CARDS ─────────────────────────────────── */}
        <div>
          <div className="text-center mb-6">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Core Scientific Modules</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Select any domain module to explore live observations, datasets, interactive charts, and maps
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Card A: Oceanographic Data */}
            <Card className="flex flex-col justify-between border-2 border-sky-200/80 hover:border-sky-500 transition-all hover:shadow-md bg-white dark:bg-card">
              <CardHeader className="pb-3">
                <div className="size-12 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center mb-3">
                  <Waves className="size-6" />
                </div>
                <Badge variant="outline" className="w-fit text-[11px] font-semibold text-sky-700 bg-sky-50">
                  Module 1
                </Badge>
                <CardTitle className="text-xl font-bold mt-2">A. Oceanographic Data</CardTitle>
                <CardDescription className="text-xs leading-relaxed text-muted-foreground">
                  Real-time sea surface temperature (SST), practical salinity records, wave height, surface wind, and hydrodynamic currents.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <ul className="text-xs space-y-2 text-slate-600 dark:text-slate-300 border-t pt-3">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-sky-600 shrink-0" />
                    <span>Live Open-Meteo Marine & Meteorological API</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-sky-600 shrink-0" />
                    <span>24h Diurnal SST & Air Temperature profiles</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-sky-600 shrink-0" />
                    <span>GIS Buoy Network & coastal station mapping</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-sky-600 shrink-0" />
                    <span>Filterable historical telemetry & CSV export</span>
                  </li>
                </ul>

                <Button
                  onClick={() => setView("module.oceanographic")}
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white gap-2 text-xs"
                >
                  Launch Oceanographic Module <ArrowRight className="size-3.5" />
                </Button>
              </CardContent>
            </Card>

            {/* Card B: Fisheries Data */}
            <Card className="flex flex-col justify-between border-2 border-emerald-200/80 hover:border-emerald-500 transition-all hover:shadow-md bg-white dark:bg-card">
              <CardHeader className="pb-3">
                <div className="size-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-3">
                  <Fish className="size-6" />
                </div>
                <Badge variant="outline" className="w-fit text-[11px] font-semibold text-emerald-700 bg-emerald-50">
                  Module 2
                </Badge>
                <CardTitle className="text-xl font-bold mt-2">B. Fisheries Data</CardTitle>
                <CardDescription className="text-xs leading-relaxed text-muted-foreground">
                  Daily catch logging, commercial landings analytics, persistent catch history in SQLite, and emergency safety beacons.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <ul className="text-xs space-y-2 text-slate-600 dark:text-slate-300 border-t pt-3">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                    <span>Persistent Daily Catch Logging (species, kg, GPS)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                    <span>Commercial catch volume & species distribution</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                    <span>Fisheries CSV dataset batch uploader</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                    <span>Emergency SOS beacon with safe demo simulation</span>
                  </li>
                </ul>

                <Button
                  onClick={() => setView("module.fisheries")}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 text-xs"
                >
                  Launch Fisheries Module <ArrowRight className="size-3.5" />
                </Button>
              </CardContent>
            </Card>

            {/* Card C: Molecular Biodiversity Insights */}
            <Card className="flex flex-col justify-between border-2 border-purple-200/80 hover:border-purple-500 transition-all hover:shadow-md bg-white dark:bg-card">
              <CardHeader className="pb-3">
                <div className="size-12 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center mb-3">
                  <Dna className="size-6" />
                </div>
                <Badge variant="outline" className="w-fit text-[11px] font-semibold text-purple-700 bg-purple-50">
                  Module 3
                </Badge>
                <CardTitle className="text-xl font-bold mt-2">C. Molecular Biodiversity</CardTitle>
                <CardDescription className="text-xs leading-relaxed text-muted-foreground">
                  Environmental DNA (eDNA) occurrence tracking, barcode marker breakdown (12S, 16S, COI), and Shannon diversity calculation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <ul className="text-xs space-y-2 text-slate-600 dark:text-slate-300 border-t pt-3">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-purple-600 shrink-0" />
                    <span>CSV Dataset Upload with column schema validation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-purple-600 shrink-0" />
                    <span>Audit distinction: Uploaded vs Curated datasets</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-purple-600 shrink-0" />
                    <span>Shannon Diversity Index (H = -Σ pi ln pi)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-purple-600 shrink-0" />
                    <span>Spatial eDNA occurrence mapping on Leaflet GIS</span>
                  </li>
                </ul>

                <Button
                  onClick={() => setView("module.biodiversity")}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2 text-xs"
                >
                  Launch Biodiversity Module <ArrowRight className="size-3.5" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── MODULE 4: AI & INTEGRATED ANALYSIS SHOWCASE ──────────────────── */}
        <Card className="border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/60 via-purple-50/40 to-sky-50/60 dark:from-indigo-950/20 dark:to-sky-950/20 shadow-sm">
          <CardContent className="p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2">
                <Badge className="bg-indigo-600 text-white font-semibold text-[11px]">
                  Module 4: Cross-Domain AI
                </Badge>
                <span className="text-xs text-muted-foreground font-medium">Bivariate Pearson Correlation Engine</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                AI-Based Cross-Domain Statistical Data Analysis
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Connect physical oceanographic measurements (SST, Salinity, Waves) directly with biological response variables (Catch volume, Species richness, Shannon index, and eDNA read counts). Computes Pearson r, R², linear regression slope, and cross-correlation matrix with scientific causation disclaimers.
              </p>
            </div>

            <Button
              size="lg"
              onClick={() => setView("module.analysis")}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 shadow-md gap-2"
            >
              <Sparkles className="size-4" />
              Launch Correlation Engine
            </Button>
          </CardContent>
        </Card>

        {/* ── USER ROLES & ONE-CLICK DEMO ACCESS ───────────────────────────── */}
        <div className="border-t pt-8 space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Role-Based Authentication Portals</h2>
            <p className="text-xs text-muted-foreground">
              Experience the platform from each authenticated user role. Click below for instant one-click demo login.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {DEMO_ACCOUNTS.map((account) => (
              <div
                key={account.role}
                className={`flex flex-col justify-between rounded-xl border p-4 sm:p-5 transition hover:scale-[1.01] shadow-sm ${account.color}`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className={`text-[10px] font-bold uppercase ${account.badgeColor}`}>
                      {account.role}
                    </Badge>
                    <span className="text-[11px] font-mono text-muted-foreground">Demo Ready</span>
                  </div>
                  <div className="text-base font-bold text-foreground">{account.label}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{account.desc}</p>
                </div>

                <div className="pt-4 border-t mt-4 space-y-2">
                  <div className="text-[11px] font-mono text-muted-foreground truncate">
                    User: {account.email}
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    disabled={loading !== null}
                    onClick={() => quickDemo(account.email, account.password, account.role)}
                    className="w-full text-xs font-semibold"
                  >
                    {loading === account.role ? "Authenticating…" : `Sign in as ${account.role}`}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-background py-6 px-4 text-center text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <strong>AI-Driven Unified Marine Data Intelligence Platform</strong> · Academic Project Review Edition
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Oceanographic Module</span>
            <span>·</span>
            <span>Fisheries Module</span>
            <span>·</span>
            <span>Molecular Biodiversity Module</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
