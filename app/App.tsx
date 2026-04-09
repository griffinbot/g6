import { useState, useEffect, useRef } from "react";
import { Search, Settings, Wind, FileText, Plane, Calendar, Loader2, Bookmark, BookmarkCheck, X, Menu, MessageSquare, SlidersHorizontal, Navigation, LogIn, Map } from "lucide-react";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Sheet, SheetContent, SheetClose, SheetDescription, SheetHeader, SheetTitle } from "./components/ui/sheet";
import { CurrentWeather } from "./components/CurrentWeather";
import { WindDataTable } from "./components/WindDataTable";
import { WeatherDiscussion } from "./components/WeatherDiscussion";
import { AirportReports } from "./components/AirportReports";
import { SettingsPanel } from "./components/SettingsPanel";
import { FlightPlanning } from "./components/FlightPlanning";
import { SevenDayOutlook } from "./components/SevenDayOutlook";
import { AviationForecastInfographic } from "./components/AviationForecastInfographic";
import { AIAssistantPanel } from "./components/AIAssistantPanel";
import { SavedLocationWidget } from "./components/SavedLocationWidget";
import { MapView } from "./components/MapView";
import { cachedFetch, weatherGovFetch } from "./services/weatherProxy";
import { WeatherProvider } from "./contexts/WeatherContext";
import { ProfileProvider } from "./contexts/ProfileContext";

const initialLocations = [
  { id: "1", name: "SeaTac, WA", lat: 47.4502, lon: -122.3088, airport: "KSEA" },
  { id: "2", name: "Boeing Field, WA", lat: 47.5300, lon: -122.3019, airport: "KBFI" },
  { id: "3", name: "Joint Base Lewis-McChord, WA", lat: 47.1376, lon: -122.4762, airport: "KTCM" },
  { id: "4", name: "Renton Municipal, WA", lat: 47.4931, lon: -122.2162, airport: "KRNT" },
];

const navTabs = [
  { value: "overview", label: "Overview", icon: SlidersHorizontal },
  { value: "discussion", label: "Discussion", icon: FileText },
  { value: "airports", label: "Airports", icon: Plane },
  { value: "wind-aloft", label: "Wind Aloft", icon: Wind },
  { value: "forecast", label: "Forecast", icon: Calendar },
  { value: "outlook", label: "7-Day", icon: Calendar },
  { value: "map", label: "Map", icon: Map },
  { value: "flight", label: "Flight Plan", icon: Navigation },
  { value: "settings", label: "Settings", icon: Settings },
] as const;

const workspaceTabs = navTabs.filter(
  (tab) => tab.value !== "discussion" && tab.value !== "settings",
);

interface SearchResult {
  place_id: number | string;
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  class?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country_code?: string;
  };
  extratags?: {
    iata?: string;
    icao?: string;
    ref?: string;
    local_ref?: string;
    [key: string]: string | undefined;
  };
}

interface OpenMeteoGeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  admin1?: string;
  timezone?: string;
}

interface SavedLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  airport: string;
  airportLookupPending?: boolean;
}

const SAVED_LOCATIONS_STORAGE_KEY = "weather.griff.savedLocations.v1";
const SELECTED_LOCATION_ID_STORAGE_KEY = "weather.griff.selectedLocationId.v1";

interface UserCoordinates {
  lat: number;
  lon: number;
}

interface FaaStation {
  icaoId: string;
  iataId?: string;
  faa?: string;
  site: string;
  state: string;
  country: string;
  lat: number;
  lon: number;
  elev?: number;
}

interface AviationApiAirport {
  icao: string;
  name: string;
  city: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
  elevation?: number;
}

async function safeParseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 5500): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await safeParseJson<T>(res);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function isAirportLike(result: SearchResult): boolean {
  return (
    !!result.extratags?.iata ||
    !!result.extratags?.icao ||
    result.class === "aeroway" ||
    result.type === "aerodrome" ||
    result.display_name.toLowerCase().includes("airport")
  );
}

function isUSResult(result: SearchResult): boolean {
  const countryCode = result.address?.country_code?.toLowerCase();
  if (countryCode) return countryCode === "us";
  return result.display_name.toLowerCase().includes("united states");
}

function normalizeAirportCode(value: string | undefined | null): string | null {
  if (!value) return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{3,5}$/.test(normalized)) return null;
  return normalized;
}

// Returns false for CWOP personal weather stations (e.g. ENCW1, FW123, DW1)
// which look like letters followed by trailing digits and are not airport identifiers.
function isAirportStyleCode(code: string): boolean {
  const c = code.toUpperCase();
  // ICAO K/P codes: KSEA, KRNT — always airport
  if (/^[KP][A-Z]{3}$/.test(c)) return true;
  // CWOP pattern: 3–5 letters followed by 1–4 digits (ENCW1, DW12, FW1234)
  if (/^[A-Z]{2,5}\d{1,4}$/.test(c)) return false;
  // Everything else that passes normalizeAirportCode is treated as a valid FAA id (S61, WA77, 0S9)
  return normalizeAirportCode(c) !== null;
}

function normalizeIcaoCode(value: string | undefined | null): string | null {
  const normalized = normalizeAirportCode(value);
  if (!normalized) return null;
  if (!/^[A-Z]{4}$/.test(normalized)) return null;
  return normalized;
}

function normalizeFaaCode(value: string | undefined | null): string | null {
  if (!value) return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{3,6}$/.test(normalized)) return null;
  if (!/[A-Z]/.test(normalized)) return null;
  return normalized;
}

function normalizeAirportSearchCode(value: string | undefined | null): string | null {
  const normalized = normalizeAirportCode(value);
  if (!normalized) return null;
  return normalized.length >= 3 && normalized.length <= 4 ? normalized : null;
}

function airportCodeFromUserSearch(
  value: string | undefined | null,
  result: SearchResult,
): string | null {
  const normalized = normalizeAirportSearchCode(value);
  if (!normalized) return null;
  // Only prepend K for pure 3-letter IATA codes — not FAA codes containing digits
  if (normalized.length === 3 && /^[A-Z]{3}$/.test(normalized) && isUSResult(result)) return `K${normalized}`;
  return normalized;
}

