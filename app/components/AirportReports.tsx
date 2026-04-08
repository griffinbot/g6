import { Plane, MapPin, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import {
  useNearbyStations,
  useMetar,
  useTaf,
  kmhToKnots,
  metersToSM,
  paToInHg,
  cToF,
  formatCloudLayer,
  parseTafPeriods,
} from "../hooks/useAviationWeather";
import { isIcaoCode } from "../utils/airportUtils";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

interface Location {
  name: string;
  airport: string;
  lat: number;
  lon: number;
}

interface AirportReportsProps {
  location: Location;
}

function normalizeStationId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,6}$/.test(normalized)) return null;
  return normalized;
}

// ─── METAR display ──────────────────────────────────────────────────
function MetarDisplay({ stationId }: { stationId: string }) {
  const { data: metar, loading, error, refetch } = useMetar(stationId);

  if (loading && !metar) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center">
        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        <span className="text-sm text-slate-400">Fetching METAR…</span>
      </div>
    );
  }

  if ((error && !metar) || !metar) {
    return (
      <div className="py-6 text-center space-y-3">
        <div className="flex items-center justify-center gap-2 text-amber-400">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-medium">
            {error ?? "No METAR data available"}
          </span>
        </div>
        <button
          onClick={refetch}
          className="text-sm text-blue-500 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const windKt = kmhToKnots(metar.windSpeed_kmh);
  const gustKt = kmhToKnots(metar.windGust_kmh);
  const visSM = metersToSM(metar.visibility_m);
  const altimeter = paToInHg(metar.barometricPressure_Pa);
  const tempF = cToF(metar.temperature_C);
  const dewF = cToF(metar.dewpoint_C);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h4 className="font-semibold text-lg">{stationId} — METAR</h4>
        <div className="flex items-center gap-3 sm:self-auto">
          <span className="text-sm text-slate-400">
            {metar.timestamp
              ? new Date(metar.timestamp).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZoneName: "short",
                })
              : ""}
          </span>
          <button
            onClick={refetch}
            className="text-gray-400 hover:text-blue-500"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-amber-400">
          Showing last successful report while refresh retries.
        </div>
      )}

      {/* Raw METAR */}
      <div className="bg-gray-900 text-green-400 p-6 rounded-xl font-mono text-sm leading-relaxed overflow-x-auto">
        {metar.raw || "Raw METAR not available"}
      </div>

      {/* Decoded */}
      <div className="bg-sky-900/20 p-4 rounded-xl border border-sky-700/30">
        <h5 className="font-semibold text-sm mb-3 text-sky-300">
          Decoded Information
        </h5>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-sky-400">Wind: </span>
            <span className="font-medium">
              {metar.windDirection != null ? `${metar.windDirection}°` : "VRB"}{" "}
              at {windKt ?? "—"} kt
              {gustKt != null ? `, gusts ${gustKt} kt` : ""}
            </span>
          </div>
          <div>
            <span className="text-sky-400">Visibility: </span>
            <span className="font-medium">{visSM} SM</span>
          </div>
          <div>
            <span className="text-sky-400">Clouds: </span>
            <span className="font-medium">
              {metar.cloudLayers.length > 0
                ? metar.cloudLayers.map(formatCloudLayer).join(", ")
                : "CLR"}
            </span>
          </div>
          <div>
            <span className="text-sky-400">Temperature: </span>
            <span className="font-medium">
              {metar.temperature_C != null
                ? `${metar.temperature_C}°C (${tempF}°F)`
                : "—"}
            </span>
          </div>
          <div>
            <span className="text-sky-400">Dew Point: </span>
            <span className="font-medium">
              {metar.dewpoint_C != null
                ? `${metar.dewpoint_C}°C (${dewF}°F)`
                : "—"}
            </span>
          </div>
          <div>
            <span className="text-sky-400">Altimeter: </span>
            <span className="font-medium">{altimeter} inHg</span>
          </div>
          <div>
            <span className="text-sky-400">Humidity: </span>
            <span className="font-medium">
              {metar.relativeHumidity != null
                ? `${Math.round(metar.relativeHumidity)}%`
                : "—"}
            </span>
          </div>
          <div>
            <span className="text-sky-400">Conditions: </span>
            <span className="font-medium">{metar.description || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAF display ────────────────────────────────────────────────────
function TafDisplay({ stationId }: { stationId: string }) {
  const { data: taf, loading, error, refetch } = useTaf(stationId);

  if (loading && !taf) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center">
        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        <span className="text-sm text-slate-400">Fetching TAF…</span>
      </div>
    );
  }

  if ((error && !taf) || !taf) {
    return (
      <div className="py-6 text-center space-y-3">
        <div className="flex items-center justify-center gap-2 text-amber-400">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-medium">
            {error ?? "No TAF data available for this station"}
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Not all stations issue Terminal Aerodrome Forecasts.
        </p>
        <button
          onClick={refetch}
          className="text-sm text-blue-500 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const parsed = parseTafPeriods(taf.raw);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h4 className="font-semibold text-lg">{stationId} — TAF</h4>
        <div className="flex items-center gap-3 sm:self-auto">
          <span className="text-sm text-slate-400">
            {taf.issuanceTime
              ? `Issued ${new Date(taf.issuanceTime).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}`
              : ""}
          </span>
          <button
            onClick={refetch}
            className="text-gray-400 hover:text-blue-500"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-amber-400">
          Showing last successful report while refresh retries.
        </div>
      )}

      {/* Raw TAF */}
      <div className="bg-gray-900 text-green-400 p-6 rounded-xl font-mono text-sm leading-relaxed overflow-x-auto whitespace-pre-wrap">
        {taf.raw}
      </div>

      {/* Decoded TAF periods */}
      {parsed.periods.length > 0 && (
        <div className="bg-sky-900/20 p-4 rounded-xl border border-sky-700/30">
          <h5 className="font-semibold text-sm mb-3 text-sky-300">
            Forecast Periods
          </h5>
          {parsed.header && (
            <div className="mb-3 text-sm text-slate-300 font-mono bg-white/5 p-2 rounded">
              {parsed.header}
            </div>
          )}
          <div className="space-y-3 text-sm">
            {parsed.periods.map((period, idx) => (
              <div key={idx} className="border-l-4 border-sky-500/60 pl-3">
                <div className="font-medium text-sky-300">{period.label}</div>
                <div className="text-slate-300 font-mono text-xs mt-0.5">
                  {period.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────
export function AirportReports({ location }: AirportReportsProps) {
  const {
    stations,
    loading: stationsLoading,
    error: stationsError,
    refetch: refetchStations,
  } = useNearbyStations(location.lat, location.lon);

  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    normalizeStationId(location.airport),
  );

  // Auto-select first station when list loads, or when the current selection
  // is a FAA identifier (not a real NWS observation station)
  useEffect(() => {
    if (stations.length === 0) return;
    const stationIds = stations.map((s) => s.stationId);
    if (!selectedStationId || !stationIds.includes(selectedStationId)) {
      setSelectedStationId(stations[0].stationId);
    }
  }, [stations, selectedStationId]);

  // Reset selection when location changes
  useEffect(() => {
    setSelectedStationId(normalizeStationId(location.airport));
  }, [location.lat, location.lon, location.airport]);

  // Whether the location airport is a FAA-only identifier (no on-site METAR)
  const isFaaOnlyAirport = location.airport && !isIcaoCode(location.airport);

  // Limit to 8 stations for display
  const displayStations = stations.slice(0, 8);

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-[#0f2237] rounded-2xl p-4 sm:p-6 shadow-sm border border-white/10">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold mb-2 text-white">Airport Reports</h2>
              <span className="text-[10px] bg-emerald-900/40 text-emerald-400 font-semibold px-2 py-0.5 rounded-full border border-emerald-700/40">
                LIVE
              </span>
            </div>
            <p className="text-slate-400">
              Real-time METAR &amp; TAF from weather.gov for nearby stations
            </p>
            {isFaaOnlyAirport && selectedStationId && (
              <p className="text-xs text-amber-400 mt-2 flex items-center gap-1.5">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span>
                  <span className="font-mono font-semibold">{location.airport}</span> has no on-site METAR station — showing nearest:{" "}
                  <span className="font-mono font-semibold text-sky-400">{selectedStationId}</span>
                </span>
              </p>
            )}
          </div>
          <Plane className="w-8 h-8 text-sky-400" />
        </div>
      </div>

      {/* Station list */}
      <div className="bg-[#0f2237] rounded-2xl p-4 sm:p-6 shadow-sm border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Nearby Observation Stations</h3>
          <button
            onClick={refetchStations}
            className="text-slate-500 hover:text-sky-400 transition-colors"
            title="Refresh stations"
          >
            <RefreshCw
              className={`w-4 h-4 ${stationsLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {stationsLoading && stations.length === 0 ? (
          <div className="flex items-center gap-2 py-6 justify-center">
            <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
            <span className="text-sm text-slate-400">
              Discovering nearby stations…
            </span>
          </div>
        ) : stationsError ? (
          <div className="py-6 text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-amber-400">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm font-medium">{stationsError}</span>
            </div>
            <p className="text-xs text-slate-500">
              weather.gov station data is only available for US locations.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {displayStations.map((station) => (
              <button
                key={station.stationId}
                onClick={() => setSelectedStationId(station.stationId)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  selectedStationId === station.stationId
                    ? "border-sky-500/60 bg-sky-900/30"
                    : "border-white/10 hover:border-white/20 bg-[#122a45]"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="font-semibold text-lg font-mono text-white">
                    {station.stationId}
                  </div>
                  {station.distance_mi === 0 && (
                    <span className="text-xs bg-sky-500 text-white px-2 py-1 rounded-full">
                      Current
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-300 mb-1 line-clamp-1">
                  {station.name}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="w-3 h-3" />
                  <span>{station.distance_mi} mi away</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Reports */}
      {selectedStationId && (
        <div className="bg-[#0f2237] rounded-2xl shadow-sm border border-white/10">
          <Tabs defaultValue="metar" className="w-full">
            <div className="px-4 sm:px-6 pt-4 sm:pt-6">
              <TabsList className="bg-white/5 p-1 rounded-xl">
                <TabsTrigger
                  value="metar"
                  className="rounded-lg data-[state=active]:bg-[#1a3a5c] data-[state=active]:text-white data-[state=active]:shadow-sm text-slate-400"
                >
                  METAR
                </TabsTrigger>
                <TabsTrigger
                  value="taf"
                  className="rounded-lg data-[state=active]:bg-[#1a3a5c] data-[state=active]:text-white data-[state=active]:shadow-sm text-slate-400"
                >
                  TAF
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="metar" className="p-4 sm:p-6 pt-4">
              <MetarDisplay stationId={selectedStationId} />
            </TabsContent>

            <TabsContent value="taf" className="p-4 sm:p-6 pt-4">
              <TafDisplay stationId={selectedStationId} />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Source note */}
      <div className="text-xs text-gray-400 text-center">
        Data sourced from{" "}
        <a
          href="https://www.weather.gov"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline"
        >
          api.weather.gov
        </a>{" "}
        (National Weather Service). Always verify with official sources before
        flight.
      </div>
    </div>
  );
}
