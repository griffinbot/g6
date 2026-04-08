import { useWeather } from "../hooks/useWeather";

interface Location {
  name: string;
  airport: string;
  lat: number;
  lon: number;
}

interface FooterProps {
  location: Location;
}

export function Footer({ location }: FooterProps) {
  const { lastUpdated } = useWeather(location.lat, location.lon);

  return (
    <span className="text-[10px] sm:text-xs text-slate-400 leading-tight">
      {lastUpdated ? (
        <>
          <span className="block">Last Updated</span>
          <span className="block">{lastUpdated.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })}</span>
        </>
      ) : 'Loading...'}
    </span>
  );
}
