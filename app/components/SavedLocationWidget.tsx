import { MapPin, X, Cloud, Sun, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, Wind, CloudFog, Loader2 } from "lucide-react";
import { useCurrentWeather, getWindDirectionName, getCeiling, getFlightCategory } from "../hooks/useWeather";

interface Location {
  id: string;
  name: string;
  lat: number;
  lon: number;
  airport: string;
}

interface SavedLocationWidgetProps {
  locations: Location[];
  selectedLocation: Location;
  onSelectLocation: (loc: Location) => void;
  onDeleteLocation: (id: string, e: React.MouseEvent) => void;
  compactOnMobile?: boolean;
}

function WeatherIcon({ iconType, className }: { iconType: string; className?: string }) {
  const iconClass = className || "w-4 h-4";
  switch (iconType) {
    case "clear":
      return <Sun className={`${iconClass} text-yellow-400`} />;
    case "partly-cloudy":
      return <Cloud className={`${iconClass} text-gray-300`} />;
    case "cloudy":
      return <Cloud className={`${iconClass} text-gray-400`} />;
    case "fog":
      return <CloudFog className={`${iconClass} text-gray-400`} />;
    case "drizzle":
      return <CloudDrizzle className={`${iconClass} text-blue-300`} />;
    case "rain":
    case "showers":
      return <CloudRain className={`${iconClass} text-blue-400`} />;
    case "freezing":
      return <CloudRain className={`${iconClass} text-cyan-400`} />;
    case "snow":
      return <CloudSnow className={`${iconClass} text-blue-200`} />;
    case "thunderstorm":
      return <CloudLightning className={`${iconClass} text-yellow-500`} />;
    default:
      return <Cloud className={`${iconClass} text-gray-300`} />;
  }
}

