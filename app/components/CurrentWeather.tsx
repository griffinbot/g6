import { Cloud, Wind, Thermometer, ChevronDown, ChevronUp, Clock, Sun, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, CloudFog, Sunrise, Sunset, AlertTriangle, CheckCircle, XCircle, X, Info, ChevronRight, Gauge, Droplets } from "lucide-react";
import { useState } from "react";
import { HourlyForecast } from "./HourlyForecast";
import { getWindDirectionName, getCeiling, getFlightCategory, getWeatherIcon } from "../hooks/useWeather";
import { useWeatherContext } from "../contexts/WeatherContext";
import { useProfileContext } from "../contexts/ProfileContext";
import type { GoNoGoThresholds } from "../../shared/contracts";

interface Location {
  name: string;
  airport: string;
  lat: number;
  lon: number;
}

interface CurrentWeatherProps {
  location: Location;
}

type PanelType = "wind" | "clouds" | "precip" | "dewpoint" | "verdict";

function WeatherIcon({ iconType, className }: { iconType: string; className?: string }) {
  const iconClass = className || "w-5 h-5";
  switch (iconType) {
    case "clear": return <Sun className={`${iconClass} text-yellow-400`} />;
    case "partly-cloudy": return <Cloud className={`${iconClass} text-gray-300`} />;
    case "cloudy": return <Cloud className={`${iconClass} text-gray-400`} />;
    case "fog": return <CloudFog className={`${iconClass} text-gray-400`} />;
    case "drizzle": return <CloudDrizzle className={`${iconClass} text-blue-300`} />;
    case "rain":
    case "showers": return <CloudRain className={`${iconClass} text-blue-400`} />;
    case "freezing": return <CloudRain className={`${iconClass} text-cyan-400`} />;
    case "snow": return <CloudSnow className={`${iconClass} text-blue-200`} />;
    case "thunderstorm": return <CloudLightning className={`${iconClass} text-yellow-500`} />;
    default: return <Cloud className={`${iconClass} text-gray-300`} />;
  }
}

function getCloudBaseEstimate(cloudCover: number): { text: string; altFt: number | null } {
  if (cloudCover < 10) return { text: "Clear", altFt: null };
  if (cloudCover < 30) return { text: "~5,000+ ft", altFt: 5000 };
  if (cloudCover < 50) return { text: "~4,000 ft", altFt: 4000 };
  if (cloudCover < 70) return { text: "~3,000 ft", altFt: 3000 };
  if (cloudCover < 85) return { text: "~2,000 ft", altFt: 2000 };
  return { text: "~1,500 ft", altFt: 1500 };
}

function calcDensityAltitude(tempF: number, pressureInHg: number, elevationFt: number): number {
  const pressureAlt = (29.92 - pressureInHg) * 1000 + elevationFt;
  const tempC = (tempF - 32) * (5 / 9);
  const standardTempC = 15 - (2 * elevationFt / 1000);
  return Math.round(pressureAlt + (120 * (tempC - standardTempC)));
}

function getCloudCoverLabel(cloudCover: number): string {
  if (cloudCover >= 90) return "OVC";
  if (cloudCover >= 70) return "BKN";
  if (cloudCover >= 50) return "SCT";
  if (cloudCover >= 25) return "FEW";
  return "CLR";
}

type Status = "go" | "marginal" | "nogo";

function windStatus(speed: number, t?: GoNoGoThresholds): Status {
  const goLimit = t?.windSpeedGo ?? 5;
  const marginalLimit = t?.windSpeedMarginal ?? 8;
  if (speed > marginalLimit) return "nogo";
  if (speed > goLimit) return "marginal";
  return "go";
}
function gustStatus(gusts: number, t?: GoNoGoThresholds): Status {
  const goLimit = t?.gustGo ?? 8;
  const marginalLimit = t?.gustMarginal ?? 12;
  if (gusts > marginalLimit) return "nogo";
  if (gusts > goLimit) return "marginal";
  return "go";
}
function precipStatus(precip: number): Status {
  return precip > 0 ? "nogo" : "go";
}
function visibilityStatus(vis: number, t?: GoNoGoThresholds): Status {
  const goLimit = t?.visibilityGo ?? 5;
  const marginalLimit = t?.visibilityMarginal ?? 3;
  if (vis < marginalLimit) return "nogo";
  if (vis < goLimit) return "marginal";
  return "go";
}
function flightCatStatus(category: string): Status {
  if (category === "IFR" || category === "LIFR") return "nogo";
  if (category === "MVFR") return "marginal";
  return "go";
}
function dewPointStatus(spread: number, t?: GoNoGoThresholds): Status {
  const goLimit = t?.dewPointSpreadGo ?? 5;
  const marginalLimit = t?.dewPointSpreadMarginal ?? 3;
  if (spread <= marginalLimit) return "nogo";
  if (spread <= goLimit) return "marginal";
  return "go";
}
function overallStatus(statuses: Status[]): Status {
  if (statuses.some(s => s === "nogo")) return "nogo";
  if (statuses.some(s => s === "marginal")) return "marginal";
  return "go";
}