function bestAirportCodeFromResult(result: SearchResult): string | null {
  const directIcao = normalizeIcaoCode(result.extratags?.icao);
  if (directIcao) return directIcao;

  const iata = normalizeAirportCode(result.extratags?.iata);
  if (iata && /^[A-Z]{3}$/.test(iata) && isUSResult(result)) return `K${iata}`;

  const refIcao = normalizeIcaoCode(result.extratags?.ref) || normalizeIcaoCode(result.extratags?.local_ref);
  if (refIcao) return refIcao;

  // FAA local identifier (e.g. WA77, 0S9) — airports with aerodrome/ref tags but no ICAO
  const faaRef = normalizeFaaCode(result.extratags?.ref) || normalizeFaaCode(result.extratags?.local_ref);
  if (faaRef && !isPlaceholderAirportCode(faaRef)) return faaRef;

  return null;
}

function isPlaceholderAirportCode(code: string): boolean {
  return code === "ARPT" || code === "GPS";
}

function isIcaoAirportResult(result: SearchResult): boolean {
  return bestAirportCodeFromResult(result) !== null;
}

function faaStationToSearchResult(station: FaaStation): SearchResult {
  const code = station.icaoId || station.faa || "";
  return {
    place_id: `faa-${code}`,
    lat: String(station.lat),
    lon: String(station.lon),
    display_name: `${station.site}, ${station.state}, United States`,
    type: "aerodrome",
    class: "aeroway",
    address: {
      city: station.site,
      state: station.state,
      country_code: "us",
    },
    extratags: {
      icao: station.icaoId || undefined,
      iata: station.iataId || undefined,
      ref: station.faa || station.icaoId || undefined,
    },
  };
}

function parseCoordinates(input: string): { lat: number; lon: number } | null {
  const s = input.trim();

  // DMS: 47-11-44.365 N / 122-1-19.402 W  or  47-11-44 N, 122-1-19 W
  const dmsMatch = s.match(
    /^(\d{1,3})-(\d{1,2})-(\d{1,2}(?:\.\d+)?)\s*([NS])\s*[/,]\s*(\d{1,3})-(\d{1,2})-(\d{1,2}(?:\.\d+)?)\s*([EW])$/i,
  );
  if (dmsMatch) {
    const [, d1, m1, s1, ns, d2, m2, s2, ew] = dmsMatch;
    const lat = (Number(d1) + Number(m1) / 60 + Number(s1) / 3600) * (ns.toUpperCase() === "S" ? -1 : 1);
    const lon = (Number(d2) + Number(m2) / 60 + Number(s2) / 3600) * (ew.toUpperCase() === "W" ? -1 : 1);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) return { lat, lon };
  }

  // Decimal degrees: 47.1957, -122.022  or  47.1957 -122.022
  const decMatch = s.match(/^(-?\d{1,3}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/);
  if (decMatch) {
    const lat = Number(decMatch[1]);
    const lon = Number(decMatch[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) return { lat, lon };
  }

  return null;
}

function normalizeOfficeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(cleaned)) return null;
  return cleaned;
}

function officeCodeFromUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const part = value.split("/").filter(Boolean).pop();
  return normalizeOfficeCode(part ?? null);
}

function toWeatherGovProxyPath(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("https://api.weather.gov/")) {
    const parsed = new URL(pathOrUrl);
    return `/api/weather-gov${parsed.pathname}${parsed.search}`;
  }
  if (pathOrUrl.startsWith("/api/weather-gov/")) return pathOrUrl;
  if (pathOrUrl.startsWith("/")) return `/api/weather-gov${pathOrUrl}`;
  return `/api/weather-gov/${pathOrUrl}`;
}

function resolveLatestProductPath(product: any): string | null {
  const atId = product?.["@id"];
  if (typeof atId === "string" && atId.length > 0) return toWeatherGovProxyPath(atId);
  const id = product?.id;
  if (typeof id === "string" && id.length > 0) return `/api/weather-gov/products/${id}`;
  if (typeof id === "number") return `/api/weather-gov/products/${String(id)}`;
  return null;
}

function officeMatchesProduct(product: any, officeCode: string): boolean {
  const code = officeCode.toUpperCase();
  const issuingOffice = String(product?.issuingOffice ?? product?.office ?? "").toUpperCase();
  const wmo = String(product?.wmoCollectiveId ?? product?.productIdentifier ?? "").toUpperCase();
  return issuingOffice.includes(`/${code}`) || issuingOffice.endsWith(code) || wmo.includes(code);
}

function normalizeMajorStationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toUpperCase();
  if (!/^[KP][A-Z]{3}$/.test(cleaned)) return null;
  return cleaned;
}

function pickNearbyMajorStations(features: any[], currentAirport: string): string[] {
  const current = normalizeMajorStationId(currentAirport);
  const rows = features
    .map((feature) => {
      const id = normalizeMajorStationId(feature?.properties?.stationIdentifier);
      if (!id) return null;
      const name = String(feature?.properties?.name ?? "").toUpperCase();
      const majorHint =
        name.includes("INTERNATIONAL") ||
        name.includes("INTL") ||
        name.includes("REGIONAL") ||
        name.includes("MUNICIPAL") ||
        name.includes("FIELD") ||
        name.includes("AIRPORT");
      let score = 0;
      if (id === current) score += 100;
      if (majorHint) score += 20;
      if (id.startsWith("K")) score += 10;
      return { id, score };
    })
    .filter((row): row is { id: string; score: number } => row !== null);

  rows.sort((a, b) => b.score - a.score);
  const unique: string[] = [];
  for (const row of rows) {
    if (!unique.includes(row.id)) unique.push(row.id);
    if (unique.length >= 2) break;
  }

  if (current && !unique.includes(current)) {
    return [current, ...unique].slice(0, 2);
  }
  return unique;
}