function LocationCard({
  loc,
  isSelected,
  onSelect,
  onDelete,
}: {
  loc: Location;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const { data: weather, loading } = useCurrentWeather(loc.lat, loc.lon);
  const flightCat =
    weather ? getFlightCategory(weather.visibility, getCeiling(weather.cloudCover)) : null;

  return (
    <div
      onClick={onSelect}
      className={`group relative flex h-full min-w-[148px] max-w-[184px] flex-shrink-0 snap-start cursor-pointer rounded-2xl border px-3 py-2.5 transition-all duration-150 ${
        isSelected
          ? "border-sky-400/50 bg-[#14314d] shadow-lg shadow-sky-950/30 ring-1 ring-sky-400/15"
          : "border-white/8 bg-[#0d2136] hover:border-white/20 hover:bg-[#122943]"
      }`}
    >
      <button
        onClick={onDelete}
        className={`absolute top-1 right-1 p-0.5 rounded-full transition-all ${
          isSelected
            ? "text-slate-400 hover:text-red-400 hover:bg-red-900/30"
            : "text-slate-500 hover:text-red-400 hover:bg-red-900/30 opacity-0 group-hover:opacity-100"
        }`}
        title="Remove location"
      >
        <X className="w-2.5 h-2.5" />
      </button>

      <div className="mb-2 flex items-center gap-1 pr-4 min-w-0">
        <MapPin className={`w-2.5 h-2.5 flex-shrink-0 ${isSelected ? "text-sky-400" : "text-slate-500"}`} />
        <span className="truncate text-[10px] font-medium text-slate-200">{loc.name}</span>
        <span className="flex-shrink-0 rounded bg-sky-400/10 px-1 py-px text-[8px] font-mono font-bold text-sky-400">
          {loc.airport}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
        </div>
      ) : !weather ? (
        <div className="flex items-center justify-center py-2">
          <span className="text-[9px] text-slate-500">--</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <WeatherIcon iconType={weather.icon} className="w-4 h-4" />
              <span className="text-lg font-light leading-none text-white">{weather.temperature}°</span>
            </div>
            {flightCat && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold leading-none ${flightCat.bgColor} ${flightCat.color}`}
              >
                {flightCat.category}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-white/8 pt-2 text-[10px]">
            <span className="text-slate-500">{getWindDirectionName(weather.windDirection)}</span>
            <span className="font-semibold text-slate-300">{weather.windSpeed} kt</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CompactLocationCard({
  loc,
  isSelected,
  onSelect,
  onDelete,
}: {
  loc: Location;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const { data: weather, loading } = useCurrentWeather(loc.lat, loc.lon);
  const flightCat =
    weather ? getFlightCategory(weather.visibility, getCeiling(weather.cloudCover)) : null;

  return (
    <div
      onClick={onSelect}
      className={`group relative flex min-w-[120px] max-w-[136px] flex-shrink-0 snap-start cursor-pointer rounded-xl border px-2.5 py-2 transition-all duration-150 ${
        isSelected
          ? "border-sky-400/50 bg-[#14314d] shadow-lg shadow-sky-950/25"
          : "border-white/8 bg-[#0d2136] hover:border-white/20 hover:bg-[#122943]"
      }`}
    >
      <button
        onClick={onDelete}
        className={`absolute top-1 right-1 p-0.5 rounded-full transition-all ${
          isSelected
            ? "text-slate-400 hover:text-red-400 hover:bg-red-900/30"
            : "text-slate-500 hover:text-red-400 hover:bg-red-900/30 opacity-0 group-hover:opacity-100"
        }`}
        title="Remove location"
      >
        <X className="w-2.5 h-2.5" />
      </button>

      <div className="mb-1.5 flex items-center gap-1 pr-4 min-w-0">
        <MapPin className={`w-2.5 h-2.5 flex-shrink-0 ${isSelected ? "text-sky-400" : "text-slate-500"}`} />
        <span className="truncate text-[10px] font-medium text-slate-200">{loc.name}</span>
        <span className="flex-shrink-0 rounded bg-sky-400/10 px-1 py-px text-[8px] font-mono font-bold text-sky-400">
          {loc.airport}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
        </div>
      ) : !weather ? (
        <div className="py-1.5 text-center text-[10px] text-slate-500">--</div>
      ) : (
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            <WeatherIcon iconType={weather.icon} className="h-3.5 w-3.5" />
            <span className="text-lg font-light leading-none text-white">{weather.temperature}°</span>
          </div>
          {flightCat && (
            <span className={`rounded-full px-1 py-px text-[8px] font-bold leading-none ${flightCat.bgColor} ${flightCat.color}`}>
              {flightCat.category}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function SavedLocationWidget({
  locations,
  selectedLocation,
  onSelectLocation,
  onDeleteLocation,
  compactOnMobile = false,
}: SavedLocationWidgetProps) {
  if (locations.length === 0) return null;

  return (
    <div
      className={`border-b border-white/8 bg-[#081523] px-3 sm:px-6 transition-all duration-300 ${
        compactOnMobile
          ? "py-1.5"
          : "py-2.5"
      }`}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        <div
          className={`flex w-full items-stretch overflow-x-auto sm:flex-1 snap-x snap-mandatory transition-all duration-300 ${
            compactOnMobile ? "gap-1.5" : "gap-2"
          }`}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          aria-label="Saved locations"
        >
          {locations.map((loc) => (
            compactOnMobile ? (
              <div key={loc.id}>
                <div className="block sm:hidden">
                  <CompactLocationCard
                    loc={loc}
                    isSelected={selectedLocation.id === loc.id}
                    onSelect={() => onSelectLocation(loc)}
                    onDelete={(e) => onDeleteLocation(loc.id, e)}
                  />
                </div>
                <div className="hidden sm:block">
                  <LocationCard
                    loc={loc}
                    isSelected={selectedLocation.id === loc.id}
                    onSelect={() => onSelectLocation(loc)}
                    onDelete={(e) => onDeleteLocation(loc.id, e)}
                  />
                </div>
              </div>
            ) : (
              <LocationCard
                key={loc.id}
                loc={loc}
                isSelected={selectedLocation.id === loc.id}
                onSelect={() => onSelectLocation(loc)}
                onDelete={(e) => onDeleteLocation(loc.id, e)}
              />
            )
          ))}
        </div>
      </div>
    </div>
  );
}