function statusStyles(status: Status, isActive = false) {
  switch (status) {
    case "go": return {
      border: isActive ? "border-emerald-500/70" : "border-emerald-700/50",
      bg: isActive ? "bg-emerald-900/50" : "bg-emerald-900/30",
      ring: "ring-emerald-500/50",
      text: "text-emerald-400",
      label: "GO",
    };
    case "marginal": return {
      border: isActive ? "border-amber-500/70" : "border-amber-600/50",
      bg: isActive ? "bg-amber-900/50" : "bg-amber-900/30",
      ring: "ring-amber-500/50",
      text: "text-amber-400",
      label: "MARGINAL",
    };
    case "nogo": return {
      border: isActive ? "border-red-500/70" : "border-red-700/50",
      bg: isActive ? "bg-red-900/50" : "bg-red-900/30",
      ring: "ring-red-500/50",
      text: "text-red-400",
      label: "NO-GO",
    };
  }
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "go") return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-400/15 px-1.5 py-0.5 rounded-full" aria-label="Status: Go">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />GO
    </span>
  );
  if (status === "marginal") return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/15 px-1.5 py-0.5 rounded-full" aria-label="Status: Marginal">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />MARG
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-400/15 px-1.5 py-0.5 rounded-full" aria-label="Status: No-Go">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />NO-GO
    </span>
  );
}

function SummaryPanel({
  title,
  icon: Icon,
  status,
  value,
  detail,
  footerLabel,
  footerValue,
  isActive,
  onClick,
}: {
  title: string;
  icon: React.ElementType;
  status: Status;
  value: React.ReactNode;
  detail: React.ReactNode;
  footerLabel: string;
  footerValue: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}) {
  const tone = statusStyles(status, isActive);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-2xl border bg-[#10263d] px-3.5 py-3 text-left transition-all duration-150 hover:border-white/20 hover:bg-[#132e49] hover:shadow-lg hover:shadow-slate-950/20 ${
        isActive ? `${tone.border} ring-1 ${tone.ring}` : "border-white/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            <Icon className="h-3.5 w-3.5 text-slate-500" />
            {title}
          </div>
          <div className="mt-3 text-[1.9rem] font-semibold leading-none text-white">{value}</div>
          <div className="mt-1 text-sm text-slate-300">{detail}</div>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-2 text-xs">
        <span className="text-slate-500">{footerLabel}</span>
        <span className="flex items-center gap-1 font-semibold text-slate-200">
          {footerValue}
          <ChevronRight className="h-3 w-3 text-slate-600 transition-colors group-hover:text-slate-400" />
        </span>
      </div>
    </button>
  );
}

function MetricPill({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className="min-w-[7.5rem] rounded-full border border-white/8 bg-white/5 px-3.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
      {detail ? <div className="text-[11px] text-slate-400">{detail}</div> : null}
    </div>
  );
}

function SkyEmoji({ code, cloudCover }: { code: number; cloudCover: number }) {
  const iconType = getWeatherIcon(code);
  if (iconType === "thunderstorm") return <span>⛈</span>;
  if (iconType === "snow") return <span>🌨</span>;
  if (iconType === "rain" || iconType === "showers") return <span>🌧</span>;
  if (iconType === "drizzle") return <span>🌦</span>;
  if (iconType === "freezing") return <span>🧊</span>;
  if (iconType === "fog") return <span>🌫</span>;
  if (cloudCover >= 90) return <span>☁️</span>;
  if (cloudCover >= 50) return <span>⛅</span>;
  if (cloudCover >= 25) return <span>🌤</span>;
  return <span>☀️</span>;
}

