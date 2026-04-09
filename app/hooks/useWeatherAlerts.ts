import { useState, useEffect, useCallback, useRef } from "react";
import { cachedFetch } from "../services/weatherProxy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertHazard =
  | "TS"      // Thunderstorm
  | "TURB"    // Turbulence
  | "ICE"     // Icing
  | "IFR"     // IFR conditions
  | "MT_OBSCN" // Mountain obscuration
  | "LLWS"    // Low-level wind shear
  | "ASH"     // Volcanic ash
  | "FZLVL"   // Freezing level
  | string;   // catch-all for future hazards

export interface WeatherAlert {
  id: string;
  type: "SIGMET" | "G-AIRMET";
  hazard: AlertHazard;
  severity?: string;   // G-AIRMETs: "SEV", "MOD", "EXTRM"
  altLow?: number;     // feet MSL (undefined = SFC)
  altHi?: number;      // feet MSL (undefined = UNL)
  validFrom: Date;
  validTo: Date;
  rawText: string;
  isActive: boolean;
}

// Raw shapes from aviationweather.gov JSON API
interface RawSigmet {
  seriesId?: string;
  hazard?: string;
  qualifier?: string;
  altLow?: number | null;
  altHi?: number | null;
  validTimeFrom?: string;
  validTimeTo?: string;
  rawAirSigmet?: string;
  coords?: string;       // WKT polygon or coordinate string
  lat?: number;
  lon?: number;
}

