import { createContext, useContext, ReactNode } from "react";
import { useWeather, WeatherState } from "../hooks/useWeather";

interface WeatherContextValue extends WeatherState {
  refetch: () => void;
}

const WeatherContext = createContext<WeatherContextValue | null>(null);

interface WeatherProviderProps {
  lat: number;
  lon: number;
  children: ReactNode;
}

export function WeatherProvider({ lat, lon, children }: WeatherProviderProps) {
  const weather = useWeather(lat, lon);
  return (
    <WeatherContext.Provider value={weather}>
      {children}
    </WeatherContext.Provider>
  );
}

export function useWeatherContext(): WeatherContextValue {
  const ctx = useContext(WeatherContext);
  if (!ctx) throw new Error("useWeatherContext must be used within a WeatherProvider");
  return ctx;
}