function ThresholdBar({ value, max, thresholds, unit, label }: {
  value: number;
  max: number;
  thresholds: { go: number; marginal: number };
  unit: string;
  label: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const goPct = (thresholds.go / max) * 100;
  const marginalPct = (thresholds.marginal / max) * 100;
  const status: Status = value <= thresholds.go ? "go" : value <= thresholds.marginal ? "marginal" : "nogo";
  const barColor = status === "go" ? "bg-emerald-500" : status === "marginal" ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className={`font-bold ${statusStyles(status).text}`}>{value} {unit}</span>
      </div>
      <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: status === "go" ? "#10b981" : status === "marginal" ? "#f59e0b" : "#ef4444" }}
        />
        <div className="absolute top-0 h-full w-px bg-emerald-400/60" style={{ left: `${goPct}%` }} />
        <div className="absolute top-0 h-full w-px bg-amber-400/60" style={{ left: `${marginalPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>0</span>
        <span className="text-emerald-600">≤{thresholds.go}</span>
        <span className="text-amber-600">≤{thresholds.marginal}</span>
        <span>{max}+</span>
      </div>
    </div>
  );
}

function MiniSparkline({ data, max, color }: { data: number[]; max: number; color: string }) {
  if (data.length === 0) return null;
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((v, i) => {
        const h = Math.max(4, Math.round((v / max) * 32));
        return (
          <div key={i} className="flex-1 rounded-sm transition-all" style={{ height: `${h}px`, backgroundColor: color, opacity: 0.7 + (i / data.length) * 0.3 }} />
        );
      })}
    </div>
  );
}

function SpreadGauge({ spread, thresholds }: { spread: number; thresholds: GoNoGoThresholds }) {
  const status = dewPointStatus(spread, thresholds);
  const pct = Math.min((spread / 20) * 100, 100);
  const fillColor = status === "go" ? "#10b981" : status === "marginal" ? "#f59e0b" : "#ef4444";
  const marginalPct = (thresholds.dewPointSpreadMarginal / 20) * 100;
  const goPct = (thresholds.dewPointSpreadGo / 20) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">T/Td Spread</span>
        <span className={`font-bold ${statusStyles(status).text}`}>{spread}°F</span>
      </div>
      <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: fillColor }} />
        <div className="absolute top-0 h-full w-px bg-red-400/60" style={{ left: `${marginalPct}%` }} />
        <div className="absolute top-0 h-full w-px bg-amber-400/60" style={{ left: `${goPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-slate-600">
        <span className="text-red-600">Fog ≤{thresholds.dewPointSpreadMarginal}°</span>
        <span className="text-amber-600">Risk ≤{thresholds.dewPointSpreadGo}°</span>
        <span>Safe &gt;{thresholds.dewPointSpreadGo}°</span>
      </div>
    </div>
  );
}

function DetailPanelContent({
  panel,
  current,
  hourly,
  wStat,
  gStat,
  pStat,
  vStat,
  fStat,
  dStat,
  cloudBase,
  tempDewSpread,
  thresholds,
}: {
  panel: PanelType;
  current: any;
  hourly: any[];
  wStat: Status;
  gStat: Status;
  pStat: Status;
  vStat: Status;
  fStat: Status;
  dStat: Status;
  cloudBase: { text: string; altFt: number | null };
  tempDewSpread: number;
  thresholds: GoNoGoThresholds;
}) {
  const next6 = hourly.filter(h => h.time >= new Date()).slice(0, 6);

  if (panel === "wind") {
    const next12 = hourly.filter(h => h.time >= new Date()).slice(0, 12);

    return (
      <div className="space-y-4">
        {/* Current conditions summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Speed</div>
            <div className={`text-2xl font-bold mt-1 ${wStat === "nogo" ? "text-red-400" : wStat === "marginal" ? "text-amber-400" : "text-white"}`}>{current.windSpeed}<span className="text-xs font-normal text-slate-400 ml-0.5">kt</span></div>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Direction</div>
            <div className="flex flex-col items-center mt-1">
              <svg width="20" height="20" viewBox="0 0 24 24" className="text-sky-400" style={{ transform: `rotate(${current.windDirection}deg)` }}>
                <path d="M12 2 L12 22 M12 2 L7 8 M12 2 L17 8" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-xs font-semibold text-slate-300 mt-0.5">{getWindDirectionName(current.windDirection)}</span>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Gusts</div>
            <div className={`text-2xl font-bold mt-1 ${gStat === "nogo" ? "text-red-400" : gStat === "marginal" ? "text-amber-400" : "text-white"}`}>{current.windGusts}<span className="text-xs font-normal text-slate-400 ml-0.5">kt</span></div>
          </div>
        </div>

        {/* Threshold bars */}
        <div className="space-y-2">
          <ThresholdBar value={current.windSpeed} max={20} thresholds={{ go: thresholds.windSpeedGo, marginal: thresholds.windSpeedMarginal }} unit="kt" label="Wind vs. balloon limit" />
          <ThresholdBar value={current.windGusts} max={25} thresholds={{ go: thresholds.gustGo, marginal: thresholds.gustMarginal }} unit="kt" label="Gusts vs. balloon limit" />
        </div>

        {/* Hourly wind table */}
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2 font-semibold">Hourly Wind — Next {next12.length}h</div>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-5 border-b border-white/10 bg-white/5">
              {["Time", "Dir", "Speed", "Gusts", "Status"].map(h => (
                <div key={h} className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide text-center py-1.5 px-1">{h}</div>
              ))}
            </div>
            {next12.map((h, i) => {
              const hr = h.time.getHours();
              const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
              const ampm = hr >= 12 ? "p" : "a";
              const hWind = windStatus(h.windSpeed, thresholds);
              const hGust = gustStatus(h.windGusts ?? 0, thresholds);
              const rowStatus = overallStatus([hWind, hGust]);
              const windColor = hWind === "nogo" ? "#f87171" : hWind === "marginal" ? "#fbbf24" : "#94a3b8";
              const gustColor = hGust === "nogo" ? "#f87171" : hGust === "marginal" ? "#fbbf24" : "#64748b";
              const rowBg = i % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]";
              const statusLabel = rowStatus === "go" ? "GO" : rowStatus === "marginal" ? "MARG" : "NO-GO";
              const statusColor = rowStatus === "go" ? "text-emerald-400 bg-emerald-900/30" : rowStatus === "marginal" ? "text-amber-400 bg-amber-900/30" : "text-red-400 bg-red-900/30";
              return (
                <div key={i} className={`grid grid-cols-5 border-b border-white/5 last:border-0 ${rowBg} items-center`}>
                  <div className="text-xs font-semibold text-slate-400 text-center py-2 px-1">{hr12}{ampm}</div>
                  <div className="flex justify-center py-2 px-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" style={{ transform: `rotate(${h.windDirection}deg)`, color: "#60a5fa" }}>
                      <path d="M12 2 L12 22 M12 2 L7 8 M12 2 L17 8" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="text-center py-2 px-1">
                    <span className="text-sm font-bold" style={{ color: windColor }}>{h.windSpeed}</span>
                    <span className="text-[10px] text-slate-600"> kt</span>
                  </div>
                  <div className="text-center py-2 px-1">
                    <span className="text-sm font-semibold" style={{ color: gustColor }}>{h.windGusts ?? "—"}</span>
                    <span className="text-[10px] text-slate-600"> kt</span>
                  </div>
                  <div className="text-center py-2 px-1">
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${statusColor}`}>{statusLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-[10px] text-slate-600 leading-relaxed">
          Thresholds: wind ≤{thresholds.windSpeedGo} kt GO · ≤{thresholds.windSpeedMarginal} kt MARGINAL · &gt;{thresholds.windSpeedMarginal} kt NO-GO · gusts ≤{thresholds.gustGo} kt GO · ≤{thresholds.gustMarginal} kt MARGINAL · &gt;{thresholds.gustMarginal} kt NO-GO
        </div>
      </div>
    );
  }

  if (panel === "clouds") {
    const cloudData = next6.map(h => h.cloudCover);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 rounded-xl p-3 space-y-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Cloud Cover</div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-white">{current.cloudCover}%</span>
              <span className="text-slate-400">{getCloudCoverLabel(current.cloudCover)}</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${current.cloudCover}%` }} />
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-3 space-y-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Ceiling AGL</div>
            <div className={`text-2xl font-bold ${cloudBase.altFt && cloudBase.altFt <= 2000 ? "text-red-400" : cloudBase.altFt && cloudBase.altFt <= 3000 ? "text-amber-400" : "text-white"}`}>
              {cloudBase.text}
            </div>
            <div className="text-xs text-slate-500">Min safe: ~3,000 ft AGL</div>
          </div>
        </div>
        <div className="bg-white/5 rounded-xl p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Cloud Coverage Next 6h</div>
          <MiniSparkline data={cloudData} max={100} color="#38bdf8" />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            {next6.map((h, i) => {
              const hr = h.time.getHours();
              const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
              const ampm = hr >= 12 ? "p" : "a";
              return <span key={i}>{hr12}{ampm}</span>;
            })}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
          {[["CLR", "&lt;10%", "bg-emerald-900/40 border-emerald-700/40"], ["FEW", "10–25%", "bg-sky-900/40 border-sky-700/40"], ["SCT", "25–50%", "bg-amber-900/40 border-amber-700/40"], ["BKN/OVC", "&gt;50%", "bg-red-900/40 border-red-700/40"]].map(([label, range, cls]) => (
            <div key={label} className={`rounded-lg border py-1.5 ${cls}`}>
              <div className="font-bold text-white">{label}</div>
              <div className="text-slate-400" dangerouslySetInnerHTML={{ __html: range }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (panel === "precip") {
    const precipData = next6.map(h => h.precipitationProbability);
    const maxPrecip = Math.max(...precipData, 1);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Current</div>
            <div className={`text-2xl font-bold mt-1 ${current.precipitation > 0 ? "text-red-400" : "text-white"}`}>
              {current.precipitation > 0 ? `${current.precipitation}"` : "None"}
            </div>
            <div className="text-xs text-slate-500 mt-1">{current.precipitation > 0 ? "Any precip = NO-GO" : "Clear of precip"}</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Next Hour Prob</div>
            <div className={`text-2xl font-bold mt-1 ${precipData[0] >= 50 ? "text-red-400" : precipData[0] >= 30 ? "text-amber-400" : "text-white"}`}>
              {precipData[0] ?? 0}%
            </div>
            <div className="text-xs text-slate-500 mt-1">Precipitation chance</div>
          </div>
        </div>
        <div className="bg-white/5 rounded-xl p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Precip Probability Next 6h</div>
          <div className="flex items-end gap-1 h-10">
            {next6.map((h, i) => {
              const prob = h.precipitationProbability;
              const heightPct = Math.max(6, (prob / 100) * 40);
              const color = prob >= 50 ? "#f87171" : prob >= 30 ? "#fbbf24" : "#38bdf8";
              const hr = h.time.getHours();
              const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
              const ampm = hr >= 12 ? "p" : "a";
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-sm" style={{ height: `${heightPct}px`, backgroundColor: color, opacity: 0.85 }} />
                  <div className="text-[9px] text-slate-500">{hr12}{ampm}</div>
                  <div className="text-[9px] font-semibold" style={{ color }}>{prob}%</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white/5 rounded-xl p-3 text-xs text-slate-400 leading-relaxed">
          <span className="text-sky-400 font-semibold">Balloon rule: </span>
          Any measurable precipitation is a NO-GO condition. Even light drizzle or mist can dramatically affect envelope fabric and burner performance.
        </div>
      </div>
    );
  }

  if (panel === "dewpoint") {
    const humData = next6.map(h => h.humidity ?? current.humidity);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Temperature</div>
            <div className="text-2xl font-bold text-white mt-1">{current.temperature}°F</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Dew Point</div>
            <div className="text-2xl font-bold text-sky-400 mt-1">{current.dewPoint}°F</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Humidity</div>
            <div className="text-2xl font-bold text-white mt-1">{current.humidity}%</div>
          </div>
        </div>
        <SpreadGauge spread={tempDewSpread} thresholds={thresholds} />
        <div className="bg-white/5 rounded-xl p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Humidity Trend Next 6h</div>
          <MiniSparkline data={humData} max={100} color="#818cf8" />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            {next6.map((h, i) => {
              const hr = h.time.getHours();
              const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
              const ampm = hr >= 12 ? "p" : "a";
              return <span key={i}>{hr12}{ampm}</span>;
            })}
          </div>
        </div>
        <div className="bg-white/5 rounded-xl p-3 text-xs text-slate-400 leading-relaxed">
          <span className="text-sky-400 font-semibold">Fog risk: </span>
          {tempDewSpread <= 3
            ? "⚠️ Spread ≤3° — HIGH fog/mist risk. DO NOT launch."
            : tempDewSpread <= 5
            ? "⚡ Spread ≤5° — MARGINAL. Monitor closely for developing fog."
            : `✓ Spread ${tempDewSpread}° — Low fog risk. Conditions favorable.`}
        </div>
      </div>
    );
  }

  if (panel === "verdict") {
    const factors: { label: string; value: string; status: Status; threshold: string }[] = [
      { label: "Wind Speed", value: `${current.windSpeed} kt`, status: wStat, threshold: `≤${thresholds.windSpeedGo} GO · ≤${thresholds.windSpeedMarginal} MARGINAL · >${thresholds.windSpeedMarginal} NO-GO` },
      { label: "Wind Gusts", value: `${current.windGusts} kt`, status: gStat, threshold: `≤${thresholds.gustGo} GO · ≤${thresholds.gustMarginal} MARGINAL · >${thresholds.gustMarginal} NO-GO` },
      { label: "Precipitation", value: current.precipitation > 0 ? `${current.precipitation}"` : "None", status: pStat, threshold: "None = GO · Any = NO-GO" },
      { label: "Visibility", value: `${current.visibility} mi`, status: vStat, threshold: `≥${thresholds.visibilityGo} GO · ≥${thresholds.visibilityMarginal} MARGINAL · <${thresholds.visibilityMarginal} NO-GO` },
      { label: "Clouds / Flight Cat", value: `${current.cloudCover}% ${getCloudCoverLabel(current.cloudCover)}`, status: fStat, threshold: "VFR = GO · MVFR = MARGINAL · IFR = NO-GO" },
      { label: "Dew Point Spread", value: `${tempDewSpread}°F`, status: dStat, threshold: `>${thresholds.dewPointSpreadGo}° GO · >${thresholds.dewPointSpreadMarginal}° MARGINAL · ≤${thresholds.dewPointSpreadMarginal}° NO-GO` },
    ];
    return (
      <div className="space-y-2">
        {factors.map((f) => {
          const ss = statusStyles(f.status);
          const Icon = f.status === "go" ? CheckCircle : f.status === "marginal" ? AlertTriangle : XCircle;
          return (
            <div key={f.label} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${ss.bg} ${ss.border}`}>
              <Icon className={`w-4 h-4 flex-shrink-0 ${ss.text}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{f.label}</span>
                  <span className={`text-sm font-bold ${ss.text}`}>{f.value}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{f.threshold}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}

function DetailSheet({
  panel,
  onClose,
  panelTitle,
  panelIcon: PanelIcon,
  children,
}: {
  panel: PanelType;
  onClose: () => void;
  panelTitle: string;
  panelIcon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Backdrop — above bottom bar */}
      <div
        className="fixed inset-0 bg-black/60 z-[210] backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Sheet — above backdrop and bottom bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[220] bg-[#0c1e32] border-t border-white/10 rounded-t-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "75vh", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pb-3 pt-1 border-b border-white/10 flex-shrink-0">
          <PanelIcon className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-white text-sm flex-1">{panelTitle}</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-4">
          {children}
        </div>
      </div>
    </>
  );
}

export function CurrentWeather({ location }: CurrentWeatherProps) {
  const [showHourly, setShowHourly] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelType | null>(null);
  const { current, hourly, daily, elevation_ft, loading, error, lastUpdated, refetch } = useWeatherContext();
  const { preferences } = useProfileContext();
  const thresholds = preferences.goNoGoThresholds;

  if (loading && !current) {
    return (
      <div className="space-y-3 animate-in fade-in-0 duration-300">
        <div className="bg-[#0f2237] rounded-2xl p-4 border border-white/10 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-5 w-28 bg-white/10 rounded-lg" />
              <div className="h-5 w-10 bg-sky-400/20 rounded-md" />
            </div>
            <div className="h-10 w-14 bg-white/10 rounded-xl" />
          </div>
        </div>
        <div className="h-10 bg-white/10 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-[#0f2237] rounded-xl p-3 sm:p-4 border border-white/10 animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="h-3 w-12 bg-white/10 rounded" />
                <div className="h-4 w-10 bg-white/10 rounded-full" />
              </div>
              <div className="h-9 w-16 bg-white/10 rounded-lg mb-2" />
              <div className="h-3 w-20 bg-white/10 rounded" />
              <div className="mt-3 pt-2 border-t border-white/5">
                <div className="h-4 w-14 bg-white/10 rounded ml-auto" />
              </div>
            </div>
          ))}
        </div>
        <div className="bg-[#0f2237] rounded-xl border border-white/10 p-3 animate-pulse">
          <div className="h-3 w-24 bg-white/10 rounded mb-3" />
          <div className="flex gap-2 overflow-hidden">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="h-3 w-6 bg-white/10 rounded" />
                <div className="h-6 w-6 bg-white/10 rounded-full" />
                <div className="h-3 w-8 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !current) {
    return (
      <div className="bg-[#0f2237] rounded-2xl p-8 shadow-sm border border-red-700/40 text-center">
        <p className="text-red-400 mb-2">Failed to load weather data</p>
        <p className="text-sm text-slate-400 mb-4">{error}</p>
        <button onClick={refetch} className="px-4 py-2 bg-sky-500 text-white rounded-xl text-sm hover:bg-sky-600 transition-colors">
          Retry
        </button>
      </div>
    );
  }

  if (!current) return null;

  const ceiling = getCeiling(current.cloudCover);
  const flightCat = getFlightCategory(current.visibility, ceiling);
  const cloudBase = getCloudBaseEstimate(current.cloudCover);
  const densityAlt = calcDensityAltitude(current.temperature, current.pressure, elevation_ft);
  const tempDewSpread = current.temperature - current.dewPoint;

  const todaySunrise = daily?.[0]?.sunrise;
  const todaySunset = daily?.[0]?.sunset;

  const formatSunTime = (isoString: string) => {
    const date = new Date(isoString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const wStat = windStatus(current.windSpeed, thresholds);
  const gStat = gustStatus(current.windGusts, thresholds);
  const pStat = precipStatus(current.precipitation);
  const vStat = visibilityStatus(current.visibility, thresholds);
  const fStat = flightCatStatus(flightCat.category);
  const dStat = dewPointStatus(tempDewSpread, thresholds);

  const overall = overallStatus([wStat, gStat, pStat, vStat, fStat, dStat]);
  const verdictLabel = overall === "go" ? "GO" : overall === "marginal" ? "MARGINAL" : "NO-GO";
  const verdictBg = overall === "go" ? "bg-emerald-500" : overall === "marginal" ? "bg-amber-400" : "bg-red-500";
  const verdictText = overall === "marginal" ? "text-amber-950" : "text-white";
  const VerdictIcon = overall === "go" ? CheckCircle : overall === "marginal" ? AlertTriangle : XCircle;

  const next6 = hourly.filter(h => h.time >= new Date()).slice(0, 6);
  const nextHourPrecipProb = next6.length > 0 ? next6[0].precipitationProbability : 0;

  const togglePanel = (p: PanelType) => setActivePanel(prev => prev === p ? null : p);

  const panelMeta: Record<PanelType, { title: string; icon: React.ElementType }> = {
    wind: { title: "Wind Detail", icon: Wind },
    clouds: { title: "Cloud & Ceiling Detail", icon: Cloud },
    precip: { title: "Precipitation Detail", icon: CloudRain },
    dewpoint: { title: "Dew Point & Fog Risk", icon: Droplets },
    verdict: { title: "Go / No-Go Breakdown", icon: VerdictIcon },
  };

  const windOverall = overallStatus([wStat, gStat]);
  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;
  const verdictSummary =
    pStat === "nogo"
      ? "Precipitation is present, which is a stop condition."
      : windOverall === "nogo"
      ? "Surface wind is beyond your launch threshold."
      : vStat === "nogo"
      ? "Visibility is below your minimum."
      : fStat === "nogo"
      ? "Ceiling or flight category is below VFR."
      : dStat === "nogo"
      ? "Fog risk is too high with a narrow temperature spread."
      : windOverall === "marginal"
      ? "Surface wind is near your launch threshold."
      : vStat === "marginal"
      ? "Visibility is trending toward minimums."
      : fStat === "marginal"
      ? "Cloud and ceiling conditions are marginal."
      : dStat === "marginal"
      ? "Fog risk is elevated and worth monitoring."
      : nextHourPrecipProb >= 30
      ? "Core signals are solid, but keep an eye on the next-hour precip chance."
      : "Core launch signals are inside your preferred envelope.";

  return (
    <>
      <div className="flex h-full flex-col gap-3">
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_32%),linear-gradient(180deg,#0f2237_0%,#0b1a2b_100%)] shadow-lg shadow-slate-950/20">
          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-sky-400/20 bg-sky-400/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-300/80">
                    Launch Surface
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${flightCat.bgColor} ${flightCat.color}`}>
                    {flightCat.category}
                  </span>
                  {lastUpdatedLabel ? (
                    <span className="flex items-center gap-1 rounded-full border border-white/8 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-slate-300">
                      <Clock className="h-3 w-3 text-slate-400" />
                      Updated {lastUpdatedLabel}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <h2 className="text-2xl font-semibold leading-tight text-white sm:text-3xl">{location.name}</h2>
                  <span className="rounded-full bg-sky-400/12 px-2.5 py-1 text-xs font-mono font-bold tracking-[0.24em] text-sky-300">
                    {location.airport}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                  <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1">
                    <WeatherIcon iconType={current.icon} className="h-4 w-4" />
                    {current.condition}
                  </span>
                  {todaySunrise ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                      <Sunrise className="h-3.5 w-3.5 text-orange-400" />
                      {formatSunTime(todaySunrise)}
                    </span>
                  ) : null}
                  {todaySunset ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                      <Sunset className="h-3.5 w-3.5 text-indigo-400" />
                      {formatSunTime(todaySunset)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-3 self-start rounded-2xl border border-white/8 bg-white/5 px-4 py-3 lg:self-end">
                <WeatherIcon iconType={current.icon} className="h-9 w-9 sm:h-10 sm:w-10" />
                <div className="text-right">
                  <div className="text-4xl font-light leading-none text-white sm:text-5xl">{current.temperature}°</div>
                  <div className="mt-1 text-xs text-slate-400">Feels {current.feelsLike}°</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => togglePanel("verdict")}
              className={`${verdictBg} ${verdictText} mt-5 flex w-full flex-col gap-3 rounded-2xl px-4 py-4 text-left transition-all hover:brightness-105 active:brightness-95 sm:flex-row sm:items-center sm:justify-between`}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-black/10 p-2">
                  <VerdictIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-80">Go / No-Go Verdict</div>
                  <div className="mt-1 text-lg font-bold sm:text-xl">Balloon Launch {verdictLabel}</div>
                  <div className="mt-1 text-sm opacity-85">{verdictSummary}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end text-sm font-semibold sm:self-auto">
                Open breakdown
                <ChevronRight className="h-4 w-4" />
              </div>
            </button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryPanel
            title="Wind"
            icon={Wind}
            status={windOverall}
            value={
              <>
                {current.windSpeed}
                <span className="ml-1 text-sm font-medium text-slate-400">kt</span>
              </>
            }
            detail={`${getWindDirectionName(current.windDirection)} (${current.windDirection}°)`}
            footerLabel="Gusts"
            footerValue={
              <span className={gStat === "nogo" ? "text-red-400" : gStat === "marginal" ? "text-amber-400" : "text-slate-200"}>
                {current.windGusts} kt
              </span>
            }
            isActive={activePanel === "wind"}
            onClick={() => togglePanel("wind")}
          />

          <SummaryPanel
            title="Ceiling"
            icon={Cloud}
            status={fStat}
            value={
              <>
                {current.cloudCover}
                <span className="ml-1 text-sm font-medium text-slate-400">%</span>
              </>
            }
            detail={
              <>
                {getCloudCoverLabel(current.cloudCover)} · {cloudBase.text}
              </>
            }
            footerLabel="Visibility"
            footerValue={
              <span className={vStat === "nogo" ? "text-red-400" : vStat === "marginal" ? "text-amber-400" : "text-slate-200"}>
                {current.visibility} mi
              </span>
            }
            isActive={activePanel === "clouds"}
            onClick={() => togglePanel("clouds")}
          />

          <SummaryPanel
            title="Precip"
            icon={CloudRain}
            status={pStat}
            value={current.precipitation > 0 ? `${current.precipitation}"` : "None"}
            detail={current.condition}
            footerLabel="Next hour"
            footerValue={
              <span className={nextHourPrecipProb >= 50 ? "text-red-400" : nextHourPrecipProb >= 30 ? "text-amber-400" : "text-slate-200"}>
                {nextHourPrecipProb}%
              </span>
            }
            isActive={activePanel === "precip"}
            onClick={() => togglePanel("precip")}
          />

          <SummaryPanel
            title="Dew Point"
            icon={Thermometer}
            status={dStat}
            value={
              <>
                {current.dewPoint}
                <span className="ml-1 text-sm font-medium text-slate-400">°F</span>
              </>
            }
            detail={`Spread ${tempDewSpread}°`}
            footerLabel="Humidity"
            footerValue={<span>{current.humidity}%</span>}
            isActive={activePanel === "dewpoint"}
            onClick={() => togglePanel("dewpoint")}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <MetricPill label="Pressure" value={`${current.pressure} inHg`} />
          <MetricPill
            label="Density Alt"
            value={<span className={densityAlt > 7000 ? "text-red-400" : densityAlt > 5000 ? "text-amber-400" : "text-slate-100"}>{densityAlt.toLocaleString()} ft</span>}
          />
          <MetricPill label="Humidity" value={`${current.humidity}%`} />
          <MetricPill
            label="Visibility"
            value={<span className={vStat === "nogo" ? "text-red-400" : vStat === "marginal" ? "text-amber-400" : "text-slate-100"}>{current.visibility} mi</span>}
            detail={current.visibility >= 10 ? "Clear" : current.visibility >= 5 ? "Moderate" : "Low"}
          />
        </div>

        {next6.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f2237] flex-shrink-0">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Next 6 Hours</span>
                <p className="mt-0.5 text-xs text-slate-500">Short-range wind and precip watch</p>
              </div>
              <button
                onClick={() => setShowHourly(!showHourly)}
                className="flex items-center gap-1 text-xs font-medium text-sky-400 transition-colors hover:text-sky-300"
              >
                <Clock className="h-3.5 w-3.5" />
                {showHourly ? "Hide" : "Full"} Hourly
                {showHourly ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="grid grid-cols-6 divide-x divide-white/10">
              {next6.map((h, i) => {
                const hr = h.time.getHours();
                const ampm = hr >= 12 ? "p" : "a";
                const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
                const hWind = windStatus(h.windSpeed, thresholds);
                const windColor = hWind === "nogo" ? "text-red-400" : hWind === "marginal" ? "text-amber-400" : "text-slate-200";
                return (
                  <button
                    key={i}
                    className="cursor-pointer px-1 py-3 text-center transition-colors hover:bg-white/5"
                    title={`${hr12}${ampm}: ${h.windSpeed}kt wind, ${h.precipitationProbability}% precip`}
                  >
                    <div className="text-xs font-medium text-slate-500">{hr12}{ampm}</div>
                    <div className="my-1 text-lg">
                      <SkyEmoji code={h.weatherCode} cloudCover={h.cloudCover} />
                    </div>
                    <div className={`text-sm font-bold ${windColor}`}>
                      {h.windSpeed}
                      <span className="text-[10px] font-normal">kt</span>
                    </div>
                    <div className={`mt-1 text-[10px] font-semibold ${h.precipitationProbability >= 50 ? "text-red-400" : h.precipitationProbability >= 30 ? "text-amber-400" : "text-slate-500"}`}>
                      {h.precipitationProbability > 0 ? `${h.precipitationProbability}% precip` : "Dry"}
                    </div>
                  </button>
                );
              })}
            </div>

            {showHourly && (
              <div className="border-t border-white/10 p-3">
                <HourlyForecast location={location} hourlyData={hourly} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      {activePanel && (
        <DetailSheet
          panel={activePanel}
          onClose={() => setActivePanel(null)}
          panelTitle={panelMeta[activePanel].title}
          panelIcon={panelMeta[activePanel].icon}
        >
          <DetailPanelContent
            panel={activePanel}
            current={current}
            hourly={hourly}
            wStat={wStat}
            gStat={gStat}
            pStat={pStat}
            vStat={vStat}
            fStat={fStat}
            dStat={dStat}
            cloudBase={cloudBase}
            tempDewSpread={tempDewSpread}
            thresholds={thresholds}
          />
        </DetailSheet>
      )}
    </>
  );
}
