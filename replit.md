# Weather Griff

## Project Overview
Aviation/balloon weather app built with React + Vite + Tailwind CSS. Displays real-time weather data for airports and locations, including surface conditions, winds aloft, forecasts, flight planning tools, and balloon-specific decision support.

## Architecture
- **Frontend**: React 18 + TypeScript + Vite 6
- **Styling**: Tailwind CSS v4 + Radix UI components + MUI
- **Entry point**: `app/main.tsx` → `app/App.tsx`
- **API functions**: `functions/api/` (Cloudflare Pages Functions style)
- **Build output**: `dist/`

## Key Directories
- `app/` - React components, hooks, and services
- `app/components/` - UI components (weather views, dialogs, panels)
- `app/hooks/` - Custom React hooks for data fetching
- `app/services/` - Weather proxy service
- `app/lib/` - Utility libraries (balloon trajectory calculations)
- `functions/` - Backend API proxy functions
- `styles/` - Global CSS files
- `public/` - Static assets

## Navigation Tabs
- **Overview** - Unified decision dashboard: Go/No-Go verdict, 4 primary cards (Wind, Clouds, Precip, Dew Point), metrics row, 6-hour outlook
- **Discussion** - NWS Area Forecast Discussion
- **Airports** - METAR/TAF reports
- **Wind Aloft** - Vertical wind profile (surface to ~34,000 ft AGL) with shear/inversion detection
- **Forecast** - Multi-day NWS-style aviation weather infographic (72-hour hourly data)
- **7-Day** - 7-day forecast outlook
- **Map** - Interactive map with KML file upload/overlay, satellite/street/topo layers, labeled placemarks/polygons/lines
- **Wind Viz** - Balloon drift/trajectory visualization
- **Flight Plan** - Route planning (in development)
- **Settings** - User preferences

## Key Components
- `CurrentWeather.tsx` - Unified decision dashboard with Go/No-Go verdict bar, 4 primary decision cards, supporting metrics row, 6-hour outlook
- `MapView.tsx` - Leaflet map with satellite/street/topo tiles, KML file upload (drag-and-drop), parses points/lines/polygons with labels and style extraction
- `AviationForecastInfographic.tsx` - NWS-style multi-day hourly forecast infographic
- `WindDataTable.tsx` - Winds aloft data table (surface to ~34,000 ft AGL) with CAPE, wind shear, and temperature inversion indicators
- `WindVisualization.tsx` - Map-based balloon drift/reachability planner
- `SavedLocationWidget.tsx` - Compact location cards with weather summaries

## Key Hooks
- `useWeather.ts` - Open-Meteo API: current conditions, 72h hourly, 7-day daily forecasts, elevation
- `useWindAloft.ts` - Open-Meteo pressure-level wind data (surface to ~34,000 ft AGL)

## Dependencies
- `leaflet` + `@types/leaflet` - Map rendering for MapView (no react-leaflet, using vanilla Leaflet with React refs)

## Development
- Run: `npm run dev` (starts Vite dev server on port 5000)
- Build: `npm run build`

## Deployment
- Type: Static site
- Build command: `npm run build`
- Public directory: `dist`

## Replit Configuration
- Frontend runs on port 5000 (0.0.0.0)
- Vite configured with `allowedHosts: true` for Replit proxy support
