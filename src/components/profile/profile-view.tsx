"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Anchor,
  Globe,
  Languages,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  Thermometer,
  User as UserIcon,
  Wind,
} from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import type { Role } from "@/lib/store";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingState, ErrorState } from "@/components/common/states";
import { RoleBadge } from "@/components/role-badge";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────
interface Profile {
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  country: string | null;
  vesselName: string | null;
  licenseNumber: string | null;
  avatarUrl: string | null;
  preferredLocationName: string | null;
  preferredLat: number | null;
  preferredLng: number | null;
  language: string;
  temperatureUnit: string;
  windUnit: string;
  notifAlerts: boolean;
  notifSummary: boolean;
}

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "ta", label: "தமிழ் (Tamil)" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "bn", label: "বাংলা (Bengali)" },
];

const TEMP_OPTIONS = [
  { value: "celsius", label: "Celsius (°C)" },
  { value: "fahrenheit", label: "Fahrenheit (°F)" },
];

const WIND_OPTIONS = [
  { value: "kmh", label: "km/h" },
  { value: "ms", label: "m/s" },
  { value: "knots", label: "knots" },
];

// ── Component ───────────────────────────────────────────────────────────
export function ProfileView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"profile" | "preferences">("profile");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getProfile();
      setProfile(r.profile as unknown as Profile);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load profile";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <LoadingState label="Loading profile…" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <ErrorState
          title="Couldn’t load profile"
          message={error ?? "Unknown error"}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-up px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarFallback className="bg-primary/15 text-base font-semibold text-primary">
              {initialsOf(profile.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <UserIcon className="size-6 text-primary" aria-hidden />
              {profile.name || "Your profile"}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="size-3.5" aria-hidden />
              <span className="truncate">{profile.email}</span>
              <RoleBadge role={profile.role} />
            </div>
          </div>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "profile" | "preferences")}
        className="mt-6"
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="profile" aria-label="Profile details">
            <UserIcon className="size-4" aria-hidden /> Profile
          </TabsTrigger>
          <TabsTrigger value="preferences" aria-label="Preferences and settings">
            <SettingsIcon className="size-4" aria-hidden /> Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileTab profile={profile} onSaved={setProfile} />
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <PreferencesTab profile={profile} onSaved={setProfile} />
        </TabsContent>
      </Tabs>

      <SignOutSection />
    </div>
  );
}

