import { useRef } from "react";
import { Loader2, ChevronLeft, ChevronRight, Wind, Thermometer, Eye, Cloud, Droplets, AlertTriangle } from "lucide-react";
import {
  getWeatherIcon,
  getCeiling,
  getFlightCategory,
} from "../hooks/useWeather";
import { useWeatherContext } from "../contexts/WeatherContext";

interface Location {
  name: string;
  airport: string;
  lat: number;
  lon: number;
}

interface AviationForecastInfographicProps {
  location: Location;
}

function tempGradient(temp: number): string {
  if (temp <= 20) return "rgba(59,130,246,0.7)";
  if (temp <= 32) return "rgba(96,165,250,0.5)";
  if (temp <= 45) return "rgba(186,230,253,0.2)";
  if (temp <= 60) return "rgba(250,204,21,0.25)";
  if (temp <= 75) return "rgba(251,146,60,0.3)";
  if (temp <= 85) return "rgba(249,115,22,0.5)";
  return "rgba(239,68,68,0.6)";
}

function tempTextColor(temp: number): string {
  if (temp <= 32) return "#93c5fd";
  if (temp >= 80) return "#f97316";
  return "#e2e8f0";
}

function flightRuleStyle(category: string): { bg: string; text: string } {
  switch (category) {
    case "VFR":  return { bg: "rgba(22,163,74,0.85)",  text: "#ffffff" };
    case "MVFR": return { bg: "rgba(37,99,235,0.85)",  text: "#ffffff" };
    case "IFR":  return { bg: "rgba(220,38,38,0.9)",   text: "#ffffff" };
    case "LIFR": return { bg: "rgba(162,28,175,0.9)",  text: "#ffffff" };
    default:     return { bg: "rgba(100,116,139,0.5)", text: "#e2e8f0" };
  }
}

function cloudBaseStyle(feet: number): { color: string; weight: string } {
  if (feet < 500)  return { color: "#e879f9", weight: "700" };
  if (feet < 1000) return { color: "#f87171", weight: "700" };
  if (feet < 2000) return { color: "#fb923c", weight: "700" };
  if (feet < 3000) return { color: "#fbbf24", weight: "600" };
  if (feet < 5000) return { color: "#34d399", weight: "500" };
  return { color: "#94a3b8", weight: "400" };
}

function visStyle(miles: number): { color: string; bg: string; weight: string } {
  if (miles < 1)  return { color: "#e879f9", bg: "rgba(162,28,175,0.2)", weight: "700" };
  if (miles < 3)  return { color: "#f87171", bg: "rgba(220,38,38,0.15)", weight: "700" };
  if (miles < 5)  return { color: "#60a5fa", bg: "rgba(37,99,235,0.15)", weight: "600" };
  return { color: "#94a3b8", bg: "transparent", weight: "400" };
}

function precipStyle(pct: number): string {
  if (pct >= 70) return "#93c5fd";
  if (pct >= 40) return "#60a5fa";
  if (pct > 0)   return "#38bdf8";
  return "#334155";
}

function spreadStyle(spread: number): { bg: string; color: string } {
  if (spread <= 3) return { bg: "rgba(220,38,38,0.3)",  color: "#f87171" };
  if (spread <= 5) return { bg: "rgba(245,158,11,0.25)", color: "#fbbf24" };
  return { bg: "transparent", color: "#64748b" };
}

function SkyEmoji({ code, cloudCover }: { code: number; cloudCover: number }) {
  const iconType = getWeatherIcon(code);
  if (iconType === "thunderstorm") return <span>⛈</span>;
  if (iconType === "snow")         return <span>🌨</span>;
  if (iconType === "rain" || iconType === "showers") return <span>🌧</span>;
  if (iconType === "drizzle")      return <span>🌦</span>;
  if (iconType === "freezing")     return <span>🧊</span>;
  if (iconType === "fog")          return <span>🌫</span>;
  if (cloudCover >= 90)            return <span>☁️</span>;
  if (cloudCover >= 50)            return <span>⛅</span>;
  if (cloudCover >= 25)            return <span>🌤</span>;
  return <span>☀️</span>;
}

