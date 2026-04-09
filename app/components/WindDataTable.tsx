import {
  Wind,
  Clock,
  Loader2,
  Moon,
  Sun,
  RefreshCw,
  ArrowUp,
  AlertTriangle,
  Info,
  ShieldAlert,
  CloudLightning,
  Snowflake,
  Waves,
  Mountain,
  Eye,
  Wind as WindIcon,
} from "lucide-react";
import {
  useWindAloft,
  interpolateToAGL,
  NORMALIZED_ALTITUDES_AGL,
  WindAloftHour,
} from "../hooks/useWindAloft";
import { useWeatherAlerts, WeatherAlert } from "../hooks/useWeatherAlerts";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";


interface Location {
  name: string;
  airport: string;
  lat: number;
  lon: number;
}

interface WindDataTableProps {
  location: Location;
}

const WIND_TABLE_SETTINGS_STORAGE_KEY = "weather.griff.windDataSettings.v2";
const RAW_ALTITUDE_DEDUPE_TOLERANCE_FT = 5;
const MAX_DISPLAY_ALTITUDE_AGL_FT = 45000;

type AltitudeFormat = "AGL" | "MSL" | "Pressure";
type AltitudeNormalized = "normalized" | "raw";
type AltitudeUnit = "ft" | "m";
type SpeedUnit = "mph" | "kmh" | "knots" | "ms";
type DistanceUnit = "miles" | "km";
type TimeFormat = "12" | "24";

type WindTableSettings = {
  altitudeFormat: AltitudeFormat;
  altitudeNormalized: AltitudeNormalized;
  altitudeUnit: AltitudeUnit;
  speedUnit: SpeedUnit;
  distanceUnit: DistanceUnit;
  timeFormat: TimeFormat;
};

const DEFAULT_WIND_TABLE_SETTINGS: WindTableSettings = {
  altitudeFormat: "AGL",
  altitudeNormalized: "normalized",
  altitudeUnit: "ft",
  speedUnit: "mph",
  distanceUnit: "miles",
  timeFormat: "12",
};

function isAltitudeFormat(value: unknown): value is AltitudeFormat {
  return value === "AGL" || value === "MSL" || value === "Pressure";
}

function isAltitudeNormalized(value: unknown): value is AltitudeNormalized {
  return value === "normalized" || value === "raw";
}

function isAltitudeUnit(value: unknown): value is AltitudeUnit {
  return value === "ft" || value === "m";
}

function isSpeedUnit(value: unknown): value is SpeedUnit {
  return value === "mph" || value === "kmh" || value === "knots" || value === "ms";
}

function isDistanceUnit(value: unknown): value is DistanceUnit {
  return value === "miles" || value === "km";
}

function isTimeFormat(value: unknown): value is TimeFormat {
  return value === "12" || value === "24";
}