function dedupeByPlaceId(results: SearchResult[]): SearchResult[] {
  const seen = new Set<number | string>();
  const output: SearchResult[] = [];
  for (const result of results) {
    if (seen.has(result.place_id)) continue;
    seen.add(result.place_id);
    output.push(result);
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSavedLocationsFromStorage(value: unknown): SavedLocation[] | null {
  if (!Array.isArray(value)) return null;

  const parsed: SavedLocation[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;

    const { id, name, lat, lon, airport, airportLookupPending } = entry;
    if (typeof id !== "string" || id.trim().length === 0) return null;
    if (typeof name !== "string" || name.trim().length === 0) return null;
    if (typeof lat !== "number" || !Number.isFinite(lat)) return null;
    if (typeof lon !== "number" || !Number.isFinite(lon)) return null;
    if (typeof airport !== "string" || airport.trim().length === 0) return null;

    parsed.push({
      id,
      name,
      lat,
      lon,
      airport,
      airportLookupPending:
        typeof airportLookupPending === "boolean" ? airportLookupPending : undefined,
    });
  }

  return parsed.length > 0 ? parsed : null;
}

function loadInitialLocationsState(): {
  savedLocations: SavedLocation[];
  selectedLocation: SavedLocation;
} {
  if (typeof window === "undefined") {
    return { savedLocations: initialLocations, selectedLocation: initialLocations[0] };
  }

  try {
    const storedLocations = window.localStorage.getItem(SAVED_LOCATIONS_STORAGE_KEY);
    const storedSelectedLocationId = window.localStorage.getItem(
      SELECTED_LOCATION_ID_STORAGE_KEY,
    );
    const parsedLocations = storedLocations
      ? parseSavedLocationsFromStorage(JSON.parse(storedLocations))
      : null;
    const savedLocations = parsedLocations ?? initialLocations;
    const selectedLocation =
      (storedSelectedLocationId
        ? savedLocations.find((location) => location.id === storedSelectedLocationId)
        : null) ?? savedLocations[0];

    return { savedLocations, selectedLocation };
  } catch {
    return { savedLocations: initialLocations, selectedLocation: initialLocations[0] };
  }
}

function distanceMiles(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);
  const a =
    sinHalfLat * sinHalfLat +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * sinHalfLon * sinHalfLon;
  return earthRadiusMiles * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function prioritizeSearchResults(
  results: SearchResult[],
  query: string,
  userCoordinates: UserCoordinates | null,
): SearchResult[] {
  const airportCodeQuery = query.trim().toUpperCase();
  return [...results].sort((a, b) => {
    const aAirport = isAirportLike(a) ? 1 : 0;
    const bAirport = isAirportLike(b) ? 1 : 0;
    if (aAirport !== bAirport) return bAirport - aAirport;

    const aCode =
      a.extratags?.icao?.toUpperCase() ||
      a.extratags?.iata?.toUpperCase() ||
      "";
    const bCode =
      b.extratags?.icao?.toUpperCase() ||
      b.extratags?.iata?.toUpperCase() ||
      "";
    const aCodeMatch = aCode === airportCodeQuery ? 1 : 0;
    const bCodeMatch = bCode === airportCodeQuery ? 1 : 0;
    if (aCodeMatch !== bCodeMatch) return bCodeMatch - aCodeMatch;

    if (userCoordinates) {
      const aLat = Number.parseFloat(a.lat);
      const aLon = Number.parseFloat(a.lon);
      const bLat = Number.parseFloat(b.lat);
      const bLon = Number.parseFloat(b.lon);
      const aValid = Number.isFinite(aLat) && Number.isFinite(aLon);
      const bValid = Number.isFinite(bLat) && Number.isFinite(bLon);
      if (aValid && bValid) {
        const aDistance = distanceMiles(userCoordinates.lat, userCoordinates.lon, aLat, aLon);
        const bDistance = distanceMiles(userCoordinates.lat, userCoordinates.lon, bLat, bLon);
        if (Math.abs(aDistance - bDistance) > 0.5) return aDistance - bDistance;
      }
    }

    return 0;
  });
}

export default function App() {
  const initialLocationsStateRef = useRef<ReturnType<typeof loadInitialLocationsState> | null>(
    null,
  );
  if (initialLocationsStateRef.current === null) {
    initialLocationsStateRef.current = loadInitialLocationsState();
  }
  const initialLocationsState = initialLocationsStateRef.current;

  const [searchQuery, setSearchQuery] = useState("");
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(
    initialLocationsState.savedLocations,
  );
  const [selectedLocation, setSelectedLocation] = useState<SavedLocation>(
    initialLocationsState.selectedLocation,
  );
  const [activeTab, setActiveTab] = useState("overview");
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [isDiscussionPanelOpen, setIsDiscussionPanelOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Search state
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [userCoordinates, setUserCoordinates] = useState<UserCoordinates | null>(null);
  const [isMobileLocationCardsCollapsed, setIsMobileLocationCardsCollapsed] = useState(false);
  const resolvingAirportIdsRef = useRef<Set<string>>(new Set());
  const prefetchKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        SAVED_LOCATIONS_STORAGE_KEY,
        JSON.stringify(savedLocations),
      );
    } catch {
      // Ignore storage failures so the app still works.
    }
  }, [savedLocations]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        SELECTED_LOCATION_ID_STORAGE_KEY,
        selectedLocation.id,
      );
    } catch {
      // Ignore storage failures so the app still works.
    }
  }, [selectedLocation.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) return;

    const storageKey = "weather_griff_user_location_prompted_v1";
    if (window.localStorage.getItem(storageKey) === "1") return;
    window.localStorage.setItem(storageKey, "1");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoordinates({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => {},
      {
        enableHighAccuracy: false,
        timeout: 6000,
        maximumAge: 30 * 60 * 1000,
      },
    );
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Perform search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 3) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;

    const searchLocations = async () => {
      setIsSearching(true);
      try {
        const query = debouncedQuery.trim();

        // Handle coordinate input first (DMS or decimal degrees)
        const parsedCoords = parseCoordinates(query);
        if (parsedCoords) {
          const syntheticResult: SearchResult = {
            place_id: `coords-${parsedCoords.lat.toFixed(6)}-${parsedCoords.lon.toFixed(6)}`,
            lat: String(parsedCoords.lat),
            lon: String(parsedCoords.lon),
            display_name: `${parsedCoords.lat.toFixed(4)}°N, ${Math.abs(parsedCoords.lon).toFixed(4)}°${parsedCoords.lon < 0 ? "W" : "E"}`,
            type: "coordinates",
            class: "place",
            address: { country_code: "us" },
            extratags: { ref: "ARPT" },
          };
          if (!cancelled) {
            setSearchResults([syntheticResult]);
            setIsSearching(false);
          }
          return;
        }

        const normalizedCodeQuery = query.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const looksLikeAirportCode = /^[A-Z0-9]{3,4}$/.test(normalizedCodeQuery);
        const looksLikeFaaId = /^[A-Z0-9]{2,6}$/.test(normalizedCodeQuery) && /[A-Z]/.test(normalizedCodeQuery);
        const looksLikeWaLocalId = /^WA\d/.test(normalizedCodeQuery);
        const proxyParams = new URLSearchParams({
          q: query,
          limit: "8",
          format: "json",
          addressdetails: "1",
          extratags: "1",
          countrycodes: "us",
        });
        if (userCoordinates) {
          const left = (userCoordinates.lon - 4).toFixed(4);
          const right = (userCoordinates.lon + 4).toFixed(4);
          const top = (userCoordinates.lat + 3).toFixed(4);
          const bottom = (userCoordinates.lat - 3).toFixed(4);
          proxyParams.set("viewbox", `${left},${top},${right},${bottom}`);
        }

        // Run Nominatim and FAA stationinfo lookups in parallel
        const [proxyData, faaStationData] = await Promise.all([
          fetchJsonWithTimeout<SearchResult[]>(`/api/position/search?${proxyParams.toString()}`, 1800),
          looksLikeFaaId
            ? fetchJsonWithTimeout<FaaStation[]>(
                `/api/aviationweather?type=stationinfo&ids=${encodeURIComponent(normalizedCodeQuery)}&format=json`,
                2000,
              ).catch(() => null)
            : Promise.resolve(null),
        ]);

        const faaResults = (faaStationData ?? []).filter((s) => s.country === "US").map(faaStationToSearchResult);
        const usProxyResults = (proxyData ?? []).filter(isUSResult);
        const airportProxyResults = usProxyResults.filter(isIcaoAirportResult);

        // FAA stationinfo results are authoritative — merge them first
        const combinedAirportResults = dedupeByPlaceId([...faaResults, ...airportProxyResults]);
        if (combinedAirportResults.length > 0) {
          if (!cancelled) {
            setSearchResults(prioritizeSearchResults(combinedAirportResults, query, userCoordinates));
          }
          return;
        }

        // For Washington local identifiers (WA##), fall back to full FAA airport database
        // which includes private strips not in the weather station index
        if (looksLikeWaLocalId && faaResults.length === 0) {
          const aviationApiData = await fetchJsonWithTimeout<Record<string, AviationApiAirport[]>>(
            `/api/airport/lookup?id=${encodeURIComponent(normalizedCodeQuery)}`,
            2500,
          ).catch(() => null);
          const aptList: AviationApiAirport[] = aviationApiData
            ? Object.values(aviationApiData).flat()
            : [];
          const waAptResults: SearchResult[] = aptList
            .filter((a) => a.country === "US" && a.state === "Washington")
            .map((a) => ({
              place_id: `apt-${a.icao}`,
              lat: String(a.lat),
              lon: String(a.lng),
              display_name: [a.name, a.city, "WA"].filter(Boolean).join(", "),
              type: "aerodrome",
              class: "aeroway",
              address: { state: "Washington", country_code: "us" },
              extratags: { ref: a.icao },
            }));
          if (waAptResults.length > 0 && !cancelled) {
            setSearchResults(prioritizeSearchResults(waAptResults, query, userCoordinates));
            return;
          }
        }

        const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
        geoUrl.searchParams.set("name", query);
        geoUrl.searchParams.set("count", "8");
        geoUrl.searchParams.set("language", "en");
        geoUrl.searchParams.set("format", "json");
        geoUrl.searchParams.set("countryCode", "US");

        const [directNominatim, geoJson] = await Promise.all([
          fetchJsonWithTimeout<SearchResult[]>(
            `https://nominatim.openstreetmap.org/search?${proxyParams.toString()}`,
            1800,
          ),
          fetchJsonWithTimeout<{ results?: OpenMeteoGeocodingResult[] }>(geoUrl.toString(), 2200),
        ]);

        const usDirectResults = (directNominatim ?? []).filter(isUSResult);
        const airportDirectResults = usDirectResults.filter(isIcaoAirportResult);
        if (airportDirectResults.length > 0) {
          if (!cancelled) {
            setSearchResults(
              prioritizeSearchResults(dedupeByPlaceId(airportDirectResults), query, userCoordinates),
            );
          }
          return;
        }

        // For Nominatim aerodrome results lacking a known airport code, try bbox stationinfo
        const aerodromeNoCode = usDirectResults.filter(
          (r) => (r.class === "aeroway" || r.type === "aerodrome") && !bestAirportCodeFromResult(r),
        );
        if (aerodromeNoCode.length > 0) {
          const r = aerodromeNoCode[0];
          const rLat = parseFloat(r.lat);
          const rLon = parseFloat(r.lon);
          const bbox = `${(rLat - 0.5).toFixed(3)},${(rLat + 0.5).toFixed(3)},${(rLon - 0.5).toFixed(3)},${(rLon + 0.5).toFixed(3)}`;
          const nearbyStations = await fetchJsonWithTimeout<FaaStation[]>(
            `/api/aviationweather?type=stationinfo&bbox=${encodeURIComponent(bbox)}&format=json`,
            2000,
          ).catch(() => null);
          const nearbyStationsUs = (nearbyStations ?? []).filter((s) => s.country === "US");
          // Prefer ICAO K-codes, then any airport-style code — skip CWOP weather stations
          const airportStation = nearbyStationsUs.find((s) => {
            const code = s.icaoId || s.faa || s.iataId || "";
            return isAirportStyleCode(code);
          });
          if (airportStation && !cancelled) {
            // Enrich the original aerodrome result with the nearest airport station's code
            // so the display name ("Enumclaw Airport") is preserved with the code badge
            const resolvedCode = airportStation.icaoId || airportStation.faa || airportStation.iataId;
            const enriched: SearchResult = {
              ...r,
              extratags: {
                ...r.extratags,
                ...(airportStation.icaoId ? { icao: airportStation.icaoId } : {}),
                ref: resolvedCode || r.extratags?.ref,
              },
            };
            setSearchResults(prioritizeSearchResults([enriched], query, userCoordinates));
            return;
          }
        }

        // Fall back to generic location results from Nominatim or the proxy
        const allGenericResults = dedupeByPlaceId([...usDirectResults, ...usProxyResults]);
        if (allGenericResults.length > 0) {
          if (!cancelled) {
            setSearchResults(prioritizeSearchResults(allGenericResults, query, userCoordinates));
          }
          return;
        }

        // Last resort: Open-Meteo geocoding results
        const results = geoJson?.results ?? [];
        const mapped: SearchResult[] = results
          .filter((r) => (r.country_code ?? "").toUpperCase() === "US")
          .map((r) => ({
            place_id: r.id,
            lat: String(r.latitude),
            lon: String(r.longitude),
            display_name: [r.name, r.admin1, r.country_code].filter(Boolean).join(", "),
            type: "place",
            class: "place",
            address: {
              city: r.name,
              state: r.admin1,
              country_code: r.country_code?.toLowerCase(),
            },
            extratags: looksLikeAirportCode
              ? normalizedCodeQuery.length === 4
                ? { icao: normalizedCodeQuery }
                : { iata: normalizedCodeQuery, icao: `K${normalizedCodeQuery}` }
              : {},
          }));

        if (!cancelled) {
          setSearchResults(prioritizeSearchResults(dedupeByPlaceId(mapped), query, userCoordinates));
        }
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    };

    searchLocations();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, userCoordinates]);

  const createLocationFromResult = (result: SearchResult, preferredAirportCode?: string | null) => {
    // Coordinate input: set placeholder airport and let the resolution effect find the nearest station
    if (result.type === "coordinates") {
      return {
        id: String(result.place_id),
        name: result.display_name,
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        airport: "ARPT",
        airportLookupPending: true,
      };
    }

    const resolvedAirportCode = bestAirportCodeFromResult(result);
    const preferred = airportCodeFromUserSearch(preferredAirportCode, result);
    // Accept both ICAO (4 letters) and FAA identifiers (alphanumeric, e.g. WA77)
    const normalizedPreferred = preferred ? normalizeFaaCode(preferred) : null;
    const airportCode = normalizedPreferred || resolvedAirportCode;

    // Airport/aerodrome results with no code yet: save with pending lookup so the
    // nearest-station effect resolves it from coordinates
    const isAerodromeResult = result.class === "aeroway" || result.type === "aerodrome";
    if (!airportCode && !isAerodromeResult) return null;

    let locationName = result.display_name.split(',')[0];
    const address = result.address;

    if (address) {
      const city = address.city || address.town || address.village;
      const state = address.state;

      if (city && state) {
        const stateAbbrev = state.split(' ').map(word => word.substring(0, 2).toUpperCase()).join('');
        locationName = `${city}, ${stateAbbrev}`;
      } else if (locationName && state) {
        const stateAbbrev = state.split(' ').map(word => word.substring(0, 2).toUpperCase()).join('');
        locationName = `${locationName}, ${stateAbbrev}`;
      }
    }

    return {
      id: String(result.place_id),
      name: locationName,
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      airport: airportCode ?? "ARPT",
      airportLookupPending: !airportCode,
    };
  };

  const isLocationSaved = (result: SearchResult) => {
    return savedLocations.some(loc => loc.id === String(result.place_id));
  };

  const handleSelectLocation = (result: SearchResult) => {
    const nextLocation = createLocationFromResult(result, searchQuery);
    if (!nextLocation) return;

    setSavedLocations((prev) => {
      const existing = prev.find((loc) => loc.id === nextLocation.id);
      if (!existing) return [...prev, nextLocation];

      const shouldPromoteAirportCode =
        isPlaceholderAirportCode(existing.airport) && !isPlaceholderAirportCode(nextLocation.airport);
      if (!shouldPromoteAirportCode) return prev;

      return prev.map((loc) =>
        loc.id === nextLocation.id
          ? { ...loc, airport: nextLocation.airport, airportLookupPending: nextLocation.airportLookupPending }
          : loc,
      );
    });

    setSelectedLocation((prev) => {
      if (prev.id !== nextLocation.id) return nextLocation;
      if (isPlaceholderAirportCode(prev.airport) && !isPlaceholderAirportCode(nextLocation.airport)) {
        return { ...prev, airport: nextLocation.airport, airportLookupPending: nextLocation.airportLookupPending };
      }
      return nextLocation;
    });
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleSaveLocation = (result: SearchResult, e: React.MouseEvent) => {
    e.stopPropagation();
    const newLocation = createLocationFromResult(result, searchQuery);
    if (!newLocation) return;

    setSavedLocations((prev) => {
      if (!prev.find((loc) => loc.id === newLocation.id)) {
        return [...prev, newLocation];
      }
      return prev;
    });
  };

  const handleDeleteLocation = (locationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSavedLocations = savedLocations.filter(loc => loc.id !== locationId);
    if (newSavedLocations.length === 0) {
      setSavedLocations(initialLocations);
      setSelectedLocation(initialLocations[0]);
      return;
    }

    setSavedLocations(newSavedLocations);
    if (selectedLocation.id === locationId) {
      setSelectedLocation(newSavedLocations[0]);
    }
  };

  const getAirportCode = (result: SearchResult, preferredAirportCode?: string | null) => {
    const preferred = airportCodeFromUserSearch(preferredAirportCode, result);
    if (preferred && normalizeFaaCode(preferred)) return preferred;
    const resolved = bestAirportCodeFromResult(result);
    if (resolved) return resolved;
    return null;
  };

  useEffect(() => {
    const pending = savedLocations.filter(
      (location) =>
        location.airportLookupPending &&
        isPlaceholderAirportCode(location.airport) &&
        !resolvingAirportIdsRef.current.has(location.id),
    );

    if (pending.length === 0) return;

    let cancelled = false;

    const resolveAirportCodes = async () => {
      for (const location of pending) {
        if (cancelled) break;
        resolvingAirportIdsRef.current.add(location.id);

        try {
          const stationData = await weatherGovFetch<{
            features?: Array<{
              properties?: { stationIdentifier?: string };
            }>;
          }>(`/api/weather-gov/points/${location.lat.toFixed(4)},${location.lon.toFixed(4)}/stations`, 10 * 60_000);

          const features: Array<{ properties?: { stationIdentifier?: string } }> =
            stationData?.features ?? [];
          // Prefer the nearest K/P ICAO code; skip CWOP personal weather stations
          const resolvedCode =
            features
              .map((f) => normalizeAirportCode(f?.properties?.stationIdentifier))
              .filter((c): c is string => c !== null && isAirportStyleCode(c))[0] ?? null;

          if (!cancelled) {
            setSavedLocations((prev) =>
              prev.map((loc) =>
                loc.id === location.id
                  ? {
                      ...loc,
                      airport: resolvedCode ?? loc.airport,
                      airportLookupPending: false,
                    }
                  : loc,
              ),
            );

            setSelectedLocation((prev) => {
              if (prev.id !== location.id) return prev;
              return {
                ...prev,
                airport: resolvedCode ?? prev.airport,
                airportLookupPending: false,
              };
            });
          }
        } finally {
          resolvingAirportIdsRef.current.delete(location.id);
        }
      }
    };

    resolveAirportCodes();

    return () => {
      cancelled = true;
    };
  }, [savedLocations]);

  useEffect(() => {
    const prefetchKey = `${selectedLocation.lat.toFixed(3)},${selectedLocation.lon.toFixed(3)}:${Math.floor(Date.now() / 600000)}`;
    if (prefetchKeysRef.current.has(prefetchKey)) return;
    prefetchKeysRef.current.add(prefetchKey);

    let cancelled = false;
    let cancelIdlePrefetch: (() => void) | null = null;

    const scheduleIdle = (task: () => void): (() => void) => {
      if (typeof window === "undefined") {
        task();
        return () => undefined;
      }
      const withIdle = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
        cancelIdleCallback?: (handle: number) => void;
      };
      if (typeof withIdle.requestIdleCallback === "function") {
        const handle = withIdle.requestIdleCallback(() => task(), { timeout: 1200 });
        return () => {
          if (typeof withIdle.cancelIdleCallback === "function") {
            withIdle.cancelIdleCallback(handle);
          }
        };
      }
      const timeout = window.setTimeout(task, 250);
      return () => window.clearTimeout(timeout);
    };

    const prefetchRegionalData = async () => {
      const pointsPath = `/api/weather-gov/points/${selectedLocation.lat.toFixed(4)},${selectedLocation.lon.toFixed(4)}`;
      const stationsPath = `${pointsPath}/stations`;

      const [points, stations] = await Promise.all([
        weatherGovFetch<any>(pointsPath, 5 * 60_000).catch(() => null),
        weatherGovFetch<any>(stationsPath, 10 * 60_000).catch(() => null),
      ]);

      if (cancelled) return;

      const officeCode =
        normalizeOfficeCode(points?.properties?.gridId) ||
        officeCodeFromUrl(points?.properties?.forecastOffice);

      const stationFeatures: any[] = Array.isArray(stations?.features) ? stations.features : [];
      const stationIds = pickNearbyMajorStations(stationFeatures, selectedLocation.airport);

      const primaryStation = stationIds[0];
      if (primaryStation) {
        await Promise.all([
          weatherGovFetch(`/api/weather-gov/stations/${primaryStation}/observations/latest`, 3 * 60_000).catch(() => null),
          cachedFetch(`/api/aviationweather?type=metar&ids=${encodeURIComponent(primaryStation)}&format=json`, undefined, 3 * 60_000).catch(() => null),
        ]);
      }

      if (cancelled) return;

      cancelIdlePrefetch = scheduleIdle(async () => {
        if (cancelled) return;

        const secondaryStationIds = stationIds.slice(1, 2);
        for (const stationId of secondaryStationIds) {
          if (cancelled) return;
          await Promise.all([
            cachedFetch(`/api/aviationweather?type=metar&ids=${encodeURIComponent(stationId)}&format=json`, undefined, 3 * 60_000).catch(() => null),
            cachedFetch(`/api/aviationweather?type=taf&ids=${encodeURIComponent(stationId)}&format=json`, undefined, 5 * 60_000).catch(() => null),
          ]);
        }

        if (!officeCode || cancelled) return;
        let products: any[] = [];
        const list = await weatherGovFetch<any>(`/api/weather-gov/products/types/AFD/locations/${officeCode}`, 45_000).catch(() => null);
        products = Array.isArray(list?.["@graph"]) ? list["@graph"] : [];
        if (products.length === 0) {
          const fallback = await weatherGovFetch<any>("/api/weather-gov/products/types/AFD", 45_000).catch(() => null);
          const fallbackProducts: any[] = Array.isArray(fallback?.["@graph"]) ? fallback["@graph"] : [];
          products = fallbackProducts.filter((item) => officeMatchesProduct(item, officeCode));
        }
        if (products.length === 0 || cancelled) return;

        products.sort((a, b) => {
          const aTs = Date.parse(a?.issuanceTime ?? "");
          const bTs = Date.parse(b?.issuanceTime ?? "");
          const aValue = Number.isFinite(aTs) ? aTs : 0;
          const bValue = Number.isFinite(bTs) ? bTs : 0;
          return bValue - aValue;
        });

        const latestProductPath = resolveLatestProductPath(products[0]);
        if (!latestProductPath || cancelled) return;
        await weatherGovFetch(latestProductPath, 60_000).catch(() => null);
      });
    };

    prefetchRegionalData();

    return () => {
      cancelled = true;
      if (cancelIdlePrefetch) cancelIdlePrefetch();
    };
  }, [selectedLocation.lat, selectedLocation.lon, selectedLocation.airport]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateCompactState = () => {
      const next = window.matchMedia("(max-width: 767px)").matches;
      setIsMobileLocationCardsCollapsed((prev) => (prev === next ? prev : next));
    };

    updateCompactState();
    window.addEventListener("resize", updateCompactState);
    return () => {
      window.removeEventListener("resize", updateCompactState);
    };
  }, [activeTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setIsAIPanelOpen(false);
    setIsDiscussionPanelOpen(false);
  };

  return (
    <ProfileProvider>
    <div className="flex min-h-screen flex-col bg-[#081320] pb-16 sm:pb-0 lg:h-[100dvh] lg:min-h-[100dvh] lg:overflow-hidden">
      {/* Navigation Drawer */}
      <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <SheetContent side="left" className="w-64 p-0 flex flex-col bg-[#0c1929] border-r border-slate-700/60 [&>button]:text-slate-400 [&>button]:hover:text-white [&>button]:hover:bg-slate-700/50">
          <SheetHeader className="px-5 py-5 border-b border-slate-700/60">
            <SheetTitle className="text-sm font-semibold tracking-widest uppercase text-slate-400 letter-spacing-wider">Navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Move between the weather workspace, reports, planning tools, and settings.
            </SheetDescription>
          </SheetHeader>
          <nav className="flex-1 py-2 overflow-y-auto">
            {workspaceTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.value;
              return (
                <SheetClose asChild key={tab.value}>
                  <button
                    onClick={() => handleTabChange(tab.value)}
                    className={`w-full flex items-center gap-3.5 px-5 py-3 text-sm font-medium transition-all duration-150 relative ${
                      isActive
                        ? "text-white bg-sky-500/15"
                        : "text-slate-400 hover:text-white hover:bg-slate-700/40"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-sky-400 rounded-r-full" />
                    )}
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-sky-400" : "text-slate-500"}`} />
                    {tab.label}
                  </button>
                </SheetClose>
              );
            })}
          </nav>
          <div className="border-t border-slate-700/60 py-2">
            <SheetClose asChild>
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  setTimeout(() => setIsDiscussionPanelOpen(true), 150);
                }}
                className="w-full flex items-center gap-3.5 px-5 py-3 text-sm font-medium transition-all duration-150 text-slate-400 hover:text-white hover:bg-slate-700/40"
              >
                <FileText className="w-4 h-4 flex-shrink-0 text-slate-500" />
                Area Forecast Discussion
              </button>
            </SheetClose>
            <SheetClose asChild>
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  setTimeout(() => setIsAIPanelOpen(true), 150);
                }}
                className="w-full flex items-center gap-3.5 px-5 py-3 text-sm font-medium transition-all duration-150 text-slate-400 hover:text-white hover:bg-slate-700/40"
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0 text-slate-500" />
                Chat with AI
              </button>
            </SheetClose>
          </div>
          <div className="border-t border-slate-700/60 py-2">
            <SheetClose asChild>
              <button
                onClick={() => handleTabChange("settings")}
                className={`w-full flex items-center gap-3.5 px-5 py-3 text-sm font-medium transition-all duration-150 relative ${
                  activeTab === "settings"
                    ? "text-white bg-sky-500/15"
                    : "text-slate-400 hover:text-white hover:bg-slate-700/40"
                }`}
              >
                {activeTab === "settings" && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-sky-400 rounded-r-full" />
                )}
                <Settings className={`w-4 h-4 flex-shrink-0 ${activeTab === "settings" ? "text-sky-400" : "text-slate-500"}`} />
                Settings
              </button>
            </SheetClose>
          </div>
          <div className="px-4 pb-5 pt-2 border-t border-slate-700/60">
            <SheetClose asChild>
              <button
                className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold transition-all duration-150 shadow-lg shadow-sky-900/30"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col gap-0">
        {/* Top Navigation */}
        <div className="relative z-50 border-b border-white/8 bg-[linear-gradient(180deg,rgba(12,25,41,0.98),rgba(10,22,38,0.94))] px-3 py-3 shadow-lg shadow-slate-950/20 sm:px-6 sm:py-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden lg:flex min-w-[10rem] flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-sky-300/70">Griff Weather</span>
                <span className="text-sm font-semibold text-white">Flight Briefing Workspace</span>
              </div>

              {/* Search Bar */}
              <div className="relative z-[100] min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search airport or city"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-2xl border-slate-600/60 bg-slate-800/50 pl-9 text-sm text-white placeholder:text-slate-400 transition-all focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/30"
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  </div>
                )}

                {/* Search Results Dropdown */}
                {(searchResults.length > 0 || (searchQuery.length >= 3 && !isSearching && searchResults.length === 0)) && (
                  <div className="absolute left-0 top-full z-[200] mt-2 max-h-[22rem] overflow-y-auto rounded-2xl border border-white/10 bg-[#0f2237] shadow-2xl w-[min(24rem,calc(100vw-1.5rem))] sm:w-[min(28rem,calc(100vw-3rem))] lg:w-full lg:max-w-none">
                    {searchResults.length > 0 ? (
                      searchResults.map(result => {
                        const code = getAirportCode(result, searchQuery);
                        const isSaved = isLocationSaved(result);

                        return (
                          <div
                            key={result.place_id}
                            onClick={() => handleSelectLocation(result)}
                            className="group flex cursor-pointer items-start gap-3 border-b border-white/8 px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-white/5"
                          >
                            {isAirportLike(result) ? (
                              <Plane className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-400" />
                            ) : (
                              <Search className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 truncate font-medium text-white">
                                {code && code !== "ARPT" && (
                                  <span className="rounded bg-sky-400/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-sky-300 font-mono">
                                    {code}
                                  </span>
                                )}
                                <span className={isAirportLike(result) ? "font-semibold" : ""}>
                                  {result.display_name.split(',')[0]}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-xs leading-snug text-slate-400">
                                {result.display_name.split(',').slice(1).join(',')}
                              </div>
                            </div>

                            <div className="flex-shrink-0">
                              {isSaved ? (
                                <div className="flex items-center gap-1.5 rounded-md bg-emerald-900/40 px-2 py-1 text-emerald-400">
                                  <BookmarkCheck className="h-3.5 w-3.5" />
                                  <span className="text-[10px] font-semibold">Saved</span>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => handleSaveLocation(result, e)}
                                  className="flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-slate-400 transition-colors hover:bg-sky-400/20 hover:text-sky-300"
                                >
                                  <Bookmark className="h-3.5 w-3.5" />
                                  <span className="text-[10px] font-semibold">Save</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center text-sm text-slate-400">
                        No locations found
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex h-10 items-center gap-1.5 rounded-2xl border border-slate-600/50 bg-slate-800/40 px-2.5 sm:px-3">
                  <Plane className="h-3.5 w-3.5 flex-shrink-0 text-sky-400" />
                  <span className="max-w-[92px] truncate text-xs font-semibold text-white sm:max-w-[120px]">
                    {selectedLocation.airport}
                  </span>
                  <span className="hidden truncate text-[10px] text-slate-400 lg:inline max-w-[120px]">
                    {selectedLocation.name}
                  </span>
                </div>
              </div>
            </div>

            <div className="hidden items-center gap-3 sm:flex">
              <TabsList className="h-auto flex-1 justify-start overflow-x-auto rounded-2xl border border-white/8 bg-[#0f2237]/70 p-1 text-slate-300 shadow-inner shadow-slate-950/30">
                {workspaceTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="h-9 flex-none gap-2 rounded-xl border-0 px-3 text-xs font-semibold text-slate-300 data-[state=active]:bg-sky-400/15 data-[state=active]:text-white data-[state=active]:shadow-none"
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`rounded-xl border px-3 text-xs font-semibold ${
                    isDiscussionPanelOpen
                      ? "border-sky-400/30 bg-sky-400/12 text-white"
                      : "border-white/8 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => {
                    setIsDiscussionPanelOpen((prev) => !prev);
                    setIsAIPanelOpen(false);
                  }}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Discussion
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`rounded-xl border px-3 text-xs font-semibold ${
                    isAIPanelOpen
                      ? "border-sky-400/30 bg-sky-400/12 text-white"
                      : "border-white/8 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => {
                    setIsAIPanelOpen((prev) => !prev);
                    setIsDiscussionPanelOpen(false);
                  }}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  AI
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`rounded-xl border px-3 text-xs font-semibold ${
                    activeTab === "settings"
                      ? "border-sky-400/30 bg-sky-400/12 text-white"
                      : "border-white/8 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => handleTabChange("settings")}
                >
                  <Settings className="w-3.5 h-3.5" />
                  Settings
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Saved Locations Weather Widget Cards */}
        <SavedLocationWidget
          locations={savedLocations}
          selectedLocation={selectedLocation}
          onSelectLocation={setSelectedLocation}
          onDeleteLocation={handleDeleteLocation}
          compactOnMobile={isMobileLocationCardsCollapsed}
        />

        {/* Tab Content */}
        <WeatherProvider lat={selectedLocation.lat} lon={selectedLocation.lon}>
        <div className="flex-1 min-h-0 bg-[#081320] lg:overflow-y-auto">
          <TabsContent value="overview" className="m-0 h-full focus-visible:ring-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200">
            <div className="w-full h-full p-2 sm:p-3">
              <CurrentWeather
                location={selectedLocation}
              />
            </div>
          </TabsContent>

          <TabsContent value="wind-aloft" className="m-0 h-full focus-visible:ring-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200">
            <div className="w-full p-4 sm:p-8 max-w-7xl mx-auto">
              <WindDataTable location={selectedLocation} />
            </div>
          </TabsContent>

          <TabsContent value="discussion" className="m-0 h-full focus-visible:ring-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200">
            <div className="w-full p-4 sm:p-8 max-w-7xl mx-auto">
              <WeatherDiscussion location={selectedLocation} />
            </div>
          </TabsContent>

          <TabsContent value="airports" className="m-0 h-full focus-visible:ring-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200">
            <div className="w-full p-4 sm:p-8 max-w-7xl mx-auto">
              <AirportReports location={selectedLocation} />
            </div>
          </TabsContent>

          <TabsContent value="forecast" className="m-0 h-full focus-visible:ring-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200">
            <div className="w-full">
              <AviationForecastInfographic location={selectedLocation} />
            </div>
          </TabsContent>

          <TabsContent value="outlook" className="m-0 h-full focus-visible:ring-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200">
            <div className="w-full p-4 sm:p-8 max-w-7xl mx-auto">
              <SevenDayOutlook location={selectedLocation} />
            </div>
          </TabsContent>

          <TabsContent value="map" className="m-0 h-full focus-visible:ring-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200">
            <div className="w-full h-full">
              <MapView location={selectedLocation} />
            </div>
          </TabsContent>

          <TabsContent value="flight" className="m-0 h-full focus-visible:ring-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200">
            <div className="w-full p-4 sm:p-8 max-w-7xl mx-auto">
              <FlightPlanning location={selectedLocation} />
            </div>
          </TabsContent>

          <TabsContent value="settings" className="m-0 h-full focus-visible:ring-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200">
            <div className="w-full p-4 sm:p-8 max-w-7xl mx-auto">
              <SettingsPanel location={selectedLocation} />
            </div>
          </TabsContent>
        </div>
        </WeatherProvider>
      </Tabs>

      {/* AI Assistant Panel */}
      <AIAssistantPanel
        location={selectedLocation}
        isOpen={isAIPanelOpen}
        onClose={() => setIsAIPanelOpen(false)}
      />

      {/* Discussion Slide-up Panel */}
      {isDiscussionPanelOpen && (
        <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-labelledby="discussion-panel-title" onKeyDown={(e) => { if (e.key === "Escape") setIsDiscussionPanelOpen(false); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsDiscussionPanelOpen(false)} />
          <div className="absolute bottom-16 left-0 right-0 max-h-[75vh] bg-[#0c1e32] border border-white/10 rounded-t-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-200 sm:bottom-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0f2237] flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" />
                <h3 id="discussion-panel-title" className="text-sm font-semibold text-white">Area Forecast Discussion</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
                onClick={() => setIsDiscussionPanelOpen(false)}
                aria-label="Close discussion"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <WeatherDiscussion location={selectedLocation} />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-[150] sm:hidden bg-[#0a1628] border-t border-white/10 shadow-2xl" aria-label="Primary navigation">
        <div className="flex items-stretch h-16" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {([
            { value: "overview", label: "Home", icon: SlidersHorizontal },
            { value: "wind-aloft", label: "Winds", icon: Wind },
            { value: "forecast", label: "Forecast", icon: Calendar },
            { value: "map", label: "Map", icon: Map },
          ] as const).map(({ value, label, icon: Icon }) => {
            const isActive = activeTab === value;
            return (
              <button
                key={value}
                onClick={() => handleTabChange(value)}
                className={`flex-1 flex flex-col items-center justify-center gap-1 relative transition-all duration-150 active:scale-95 touch-manipulation ${
                  isActive ? "text-sky-400" : "text-slate-500 hover:text-slate-300"
                }`}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-sky-400" />
                )}
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </button>
            );
          })}
          <button
            onClick={() => setIsMenuOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-150 active:scale-95 touch-manipulation text-slate-500 hover:text-slate-300"
            aria-label="More navigation options"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </div>
      </nav>
    </div>
    </ProfileProvider>
  );
}
