import { Sun, Wind, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, CloudFog, Cloud, Loader2, CheckCircle, AlertTriangle, XCircle, Droplets, ArrowUp } from "lucide-react";
import { getWindDirectionName, getFlightCategory, getCeiling, DailyForecastData } from "../hooks/useWeather";
import { useWeatherContext } from "../contexts/WeatherContext";

interface Location {
  name: string;
  airport: string;
  lat: number;
  lon: number;
}

type FlightStatus = "go" | "marginal" | "nogo";

function balloonStatus(day: DailyForecastData): FlightStatus {
  const wind = day.windSpeed;
  const gusts = day.windGusts;
  const precip = day.precipitationProbability;

  if (wind > 8 || gusts > 12 || precip > 50) return "nogo";
  if (wind >= 5 || gusts >= 8 || precip >= 30) return "marginal";
  return "go";
}

function statusConfig(status: FlightStatus) {
  switch (status) {
    case "go": return {
      label: "GO",
      icon: CheckCircle,
      cardBg: "bg-emerald-900/30",
      cardBorder: "border-emerald-700/50",
      stripBg: "bg-emerald-500",
      stripText: "text-white",
      dotColor: "bg-emerald-500",
      textColor: "text-emerald-400",
      badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-600/40",
    };
    case "marginal": return {
      label: "MARGINAL",
      icon: AlertTriangle,
      cardBg: "bg-amber-900/25",
      cardBorder: "border-amber-600/50",
      stripBg: "bg-amber-400",
      stripText: "text-amber-950",
      dotColor: "bg-amber-400",
      textColor: "text-amber-400",
      badgeBg: "bg-amber-500/20 text-amber-300 border-amber-600/40",
    };
    case "nogo": return {
      label: "NO-GO",
      icon: XCircle,
      cardBg: "bg-red-900/25",
      cardBorder: "border-red-700/50",
      stripBg: "bg-red-500",
      stripText: "text-white",
      dotColor: "bg-red-500",
      textColor: "text-red-400",
      badgeBg: "bg-red-500/20 text-red-300 border-red-700/40",
    };
  }
}

function WeatherEmoji({ iconType }: { iconType: string }) {
  switch (iconType) {
    case "thunderstorm":   return <span>⛈</span>;
    case "snow":           return <span>🌨</span>;
    case "rain":
    case "showers":        return <span>🌧</span>;
    case "drizzle":        return <span>🌦</span>;
    case "freezing":       return <span>🧊</span>;
    case "fog":            return <span>🌫</span>;
    case "partly-cloudy":  return <span>⛅</span>;
    case "cloudy":         return <span>☁️</span>;
    case "clear":          return <span>☀️</span>;
    default:               return <span>🌤</span>;
  }
}