function readWindTableSettings(): WindTableSettings {
  if (typeof window === "undefined") return DEFAULT_WIND_TABLE_SETTINGS;
  const raw = window.localStorage.getItem(WIND_TABLE_SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_WIND_TABLE_SETTINGS;

  try {
    const parsed = JSON.parse(raw) as Partial<WindTableSettings>;
    return {
      altitudeFormat: isAltitudeFormat(parsed.altitudeFormat)
        ? parsed.altitudeFormat
        : DEFAULT_WIND_TABLE_SETTINGS.altitudeFormat,
      altitudeNormalized: isAltitudeNormalized(parsed.altitudeNormalized)
        ? parsed.altitudeNormalized
        : DEFAULT_WIND_TABLE_SETTINGS.altitudeNormalized,
      altitudeUnit: isAltitudeUnit(parsed.altitudeUnit)
        ? parsed.altitudeUnit
        : DEFAULT_WIND_TABLE_SETTINGS.altitudeUnit,
      speedUnit: isSpeedUnit(parsed.speedUnit)
        ? parsed.speedUnit
        : DEFAULT_WIND_TABLE_SETTINGS.speedUnit,
      distanceUnit: isDistanceUnit(parsed.distanceUnit)
        ? parsed.distanceUnit
        : DEFAULT_WIND_TABLE_SETTINGS.distanceUnit,
      timeFormat: isTimeFormat(parsed.timeFormat)
        ? parsed.timeFormat
        : DEFAULT_WIND_TABLE_SETTINGS.timeFormat,
    };
  } catch {
    return DEFAULT_WIND_TABLE_SETTINGS;
  }
}

// ─── Alert helpers ───────────────────────────────────────────────────────────

function hazardLabel(hazard: string): string {
  switch (hazard.toUpperCase()) {
    case "TS": return "Thunderstorm";
    case "TURB": return "Turbulence";
    case "ICE": return "Icing";
    case "IFR": return "IFR Conditions";
    case "MT_OBSCN": return "Mtn Obscuration";
    case "LLWS": return "Wind Shear";
    case "ASH": return "Volcanic Ash";
    case "FZLVL": return "Freezing Level";
    case "SFC_WND": return "Surface Winds";
    default: return hazard;
  }
}

function HazardIcon({ hazard, className }: { hazard: string; className?: string }) {
  const cls = className ?? "w-4 h-4";
  switch (hazard.toUpperCase()) {
    case "TS": return <CloudLightning className={cls} />;
    case "ICE": return <Snowflake className={cls} />;
    case "TURB": return <Waves className={cls} />;
    case "MT_OBSCN": return <Mountain className={cls} />;
    case "IFR": return <Eye className={cls} />;
    case "LLWS": return <WindIcon className={cls} />;
    default: return <ShieldAlert className={cls} />;
  }
}

function alertColors(alert: WeatherAlert): { badge: string; row: string; icon: string } {
  if (alert.type === "SIGMET") {
    return {
      badge: "bg-red-950 text-red-400 border border-red-800",
      row: "bg-red-950/30 border-l-2 border-l-red-600",
      icon: "text-red-400",
    };
  }
  // G-AIRMET
  const sev = alert.severity?.toUpperCase() ?? "";
  if (sev === "SEV" || sev === "EXTRM") {
    return {
      badge: "bg-orange-950 text-orange-400 border border-orange-800",
      row: "bg-orange-950/30 border-l-2 border-l-orange-500",
      icon: "text-orange-400",
    };
  }
  return {
    badge: "bg-amber-950 text-amber-400 border border-amber-800",
    row: "bg-amber-950/30 border-l-2 border-l-amber-500",
    icon: "text-amber-400",
  };
}

function formatAltRange(altLow?: number, altHi?: number): string {
  const lo = altLow == null ? "SFC" : `${(altLow / 1000).toFixed(0)}k`;
  const hi = altHi == null ? "UNL" : altHi >= 18000 ? `FL${(altHi / 100).toFixed(0)}` : `${(altHi / 1000).toFixed(0)}k`;
  return `${lo}–${hi}`;
}

function formatExpiry(validTo: Date): string {
  const now = Date.now();
  const diff = validTo.getTime() - now;
  if (diff <= 0) return "expired";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m left` : `${hrs}h left`;
}

// ─── Component ──────────────────────────────────────────────────────

export function WindDataTable({
  location,
}: WindDataTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { hours, elevation_m, loading, error, refetch } =
    useWindAloft(location.lat, location.lon);

  const { alerts, loading: alertsLoading } = useWeatherAlerts(location.lat, location.lon);

  const [altitudeFormat, setAltitudeFormat] = useState<AltitudeFormat>(
    DEFAULT_WIND_TABLE_SETTINGS.altitudeFormat,
  );
  const [altitudeNormalized, setAltitudeNormalized] = useState<AltitudeNormalized>(
    DEFAULT_WIND_TABLE_SETTINGS.altitudeNormalized,
  );
  const [altitudeUnit, setAltitudeUnit] = useState<AltitudeUnit>(
    DEFAULT_WIND_TABLE_SETTINGS.altitudeUnit,
  );
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>(
    DEFAULT_WIND_TABLE_SETTINGS.speedUnit,
  );
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(
    DEFAULT_WIND_TABLE_SETTINGS.distanceUnit,
  );
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(
    DEFAULT_WIND_TABLE_SETTINGS.timeFormat,
  );

  useEffect(() => {
    const loaded = readWindTableSettings();
    setAltitudeFormat(loaded.altitudeFormat);
    setAltitudeNormalized(loaded.altitudeNormalized);
    setAltitudeUnit(loaded.altitudeUnit);
    setSpeedUnit(loaded.speedUnit);
    setDistanceUnit(loaded.distanceUnit);
    setTimeFormat(loaded.timeFormat);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const settingsToSave: WindTableSettings = {
      altitudeFormat,
      altitudeNormalized,
      altitudeUnit,
      speedUnit,
      distanceUnit,
      timeFormat,
    };
    window.localStorage.setItem(
      WIND_TABLE_SETTINGS_STORAGE_KEY,
      JSON.stringify(settingsToSave),
    );
  }, [
    altitudeFormat,
    altitudeNormalized,
    altitudeUnit,
    speedUnit,
    distanceUnit,
    timeFormat,
  ]);

  const elevationFt = elevation_m * 3.28084;

  // ── Derive display rows from raw API data ─────────────────────────

  type DisplayRow = {
    label: string;
    windSpeed: number;    // mph (raw)
    windDirection: number; // degrees
    altitudeAGL_ft: number;
    altitudeMSL_ft: number;
    pressureLevel: number;
    isSurface?: boolean;
  };

  function buildRows(hour: WindAloftHour): DisplayRow[] {
    const rows: DisplayRow[] = [];
    const cappedPressureLevels = hour.levels.filter(
      (level) => level.altitudeAGL_ft <= MAX_DISPLAY_ALTITUDE_AGL_FT,
    );

    rows.push({
      label: "Surface",
      windSpeed: hour.surfaceWindSpeed_mph,
      windDirection: hour.surfaceWindDirection,
      altitudeAGL_ft: 0,
      altitudeMSL_ft: Math.round(elevationFt),
      pressureLevel: 0,
      isSurface: true,
    });

    if (
      altitudeNormalized === "normalized" &&
      altitudeFormat !== "Pressure"
    ) {
      for (const targetAGL of NORMALIZED_ALTITUDES_AGL) {
        const interp = interpolateToAGL(cappedPressureLevels, targetAGL);
        if (interp) {
          rows.push({
            label: String(targetAGL),
            windSpeed: interp.windSpeed_mph,
            windDirection: interp.windDirection,
            altitudeAGL_ft: targetAGL,
            altitudeMSL_ft: targetAGL + Math.round(elevationFt),
            pressureLevel: interp.pressureLevel,
          });
        }
      }
    } else {
      if (altitudeFormat !== "Pressure") {
        for (const lv of hour.nearSurfaceLevels) {
          rows.push({
            label: String(lv.altitudeAGL_ft),
            windSpeed: lv.windSpeed_mph,
            windDirection: lv.windDirection,
            altitudeAGL_ft: lv.altitudeAGL_ft,
            altitudeMSL_ft: lv.altitudeMSL_ft,
            pressureLevel: 0,
          });
        }
      }

      for (const lv of cappedPressureLevels) {
        rows.push({
          label:
            altitudeFormat === "Pressure"
              ? String(lv.pressureLevel)
              : String(lv.altitudeAGL_ft),
          windSpeed: lv.windSpeed_mph,
          windDirection: lv.windDirection,
          altitudeAGL_ft: lv.altitudeAGL_ft,
          altitudeMSL_ft: lv.altitudeMSL_ft,
          pressureLevel: lv.pressureLevel,
        });
      }

      rows.sort((a, b) => a.altitudeAGL_ft - b.altitudeAGL_ft);
    }

    if (rows.length <= 1) return rows;
    const [surface, ...upperRows] = rows;
    upperRows.sort((a, b) => a.altitudeAGL_ft - b.altitudeAGL_ft);
    if (altitudeNormalized === "raw" && altitudeFormat !== "Pressure") {
      const dedupedRows = upperRows.filter((row, index) => {
        if (index === 0) return true;
        const previous = upperRows[index - 1];
        return (
          Math.abs(row.altitudeAGL_ft - previous.altitudeAGL_ft) >
          RAW_ALTITUDE_DEDUPE_TOLERANCE_FT
        );
      });
      return [surface, ...dedupedRows];
    }
    return [surface, ...upperRows];
  }

  type ShearInfo = {
    hasDirectionShear: boolean;
    hasSpeedShear: boolean;
    directionDelta: number;
    speedDelta: number;
  };

  function detectWindShear(rows: DisplayRow[]): Map<number, ShearInfo> {
    const shearMap = new Map<number, ShearInfo>();
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      let dirDelta = Math.abs(curr.windDirection - prev.windDirection);
      if (dirDelta > 180) dirDelta = 360 - dirDelta;
      const speedDelta = Math.abs(curr.windSpeed - prev.windSpeed);
      const hasDirectionShear = dirDelta > 30;
      const hasSpeedShear = speedDelta > 10;
      if (hasDirectionShear || hasSpeedShear) {
        shearMap.set(i, { hasDirectionShear, hasSpeedShear, directionDelta: dirDelta, speedDelta });
      }
    }
    return shearMap;
  }

  // ── Display helpers ───────────────────────────────────────────────

  const getDisplayAltitude = (row: DisplayRow): string => {
    if (row.isSurface) return "Surface";
    if (altitudeFormat === "Pressure")
      return `${row.pressureLevel}`;
    const baseFt =
      altitudeFormat === "MSL"
        ? row.altitudeMSL_ft
        : row.altitudeAGL_ft;
    const converted =
      altitudeUnit === "m"
        ? Math.round(baseFt * 0.3048)
        : baseFt;
    return converted.toLocaleString();
  };

  const getAltitudeUnitLabel = (): string => {
    if (altitudeFormat === "Pressure") return "mb";
    return altitudeUnit;
  };

  const convertSpeed = (mph: number): number => {
    switch (speedUnit) {
      case "kmh":
        return Math.round(mph * 1.60934);
      case "knots":
        return Math.round(mph * 0.868976);
      case "ms":
        return Math.round(mph * 0.44704 * 10) / 10;
      default:
        return mph;
    }
  };

  const getSpeedUnitLabel = (): string => {
    switch (speedUnit) {
      case "kmh": return "km/h";
      case "knots": return "kt";
      case "ms": return "m/s";
      default: return "mph";
    }
  };

  const formatTime = (date: Date) => {
    const h = date.getHours();
    const m = date.getMinutes();
    if (timeFormat === "24")
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    const ampm = h >= 12 ? "p" : "a";
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, "0")}${ampm}`;
  };

  const getWindDirectionRotation = (deg: number) => {
    const normalized = ((deg % 360) + 360) % 360;
    return (normalized + 180) % 360;
  };

  const getSpeedColor = (speed: number) => {
    if (speed >= 25) return "text-red-400";
    if (speed >= 20) return "text-orange-400";
    if (speed >= 15) return "text-yellow-400";
    if (speed >= 10) return "text-green-400";
    if (speed >= 5) return "text-emerald-400";
    return "text-muted-foreground";
  };

  const getHourlyWindSummary = (hour: WindAloftHour) => {
    const cappedPressureLevels = hour.levels.filter(
      (level) => level.altitudeAGL_ft <= MAX_DISPLAY_ALTITUDE_AGL_FT,
    );

    const profileSpeedsMph = [
      hour.surfaceWindSpeed_mph,
      ...hour.nearSurfaceLevels.map((level) => level.windSpeed_mph),
      ...cappedPressureLevels.map((level) => level.windSpeed_mph),
    ].filter((value) => Number.isFinite(value) && value >= 0);

    const avgMph =
      profileSpeedsMph.length > 0
        ? Math.round(
            profileSpeedsMph.reduce((sum, value) => sum + value, 0) /
              profileSpeedsMph.length,
          )
        : hour.surfaceWindSpeed_mph;

    const profilePeakMph =
      profileSpeedsMph.length > 0
        ? Math.max(...profileSpeedsMph)
        : hour.surfaceWindSpeed_mph;

    return {
      avgMph,
      gustMph: Math.max(hour.surfaceWindGust_mph, profilePeakMph),
    };
  };

  const cloudLabel = (hour: WindAloftHour) => {
    const pct = hour.cloudCover;
    let cover = "CLR";
    if (pct >= 90) cover = "OVC";
    else if (pct >= 70) cover = "BKN";
    else if (pct >= 50) cover = "SCT";
    else if (pct >= 25) cover = "FEW";

    let ceiling = "—";
    if (hour.cloudCoverHigh > 20) ceiling = "@20k+";
    if (hour.cloudCoverMid > 20) ceiling = "@10k";
    if (hour.cloudCoverLow > 20) ceiling = "@3k";
    if (pct < 25) ceiling = "";

    return `${cover}${ceiling}`;
  };

  const visLabel = (hour: WindAloftHour) => {
    const sm = hour.visibility_m / 1609.34;
    if (sm >= 10) return "10+SM";
    if (sm >= 6) return `${Math.round(sm)}SM`;
    return `${sm.toFixed(1)}SM`;
  };

  const isDaytime = (date: Date) => {
    const h = date.getHours();
    return h >= 6 && h < 20;
  };

  // ── Find closest-to-now index ─────────────────────────────────────

  const nowIndex = useMemo(() => {
    if (hours.length === 0) return 0;
    const now = Date.now();
    let best = 0;
    let bestDiff = Infinity;
    hours.forEach((h, i) => {
      const d = Math.abs(h.time.getTime() - now);
      if (d < bestDiff) {
        bestDiff = d;
        best = i;
      }
    });
    return best;
  }, [hours]);

  // ── Scroll to current time on load ────────────────────────────────

  const getCardWidth = () => {
    if (typeof window !== "undefined" && window.innerWidth < 640) return 200;
    return 240;
  };

  useEffect(() => {
    if (scrollRef.current && hours.length > 0) {
      const container = scrollRef.current;
      const cardWidth = getCardWidth();
      const scrollPosition =
        cardWidth * nowIndex -
        container.clientWidth / 2 +
        cardWidth / 2;
      container.scrollLeft = Math.max(0, scrollPosition);
    }
  }, [hours, nowIndex]);

  const scrollToCurrentTime = () => {
    if (scrollRef.current && hours.length > 0) {
      const container = scrollRef.current;
      const cardWidth = getCardWidth();
      const scrollPosition =
        cardWidth * nowIndex -
        container.clientWidth / 2 +
        cardWidth / 2;
      container.scrollTo({
        left: Math.max(0, scrollPosition),
        behavior: "smooth",
      });
    }
  };

  // ── Loading / Error states ────────────────────────────────────────

  if (loading && hours.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-8 flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
        <span className="text-muted-foreground text-sm">
          Loading wind aloft data…
        </span>
      </div>
    );
  }

  if (error && hours.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-8 text-center">
        <p className="text-destructive text-sm mb-2">Failed to load wind aloft data</p>
        <p className="text-xs text-muted-foreground mb-4">{error}</p>
        <button
          onClick={refetch}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 transition-opacity"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Weather Alerts Section ──────────────────────────────── */}
      <div className="bg-card rounded-lg border border-border p-3">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Weather Advisories
          </span>
          {alertsLoading && (
            <Loader2 className="w-3 h-3 text-muted-foreground animate-spin ml-auto" />
          )}
        </div>

        {!alertsLoading && alerts.length === 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-950/40 border border-emerald-900/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-xs text-emerald-400 font-medium">No active advisories for this area</span>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="space-y-1.5">
            {alerts.map((alert) => {
              const colors = alertColors(alert);
              return (
                <Dialog key={alert.id}>
                  <DialogTrigger asChild>
                    <button className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-opacity hover:opacity-90 ${colors.row}`}>
                      <HazardIcon hazard={alert.hazard} className={`w-3.5 h-3.5 shrink-0 ${colors.icon}`} />
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${colors.badge}`}>
                        {alert.type}
                      </span>
                      <span className="text-xs font-medium text-foreground flex-1 min-w-0 truncate">
                        {hazardLabel(alert.hazard)}
                        {alert.severity && ` · ${alert.severity}`}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatAltRange(alert.altLow, alert.altHi)}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatExpiry(alert.validTo)}
                      </span>
                      <Info className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <HazardIcon hazard={alert.hazard} className={`w-4 h-4 ${alertColors(alert).icon}`} />
                        {alert.type}: {hazardLabel(alert.hazard)}
                      </DialogTitle>
                      <DialogDescription>
                        Valid until {alert.validTo.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {" · "}{formatAltRange(alert.altLow, alert.altHi)} ft MSL
                      </DialogDescription>
                    </DialogHeader>
                    <div className="mt-2">
                      <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap bg-muted/30 rounded-md p-3 leading-relaxed">
                        {alert.rawText || "No raw text available."}
                      </pre>
                    </div>
                  </DialogContent>
                </Dialog>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Visual Wind Profile ─────────────────────────────────── */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <Wind className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground font-medium">Vertical Profile · Current wind vectors by altitude</span>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-end justify-between h-20 gap-1 overflow-hidden">
            {buildRows(hours[nowIndex] || hours[0]).map((row, i) => {
              const speed = convertSpeed(row.windSpeed);
              const maxSpeed = 50;
              const heightPct = Math.min(100, (speed / maxSpeed) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative min-w-0">
                  <div
                    className="w-full bg-primary/20 rounded-t-sm transition-all group-hover:bg-primary/35"
                    style={{ height: `${heightPct}%` }}
                  >
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-popover border border-border text-foreground text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 pointer-events-none">
                      {speed}{getSpeedUnitLabel()}
                    </div>
                  </div>
                  <div
                    className="w-3 h-3 flex items-center justify-center shrink-0"
                    style={{ transform: `rotate(${getWindDirectionRotation(row.windDirection)}deg)` }}
                  >
                    <ArrowUp className="w-2.5 h-2.5 text-primary" />
                  </div>
                  <span className="text-[8px] font-mono text-muted-foreground/70 rotate-45 mt-0.5 hidden sm:block">
                    {row.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Main data section ────────────────────────────────────── */}
      <div className="bg-card rounded-lg border border-border">
        <div className="p-4 pb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-medium text-base leading-none text-foreground">Wind Aloft</h3>
              <span className="text-[10px] bg-emerald-950 text-emerald-400 font-semibold px-2 py-0.5 rounded-full shrink-0">LIVE</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={refetch}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-secondary text-secondary-foreground rounded-lg transition-colors hover:opacity-80 text-xs"
                title="Refresh data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={scrollToCurrentTime}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg transition-opacity hover:opacity-80 text-xs font-medium"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Now</span>
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {location.airport} · Elev {Math.round(elevationFt).toLocaleString()} ft MSL
          </p>

          {/* ── Settings pill row ─────────────────────────────── */}
          <div className="overflow-x-auto -mx-1 px-1 pb-1">
            <div className="flex items-center gap-1 flex-nowrap min-w-max">
              <span className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wide shrink-0 mr-0.5">Alt</span>
              {(["AGL", "MSL", "Pressure"] as AltitudeFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setAltitudeFormat(fmt)}
                  className={`px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all whitespace-nowrap ${altitudeFormat === fmt ? "border-primary/50 text-foreground bg-primary/10" : "border-border text-muted-foreground bg-transparent hover:border-muted-foreground/50"}`}
                >
                  {fmt}
                </button>
              ))}
              <span className="text-border mx-0.5 select-none text-xs">|</span>
              {(["normalized", "raw"] as AltitudeNormalized[]).map((n) => (
                <button
                  key={n}
                  onClick={() => setAltitudeNormalized(n)}
                  className={`px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all whitespace-nowrap ${altitudeNormalized === n ? "border-primary/50 text-foreground bg-primary/10" : "border-border text-muted-foreground bg-transparent hover:border-muted-foreground/50"}`}
                >
                  {n === "normalized" ? "Norm" : "Raw"}
                </button>
              ))}
              <span className="text-border mx-0.5 select-none text-xs">|</span>
              {(["ft", "m"] as AltitudeUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setAltitudeUnit(u)}
                  className={`px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all whitespace-nowrap ${altitudeUnit === u ? "border-primary/50 text-foreground bg-primary/10" : "border-border text-muted-foreground bg-transparent hover:border-muted-foreground/50"}`}
                >
                  {u}
                </button>
              ))}
              <span className="text-border mx-0.5 select-none text-xs">|</span>
              <span className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wide shrink-0 mr-0.5">Spd</span>
              {(["mph", "kmh", "knots", "ms"] as SpeedUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setSpeedUnit(u)}
                  className={`px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all whitespace-nowrap ${speedUnit === u ? "border-primary/50 text-foreground bg-primary/10" : "border-border text-muted-foreground bg-transparent hover:border-muted-foreground/50"}`}
                >
                  {u === "kmh" ? "km/h" : u === "ms" ? "m/s" : u}
                </button>
              ))}
              <span className="text-border mx-0.5 select-none text-xs">|</span>
              <span className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wide shrink-0 mr-0.5">Time</span>
              {(["12", "24"] as TimeFormat[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setTimeFormat(u)}
                  className={`px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all whitespace-nowrap ${timeFormat === u ? "border-primary/50 text-foreground bg-primary/10" : "border-border text-muted-foreground bg-transparent hover:border-muted-foreground/50"}`}
                >
                  {u}h
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Scrollable cards ─────────────────────────────────── */}
        <div className="border-t border-border px-4 pb-4">
          <div
            ref={scrollRef}
            className="flex gap-2 py-3 overflow-x-auto overscroll-x-contain"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {hours.map((hour, hourIndex) => {
              const isNow = hourIndex === nowIndex;
              const rows = buildRows(hour);
              const daytime = isDaytime(hour.time);
              const windSummary = getHourlyWindSummary(hour);
              const shearMap = detectWindShear(rows);

              return (
                <div
                  key={hourIndex}
                  className={`flex-shrink-0 w-[192px] sm:w-[228px] rounded-lg overflow-hidden border transition-all ${
                    isNow
                      ? "border-primary/60 ring-1 ring-primary/20 bg-card"
                      : "border-border bg-card"
                  }`}
                >
                  {/* Header */}
                  <div className={`px-3 py-2.5 ${isNow ? "bg-primary/10" : "bg-muted/20"}`}>
                    <div className="text-xl sm:text-2xl font-light text-foreground leading-none mb-1.5">
                      {formatTime(hour.time)}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span>AVG {convertSpeed(windSummary.avgMph)}{getSpeedUnitLabel()}</span>
                      <span>GUST {convertSpeed(windSummary.gustMph)}{getSpeedUnitLabel()}</span>
                      <span>CAPE {hour.cape}</span>
                    </div>
                  </div>

                  {/* Weather info bar */}
                  <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-border bg-muted/10">
                    {daytime ? (
                      <Sun className="w-3 h-3 text-yellow-400 shrink-0" />
                    ) : (
                      <Moon className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-[10px] bg-muted/50 px-1 py-0.5 rounded font-mono text-muted-foreground shrink-0">
                      {location.airport}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {cloudLabel(hour)} {visLabel(hour)}
                    </span>
                  </div>

                  {/* Altitude data table */}
                  <div>
                    <div className="grid grid-cols-3 gap-1 px-2 py-1.5 bg-muted/20 text-[10px] font-semibold text-muted-foreground border-b border-border">
                      <div>ALT ({altitudeFormat})</div>
                      <div>DIR</div>
                      <div>SPEED</div>
                    </div>

                    <div>
                      {rows.map((row, ri) => {
                        const shear = shearMap.get(ri);
                        const hasShear = !!shear;
                        return (
                          <div
                            key={ri}
                            className={`grid grid-cols-3 gap-1 px-2 py-1 text-xs border-b border-border/60 transition-colors hover:bg-muted/20 ${
                              row.isSurface ? "bg-muted/10" : ""
                            } ${hasShear ? "bg-amber-950/40 border-l-2 border-l-amber-500" : ""}`}
                          >
                            {/* Altitude */}
                            <div className="text-foreground font-medium whitespace-nowrap flex items-center gap-0.5">
                              {hasShear && (
                                <AlertTriangle
                                  className="w-2.5 h-2.5 text-amber-400 shrink-0"
                                  title={`Shear: dir Δ${shear.directionDelta}° spd Δ${shear.speedDelta}mph`}
                                />
                              )}
                              <span className="truncate">
                                {getDisplayAltitude(row)}
                                {!row.isSurface && (
                                  <span className="text-[9px] text-muted-foreground ml-0.5">
                                    {getAltitudeUnitLabel()}
                                  </span>
                                )}
                              </span>
                            </div>

                            {/* Direction */}
                            <div className={`font-medium flex items-center gap-0.5 whitespace-nowrap ${hasShear && shear.hasDirectionShear ? "text-amber-400" : "text-foreground"}`}>
                              <ArrowUp
                                className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0"
                                style={{
                                  transform: `rotate(${getWindDirectionRotation(row.windDirection)}deg)`,
                                }}
                              />
                              <span className="text-[10px]">
                                {row.windDirection}°
                                {hasShear && shear.hasDirectionShear && (
                                  <span className="text-[9px] ml-0.5 text-amber-400">Δ{shear.directionDelta}°</span>
                                )}
                              </span>
                            </div>

                            {/* Speed */}
                            <div
                              className={`font-semibold whitespace-nowrap ${hasShear && shear.hasSpeedShear ? "text-amber-400" : getSpeedColor(row.windSpeed)}`}
                            >
                              {convertSpeed(row.windSpeed)}{" "}
                              <span className="text-[9px] opacity-70">{getSpeedUnitLabel()}</span>
                              {hasShear && shear.hasSpeedShear && (
                                <span className="text-[9px] ml-0.5 text-amber-400">Δ{shear.speedDelta}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
