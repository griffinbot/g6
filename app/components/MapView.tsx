import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Upload, Layers, X, ChevronDown, ChevronUp, Eye, EyeOff, AlertCircle } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";

function isValidCoord(lat: number, lng: number): boolean {
  return isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

interface KMLLayer {
  id: string;
  name: string;
  visible: boolean;
  layerGroup: L.LayerGroup;
  featureCount: number;
  bounds: L.LatLngBounds | null;
}

interface ParsedFeature {
  name: string;
  description: string;
  type: "point" | "line" | "polygon";
  coordinates: [number, number][] | [number, number];
  style: {
    color: string;
    fillColor: string;
    fillOpacity: number;
    weight: number;
    iconColor: string;
  };
  folder: string;
}

const AIRSPACE_COLORS: Record<string, { color: string; fillColor: string; label: string; dashArray?: string }> = {
  B: { color: "#1565c0", fillColor: "#1976d2", label: "Class B" },
  C: { color: "#ad1457", fillColor: "#c2185b", label: "Class C" },
  D: { color: "#1565c0", fillColor: "#1976d2", label: "Class D", dashArray: "6 4" },
  E: { color: "#f9a825", fillColor: "#fbc02d", label: "Class E" },
  SUA: { color: "#b71c1c", fillColor: "#c62828", label: "Special Use" },
};

function parseKMLColor(kmlColor: string): string {
  if (!kmlColor || kmlColor.length < 8) return "#3388ff";
  const b = kmlColor.substring(2, 4);
  const g = kmlColor.substring(4, 6);
  const r = kmlColor.substring(6, 8);
  return `#${r}${g}${b}`;
}

function parseKML(kmlText: string): { features: ParsedFeature[]; name: string } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, "text/xml");

  const docName = doc.querySelector("Document > name")?.textContent || "Imported KML";

  const styles: Record<string, { color: string; fillColor: string; fillOpacity: number; width: number; iconColor: string }> = {};

  doc.querySelectorAll("Style").forEach((style) => {
    const id = style.getAttribute("id") || "";
    const lineColor = style.querySelector("LineStyle > color")?.textContent || "";
    const lineWidth = parseFloat(style.querySelector("LineStyle > width")?.textContent || "2");
    const polyColor = style.querySelector("PolyStyle > color")?.textContent || "";
    const iconHref = style.querySelector("IconStyle > Icon > href")?.textContent || "";

    let iconColor = "#3388ff";
    if (iconHref.includes("red")) iconColor = "#e74c3c";
    else if (iconHref.includes("grn") || iconHref.includes("green")) iconColor = "#2ecc71";
    else if (iconHref.includes("blu") || iconHref.includes("blue")) iconColor = "#3498db";
    else if (iconHref.includes("ylw") || iconHref.includes("yellow")) iconColor = "#f1c40f";
    else if (iconHref.includes("pink") || iconHref.includes("purple")) iconColor = "#9b59b6";
    else if (iconHref.includes("wht") || iconHref.includes("white")) iconColor = "#ecf0f1";
    else if (iconHref.includes("ltblu")) iconColor = "#74b9ff";

    const parsedLineColor = lineColor ? parseKMLColor(lineColor) : "#3388ff";
    const parsedPolyColor = polyColor ? parseKMLColor(polyColor) : parsedLineColor;
    const polyOpacity = polyColor && polyColor.length >= 2 ? parseInt(polyColor.substring(0, 2), 16) / 255 : 0.3;

    styles[id] = {
      color: parsedLineColor,
      fillColor: parsedPolyColor,
      fillOpacity: polyOpacity,
      width: lineWidth,
      iconColor,
    };
  });

  const styleMaps: Record<string, string> = {};
  doc.querySelectorAll("StyleMap").forEach((sm) => {
    const smId = sm.getAttribute("id") || "";
    const normalPair = Array.from(sm.querySelectorAll("Pair")).find(
      (p) => p.querySelector("key")?.textContent === "normal"
    );
    if (normalPair) {
      const url = normalPair.querySelector("styleUrl")?.textContent || "";
      styleMaps[smId] = url.replace("#", "");
    }
  });

  function resolveStyle(styleUrl: string) {
    const id = styleUrl.replace("#", "");
    if (styleMaps[id]) {
      return styles[styleMaps[id]] || null;
    }
    return styles[id] || null;
  }

  const features: ParsedFeature[] = [];

  doc.querySelectorAll("Placemark").forEach((pm) => {
    const name = pm.querySelector("name")?.textContent || "";
    const description = pm.querySelector("description")?.textContent || "";
    const styleUrl = pm.querySelector("styleUrl")?.textContent || "";
    const resolvedStyle = resolveStyle(styleUrl);

    let folder = "";
    let parent = pm.parentElement;
    while (parent) {
      if (parent.tagName === "Folder") {
        const folderName = parent.querySelector(":scope > name")?.textContent;
        if (folderName) {
          folder = folderName;
          break;
        }
      }
      parent = parent.parentElement;
    }

    const defaultStyle = {
      color: "#3388ff",
      fillColor: "#3388ff",
      fillOpacity: 0.3,
      weight: 2,
      iconColor: "#3388ff",
    };

    const style = {
      color: resolvedStyle?.color || defaultStyle.color,
      fillColor: resolvedStyle?.fillColor || defaultStyle.fillColor,
      fillOpacity: resolvedStyle?.fillOpacity ?? defaultStyle.fillOpacity,
      weight: resolvedStyle?.width || defaultStyle.weight,
      iconColor: resolvedStyle?.iconColor || defaultStyle.iconColor,
    };

    const point = pm.querySelector("Point");
    if (point) {
      const coordText = point.querySelector("coordinates")?.textContent?.trim() || "";
      const parts = coordText.split(",").map(Number);
      if (parts.length >= 2 && isValidCoord(parts[1], parts[0])) {
        features.push({
          name,
          description,
          type: "point",
          coordinates: [parts[1], parts[0]],
          style,
          folder,
        });
      }
      return;
    }

    const line = pm.querySelector("LineString");
    if (line) {
      const coordText = line.querySelector("coordinates")?.textContent?.trim() || "";
      const coords = coordText
        .split(/\s+/)
        .filter(Boolean)
        .map((c) => {
          const p = c.split(",").map(Number);
          return [p[1], p[0]] as [number, number];
        })
        .filter(([lat, lng]) => isValidCoord(lat, lng));
      if (coords.length >= 2) {
        features.push({
          name,
          description,
          type: "line",
          coordinates: coords,
          style,
          folder,
        });
      }
      return;
    }

    const polygon = pm.querySelector("Polygon");
    if (polygon) {
      const coordText =
        polygon.querySelector("outerBoundaryIs LinearRing coordinates")?.textContent?.trim() || "";
      const coords = coordText
        .split(/\s+/)
        .filter(Boolean)
        .map((c) => {
          const p = c.split(",").map(Number);
          return [p[1], p[0]] as [number, number];
        })
        .filter(([lat, lng]) => isValidCoord(lat, lng));
      if (coords.length >= 3) {
        features.push({
          name,
          description,
          type: "polygon",
          coordinates: coords,
          style,
          folder,
        });
      }
    }
  });

  return { features, name: docName };
}

function createMarkerIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "custom-kml-marker",
    html: `<div style="
      width: 12px; height: 12px;
      background: ${color};
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -8],
  });
}

function classifyAirspace(props: Record<string, unknown>): keyof typeof AIRSPACE_COLORS | null {
  const classStr = String(
    props.AIRSPACE_CLASS || props.airspace_class || props.CLASS ||
    props.type_code || props.type || props.CLASS_AIRSPACE || ""
  ).toUpperCase().trim();

  const nameStr = String(props.NAME || props.name || "").toUpperCase();
  const typeStr = String(props.TYPE || props.type || props.TYPE_CODE || "").toUpperCase();

  if (classStr === "B" || nameStr.includes("CLASS B") || typeStr === "CLASS_B") return "B";
  if (classStr === "C" || nameStr.includes("CLASS C") || typeStr === "CLASS_C") return "C";
  if (classStr === "D" || nameStr.includes("CLASS D") || typeStr === "CLASS_D") return "D";
  if (
    classStr === "E" || classStr === "E2" || classStr === "E3" || classStr === "E4" ||
    nameStr.includes("CLASS E") || typeStr === "CLASS_E"
  )
    return "E";
  if (
    classStr === "SUA" ||
    typeStr.includes("MOA") || typeStr.includes("RESTRICTED") ||
    typeStr.includes("WARNING") || typeStr.includes("PROHIBITED") ||
    typeStr.includes("ALERT") || typeStr.includes("DANGER") ||
    nameStr.includes("MOA") || nameStr.includes("RESTRICTED") ||
    nameStr.includes("WARNING AREA") || nameStr.includes("PROHIBITED")
  )
    return "SUA";
  return null;
}

export function MapView({ location }: { location: { name: string; lat: number; lon: number; airport: string } }) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const airspaceLayerRef = useRef<L.LayerGroup | null>(null);
  const [kmlLayers, setKmlLayers] = useState<KMLLayer[]>([]);
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [isMobileToolsOpen, setIsMobileToolsOpen] = useState(false);

  const [overlayPanelOpen, setOverlayPanelOpen] = useState(true);
  const [airspaceEnabled, setAirspaceEnabled] = useState(false);
  const [enumclawEnabled, setEnumclawEnabled] = useState(false);
  const [airspaceLoading, setAirspaceLoading] = useState(false);
  const [enumclawLoading, setEnumclawLoading] = useState(false);
  const [airspaceError, setAirspaceError] = useState<string | null>(null);
  const [enumclawError, setEnumclawError] = useState<string | null>(null);
  const enumclawLayerIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [location.lat, location.lon],
      zoom: 10,
      zoomControl: false,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri",
        maxZoom: 19,
      }
    );

    const streets = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }
    );

    const topo = L.tileLayer(
      "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      {
        attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
        maxZoom: 17,
      }
    );

    satellite.addTo(map);

    L.control
      .layers(
        { Satellite: satellite, Streets: streets, Topographic: topo },
        {},
        { position: "topright" }
      )
      .addTo(map);

    L.control.scale({ position: "bottomleft" }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView([location.lat, location.lon], mapRef.current.getZoom());
    }
  }, [location.lat, location.lon]);

  const addKMLToMap = useCallback(
    (kmlText: string, fileName: string): string | null => {
      if (!mapRef.current) return null;

      const { features, name } = parseKML(kmlText);
      if (features.length === 0) return null;

      const layerGroup = L.layerGroup();
      const bounds = L.latLngBounds([]);

      features.forEach((f) => {
        if (f.type === "point") {
          const [lat, lng] = f.coordinates as [number, number];
          const marker = L.marker([lat, lng], {
            icon: createMarkerIcon(f.style.iconColor),
          });

          let popupContent = `<div style="max-width:250px">`;
          popupContent += `<strong style="font-size:13px">${escapeHtml(f.name || "Unnamed")}</strong>`;
          if (f.folder) popupContent += `<br><span style="color:#666;font-size:11px">${escapeHtml(f.folder)}</span>`;
          if (f.description) popupContent += `<br><div style="font-size:11px;margin-top:4px;max-height:100px;overflow:auto">${escapeHtml(f.description)}</div>`;
          popupContent += `</div>`;

          marker.bindPopup(popupContent);
          marker.bindTooltip(escapeHtml(f.name || "Unnamed"), {
            permanent: false,
            direction: "top",
            offset: [0, -8],
            className: "kml-tooltip",
          });

          layerGroup.addLayer(marker);
          bounds.extend([lat, lng]);
        } else if (f.type === "line") {
          const coords = f.coordinates as [number, number][];
          const polyline = L.polyline(coords, {
            color: f.style.color,
            weight: f.style.weight,
            opacity: 0.8,
          });

          let popupContent = `<strong>${escapeHtml(f.name || "Unnamed Line")}</strong>`;
          if (f.folder) popupContent += `<br><span style="color:#666;font-size:11px">${escapeHtml(f.folder)}</span>`;

          polyline.bindPopup(popupContent);
          layerGroup.addLayer(polyline);
          coords.forEach((c) => bounds.extend(c));
        } else if (f.type === "polygon") {
          const coords = f.coordinates as [number, number][];
          const polygon = L.polygon(coords, {
            color: f.style.color,
            fillColor: f.style.fillColor,
            fillOpacity: f.style.fillOpacity,
            weight: f.style.weight,
          });

          let popupContent = `<strong>${escapeHtml(f.name || "Unnamed Area")}</strong>`;
          if (f.folder) popupContent += `<br><span style="color:#666;font-size:11px">${escapeHtml(f.folder)}</span>`;
          if (f.description) popupContent += `<br><div style="font-size:11px;margin-top:4px;max-height:100px;overflow:auto">${escapeHtml(f.description)}</div>`;

          polygon.bindPopup(popupContent);
          layerGroup.addLayer(polygon);
          coords.forEach((c) => bounds.extend(c));
        }
      });

      layerGroup.addTo(mapRef.current);

      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [40, 40] });
      }

      const layerId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const layer: KMLLayer = {
        id: layerId,
        name: name || fileName.replace(/\.kml$/i, ""),
        visible: true,
        layerGroup,
        featureCount: features.length,
        bounds: bounds.isValid() ? bounds : null,
      };

      setKmlLayers((prev) => [...prev, layer]);
      return layerId;
    },
    []
  );

  const handleFileUpload = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      setLoadingFile(true);

      Array.from(files).forEach((file) => {
        if (!file.name.toLowerCase().endsWith(".kml")) {
          setLoadingFile(false);
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          if (text) {
            addKMLToMap(text, file.name);
          }
          setLoadingFile(false);
        };
        reader.onerror = () => setLoadingFile(false);
        reader.readAsText(file);
      });
    },
    [addKMLToMap]
  );

  const toggleLayerVisibility = useCallback((layerId: string) => {
    setKmlLayers((prev) =>
      prev.map((layer) => {
        if (layer.id === layerId) {
          if (layer.visible) {
            mapRef.current?.removeLayer(layer.layerGroup);
          } else {
            layer.layerGroup.addTo(mapRef.current!);
          }
          return { ...layer, visible: !layer.visible };
        }
        return layer;
      })
    );
  }, []);

  const removeLayer = useCallback((layerId: string) => {
    setKmlLayers((prev) => {
      const layer = prev.find((l) => l.id === layerId);
      if (layer) {
        mapRef.current?.removeLayer(layer.layerGroup);
      }
      return prev.filter((l) => l.id !== layerId);
    });
  }, []);

  const zoomToLayer = useCallback((layer: KMLLayer) => {
    if (layer.bounds && mapRef.current) {
      mapRef.current.fitBounds(layer.bounds, { padding: [40, 40] });
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      handleFileUpload(e.dataTransfer.files);
    },
    [handleFileUpload]
  );

  const loadAirspace = useCallback(async () => {
    if (!mapRef.current) return;
    setAirspaceLoading(true);
    setAirspaceError(null);

    try {
      const map = mapRef.current;
      const bounds = map.getBounds();
      const minLat = bounds.getSouth().toFixed(4);
      const maxLat = bounds.getNorth().toFixed(4);
      const minLon = bounds.getWest().toFixed(4);
      const maxLon = bounds.getEast().toFixed(4);

      const proxyUrl = `/api/airspace?minLat=${minLat}&maxLat=${maxLat}&minLon=${minLon}&maxLon=${maxLon}`;

      const res = await fetch(proxyUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        throw new Error(`Airspace API error: ${res.status}`);
      }

      const json = await res.json();

      const layerGroup = L.layerGroup();
      let featureCount = 0;

      function renderGeoJsonCoords(
        geomType: string,
        coordinates: unknown,
        props: Record<string, unknown>
      ) {
        const airClass = classifyAirspace(props);
        if (!airClass) return;
        const style = AIRSPACE_COLORS[airClass];

        const name = escapeHtml(
          String(
            props.NAME || props.name || props.designator || props.DESIGNATOR ||
            props.airspace_class || props.id || "Airspace"
          )
        );
        const ceiling = escapeHtml(
          String(props.CEILING || props.ceiling || props.upper_alt || props.HIGH_ALT || "")
        );
        const floor = escapeHtml(
          String(props.FLOOR || props.floor || props.lower_alt || props.LOW_ALT || "")
        );

        const popupHtml = `
          <div style="min-width:160px">
            <strong style="font-size:13px">${name}</strong>
            <br/><span style="color:${style.color};font-size:11px;font-weight:600">${style.label}${airClass ? ` (Class ${airClass})` : ""}</span>
            ${ceiling ? `<br/><span style="font-size:11px">Ceiling: ${ceiling}</span>` : ""}
            ${floor ? `<br/><span style="font-size:11px">Floor: ${floor}</span>` : ""}
          </div>
        `;

        const polyOptions: L.PolylineOptions = {
          color: style.color,
          fillColor: style.fillColor,
          fillOpacity: 0.2,
          weight: 2,
          dashArray: style.dashArray,
        };

        function ringToLatLngs(ring: unknown[]): [number, number][] {
          return (ring as number[][])
            .map(([lon, lat]) => [lat, lon] as [number, number])
            .filter(([lat, lon]) => isValidCoord(lat, lon));
        }

        if (geomType === "Polygon" && Array.isArray(coordinates)) {
          const outer = ringToLatLngs((coordinates as unknown[][])[0] || []);
          const holes = (coordinates as unknown[][]).slice(1).map((ring) =>
            ringToLatLngs(ring as unknown[])
          );
          if (outer.length >= 3) {
            const poly = holes.length > 0
              ? L.polygon([outer, ...holes], polyOptions)
              : L.polygon(outer, polyOptions);
            poly.bindPopup(popupHtml);
            layerGroup.addLayer(poly);
            featureCount++;
          }
        } else if (geomType === "MultiPolygon" && Array.isArray(coordinates)) {
          (coordinates as unknown[][][]).forEach((polygonCoords) => {
            const outer = ringToLatLngs((polygonCoords[0] as unknown[]) || []);
            const holes = polygonCoords.slice(1).map((ring) =>
              ringToLatLngs(ring as unknown[])
            );
            if (outer.length >= 3) {
              const poly = holes.length > 0
                ? L.polygon([outer, ...holes], polyOptions)
                : L.polygon(outer, polyOptions);
              poly.bindPopup(popupHtml);
              layerGroup.addLayer(poly);
              featureCount++;
            }
          });
        }
      }

      function processFeature(feature: Record<string, unknown>) {
        const geometry = feature.geometry as Record<string, unknown> | null;
        const properties = (feature.properties as Record<string, unknown>) || {};
        if (!geometry || !geometry.type) return;
        renderGeoJsonCoords(
          String(geometry.type),
          geometry.coordinates,
          properties
        );
      }

      if (json && json.type === "FeatureCollection" && Array.isArray(json.features)) {
        json.features.forEach((f: Record<string, unknown>) => processFeature(f));
      } else if (json && json.type === "Feature") {
        processFeature(json as Record<string, unknown>);
      } else if (Array.isArray(json)) {
        json.forEach((item: Record<string, unknown>) => {
          if (item.type === "Feature") {
            processFeature(item);
          } else if (item.geometry) {
            processFeature(item);
          }
        });
      }

      if (airspaceLayerRef.current) {
        mapRef.current.removeLayer(airspaceLayerRef.current);
      }

      layerGroup.addTo(mapRef.current);
      airspaceLayerRef.current = layerGroup;

      if (featureCount === 0) {
        setAirspaceError("No airspace features found for the current map view.");
      }
    } catch (err) {
      setAirspaceError("Failed to load airspace data. Check your connection.");
      console.error("Airspace fetch error:", err);
    } finally {
      setAirspaceLoading(false);
    }
  }, []);

  const removeAirspace = useCallback(() => {
    if (airspaceLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(airspaceLayerRef.current);
      airspaceLayerRef.current = null;
    }
    setAirspaceError(null);
  }, []);

  const handleAirspaceToggle = useCallback(async () => {
    const newVal = !airspaceEnabled;
    setAirspaceEnabled(newVal);
    if (newVal) {
      await loadAirspace();
    } else {
      removeAirspace();
    }
  }, [airspaceEnabled, loadAirspace, removeAirspace]);

  const handleEnumclawToggle = useCallback(async () => {
    const newVal = !enumclawEnabled;
    setEnumclawEnabled(newVal);

    if (newVal) {
      setEnumclawLoading(true);
      setEnumclawError(null);
      try {
        const res = await fetch("/Enumclaw_JULY_3RD_KML.kml");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const layerId = addKMLToMap(text, "Enumclaw JULY 3RD KML");
        if (layerId) {
          enumclawLayerIdRef.current = layerId;
        } else {
          setEnumclawError("KML file loaded but contained no features.");
          setEnumclawEnabled(false);
        }
      } catch (err) {
        setEnumclawError("Failed to load Enumclaw KML file.");
        setEnumclawEnabled(false);
        console.error("Enumclaw KML load error:", err);
      } finally {
        setEnumclawLoading(false);
      }
    } else {
      if (enumclawLayerIdRef.current) {
        removeLayer(enumclawLayerIdRef.current);
        enumclawLayerIdRef.current = null;
      }
      setEnumclawError(null);
    }
  }, [enumclawEnabled, addKMLToMap, removeLayer]);

  useEffect(() => {
    return () => {
      if (airspaceLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(airspaceLayerRef.current);
      }
    };
  }, []);

  const toolsPanel = (
    <div className="space-y-3">
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={loadingFile}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#081828]/92 px-4 py-3 text-sm font-semibold text-slate-100 shadow-lg shadow-slate-950/20 backdrop-blur-sm transition-all hover:border-sky-400/25 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loadingFile ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        Upload KML
      </button>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#081828]/92 shadow-lg shadow-slate-950/20 backdrop-blur-sm">
        <button
          onClick={() => setOverlayPanelOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3.5 py-3 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/5"
        >
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-sky-400" />
            <span>Overlays</span>
          </div>
          {overlayPanelOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {overlayPanelOpen && (
          <div className="flex flex-col gap-2.5 border-t border-white/8 px-3.5 py-3">
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={airspaceEnabled}
                onChange={handleAirspaceToggle}
                disabled={airspaceLoading}
                className="h-3.5 w-3.5 accent-sky-500"
              />
              <span className="flex-1 text-xs font-medium text-slate-200">Airspace</span>
              {airspaceLoading && (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              )}
            </label>

            {airspaceError && (
              <div className="flex items-start gap-1 rounded-lg bg-amber-500/12 px-2 py-1.5 text-xs text-amber-200">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{airspaceError}</span>
              </div>
            )}

            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={enumclawEnabled}
                onChange={handleEnumclawToggle}
                disabled={enumclawLoading}
                className="h-3.5 w-3.5 accent-sky-500"
              />
              <span className="flex-1 text-xs font-medium text-slate-200">Enumclaw KML</span>
              {enumclawLoading && (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              )}
            </label>

            {enumclawError && (
              <div className="flex items-start gap-1 rounded-lg bg-red-500/12 px-2 py-1.5 text-xs text-red-200">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{enumclawError}</span>
              </div>
            )}

            <div className="mt-1 border-t border-white/8 pt-2">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Airspace Legend</p>
              <div className="flex flex-col gap-1.5">
                {Object.entries(AIRSPACE_COLORS).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-sm border"
                      style={{
                        background: val.fillColor + "40",
                        borderColor: val.color,
                        borderStyle: val.dashArray ? "dashed" : "solid",
                        borderWidth: 2,
                      }}
                    />
                    <span className="text-[11px] text-slate-300">{val.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {kmlLayers.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#081828]/92 shadow-lg shadow-slate-950/20 backdrop-blur-sm">
          <button
            onClick={() => setIsLayerPanelOpen(!isLayerPanelOpen)}
            className="flex w-full items-center justify-between px-3.5 py-3 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/5"
          >
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-sky-400" />
              <span>Imported Layers ({kmlLayers.length})</span>
            </div>
            {isLayerPanelOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {isLayerPanelOpen && (
            <div className="max-h-56 overflow-y-auto border-t border-white/8">
              {kmlLayers.map((layer) => (
                <div
                  key={layer.id}
                  className="flex items-center gap-2 border-b border-white/6 px-3.5 py-2.5 last:border-0"
                >
                  <button
                    onClick={() => toggleLayerVisibility(layer.id)}
                    className="text-slate-400 transition-colors hover:text-sky-400"
                    title={layer.visible ? "Hide layer" : "Show layer"}
                  >
                    {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => zoomToLayer(layer)}
                    className={`flex-1 truncate text-left text-xs transition-colors ${
                      layer.visible ? "text-slate-200 hover:text-sky-300" : "text-slate-500 hover:text-sky-300"
                    }`}
                    title={`${layer.name} (${layer.featureCount} features) — click to zoom`}
                  >
                    {layer.name}
                    <span className="ml-1 text-slate-500">({layer.featureCount})</span>
                  </button>
                  <button
                    onClick={() => {
                      if (enumclawLayerIdRef.current === layer.id) {
                        setEnumclawEnabled(false);
                        enumclawLayerIdRef.current = null;
                      }
                      removeLayer(layer.id);
                    }}
                    className="text-slate-500 transition-colors hover:text-red-400"
                    title="Remove layer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 bg-[#081828]/80 px-3.5 py-3 text-xs text-slate-400 backdrop-blur-sm">
          Upload a KML file or enable overlays to add map context.
        </div>
      )}
    </div>
  );

  return (
    <div className="relative flex h-full min-h-[calc(100dvh-13rem)] w-full flex-col sm:min-h-[34rem] lg:min-h-0">
      <input
        ref={fileInputRef}
        type="file"
        accept=".kml"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
      />

      <div
        ref={mapContainerRef}
        className="flex-1 w-full relative z-0"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />

      {isDragging && (
        <div className="absolute inset-0 z-[10] bg-sky-500/20 border-4 border-dashed border-sky-400 flex items-center justify-center pointer-events-none">
          <div className="bg-white/95 rounded-2xl px-8 py-6 shadow-xl text-center">
            <Upload className="w-10 h-10 text-sky-500 mx-auto mb-2" />
            <p className="text-lg font-semibold text-gray-800">Drop KML file here</p>
            <p className="text-sm text-gray-500">Release to add to map</p>
          </div>
        </div>
      )}

      <div className="absolute left-3 top-3 z-[5] hidden w-72 max-h-[calc(100%-1.5rem)] overflow-y-auto pr-1 sm:block">
        {toolsPanel}
      </div>

      <div className="absolute bottom-20 left-1/2 z-[5] -translate-x-1/2 sm:hidden">
        <button
          onClick={() => setIsMobileToolsOpen(true)}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-[#081828]/92 px-4 py-2.5 text-sm font-semibold text-slate-100 shadow-xl shadow-slate-950/25 backdrop-blur-sm transition-all hover:border-sky-400/25 hover:text-sky-300"
        >
          <Layers className="h-4 w-4 text-sky-400" />
          Map Tools
        </button>
      </div>

      <Sheet open={isMobileToolsOpen} onOpenChange={setIsMobileToolsOpen}>
        <SheetContent
          side="bottom"
          className="border-white/10 bg-[#081320] px-0 pt-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] text-white"
        >
          <SheetHeader className="border-b border-white/8 px-4 py-4">
            <SheetTitle className="text-white">Map Tools</SheetTitle>
            <SheetDescription className="text-slate-400">
              Manage uploads, overlay toggles, and imported layer visibility.
            </SheetDescription>
          </SheetHeader>
          <div className="max-h-[70vh] overflow-y-auto px-4 py-4 sm:hidden">
            {toolsPanel}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