// ── Profile tab ─────────────────────────────────────────────────────────
function ProfileTab({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: (p: Profile) => void;
}) {
  const [name, setName] = useState(profile.name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [country, setCountry] = useState(profile.country ?? "");
  const [vesselName, setVesselName] = useState(profile.vesselName ?? "");
  const [licenseNumber, setLicenseNumber] = useState(
    profile.licenseNumber ?? "",
  );
  const [prefLocName, setPrefLocName] = useState(
    profile.preferredLocationName ?? "",
  );
  const [prefLat, setPrefLat] = useState<string>(
    profile.preferredLat != null ? String(profile.preferredLat) : "",
  );
  const [prefLng, setPrefLng] = useState<string>(
    profile.preferredLng != null ? String(profile.preferredLng) : "",
  );
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Name must be at least 2 characters";
    const latN = prefLat === "" ? null : Number(prefLat);
    const lngN = prefLng === "" ? null : Number(prefLng);
    if (latN != null && (!Number.isFinite(latN) || latN < -90 || latN > 90))
      e.prefLat = "Latitude must be between -90 and 90";
    if (lngN != null && (!Number.isFinite(lngN) || lngN < -180 || lngN > 180))
      e.prefLng = "Longitude must be between -180 and 180";
    if ((latN == null) !== (lngN == null)) {
      e.prefLat = e.prefLat ?? "Both latitude and longitude are required";
      e.prefLng = e.prefLng ?? "Both latitude and longitude are required";
    }
    return e;
  }, [name, prefLat, prefLng]);

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Geolocation is not supported by this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPrefLat(pos.coords.latitude.toFixed(4));
        setPrefLng(pos.coords.longitude.toFixed(4));
        if (!prefLocName) setPrefLocName("Current location");
        setLocating(false);
        toast.success("Location updated from your device");
      },
      (err) => {
        setLocating(false);
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied"
            : err.code === err.TIMEOUT
              ? "Location request timed out"
              : "Could not get your location";
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function save() {
    setTouched({ name: true, prefLat: true, prefLng: true });
    if (Object.keys(errors).length > 0) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setSaving(true);
    try {
      const input: Record<string, unknown> = {
        name: name.trim(),
        phone: phone.trim(),
        country: country.trim(),
        vesselName: vesselName.trim(),
        licenseNumber: licenseNumber.trim(),
        preferredLocationName: prefLocName.trim(),
      };
      if (prefLat !== "") input.preferredLat = Number(prefLat);
      else input.preferredLat = null;
      if (prefLng !== "") input.preferredLng = Number(prefLng);
      else input.preferredLng = null;

      const r = await api.updateProfile(input);
      onSaved(r.profile as unknown as Profile);
      toast.success("Profile saved");
      setTouched({});
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to save profile";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Read-only identity ─────────────────────────────────── */}
      <Card className="glass-card">
        <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
            <div className="flex flex-col gap-1">
              <Label htmlFor="profile-email" className="text-xs text-muted-foreground">
                Email
              </Label>
              <div
                id="profile-email"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Mail className="size-4 text-muted-foreground" aria-hidden />
                <span className="truncate">{profile.email}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Email is managed by your account administrator.
              </p>
            </div>
            <Separator orientation="vertical" className="hidden h-12 sm:block" />
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Role</Label>
              <div className="flex items-center gap-2">
                <RoleBadge role={profile.role} />
                <span className="text-xs text-muted-foreground">
                  {roleDescription(profile.role)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Personal information ──────────────────────────────── */}
      <Card className="glass-card">
        <CardContent className="space-y-4 py-4">
          <div className="flex items-center gap-2">
            <UserIcon className="size-4 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold">Personal information</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="profile-name"
              label="Full name"
              value={name}
              onChange={(v) => setName(v)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              error={touched.name ? errors.name : undefined}
              required
              autoComplete="name"
              icon={<UserIcon className="size-4" aria-hidden />}
            />
            <Field
              id="profile-phone"
              label="Phone"
              value={phone}
              onChange={(v) => setPhone(v)}
              type="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              icon={<UserIcon className="size-4" aria-hidden />}
            />
            <Field
              id="profile-country"
              label="Country"
              value={country}
              onChange={(v) => setCountry(v)}
              autoComplete="country-name"
              placeholder="India"
              icon={<Globe className="size-4" aria-hidden />}
            />
            <Field
              id="profile-vessel"
              label="Vessel name"
              value={vesselName}
              onChange={(v) => setVesselName(v)}
              placeholder="e.g. Marina Star"
              icon={<Anchor className="size-4" aria-hidden />}
            />
            <Field
              id="profile-license"
              label="License number"
              value={licenseNumber}
              onChange={(v) => setLicenseNumber(v)}
              placeholder="Fishing license ID"
              icon={<ShieldCheck className="size-4" aria-hidden />}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Preferred location ─────────────────────────────────── */}
      <Card className="glass-card">
        <CardContent className="space-y-4 py-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="size-4 text-primary" aria-hidden />
                Preferred location
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Used as the default for sea-condition lookups and the alert
                engine when you don’t share a live position.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={useMyLocation}
              disabled={locating}
              aria-busy={locating}
            >
              {locating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <MapPin className="size-4" aria-hidden />
              )}
              Use my current location
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="profile-pref-loc-name"
              label="Location name"
              value={prefLocName}
              onChange={(v) => setPrefLocName(v)}
              placeholder="e.g. Chennai harbour"
              className="sm:col-span-2"
              icon={<MapPin className="size-4" aria-hidden />}
            />
            <Field
              id="profile-pref-lat"
              label="Latitude"
              value={prefLat}
              onChange={(v) => setPrefLat(v)}
              onBlur={() => setTouched((t) => ({ ...t, prefLat: true }))}
              error={touched.prefLat ? errors.prefLat : undefined}
              inputMode="decimal"
              placeholder="13.0827"
              icon={<MapPin className="size-4" aria-hidden />}
            />
            <Field
              id="profile-pref-lng"
              label="Longitude"
              value={prefLng}
              onChange={(v) => setPrefLng(v)}
              onBlur={() => setTouched((t) => ({ ...t, prefLng: true }))}
              error={touched.prefLng ? errors.prefLng : undefined}
              inputMode="decimal"
              placeholder="80.2707"
              icon={<MapPin className="size-4" aria-hidden />}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button onClick={save} disabled={saving} aria-busy={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          Save profile
        </Button>
      </div>
    </div>
  );
}

// ── Preferences tab ────────────────────────────────────────────────────
function PreferencesTab({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: (p: Profile) => void;
}) {
  const [language, setLanguage] = useState(profile.language ?? "en");
  const [temperatureUnit, setTemperatureUnit] = useState(
    profile.temperatureUnit ?? "celsius",
  );
  const [windUnit, setWindUnit] = useState(profile.windUnit ?? "kmh");
  const [notifAlerts, setNotifAlerts] = useState<boolean>(
    profile.notifAlerts ?? true,
  );
  const [notifSummary, setNotifSummary] = useState<boolean>(
    profile.notifSummary ?? false,
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const r = await api.updateProfile({
        language,
        temperatureUnit,
        windUnit,
        notifAlerts,
        notifSummary,
      });
      onSaved(r.profile as unknown as Profile);
      toast.success("Preferences saved");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to save preferences";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardContent className="space-y-5 py-4">
          <div className="flex items-center gap-2">
            <Languages className="size-4 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold">Language &amp; units</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SelectField
              id="pref-language"
              label="Language"
              value={language}
              onChange={setLanguage}
              options={LANGUAGE_OPTIONS}
            />
            <SelectField
              id="pref-temp-unit"
              label="Temperature"
              value={temperatureUnit}
              onChange={setTemperatureUnit}
              options={TEMP_OPTIONS}
            />
            <SelectField
              id="pref-wind-unit"
              label="Wind speed"
              value={windUnit}
              onChange={setWindUnit}
              options={WIND_OPTIONS}
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
            <Badge variant="secondary" className="gap-1">
              <Thermometer className="size-3" aria-hidden />
              {TEMP_OPTIONS.find((o) => o.value === temperatureUnit)?.label ?? temperatureUnit}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Wind className="size-3" aria-hidden />
              {WIND_OPTIONS.find((o) => o.value === windUnit)?.label ?? windUnit}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Globe className="size-3" aria-hidden />
              {LANGUAGE_OPTIONS.find((o) => o.value === language)?.label ?? language}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="space-y-5 py-4">
          <div className="flex items-center gap-2">
            <SettingsIcon className="size-4 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold">Notification preferences</h2>
          </div>

          <SwitchRow
            id="pref-notif-alerts"
            title="Alert notifications"
            description="Receive notifications when a marine alert is generated for your area."
            checked={notifAlerts}
            onChange={setNotifAlerts}
          />
          <Separator />
          <SwitchRow
            id="pref-notif-summary"
            title="Daily summary digest"
            description="Receive a once-daily summary of your recent activity and sea conditions."
            checked={notifSummary}
            onChange={setNotifSummary}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button onClick={save} disabled={saving} aria-busy={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          Save preferences
        </Button>
      </div>
    </div>
  );
}

// ── Sign out ───────────────────────────────────────────────────────────
function SignOutSection() {
  const logoutClient = useAppStore((s) => s.logoutClient);

  async function signOut() {
    try {
      await api.signOut();
    } catch {
      /* best-effort */
    }
    logoutClient();
    useAppStore.setState({ view: "landing" });
    toast.success("Signed out");
  }

  return (
    <div className="mt-8 flex flex-col items-start justify-between gap-3 rounded-xl border border-border/60 bg-card/30 p-4 sm:flex-row sm:items-center">
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-amber-400"
          aria-hidden
        />
        <div>
          <p className="text-sm font-medium">Sign out of your account</p>
          <p className="text-xs text-muted-foreground">
            You’ll need to sign back in to access your dashboard and modules.
          </p>
        </div>
      </div>
      <Button variant="outline" onClick={signOut} className="shrink-0">
        <LogOut className="size-4" aria-hidden />
        Sign out
      </Button>
    </div>
  );
}

// ── Small primitives ────────────────────────────────────────────────────
function Field({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  type = "text",
  inputMode,
  placeholder,
  required,
  autoComplete,
  icon,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  type?: string;
  inputMode?: "text" | "decimal" | "tel" | "email";
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon}
        {label}
        {required && <span className="text-rose-400">*</span>}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={error ? "border-rose-500/60" : ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1 text-xs text-rose-400">
          <AlertTriangle className="size-3" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SwitchRow({
  id,
  title,
  description,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {title}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-label={title}
      />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────
function initialsOf(name: string): string {
  if (!name) return "U";
  return name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function roleDescription(role: Role): string {
  if (role === "ADMIN") return "System administrator";
  if (role === "RESEARCHER") return "Research & analytics";
  return "Fisherman";
}

export default ProfileView;
