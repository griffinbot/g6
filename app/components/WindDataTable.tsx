import {
  Wind,
  Clock,
  Loader2,
  Moon,
  Sun,
  RefreshCw,
  ArrowUp,
  AlertTriangle,
  Thermometer,
  Flame,
  Info,
} from "lucide-react";
import {
  useWindAloft,
  interpolateToAGL,
  NORMALIZED_ALTITUDES_AGL,
  WindAloftHour,
} from "../hooks/useWindAloft";
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

const WIND_TABLE_SETTINGS_STORAGE_KEY = "weather.griff.windDataSettings.v1";
const RAW_ALTITUDE_DEDUPE_TOLERANCE_FT = 5;
const MAX_DISPLAY_ALTITUDE_AGL_FT = 45000;

type AltitudeFormat = "AGL" | "MSL" | "Pressure";
type AltitudeNormalized = "normalized" | "raw";
type AltitudeUnit = "ft" | "m";
type SpeedUnit = "mph" | "kmh" | "knots" | "ms";
type TempUnit = "F" | "C";
type DistanceUnit = "miles" | "km";
type TimeFormat = "12" | "24";

type WindTableSettings = {
  altitudeFormat: AltitudeFormat;
  altitudeNormalized: AltitudeNormalized;
  altitudeUnit: AltitudeUnit;
  speedUnit: SpeedUnit;
  tempUnit: TempUnit;
  distanceUnit: DistanceUnit;
  timeFormat: TimeFormat;
};

