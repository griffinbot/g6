import { Settings, Bell, Globe, Thermometer, Wind, Gauge, Mail, BarChart3, CloudRain } from "lucide-react";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Separator } from "./ui/separator";
import { Input } from "./ui/input";
import { MetadataReport } from "./MetadataReport";
import { useProfileContext } from "../contexts/ProfileContext";
import type { GoNoGoThresholds } from "../../shared/contracts";

interface SettingsPanelProps {
  location: {
    name: string;
    airport: string;
  };
}

function ThresholdField({
  label,
  description,
  value,
  onChange,
  unit,
  min,
  max,
  step,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5 flex-1 min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Input
          type="number"
          value={value}
          min={min ?? 0}
          max={max ?? 999}
          step={step ?? 1}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onChange(n);
          }}
          className="w-20 text-center text-sm h-8"
        />
        <span className="text-xs text-gray-500 w-6">{unit}</span>
      </div>
    </div>
  );
}

export function SettingsPanel({ location }: SettingsPanelProps) {
  const { preferences, savePreferences } = useProfileContext();
  const t = preferences.goNoGoThresholds;

  function updateThreshold(key: keyof GoNoGoThresholds, value: number) {
    savePreferences({
      ...preferences,
      goNoGoThresholds: {
        ...t,
        [key]: value,
      },
    });
  }

  return (
    <div className="w-full p-6 xl:px-8 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold mb-2">Settings</h2>
            <p className="text-gray-600">Customize your weather app experience</p>
          </div>
          <Settings className="w-8 h-8 text-blue-500" />
        </div>
      </div>

      {/* Units */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-blue-500" />
          Units & Display
        </h3>
        
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-gray-400" />
                Temperature
              </Label>
              <p className="text-sm text-gray-500">Choose temperature display unit</p>
            </div>
            <Select defaultValue="fahrenheit">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fahrenheit">Fahrenheit (°F)</SelectItem>
                <SelectItem value="celsius">Celsius (°C)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base flex items-center gap-2">
                <Wind className="w-4 h-4 text-gray-400" />
                Wind Speed
              </Label>
              <p className="text-sm text-gray-500">Choose wind speed unit</p>
            </div>
            <Select defaultValue="knots">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="knots">Knots (kt)</SelectItem>
                <SelectItem value="mph">Miles per hour (mph)</SelectItem>
                <SelectItem value="kph">Kilometers per hour (km/h)</SelectItem>
                <SelectItem value="ms">Meters per second (m/s)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base flex items-center gap-2">
                <Gauge className="w-4 h-4 text-gray-400" />
                Pressure
              </Label>
              <p className="text-sm text-gray-500">Choose pressure unit</p>
            </div>
            <Select defaultValue="inhg">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inhg">Inches of Mercury (inHg)</SelectItem>
                <SelectItem value="mb">Millibars (mb)</SelectItem>
                <SelectItem value="hpa">Hectopascals (hPa)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base">Distance/Visibility</Label>
              <p className="text-sm text-gray-500">Choose distance unit</p>
            </div>
            <Select defaultValue="miles">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="miles">Miles (mi)</SelectItem>
                <SelectItem value="kilometers">Kilometers (km)</SelectItem>
                <SelectItem value="nautical">Nautical Miles (nm)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base">Altitude</Label>
              <p className="text-sm text-gray-500">Choose altitude unit</p>
            </div>
            <Select defaultValue="feet">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="feet">Feet (ft)</SelectItem>
                <SelectItem value="meters">Meters (m)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Go/No-Go Thresholds */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
          <CloudRain className="w-5 h-5 text-blue-500" />
          Go/No-Go Thresholds
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          Set the cutoff values used to evaluate balloon flight conditions. Changes save immediately.
        </p>

        <div className="space-y-5">
          {/* Surface Wind */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Surface Wind Speed (kt)</p>
            <div className="space-y-3 pl-1">
              <ThresholdField
                label="GO cutoff"
                description="Wind at or below this speed is GO"
                value={t.windSpeedGo}
                onChange={(v) => updateThreshold("windSpeedGo", v)}
                unit="kt"
                min={0}
                max={30}
              />
              <ThresholdField
                label="MARGINAL cutoff"
                description="Wind above GO but at or below this speed is MARGINAL"
                value={t.windSpeedMarginal}
                onChange={(v) => updateThreshold("windSpeedMarginal", v)}
                unit="kt"
                min={0}
                max={30}
              />
            </div>
          </div>

          <Separator />

          {/* Wind Gusts */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Wind Gusts (kt)</p>
            <div className="space-y-3 pl-1">
              <ThresholdField
                label="GO cutoff"
                description="Gusts at or below this speed are GO"
                value={t.gustGo}
                onChange={(v) => updateThreshold("gustGo", v)}
                unit="kt"
                min={0}
                max={40}
              />
              <ThresholdField
                label="MARGINAL cutoff"
                description="Gusts above GO but at or below this speed are MARGINAL"
                value={t.gustMarginal}
                onChange={(v) => updateThreshold("gustMarginal", v)}
                unit="kt"
                min={0}
                max={40}
              />
            </div>
          </div>

          <Separator />

          {/* Visibility */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Visibility (mi)</p>
            <div className="space-y-3 pl-1">
              <ThresholdField
                label="GO cutoff"
                description="Visibility at or above this distance is GO"
                value={t.visibilityGo}
                onChange={(v) => updateThreshold("visibilityGo", v)}
                unit="mi"
                min={0}
                max={20}
                step={0.5}
              />
              <ThresholdField
                label="MARGINAL cutoff"
                description="Visibility below GO but at or above this distance is MARGINAL"
                value={t.visibilityMarginal}
                onChange={(v) => updateThreshold("visibilityMarginal", v)}
                unit="mi"
                min={0}
                max={20}
                step={0.5}
              />
            </div>
          </div>

          <Separator />

          {/* Dew Point Spread */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Dew Point Spread (°F)</p>
            <div className="space-y-3 pl-1">
              <ThresholdField
                label="GO cutoff"
                description="Spread above this value is GO (higher spread = less fog risk)"
                value={t.dewPointSpreadGo}
                onChange={(v) => updateThreshold("dewPointSpreadGo", v)}
                unit="°F"
                min={0}
                max={30}
              />
              <ThresholdField
                label="MARGINAL cutoff"
                description="Spread below GO but above this value is MARGINAL"
                value={t.dewPointSpreadMarginal}
                onChange={(v) => updateThreshold("dewPointSpreadMarginal", v)}
                unit="°F"
                min={0}
                max={30}
              />
            </div>
          </div>

          <Separator />

          {/* Non-editable items */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Fixed Rules (not editable)</p>
            <div className="space-y-2 pl-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Precipitation</span>
                <span className="text-xs bg-red-50 text-red-600 border border-red-200 rounded px-2 py-0.5 font-medium">Any = NO-GO</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Flight Category</span>
                <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded px-2 py-0.5 font-medium">IFR/LIFR = NO-GO · MVFR = Marginal</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-500" />
          Notifications & Alerts
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="severe-weather" className="text-base">Severe Weather Alerts</Label>
              <p className="text-sm text-gray-500">Receive alerts for severe weather conditions</p>
            </div>
            <Switch id="severe-weather" defaultChecked />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="wind-alerts" className="text-base">High Wind Alerts</Label>
              <p className="text-sm text-gray-500">Get notified when winds exceed 25 knots</p>
            </div>
            <Switch id="wind-alerts" defaultChecked />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="visibility-alerts" className="text-base">Low Visibility Alerts</Label>
              <p className="text-sm text-gray-500">Alert when visibility drops below 3 miles</p>
            </div>
            <Switch id="visibility-alerts" defaultChecked />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="forecast-updates" className="text-base">Forecast Updates</Label>
              <p className="text-sm text-gray-500">Notify when forecasts are updated</p>
            </div>
            <Switch id="forecast-updates" />
          </div>
        </div>
      </div>

      {/* Data & Privacy */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-lg mb-4">Data & Display Preferences</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto-refresh" className="text-base">Auto-Refresh Data</Label>
              <p className="text-sm text-gray-500">Automatically update weather data every 15 minutes</p>
            </div>
            <Switch id="auto-refresh" defaultChecked />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="detailed-view" className="text-base">Detailed Wind Tables</Label>
              <p className="text-sm text-gray-500">Show comprehensive wind data by default</p>
            </div>
            <Switch id="detailed-view" defaultChecked />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="24-hour" className="text-base">24-Hour Time Format</Label>
              <p className="text-sm text-gray-500">Use 24-hour clock instead of 12-hour</p>
            </div>
            <Switch id="24-hour" />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="save-locations" className="text-base">Save Location History</Label>
              <p className="text-sm text-gray-500">Remember previously searched locations</p>
            </div>
            <Switch id="save-locations" defaultChecked />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-500" />
              Metadata
            </h3>
            <p className="text-sm text-gray-500">
              Data sources, model runs, and confidence metrics for {location.name}
            </p>
          </div>
        </div>
      </div>

      <MetadataReport location={location} embedded />

      {/* About */}
      <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
        <div className="text-center space-y-2">
          <h4 className="font-semibold">Weather App for Aviation</h4>
          <p className="text-sm text-gray-600">Version 1.0.0</p>
          <p className="text-xs text-gray-500 mt-4">
            Data provided by NOAA, National Weather Service, and Aviation Weather Center
          </p>
        </div>
      </div>

      {/* Feedback */}
      <a
        href="mailto:support@example.com?subject=Aviation Weather App - Bug Report"
        className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl p-4 sm:p-5 flex items-center justify-center gap-2 font-semibold text-base shadow-sm transition-colors"
      >
        <Mail className="w-5 h-5" />
        <span>Report a Bug</span>
      </a>
    </div>
  );
}
