import { CheckCircle, AlertTriangle, XCircle, Wind, Eye, Cloud, CloudRain, Plane, Loader2 } from "lucide-react";
import { useWeather, getCeiling, getFlightCategory } from "../hooks/useWeather";
import { useProfileContext } from "../contexts/ProfileContext";
import type { GoNoGoThresholds } from "../../shared/contracts";

interface Location {
  name: string;
  airport: string;
  lat: number;
  lon: number;
}

interface BalloonGoNoGoProps {
  location: Location;
}

type Status = "go" | "marginal" | "nogo";

interface Criterion {
  label: string;
  value: string;
  status: Status;
  icon: React.ReactNode;
}

function statusColor(status: Status) {
  switch (status) {
    case "go": return { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", dot: "bg-green-500" };
    case "marginal": return { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", dot: "bg-yellow-500" };
    case "nogo": return { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" };
  }
}

function overallStatus(criteria: Criterion[]): Status {
  if (criteria.some(c => c.status === "nogo")) return "nogo";
  if (criteria.some(c => c.status === "marginal")) return "marginal";
  return "go";
}

function overallLabel(status: Status): string {
  switch (status) {
    case "go": return "GO";
    case "marginal": return "MARGINAL";
    case "nogo": return "NO-GO";
  }
}

function overallBanner(status: Status) {
  switch (status) {
    case "go": return { bg: "bg-green-500", text: "text-white" };
    case "marginal": return { bg: "bg-yellow-400", text: "text-yellow-900" };
    case "nogo": return { bg: "bg-red-500", text: "text-white" };
  }
}

function StatusIcon({ status }: { status: Status }) {
  switch (status) {
    case "go": return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
    case "marginal": return <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />;
    case "nogo": return <XCircle className="w-3.5 h-3.5 text-red-500" />;
  }
}

function evalWindStatus(speed: number, t: GoNoGoThresholds): Status {
  if (speed > t.windSpeedMarginal) return "nogo";
  if (speed > t.windSpeedGo) return "marginal";
  return "go";
}

function evalGustStatus(gusts: number, t: GoNoGoThresholds): Status {
  if (gusts > t.gustMarginal) return "nogo";
  if (gusts > t.gustGo) return "marginal";
  return "go";
}

function evalVisStatus(vis: number, t: GoNoGoThresholds): Status {
  if (vis < t.visibilityMarginal) return "nogo";
  if (vis < t.visibilityGo) return "marginal";
  return "go";
}

export function BalloonGoNoGo({ location }: BalloonGoNoGoProps) {
  const { current, loading, error } = useWeather(location.lat, location.lon);
  const { preferences } = useProfileContext();
  const t = preferences.goNoGoThresholds;

  if (loading && !current) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
        <span className="text-gray-500 text-sm">Evaluating flight conditions...</span>
      </div>
    );
  }

  if (error && !current) return null;
  if (!current) return null;

  const ceiling = getCeiling(current.cloudCover);
  const flightCat = getFlightCategory(current.visibility, ceiling);

  const windStatus = evalWindStatus(current.windSpeed, t);
  const gustStatus = evalGustStatus(current.windGusts, t);
  const precipStatus: Status = current.precipitation > 0 ? "nogo" : "go";
  const visStatus = evalVisStatus(current.visibility, t);
  const flightCatStatus: Status = (flightCat.category === "IFR" || flightCat.category === "LIFR") ? "nogo" : flightCat.category === "MVFR" ? "marginal" : "go";

  const criteria: Criterion[] = [
    { label: "Surface Wind", value: `${current.windSpeed} kt`, status: windStatus, icon: <Wind className="w-3 h-3" /> },
    { label: "Gusts", value: `${current.windGusts} kt`, status: gustStatus, icon: <Wind className="w-3 h-3" /> },
    { label: "Precipitation", value: current.precipitation > 0 ? `${current.precipitation}"` : "None", status: precipStatus, icon: <CloudRain className="w-3 h-3" /> },
    { label: "Visibility", value: `${current.visibility} mi`, status: visStatus, icon: <Eye className="w-3 h-3" /> },
    { label: "Flight Category", value: flightCat.category, status: flightCatStatus, icon: <Plane className="w-3 h-3" /> },
  ];

  const overall = overallStatus(criteria);
  const banner = overallBanner(overall);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className={`${banner.bg} ${banner.text} px-4 py-2 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4" />
          <span className="text-sm font-semibold">Balloon Go/No-Go</span>
        </div>
        <span className="text-sm font-bold tracking-wide">{overallLabel(overall)}</span>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {criteria.map((c) => {
            const colors = statusColor(c.status);
            return (
              <div key={c.label} className={`${colors.bg} ${colors.border} border rounded-lg p-2 flex flex-col gap-0.5`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-gray-500 text-[9px]">
                    {c.icon}
                    <span>{c.label}</span>
                  </div>
                  <StatusIcon status={c.status} />
                </div>
                <div className={`font-semibold text-xs ${colors.text}`}>{c.value}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[9px] text-gray-400">
          <span>Wind ≤{t.windSpeedGo}kt = Go, ≤{t.windSpeedMarginal}kt = Marginal, &gt;{t.windSpeedMarginal}kt = No-Go</span>
          <span>Gusts ≤{t.gustGo}kt = Go, ≤{t.gustMarginal}kt = Marginal, &gt;{t.gustMarginal}kt = No-Go</span>
          <span>Any Precip = No-Go</span>
          <span>Vis ≥{t.visibilityGo}mi = Go, ≥{t.visibilityMarginal}mi = Marginal, &lt;{t.visibilityMarginal}mi = No-Go</span>
          <span>IFR/LIFR = No-Go</span>
        </div>
      </div>
    </div>
  );
}