const DEFAULT_WIND_TABLE_SETTINGS: WindTableSettings = {
  altitudeFormat: "AGL",
  altitudeNormalized: "normalized",
  altitudeUnit: "ft",
  speedUnit: "mph",
  tempUnit: "F",
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

function isTempUnit(value: unknown): value is TempUnit {
  return value === "F" || value === "C";
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
      tempUnit: isTempUnit(parsed.tempUnit)
        ? parsed.tempUnit
        : DEFAULT_WIND_TABLE_SETTINGS.tempUnit,
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

// ─── Component ──────────────────────────────────────────────────────

export function WindDataTable({
  location,
}: WindDataTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Wind aloft data from Open-Meteo
  const { hours, elevation_m, loading, error, refetch } =
    useWindAloft(location.lat, location.lon);

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
  const [tempUnit, setTempUnit] = useState<TempUnit>(
    DEFAULT_WIND_TABLE_SETTINGS.tempUnit,
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
    setTempUnit(loaded.tempUnit);
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
      tempUnit,
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
    tempUnit,
    distanceUnit,
    timeFormat,
  ]);

  const elevationFt = elevation_m * 3.28084;

  // ── Derive display rows from raw API data ─────────────────────────

  type DisplayRow = {
    label: string; // e.g. "Surface", "262", "1000"
    temperature: number; // °F (raw)
    windSpeed: number; // mph (raw)
    windDirection: number; // degrees
    altitudeAGL_ft: number;
    altitudeMSL_ft: number;
    pressureLevel: number;
    isSurface?: boolean;
  };

  /** Build rows for a single hour based on current settings. */
  function buildRows(hour: WindAloftHour): DisplayRow[] {
    const rows: DisplayRow[] = [];
    const cappedPressureLevels = hour.levels.filter(
      (level) => level.altitudeAGL_ft <= MAX_DISPLAY_ALTITUDE_AGL_FT,
    );

    // Surface row
    rows.push({
      label: "Surface",
      temperature: hour.surfaceTemp_F,
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
      // Interpolate to fixed AGL altitudes
      for (const targetAGL of NORMALIZED_ALTITUDES_AGL) {
        const interp = interpolateToAGL(cappedPressureLevels, targetAGL);
        if (interp) {
          rows.push({
            label: String(targetAGL),
            temperature: interp.temperature_F,
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
            temperature: lv.temperature_F,
            windSpeed: lv.windSpeed_mph,
            windDirection: lv.windDirection,
            altitudeAGL_ft: lv.altitudeAGL_ft,
            altitudeMSL_ft: lv.altitudeMSL_ft,
            pressureLevel: 0,
          });
        }
      }

      // Raw pressure-level data
      for (const lv of cappedPressureLevels) {
        rows.push({
          label:
            altitudeFormat === "Pressure"
              ? String(lv.pressureLevel)
              : String(lv.altitudeAGL_ft),
          temperature: lv.temperature_F,
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

  type InversionInfo = {
    hasInversion: boolean;
    tempDelta: number;
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

  function detectInversions(rows: DisplayRow[]): Map<number, InversionInfo> {
    const inversionMap = new Map<number, InversionInfo>();
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      if (curr.altitudeAGL_ft > prev.altitudeAGL_ft && curr.temperature > prev.temperature) {
        const tempDelta = curr.temperature - prev.temperature;
        inversionMap.set(i, { hasInversion: true, tempDelta });
      }
    }
    return inversionMap;
  }

  function getCapeIndicator(cape: number): { label: string; color: string; bg: string } {
    if (cape >= 2500) return { label: "Extreme", color: "text-red-100", bg: "bg-red-500" };
    if (cape >= 1500) return { label: "Strong", color: "text-orange-100", bg: "bg-orange-500" };
    if (cape >= 1000) return { label: "Moderate", color: "text-yellow-100", bg: "bg-yellow-500" };
    if (cape >= 500) return { label: "Weak", color: "text-green-100", bg: "bg-green-500" };
    if (cape > 0) return { label: "Marginal", color: "text-blue-100", bg: "bg-blue-400" };
    return { label: "None", color: "text-gray-100", bg: "bg-gray-400" };
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

  const convertTemp = (f: number): number => {
    if (tempUnit === "C") return Math.round(((f - 32) * 5) / 9);
    return f;
  };

  const getSpeedUnitLabel = (): string => {
    switch (speedUnit) {
      case "kmh":
        return "km/h";
      case "knots":
        return "kt";
      case "ms":
        return "m/s";
      default:
        return "mph";
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

  const getTempColor = (temp: number) => {
    if (temp >= 60) return "text-green-400";
    if (temp >= 50) return "text-green-500";
    if (temp >= 40) return "text-yellow-400";
    if (temp >= 30) return "text-blue-300";
    if (temp >= 20) return "text-blue-400";
    return "text-blue-500";
  };

  const getSpeedColor = (speed: number) => {
    if (speed >= 25) return "text-pink-200";
    if (speed >= 20) return "text-yellow-200";
    if (speed >= 15) return "text-yellow-300";
    if (speed >= 10) return "text-green-200";
    if (speed >= 5) return "text-green-300";
    return "text-white";
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

  // Cloud height label helper
  const cloudLabel = (hour: WindAloftHour) => {
    const pct = hour.cloudCover;
    let cover = "CLR";
    if (pct >= 90) cover = "OVC";
    else if (pct >= 70) cover = "BKN";
    else if (pct >= 50) cover = "SCT";
    else if (pct >= 25) cover = "FEW";

    // Estimate ceiling from low/mid/high cloud layers
    let ceiling = "—";
    if (hour.cloudCoverHigh > 20) ceiling = "@20k+";
    if (hour.cloudCoverMid > 20) ceiling = "@10k";
    if (hour.cloudCoverLow > 20) ceiling = "@3k";
    if (pct < 25) ceiling = "";

    return `${cover}${ceiling}`;
  };

  // Visibility in ground-friendly format
  const visLabel = (hour: WindAloftHour) => {
    const sm = hour.visibility_m / 1609.34;
    if (sm >= 10) return "10+SM";
    if (sm >= 6) return `${Math.round(sm)}SM`;
    return `${sm.toFixed(1)}SM`;
  };

  // Is it daytime?
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
    if (typeof window !== "undefined" && window.innerWidth < 640) return 228;
    return 276;
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        <span className="text-gray-500">
          Loading wind aloft data from Open-Meteo…
        </span>
      </div>
    );
  }

  if (error && hours.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 text-center">
        <p className="text-red-500 mb-2">
          Failed to load wind aloft data
        </p>
        <p className="text-sm text-gray-500 mb-4">{error}</p>
        <button
          onClick={refetch}
          className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm hover:bg-blue-600 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {hours.length > 0 && (() => {
        const currentHour = hours[nowIndex] || hours[0];
        const capeInfo = getCapeIndicator(currentHour.cape);
        const currentRows = buildRows(currentHour);
        const currentShear = detectWindShear(currentRows);
        const currentInversions = detectInversions(currentRows);
        const shearCount = currentShear.size;
        const inversionCount = currentInversions.size;

        const shearZones = Array.from(currentShear.entries()).map(([idx, info]) => ({
          altitude: currentRows[idx]?.altitudeAGL_ft ?? 0,
          directionDelta: info.directionDelta,
          speedDelta: info.speedDelta,
          hasDirectionShear: info.hasDirectionShear,
          hasSpeedShear: info.hasSpeedShear,
        }));

        const inversionLayers = Array.from(currentInversions.entries()).map(([idx, info]) => ({
          altitudeFrom: currentRows[idx - 1]?.altitudeAGL_ft ?? 0,
          altitudeTo: currentRows[idx]?.altitudeAGL_ft ?? 0,
          tempDelta: info.tempDelta,
        }));

        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* CAPE card */}
            <Dialog>
              <DialogTrigger asChild>
                <button className={`rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 ${capeInfo.bg} bg-opacity-10 text-left w-full cursor-pointer hover:shadow-md transition-shadow group`}>
                  <div className={`w-12 h-12 rounded-full ${capeInfo.bg} bg-opacity-20 flex items-center justify-center shrink-0`}>
                    <Flame className={`w-6 h-6 ${capeInfo.bg === "bg-gray-400" ? "text-gray-500" : capeInfo.bg.replace("bg-", "text-")}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 font-medium">CAPE / Thermal Activity</p>
                    <p className="text-lg font-bold text-slate-900">{currentHour.cape} J/kg</p>
                    <p className={`text-xs font-semibold ${capeInfo.bg.replace("bg-", "text-")}`}>{capeInfo.label}</p>
                  </div>
                  <Info className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-white">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Flame className={`w-5 h-5 ${capeInfo.bg.replace("bg-", "text-")}`} />
                    CAPE / Thermal Activity
                  </DialogTitle>
                  <DialogDescription>
                    Convective Available Potential Energy
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className={`rounded-xl p-4 ${capeInfo.bg} bg-opacity-10 border border-gray-100`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-600">Current reading</span>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded-full text-white ${capeInfo.bg}`}>{capeInfo.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{currentHour.cape} J/kg</p>
                  </div>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p><strong className="text-slate-800">What is CAPE?</strong> CAPE measures the energy available to fuel rising air parcels. Higher CAPE means stronger convective potential — the atmosphere is more likely to produce strong updrafts, turbulence, and storms.</p>
                    <p><strong className="text-slate-800">For balloon & aviation operations:</strong></p>
                    <ul className="ml-4 space-y-1 list-disc">
                      <li><strong>0 J/kg (None):</strong> Stable air, no convective risk.</li>
                      <li><strong>1–499 J/kg (Marginal):</strong> Low instability. Generally safe.</li>
                      <li><strong>500–999 J/kg (Weak):</strong> Some instability. Monitor for afternoon development.</li>
                      <li><strong>1000–1499 J/kg (Moderate):</strong> Notable instability. Use caution, especially afternoon flights.</li>
                      <li><strong>1500–2499 J/kg (Strong):</strong> Significant convective risk. Avoid or delay operations.</li>
                      <li><strong>2500+ J/kg (Extreme):</strong> Dangerous instability. Do not fly.</li>
                    </ul>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Wind Shear card */}
            <Dialog>
              <DialogTrigger asChild>
                <button className={`rounded-2xl shadow-sm border p-4 flex items-center gap-4 ${shearCount > 0 ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-white"} text-left w-full cursor-pointer hover:shadow-md transition-shadow group`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${shearCount > 0 ? "bg-amber-100" : "bg-gray-50"}`}>
                    <AlertTriangle className={`w-6 h-6 ${shearCount > 0 ? "text-amber-500" : "text-gray-400"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 font-medium">Wind Shear</p>
                    <p className="text-lg font-bold text-slate-900">{shearCount} {shearCount === 1 ? "zone" : "zones"}</p>
                    <p className={`text-xs font-semibold ${shearCount > 0 ? "text-amber-600" : "text-green-600"}`}>{shearCount > 0 ? "Shear Detected" : "No Shear"}</p>
                  </div>
                  <Info className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-white">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className={`w-5 h-5 ${shearCount > 0 ? "text-amber-500" : "text-gray-400"}`} />
                    Wind Shear
                  </DialogTitle>
                  <DialogDescription>
                    Rapid changes in wind speed or direction with altitude
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className={`rounded-xl p-4 border ${shearCount > 0 ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-600">Detected zones</span>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${shearCount > 0 ? "bg-amber-500 text-white" : "bg-green-500 text-white"}`}>{shearCount > 0 ? "Warning" : "Clear"}</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{shearCount} {shearCount === 1 ? "zone" : "zones"}</p>
                  </div>
                  {shearZones.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Shear zones detected near:</p>
                      {shearZones.map((z, i) => (
                        <div key={i} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm">
                          <span className="font-semibold text-slate-800">{z.altitude.toLocaleString()} ft AGL</span>
                          <span className="text-gray-500 ml-2">
                            {z.hasDirectionShear && `Dir: Δ${z.directionDelta}°`}
                            {z.hasDirectionShear && z.hasSpeedShear && " · "}
                            {z.hasSpeedShear && `Speed: Δ${z.speedDelta} mph`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2 text-sm text-gray-600">
                    <p><strong className="text-slate-800">What is wind shear?</strong> Wind shear occurs when wind speed or direction changes rapidly over a short altitude range. This creates invisible turbulence that aircraft and balloons transition through.</p>
                    <p><strong className="text-slate-800">For balloon & aviation operations:</strong> Wind shear can cause sudden ascent or descent rate changes, making altitude control difficult. Direction shear can rotate the envelope and complicate navigation. Multiple shear zones increase risk significantly.</p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Temp Inversions card */}
            <Dialog>
              <DialogTrigger asChild>
                <button className={`rounded-2xl shadow-sm border p-4 flex items-center gap-4 ${inversionCount > 0 ? "border-purple-200 bg-purple-50" : "border-gray-100 bg-white"} text-left w-full cursor-pointer hover:shadow-md transition-shadow group`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${inversionCount > 0 ? "bg-purple-100" : "bg-gray-50"}`}>
                    <Thermometer className={`w-6 h-6 ${inversionCount > 0 ? "text-purple-500" : "text-gray-400"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 font-medium">Temp Inversions</p>
                    <p className="text-lg font-bold text-slate-900">{inversionCount} {inversionCount === 1 ? "layer" : "layers"}</p>
                    <p className={`text-xs font-semibold ${inversionCount > 0 ? "text-purple-600" : "text-green-600"}`}>{inversionCount > 0 ? "Inversion Detected" : "No Inversion"}</p>
                  </div>
                  <Info className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-white">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Thermometer className={`w-5 h-5 ${inversionCount > 0 ? "text-purple-500" : "text-gray-400"}`} />
                    Temperature Inversions
                  </DialogTitle>
                  <DialogDescription>
                    Layers where temperature increases with altitude
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className={`rounded-xl p-4 border ${inversionCount > 0 ? "bg-purple-50 border-purple-200" : "bg-gray-50 border-gray-100"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-600">Detected layers</span>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${inversionCount > 0 ? "bg-purple-500 text-white" : "bg-green-500 text-white"}`}>{inversionCount > 0 ? "Present" : "None"}</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{inversionCount} {inversionCount === 1 ? "layer" : "layers"}</p>
                  </div>
                  {inversionLayers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Inversion layers:</p>
                      {inversionLayers.map((layer, i) => (
                        <div key={i} className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-sm">
                          <span className="font-semibold text-slate-800">{layer.altitudeFrom.toLocaleString()}–{layer.altitudeTo.toLocaleString()} ft AGL</span>
                          <span className="text-gray-500 ml-2">+{layer.tempDelta}°F warmer</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2 text-sm text-gray-600">
                    <p><strong className="text-slate-800">What is a temperature inversion?</strong> Normally, air cools as you climb. In an inversion, a layer of warm air sits above cooler air — trapping pollutants, fog, and affecting convection.</p>
                    <p><strong className="text-slate-800">For balloon & aviation operations:</strong> Inversions create a "ceiling" that suppresses thermals below them and can trap smoke or haze, reducing visibility. A balloon can feel a sharp change in lift rate when entering or exiting an inversion layer. Strong inversions near the surface can indicate poor early-morning launch conditions.</p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        );
      })()}

      {/* Visual Wind Profile */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-sky-50 flex items-center justify-center mb-3">
            <Wind className="w-8 h-8 text-sky-500" />
          </div>
          <h4 className="font-bold text-slate-900">Vertical Profile</h4>
          <p className="text-xs text-slate-500 mt-1">Current wind vectors by altitude</p>
        </div>
        
        <div className="md:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-end justify-between h-32 gap-2">
            {buildRows(hours[nowIndex] || hours[0]).map((row, i) => {
              const speed = convertSpeed(row.windSpeed);
              const maxSpeed = 50; // Reference for height
              const heightPct = Math.min(100, (speed / maxSpeed) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative">
                  <div 
                    className="w-full bg-sky-100 rounded-t-sm transition-all group-hover:bg-sky-200" 
                    style={{ height: `${heightPct}%` }}
                  >
                    <div 
                      className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10"
                    >
                      {speed}{getSpeedUnitLabel()}
                    </div>
                  </div>
                  <div 
                    className="w-4 h-4 flex items-center justify-center transition-transform"
                    style={{ transform: `rotate(${getWindDirectionRotation(row.windDirection)}deg)` }}
                  >
                    <ArrowUp className="w-3 h-3 text-sky-600" />
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 rotate-45 mt-1">
                    {row.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="p-4 sm:p-6 pb-3">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-semibold text-lg leading-none">Wind Aloft Data</h3>
              <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full shrink-0">LIVE</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={refetch}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors shadow-sm"
                title="Refresh data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={scrollToCurrentTime}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors shadow-sm"
              >
                <Clock className="w-4 h-4" />
                <span className="font-medium text-sm">Now</span>
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-3">
            Upper Level Winds {location.airport} · Elev {Math.round(elevationFt).toLocaleString()} ft MSL
          </p>
          {/* ── Inline settings pill row ─────────────────────────── */}
          <div className="overflow-x-auto -mx-1 px-1 pb-1">
            <div className="flex items-center gap-1.5 flex-nowrap min-w-max">
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide shrink-0 mr-0.5">Alt</span>
              {(["AGL", "MSL", "Pressure"] as AltitudeFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setAltitudeFormat(fmt)}
                  className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all whitespace-nowrap ${altitudeFormat === fmt ? "border-blue-500 text-blue-600 bg-blue-50" : "border-gray-200 text-gray-500 bg-white hover:border-gray-400"}`}
                >
                  {fmt}
                </button>
              ))}
              <span className="text-gray-200 mx-0.5 select-none">|</span>
              {(["normalized", "raw"] as AltitudeNormalized[]).map((n) => (
                <button
                  key={n}
                  onClick={() => setAltitudeNormalized(n)}
                  className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all whitespace-nowrap ${altitudeNormalized === n ? "border-blue-500 text-blue-600 bg-blue-50" : "border-gray-200 text-gray-500 bg-white hover:border-gray-400"}`}
                >
                  {n === "normalized" ? "Norm" : "Raw"}
                </button>
              ))}
              <span className="text-gray-200 mx-0.5 select-none">|</span>
              {(["ft", "m"] as AltitudeUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setAltitudeUnit(u)}
                  className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all whitespace-nowrap ${altitudeUnit === u ? "border-blue-500 text-blue-600 bg-blue-50" : "border-gray-200 text-gray-500 bg-white hover:border-gray-400"}`}
                >
                  {u}
                </button>
              ))}
              <span className="text-gray-200 mx-0.5 select-none">|</span>
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide shrink-0 mr-0.5">Spd</span>
              {(["mph", "kmh", "knots", "ms"] as SpeedUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setSpeedUnit(u)}
                  className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all whitespace-nowrap ${speedUnit === u ? "border-blue-500 text-blue-600 bg-blue-50" : "border-gray-200 text-gray-500 bg-white hover:border-gray-400"}`}
                >
                  {u === "kmh" ? "km/h" : u === "ms" ? "m/s" : u}
                </button>
              ))}
              <span className="text-gray-200 mx-0.5 select-none">|</span>
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide shrink-0 mr-0.5">Temp</span>
              {(["F", "C"] as TempUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setTempUnit(u)}
                  className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all whitespace-nowrap ${tempUnit === u ? "border-blue-500 text-blue-600 bg-blue-50" : "border-gray-200 text-gray-500 bg-white hover:border-gray-400"}`}
                >
                  °{u}
                </button>
              ))}
              <span className="text-gray-200 mx-0.5 select-none">|</span>
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide shrink-0 mr-0.5">Dist</span>
              {(["miles", "km"] as DistanceUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setDistanceUnit(u)}
                  className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all whitespace-nowrap ${distanceUnit === u ? "border-blue-500 text-blue-600 bg-blue-50" : "border-gray-200 text-gray-500 bg-white hover:border-gray-400"}`}
                >
                  {u}
                </button>
              ))}
              <span className="text-gray-200 mx-0.5 select-none">|</span>
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide shrink-0 mr-0.5">Time</span>
              {(["12", "24"] as TimeFormat[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setTimeFormat(u)}
                  className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all whitespace-nowrap ${timeFormat === u ? "border-blue-500 text-blue-600 bg-blue-50" : "border-gray-200 text-gray-500 bg-white hover:border-gray-400"}`}
                >
                  {u}h
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable cards ─────────────────────────────────────── */}
      <div className="border-t border-gray-100 px-4 sm:px-6 pb-4 sm:pb-6">
        <div
          ref={scrollRef}
          className="flex gap-2 sm:gap-4 py-4 overflow-x-auto overscroll-x-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {hours.map((hour, hourIndex) => {
            const isNow = hourIndex === nowIndex;
            const rows = buildRows(hour);
            const daytime = isDaytime(hour.time);
            const windSummary = getHourlyWindSummary(hour);
            const shearMap = detectWindShear(rows);
            const inversionMap = detectInversions(rows);

            return (
              <div
                key={hourIndex}
                className={`flex-shrink-0 w-[220px] sm:w-[260px] rounded-2xl overflow-hidden transition-all ${
                  isNow
                    ? "bg-gradient-to-br from-blue-500 to-blue-600 ring-2 ring-blue-400 ring-offset-2"
                    : "bg-gradient-to-br from-blue-400 to-blue-500"
                }`}
              >
                {/* Header */}
                <div className="p-4 pb-3 text-white">
                  <div className="text-2xl sm:text-3xl font-light mb-2">
                    {formatTime(hour.time)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                    <span className="font-semibold">
                      CIN {hour.cin}
                    </span>
                    <span className="font-semibold">
                      CAPE {hour.cape}
                    </span>
                    <span className="font-semibold">
                      AVG {convertSpeed(windSummary.avgMph)} {getSpeedUnitLabel()}
                    </span>
                    <span className="font-semibold">
                      GUST {convertSpeed(windSummary.gustMph)} {getSpeedUnitLabel()}
                    </span>
                  </div>
                </div>

                {/* Weather info bar */}
                <div className="px-4 pb-3 text-white flex items-center gap-2">
                  {daytime ? (
                    <Sun className="w-4 h-4 text-yellow-300" />
                  ) : (
                    <Moon className="w-4 h-4 text-blue-200" />
                  )}
                  <span className="text-xs bg-blue-700/60 px-1.5 py-0.5 rounded font-mono font-semibold">
                    {location.airport}
                  </span>
                  <span className="text-sm font-medium">
                    {hour.cloudCover}% {cloudLabel(hour)}{" "}
                    {visLabel(hour)}
                  </span>
                </div>

                {/* Altitude data table */}
                <div className="bg-blue-600/40 backdrop-blur-sm">
                  <div className="grid grid-cols-[1.05fr_0.7fr_0.95fr_1fr] sm:grid-cols-[1fr_0.8fr_1fr_0.8fr] gap-1.5 sm:gap-3 px-3 py-2 text-white text-[10px] sm:text-xs font-semibold border-b border-white/20">
                    <div>ALT. ({altitudeFormat})</div>
                    <div>TEMP</div>
                    <div>DIRECTION</div>
                    <div>SPEED</div>
                  </div>

                  <div>
                    {rows.map((row, ri) => {
                      const shear = shearMap.get(ri);
                      const inversion = inversionMap.get(ri);
                      const hasShear = !!shear;
                      const hasInversion = !!inversion;
                      return (
                      <div
                        key={ri}
                        className={`grid grid-cols-[1.05fr_0.7fr_0.95fr_1fr] sm:grid-cols-4 gap-1.5 sm:gap-3 px-3 py-1.5 text-xs sm:text-sm border-b border-white/10 hover:bg-white/10 transition-colors ${
                          row.isSurface ? "bg-white/5" : ""
                        } ${hasShear ? "bg-amber-500/20 border-l-2 border-l-amber-400" : ""} ${hasInversion ? "bg-purple-500/20 border-r-2 border-r-purple-400" : ""}`}
                      >
                        <div className="text-white font-medium whitespace-nowrap flex items-center gap-1">
                          {hasShear && <span title={`Shear: dir Δ${shear.directionDelta}° spd Δ${shear.speedDelta}mph`}><AlertTriangle className="w-3 h-3 text-amber-300 shrink-0" /></span>}
                          {hasInversion && <span title={`Inversion: +${inversion.tempDelta}°F`}><Thermometer className="w-3 h-3 text-purple-300 shrink-0" /></span>}
                          <span>
                          {getDisplayAltitude(row)}{" "}
                          {!row.isSurface && (
                            <span className="inline-block ml-1 text-[10px] opacity-70">
                              {getAltitudeUnitLabel()}
                            </span>
                          )}
                          </span>
                        </div>

                        <div
                          className={`font-semibold ${hasInversion ? "text-purple-300" : getTempColor(row.temperature)}`}
                        >
                          {convertTemp(row.temperature)}°
                          {tempUnit}
                          {hasInversion && <span className="text-[9px] ml-0.5">↑</span>}
                        </div>

                        <div className={`font-medium flex items-center whitespace-nowrap ${hasShear && shear.hasDirectionShear ? "text-amber-300" : "text-white"}`}>
                          <ArrowUp
                            className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0"
                            style={{
                              transform: `rotate(${getWindDirectionRotation(
                                row.windDirection,
                              )}deg)`,
                            }}
                          />
                          <span className="ml-1 text-xs">
                            {row.windDirection}°
                            {hasShear && shear.hasDirectionShear && <span className="text-[9px] ml-0.5">Δ{shear.directionDelta}°</span>}
                          </span>
                        </div>

                        <div
                          className={`font-semibold whitespace-nowrap ${hasShear && shear.hasSpeedShear ? "text-amber-300" : getSpeedColor(row.windSpeed)}`}
                        >
                          {convertSpeed(row.windSpeed)}{" "}
                          {getSpeedUnitLabel()}
                          {hasShear && shear.hasSpeedShear && <span className="text-[9px] ml-0.5">Δ{shear.speedDelta}</span>}
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
  );
}
