import { fetchJsonWithCache } from "../../_lib/cache";
import {
  buildUpstreamHeaders,
  HttpError,
  jsonError,
  withCors,
} from "../../_lib/proxy";
import type { Env } from "../../_lib/rateLimiter";

interface EventContext {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
}

export async function onRequestGet(context: EventContext): Promise<Response> {
  const { request, env } = context;

  try {
    const incomingUrl = new URL(request.url);
    const id = incomingUrl.searchParams.get("id")?.trim().toUpperCase() || "";
    if (!id || id.length < 2 || id.length > 7) {
      throw new HttpError(400, "id must be 2–7 characters");
    }
    if (!/^[A-Z0-9]+$/.test(id)) {
      throw new HttpError(400, "id must be alphanumeric");
    }

    const upstreamParams = new URLSearchParams({ apt: id });
    const response = await fetchJsonWithCache({
      request,
      ctx: context,
      cacheKeyPath: "/api/airport/lookup",
      cacheQuery: upstreamParams,
      targetUrl: `https://api.aviationapi.com/v1/airports?${upstreamParams.toString()}`,
      ttlSeconds: 604800,
      staleTtlSeconds: 1209600,
      upstreamHeaders: buildUpstreamHeaders(env),
    });

    return withCors(response, request, env);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.status, error.message, request, env);
    }
    return jsonError(502, "Airport lookup proxy failed", request, env);
  }
}