function WindArrow({ deg, color }: { deg: number; color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ transform: `rotate(${deg}deg)`, color }}>
      <path d="M12 2 L12 22 M12 2 L7 8 M12 2 L17 8" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getDayLabel(date: Date, index: number): string {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function getDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SevenDayOutlook({ location }: { location: Location }) {
  const { daily, loading, error, refetch } = useWeatherContext();

  if (loading && daily.length === 0) {
    return (
      <div className="h-full flex items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
        <span className="text-slate-400">Loading 7-day forecast...</span>
      </div>
    );
  }

  if (error && daily.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-3">Failed to load forecast</p>
          <button onClick={refetch} className="px-4 py-2 bg-sky-500 text-white rounded-xl text-sm hover:bg-sky-600 transition-colors">Retry</button>
        </div>
      </div>
    );
  }

  const statuses = daily.map(balloonStatus);
  const goCount = statuses.filter(s => s === "go").length;
  const marginalCount = statuses.filter(s => s === "marginal").length;
  const nogoCount = statuses.filter(s => s === "nogo").length;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">

      {/* === 7-DAY STATUS STRIP === */}
      <div className="bg-[#0f2237] rounded-2xl border border-white/10 overflow-hidden">
        {/* Week summary bar */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white">7-Day Balloon Outlook</h2>
            <p className="text-xs text-slate-500 mt-0.5">{location.airport} · {location.name}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {goCount > 0 && (
              <span className="flex items-center gap-1 bg-emerald-900/40 border border-emerald-700/40 px-2 py-1 rounded-lg text-emerald-400 font-semibold">
                <CheckCircle className="w-3 h-3" /> {goCount} GO
              </span>
            )}
            {marginalCount > 0 && (
              <span className="flex items-center gap-1 bg-amber-900/40 border border-amber-600/40 px-2 py-1 rounded-lg text-amber-400 font-semibold">
                <AlertTriangle className="w-3 h-3" /> {marginalCount} MARGINAL
              </span>
            )}
            {nogoCount > 0 && (
              <span className="flex items-center gap-1 bg-red-900/40 border border-red-700/40 px-2 py-1 rounded-lg text-red-400 font-semibold">
                <XCircle className="w-3 h-3" /> {nogoCount} NO-GO
              </span>
            )}
          </div>
        </div>

        {/* Day strip */}
        <div className="grid grid-cols-7 divide-x divide-white/10">
          {daily.map((day, i) => {
            const st = statuses[i];
            const cfg = statusConfig(st);
            return (
              <div key={i} className={`flex flex-col items-center py-3 px-1 ${cfg.cardBg} relative`}>
                {/* Day label */}
                <div className={`text-[11px] font-bold uppercase tracking-wide ${i === 0 ? "text-sky-400" : "text-slate-400"}`}>
                  {getDayLabel(day.date, i)}
                </div>
                <div className="text-[10px] text-slate-600 mb-2">{getDateLabel(day.date)}</div>

                {/* Weather icon */}
                <div className="text-2xl mb-2">
                  <WeatherEmoji iconType={day.icon} />
                </div>

                {/* Status indicator */}
                <div className={`w-full mx-1 rounded-md py-1 text-center text-[10px] font-black tracking-wide ${cfg.stripBg} ${cfg.stripText}`}>
                  {st === "marginal" ? "MARG" : cfg.label}
                </div>

                {/* Temp */}
                <div className="mt-2 text-center">
                  <span className="text-sm font-bold text-white">{day.high}°</span>
                  <span className="text-xs text-slate-500 ml-1">{day.low}°</span>
                </div>

                {/* Wind */}
                <div className={`text-[10px] font-semibold mt-1 ${day.windSpeed > 8 ? "text-red-400" : day.windSpeed >= 5 ? "text-amber-400" : "text-slate-400"}`}>
                  {day.windSpeed}kt
                </div>

                {/* Precip */}
                {day.precipitationProbability > 0 && (
                  <div className={`text-[10px] font-semibold ${day.precipitationProbability >= 50 ? "text-blue-400" : "text-blue-500/70"}`}>
                    {day.precipitationProbability}%
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Color-band row at bottom */}
        <div className="grid grid-cols-7 h-1.5">
          {statuses.map((st, i) => {
            const cfg = statusConfig(st);
            return <div key={i} className={cfg.stripBg} />;
          })}
        </div>
      </div>

      {/* === DETAIL CARDS === */}
      <div className="space-y-2">
        {daily.map((day, index) => {
          const st = statuses[index];
          const cfg = statusConfig(st);
          const StatusIcon = cfg.icon;
          const windSt = day.windSpeed > 8 ? "nogo" : day.windSpeed >= 5 ? "marginal" : "go";
          const gustSt = day.windGusts > 12 ? "nogo" : day.windGusts >= 8 ? "marginal" : "go";
          const precipSt = day.precipitationProbability > 50 ? "nogo" : day.precipitationProbability >= 30 ? "marginal" : "go";

          return (
            <div
              key={index}
              className={`${cfg.cardBg} ${cfg.cardBorder} border rounded-2xl overflow-hidden transition-all`}
            >
              {/* Main row */}
              <div className="grid grid-cols-12 gap-3 p-3 sm:p-4 items-center">
                {/* Day + Icon */}
                <div className="col-span-3 sm:col-span-2 flex flex-col gap-0.5">
                  <div className={`text-sm font-bold ${index === 0 ? "text-sky-400" : "text-white"}`}>
                    {getDayLabel(day.date, index)}
                  </div>
                  <div className="text-xs text-slate-500">{getDateLabel(day.date)}</div>
                  <div className="text-2xl mt-1"><WeatherEmoji iconType={day.icon} /></div>
                </div>

                {/* Status badge */}
                <div className="col-span-3 sm:col-span-2 flex flex-col items-center justify-center">
                  <div className={`${cfg.stripBg} ${cfg.stripText} rounded-xl px-2 py-1.5 text-center w-full`}>
                    <StatusIcon className="w-4 h-4 mx-auto mb-0.5" />
                    <div className="text-[11px] font-black tracking-wide leading-none">{cfg.label}</div>
                  </div>
                </div>

                {/* Temp */}
                <div className="col-span-2 text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Temp</div>
                  <div className="text-xl font-bold text-white leading-none">{day.high}°</div>
                  <div className="text-sm text-slate-500">{day.low}°</div>
                </div>

                {/* Wind */}
                <div className="col-span-3 sm:col-span-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Wind</div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <WindArrow deg={day.windDirection} color={windSt === "nogo" ? "#f87171" : windSt === "marginal" ? "#fbbf24" : "#94a3b8"} />
                    <span className={`text-sm font-bold ${windSt === "nogo" ? "text-red-400" : windSt === "marginal" ? "text-amber-400" : "text-slate-300"}`}>
                      {day.windSpeed} kt
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Gusts <span className={`font-semibold ${gustSt === "nogo" ? "text-red-400" : gustSt === "marginal" ? "text-amber-400" : "text-slate-400"}`}>{day.windGusts} kt</span>
                  </div>
                </div>

                {/* Precip */}
                <div className="col-span-3 sm:col-span-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Precip</div>
                  <div className={`text-lg font-bold ${precipSt === "nogo" ? "text-red-400" : precipSt === "marginal" ? "text-amber-400" : "text-slate-400"}`}>
                    {day.precipitationProbability}%
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden w-12 mt-1">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${day.precipitationProbability}%`,
                        backgroundColor: precipSt === "nogo" ? "#f87171" : precipSt === "marginal" ? "#fbbf24" : "#38bdf8",
                      }}
                    />
                  </div>
                </div>

                {/* Condition text — hidden on small */}
                <div className="hidden sm:block col-span-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Condition</div>
                  <div className="text-xs text-slate-300 leading-snug">{day.condition}</div>
                  {day.precipitationSum > 0 && (
                    <div className="text-[10px] text-blue-400 mt-1 flex items-center gap-1">
                      <Droplets className="w-3 h-3" />
                      {day.precipitationSum}"
                    </div>
                  )}
                </div>
              </div>

              {/* Reason bar — only show when not GO */}
              {st !== "go" && (
                <div className="px-4 pb-2.5 flex items-center gap-2">
                  <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.textColor}`} />
                  <p className={`text-xs ${cfg.textColor}`}>
                    {st === "nogo" && day.windSpeed > 8 && `Wind ${day.windSpeed} kt exceeds 8 kt limit.`}
                    {st === "nogo" && day.windGusts > 12 && ` Gusts ${day.windGusts} kt exceed 12 kt limit.`}
                    {st === "nogo" && day.precipitationProbability > 50 && ` ${day.precipitationProbability}% precip probability.`}
                    {st === "marginal" && day.windSpeed >= 5 && day.windSpeed <= 8 && `Wind ${day.windSpeed} kt is in marginal range (5–8 kt).`}
                    {st === "marginal" && day.windGusts >= 8 && day.windGusts <= 12 && ` Gusts ${day.windGusts} kt approaching limit.`}
                    {st === "marginal" && day.precipitationProbability >= 30 && day.precipitationProbability <= 50 && ` ${day.precipitationProbability}% precip chance — monitor closely.`}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 px-1">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-600 leading-relaxed">
          Balloon thresholds: wind &gt;8 kt = NO-GO, 5–8 kt = MARGINAL · gusts &gt;12 kt = NO-GO · precip &gt;50% = NO-GO. Always verify with current TAF/METAR before flight.
        </p>
      </div>
    </div>
  );
}
