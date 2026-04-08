import type { Env } from "../_lib/rateLimiter";
import { buildUpstreamHeaders, HttpError, jsonError, withCors } from "../_lib/proxy";

interface EventContext {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
}

const ALLOWED_PARAMS = new Set(["minLat", "maxLat", "minLon", "maxLon"]);
const COORD_RE = /^-?\d{1,3}(\.\d{1,6})?$/;

function validateCoord(value: string | null, name: string, min: number, max: number): number {
  if (!value || !COORD_RE.test(value)) throw new HttpError(400, `Invalid ${name}`);
  const n = parseFloat(value);
  if (!isFinite(n) || n < min || n > max) throw new HttpError(400, `${name} out of range`);
  return n;
}

export async function onRequestGet(context: EventContext): Promise<Response> {
  const { request, env } = context;

  const url = new URL(request.url);

  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_PARAMS.has(key)) {
      return jsonError(400, `Unsupported query param: ${key}`, request, env);
    }
  }

  try {
    const minLat = validateCoord(url.searchParams.get("minLat"), "minLat", -90, 90);
    const maxLat = validateCoord(url.searchParams.get("maxLat"), "maxLat", -90, 90);
    const minLon = validateCoord(url.searchParams.get("minLon"), "minLon", -180, 180);
    const maxLon = validateCoord(url.searchParams.get("maxLon"), "maxLon", -180, 180);

    const faaUrl =
      `https://api.faa.gov/sua/v1/airspace?` +
      `minLat=${minLat}&maxLat=${maxLat}&minLon=${minLon}&maxLon=${maxLon}`;

    const upstreamHeaders = buildUpstreamHeaders(env, "application/json");

    const response = await fetch(faaUrl, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return jsonError(502, `FAA airspace API error: ${response.status}`, request, env);
    }

    const data = await response.json();

    const corsHeaders = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    });

    return withCors(
      new Response(JSON.stringify(data), { status: 200, headers: corsHeaders }),
      request,
      env
    );
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonError(err.status, err.message, request, env);
    }
    console.error("Airspace proxy error:", err);
    return jsonError(502, "Airspace data unavailable", request, env);
  }
}