interface RawGairmet {
  tag?: string;
  hazard?: string;
  severity?: string;
  altLow?: number | null;
  altHi?: number | null;
  validTime?: string;
  forecast?: { validTime?: string }[];
  rawGairmet?: string;
  coords?: string;
  lat?: number;
  lon?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a loose bounding box ~300 nm around the point */
function boundingBox(lat: number, lon: number, deg = 5) {
  return { minLat: lat - deg, maxLat: lat + deg, minLon: lon - deg, maxLon: lon + deg };
}

/** Check if a coordinate pair is inside the bounding box */
function inBox(
  lat: number,
  lon: number,
  box: ReturnType<typeof boundingBox>,
): boolean {
  return lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon;
}

/** Try to detect if a SIGMET's rawText or coords mention a point in our bounding box.
 *  This is a best-effort heuristic since we don't have a full polygon intersection library. */
function sigmetNearLocation(s: RawSigmet, box: ReturnType<typeof boundingBox>): boolean {
  // If API gives us a representative lat/lon, use it directly
  if (s.lat != null && s.lon != null) {
    return inBox(s.lat, s.lon, box);
  }
  // Scan the coords field for lat/lon pairs: "DDN/DDW" or "DD.D/DD.D"
  const coordStr = s.coords ?? s.rawAirSigmet ?? "";
  const matches = coordStr.matchAll(/(\d{2,3})(?:\.(\d+))?([NS])\s*\/?\s*(\d{2,3})(?:\.(\d+))?([EW])/gi);
  for (const m of matches) {
    const latDeg = parseFloat(`${m[1]}.${m[2] ?? "0"}`);
    const latSign = m[3].toUpperCase() === "S" ? -1 : 1;
    const lonDeg = parseFloat(`${m[4]}.${m[5] ?? "0"}`);
    const lonSign = m[6].toUpperCase() === "W" ? -1 : 1;
    if (inBox(latSign * latDeg, lonSign * lonDeg, box)) return true;
  }
  return false;
}

function gairmetNearLocation(g: RawGairmet, box: ReturnType<typeof boundingBox>): boolean {
  if (g.lat != null && g.lon != null) {
    return inBox(g.lat, g.lon, box);
  }
  const coordStr = g.coords ?? g.rawGairmet ?? "";
  const matches = coordStr.matchAll(/(\d{2,3})(?:\.(\d+))?([NS])\s*\/?\s*(\d{2,3})(?:\.(\d+))?([EW])/gi);
  for (const m of matches) {
    const latDeg = parseFloat(`${m[1]}.${m[2] ?? "0"}`);
    const latSign = m[3].toUpperCase() === "S" ? -1 : 1;
    const lonDeg = parseFloat(`${m[4]}.${m[5] ?? "0"}`);
    const lonSign = m[6].toUpperCase() === "W" ? -1 : 1;
    if (inBox(latSign * latDeg, lonSign * lonDeg, box)) return true;
  }
  return false;
}

function parseFtMsl(val: number | null | undefined): number | undefined {
  if (val == null || val <= 0) return undefined;
  // aviationweather.gov returns flight levels * 100
  return val >= 1000 ? val : val * 100;
}

function parseSigmet(raw: RawSigmet, box: ReturnType<typeof boundingBox>): WeatherAlert | null {
  if (!sigmetNearLocation(raw, box)) return null;
  const validFrom = raw.validTimeFrom ? new Date(raw.validTimeFrom) : new Date();
  const validTo = raw.validTimeTo ? new Date(raw.validTimeTo) : new Date(Date.now() + 3600000);
  const now = Date.now();
  return {
    id: raw.seriesId ?? `sigmet-${raw.validTimeFrom}-${raw.hazard}`,
    type: "SIGMET",
    hazard: (raw.hazard ?? "UNKN").toUpperCase() as AlertHazard,
    altLow: parseFtMsl(raw.altLow),
    altHi: parseFtMsl(raw.altHi),
    validFrom,
    validTo,
    rawText: raw.rawAirSigmet ?? "",
    isActive: validFrom.getTime() <= now && validTo.getTime() >= now,
  };
}

function parseGairmet(raw: RawGairmet, box: ReturnType<typeof boundingBox>): WeatherAlert | null {
  if (!gairmetNearLocation(raw, box)) return null;
  // G-AIRMETs have nested forecasts; use the first valid forecast period
  const validTimeStr = raw.forecast?.[0]?.validTime ?? raw.validTime;
  const validFrom = validTimeStr ? new Date(validTimeStr) : new Date();
  // G-AIRMETs are typically valid for 3 hours
  const validTo = new Date(validFrom.getTime() + 3 * 3600 * 1000);
  const now = Date.now();
  return {
    id: raw.tag ?? `gairmet-${raw.validTime}-${raw.hazard}`,
    type: "G-AIRMET",
    hazard: (raw.hazard ?? "UNKN").toUpperCase() as AlertHazard,
    severity: raw.severity,
    altLow: parseFtMsl(raw.altLow),
    altHi: parseFtMsl(raw.altHi),
    validFrom,
    validTo,
    rawText: raw.rawGairmet ?? "",
    isActive: validFrom.getTime() <= now && validTo.getTime() >= now,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseWeatherAlertsResult {
  alerts: WeatherAlert[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWeatherAlerts(lat: number, lon: number): UseWeatherAlertsResult {
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchCountRef = useRef(0);

  const fetch = useCallback(async () => {
    const currentFetch = ++fetchCountRef.current;
    setLoading(true);
    setError(null);

    const box = boundingBox(lat, lon, 5);

    try {
      const [sigmetRes, gairmetRes] = await Promise.allSettled([
        cachedFetch(`/api/aviationweather?type=sigmet&format=json`, undefined, 10 * 60 * 1000),
        cachedFetch(`/api/aviationweather?type=gairmet&format=json`, undefined, 10 * 60 * 1000),
      ]);

      if (currentFetch !== fetchCountRef.current) return;

      const collected: WeatherAlert[] = [];

      if (sigmetRes.status === "fulfilled" && Array.isArray(sigmetRes.value)) {
        for (const raw of sigmetRes.value as RawSigmet[]) {
          const parsed = parseSigmet(raw, box);
          if (parsed && parsed.isActive) collected.push(parsed);
        }
      }

      if (gairmetRes.status === "fulfilled" && Array.isArray(gairmetRes.value)) {
        for (const raw of gairmetRes.value as RawGairmet[]) {
          const parsed = parseGairmet(raw, box);
          if (parsed && parsed.isActive) collected.push(parsed);
        }
      }

      // Sort: SIGMETs first, then by validTo ascending
      collected.sort((a, b) => {
        if (a.type !== b.type) return a.type === "SIGMET" ? -1 : 1;
        return a.validTo.getTime() - b.validTo.getTime();
      });

      setAlerts(collected);
    } catch (err) {
      if (currentFetch !== fetchCountRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load weather alerts");
    } finally {
      if (currentFetch === fetchCountRef.current) setLoading(false);
    }
  }, [lat, lon]);

  useEffect(() => {
    fetch();
    // Refresh every 10 minutes
    const interval = setInterval(fetch, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { alerts, loading, error, refetch: fetch };
}