function formatHour(date: Date): string {
  const h = date.getHours();
  const ampm = h >= 12 ? "p" : "a";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}${ampm}`;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const COL = 60;
const LABEL = 112;

export function AviationForecastInfographic({ location }: AviationForecastInfographicProps) {
  const { hourly, loading, error, refetch } = useWeatherContext();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (amount: number) => scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });

  if (loading && hourly.length === 0) {
    return (
      <div className="h-full flex items-center justify-center gap-3 bg-[#0f2237] rounded-2xl border border-white/10">
        <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
        <span className="text-slate-400">Loading aviation forecast...</span>
      </div>
    );
  }

  if (error && hourly.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0f2237] rounded-2xl border border-red-700/30 text-center p-8">
        <div>
          <p className="text-red-400 mb-2">Failed to load forecast</p>
          <button onClick={refetch} className="px-4 py-2 bg-sky-500 text-white rounded-xl text-sm hover:bg-sky-600 transition-colors">Retry</button>
        </div>
      </div>
    );
  }

  const now = new Date();
  const data = hourly.filter(h => h.time >= now);

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0f2237] rounded-2xl border border-white/10 text-slate-500">
        No upcoming forecast data available
      </div>
    );
  }

  const dateBoundaries: { idx: number; span: number; label: string }[] = [];
  for (let i = 0; i < data.length; i++) {
    const prev = i > 0 ? data[i - 1].time : null;
    if (!prev || data[i].time.getDate() !== prev.getDate()) {
      let span = 1;
      for (let j = i + 1; j < data.length; j++) {
        if (data[j].time.getDate() !== data[i].time.getDate()) break;
        span++;
      }
      dateBoundaries.push({ idx: i, span, label: formatDay(data[i].time) });
    }
  }

  const rows: { key: string; label: string; icon?: React.ReactNode; render: (h: typeof data[0], i: number) => React.ReactNode }[] = [
    {
      key: "sky",
      label: "Sky",
      render: (h) => (
        <div className="text-xl leading-none py-0.5">
          <SkyEmoji code={h.weatherCode} cloudCover={h.cloudCover} />
        </div>
      ),
    },
    {
      key: "flightrule",
      label: "Flight Rule",
      render: (h) => {
        const ceiling = getCeiling(h.cloudCover);
        const cat = getFlightCategory(h.visibility, ceiling);
        const st = flightRuleStyle(cat.category);
        return (
          <span
            className="inline-block px-1.5 py-0.5 rounded text-[11px] font-black tracking-wide w-full text-center"
            style={{ background: st.bg, color: st.text }}
          >
            {cat.category}
          </span>
        );
      },
    },
    {
      key: "cloud",
      label: "Cloud %",
      render: (h) => (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[11px] font-semibold text-slate-300">{h.cloudCover}<span className="text-[9px] text-slate-500">%</span></span>
          <div className="w-8 h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-sky-400/50" style={{ width: `${h.cloudCover}%` }} />
          </div>
        </div>
      ),
    },
    {
      key: "cloudbase",
      label: "Ceiling",
      render: (h) => {
        const ceiling = getCeiling(h.cloudCover);
        const st = cloudBaseStyle(ceiling);
        const label = ceiling >= 10000 ? `${Math.round(ceiling / 1000)}k` : ceiling >= 1000 ? `${(ceiling / 1000).toFixed(1)}k` : ceiling.toString();
        return <span className="text-[11px]" style={{ color: st.color, fontWeight: st.weight }}>{label}</span>;
      },
    },
    {
      key: "vis",
      label: "Vis (mi)",
      render: (h) => {
        const st = visStyle(h.visibility);
        return (
          <span
            className="inline-block text-[11px] px-1 rounded"
            style={{ color: st.color, backgroundColor: st.bg, fontWeight: st.weight }}
          >
            {h.visibility}
          </span>
        );
      },
    },
    {
      key: "temp",
      label: "Temp °F",
      render: (h) => (
        <span
          className="inline-block px-1.5 py-0.5 rounded text-[12px] font-bold w-full text-center"
          style={{ backgroundColor: tempGradient(h.temperature), color: tempTextColor(h.temperature) }}
        >
          {h.temperature}
        </span>
      ),
    },
    {
      key: "wind",
      label: "Wind",
      render: (h) => {
        const wColor = h.windSpeed > 8 ? "#f87171" : h.windSpeed >= 5 ? "#fbbf24" : "#94a3b8";
        return (
          <div className="flex flex-col items-center gap-0.5">
            <svg width="14" height="14" viewBox="0 0 24 24" style={{ transform: `rotate(${h.windDirection}deg)`, color: wColor }}>
              <path d="M12 2 L12 22 M12 2 L7 8 M12 2 L17 8" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[10px] font-semibold" style={{ color: wColor }}>{h.windSpeed}kt</span>
          </div>
        );
      },
    },
    {
      key: "gusts",
      label: "Gusts",
      render: (h) => {
        const gustColor = h.windGusts > 25 ? "#f87171" : h.windGusts > 15 ? "#fb923c" : "#64748b";
        return (
          <span className="text-[11px]" style={{ color: gustColor, fontWeight: h.windGusts > 15 ? 700 : 400 }}>
            {h.windGusts > 0 ? `${h.windGusts}kt` : "—"}
          </span>
        );
      },
    },
    {
      key: "precip",
      label: "Precip %",
      render: (h) => {
        const pct = h.precipitationProbability;
        const color = precipStyle(pct);
        return pct > 0 ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] font-semibold" style={{ color }}>{pct}%</span>
            <div className="w-4 rounded-sm" style={{ height: Math.max(2, Math.round(pct / 100 * 12)), backgroundColor: color, opacity: 0.8 }} />
          </div>
        ) : (
          <span className="text-[10px] text-slate-700">—</span>
        );
      },
    },
    {
      key: "humidity",
      label: "RH %",
      render: (h) => {
        const humColor = h.humidity >= 90 ? "#60a5fa" : h.humidity >= 70 ? "#7dd3fc" : "#475569";
        return <span className="text-[11px]" style={{ color: humColor }}>{h.humidity}%</span>;
      },
    },
    {
      key: "dewpt",
      label: "Dew Pt °F",
      render: (h) => (
        <span className="text-[11px] text-sky-400/80">{h.dewPoint}°</span>
      ),
    },
    {
      key: "spread",
      label: "T–Td",
      render: (h) => {
        const spread = h.temperature - h.dewPoint;
        const st = spreadStyle(spread);
        return (
          <span
            className="inline-block text-[11px] font-semibold px-1 rounded"
            style={{ backgroundColor: st.bg, color: st.color }}
          >
            {spread}°
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="bg-[#0f2237] rounded-2xl border border-white/10 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-white">Aviation Forecast</h2>
          <p className="text-xs text-slate-500 mt-0.5">{location.airport} · {location.name} · {data.length}hr outlook</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => scrollBy(-COL * 6)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scrollBy(COL * 6)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Table */}
      <div className="bg-[#0f2237] rounded-2xl border border-white/10 overflow-hidden flex-1 min-h-0 flex flex-col">
        <div ref={scrollRef} className="overflow-auto flex-1" style={{ scrollbarWidth: "thin", scrollbarColor: "#1e3a5f #0f2237" }}>
          <table className="border-collapse h-full" style={{ minWidth: data.length * COL + LABEL }}>
            <thead>
              {/* DATE ROW */}
              <tr>
                <th
                  style={{ minWidth: LABEL, maxWidth: LABEL, position: "sticky", left: 0, zIndex: 10 }}
                  className="bg-[#0a1929] border-r border-b border-white/10 px-3 py-2"
                />
                {dateBoundaries.map((d) => (
                  <th
                    key={d.idx}
                    colSpan={d.span}
                    style={{ minWidth: COL * d.span }}
                    className="px-2 py-2 text-center text-[11px] font-bold text-sky-300 bg-[#0a1929] border-r border-b border-white/10 tracking-wide uppercase"
                  >
                    {d.label}
                  </th>
                ))}
              </tr>
              {/* HOUR ROW */}
              <tr>
                <th
                  style={{ minWidth: LABEL, maxWidth: LABEL, position: "sticky", left: 0, zIndex: 10 }}
                  className="bg-[#0d1f33] border-r border-b border-white/10 px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"
                >
                  Hour (local)
                </th>
                {data.map((h, i) => {
                  const isNoon = h.time.getHours() === 12;
                  const isMidnight = h.time.getHours() === 0;
                  return (
                    <th
                      key={i}
                      style={{ minWidth: COL, maxWidth: COL }}
                      className={`py-1.5 text-center text-[11px] font-semibold border-r border-b border-white/10 ${isMidnight ? "bg-[#0a1929] text-slate-400 border-l-2 border-l-sky-800" : isNoon ? "bg-[#0d1f33] text-slate-300" : "bg-[#0d1f33] text-slate-500"}`}
                    >
                      {formatHour(h.time)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={row.key} className={rowIdx % 2 === 0 ? "bg-[#0f2237]" : "bg-[#0d1e30]"}>
                  <td
                    style={{ minWidth: LABEL, maxWidth: LABEL, position: "sticky", left: 0, zIndex: 5 }}
                    className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-inherit border-r border-white/10 whitespace-nowrap"
                  >
                    {row.label}
                  </td>
                  {data.map((h, i) => {
                    const isMidnight = h.time.getHours() === 0;
                    return (
                      <td
                        key={i}
                        style={{ minWidth: COL, maxWidth: COL }}
                        className={`px-1 py-2 text-center border-r border-white/5 ${isMidnight ? "border-l-2 border-l-sky-800/50" : ""}`}
                      >
                        <div className="flex items-center justify-center">
                          {row.render(h, i)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 flex-shrink-0">
        <div className="bg-[#0f2237] rounded-xl px-3 py-2 border border-white/10 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Flight Rules</span>
          {[
            { label: "VFR",  bg: "#16a34a" },
            { label: "MVFR", bg: "#2563eb" },
            { label: "IFR",  bg: "#dc2626" },
            { label: "LIFR", bg: "#a21caf" },
          ].map(item => (
            <span key={item.label} className="px-2 py-0.5 rounded text-[10px] text-white font-bold" style={{ backgroundColor: item.bg }}>
              {item.label}
            </span>
          ))}
        </div>
        <div className="bg-[#0f2237] rounded-xl px-3 py-2 border border-white/10 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">T–Td</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold text-red-400 bg-red-900/40">≤3° fog</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold text-amber-400 bg-amber-900/30">≤5° caution</span>
        </div>
        <div className="bg-[#0f2237] rounded-xl px-3 py-2 border border-white/10 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Ceiling</span>
          <span className="text-[10px] text-slate-400">5k+ VFR</span>
          <span className="text-[10px] text-amber-400 font-semibold">&lt;3k</span>
          <span className="text-[10px] text-red-400 font-bold">&lt;1k IFR</span>
          <span className="text-[10px] text-fuchsia-400 font-bold">&lt;500 LIFR</span>
        </div>
        <div className="bg-[#0f2237] rounded-xl px-3 py-2 border border-white/10 flex items-center gap-1.5 flex-wrap">
          <AlertTriangle className="w-3 h-3 text-amber-500" />
          <span className="text-[10px] text-slate-500">Estimates — verify with TAF/METAR</span>
        </div>
      </div>
    </div>
  );
}
