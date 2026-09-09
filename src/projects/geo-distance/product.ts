import { getDistance, getGreatCircleBearing, convertDistance } from "geolib";
import type { Product } from "../../products/types.js";

function isCoord(v: unknown): v is { latitude: number; longitude: number } {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).latitude === "number" &&
    typeof (v as Record<string, unknown>).longitude === "number"
  );
}

/**
 * Twelfth Basalt product: great-circle distance and bearing between two
 * coordinates. Pure math (haversine via geolib) — no geocoding, no map
 * provider, no API key. The subset of "geospatial" agents can use without
 * paying for a full Mapbox/Google Maps integration.
 */
export const geoDistanceProduct: Product = {
  id: "geo-distance",
  method: "POST",
  path: "/geo-distance",
  priceUsd: Number(process.env.AUTOMATON_PRICE_GEO_DISTANCE_USD ?? 0.002),
  description: "Calculates great-circle distance (km/mi) and initial bearing between two lat/lng coordinates.",
  launchedAt: "2026-09-09",
  inputSchema: {
    type: "object",
    required: ["from", "to"],
    properties: {
      from: { type: "object", required: ["latitude", "longitude"], properties: { latitude: { type: "number" }, longitude: { type: "number" } } },
      to: { type: "object", required: ["latitude", "longitude"], properties: { latitude: { type: "number" }, longitude: { type: "number" } } },
    },
  },
  inputExample: {
    from: { latitude: 40.7128, longitude: -74.006 },
    to: { latitude: 51.5074, longitude: -0.1278 },
  },
  outputSchema: {
    type: "object",
    properties: {
      distanceKm: { type: "number" },
      distanceMi: { type: "number" },
      bearingDeg: { type: "number" },
    },
    required: ["distanceKm", "distanceMi", "bearingDeg"],
  },
  outputExample: { distanceKm: 5576.46, distanceMi: 3465.05, bearingDeg: 51.21 },
  handler(req, res) {
    const { from, to } = req.body ?? {};
    if (!isCoord(from) || !isCoord(to)) {
      res.status(400).json({ error: "Body must include { from: {latitude,longitude}, to: {latitude,longitude} }" });
      return;
    }
    try {
      const meters = getDistance(from, to);
      res.json({
        distanceKm: Math.round(convertDistance(meters, "km") * 100) / 100,
        distanceMi: Math.round(convertDistance(meters, "mi") * 100) / 100,
        bearingDeg: Math.round(getGreatCircleBearing(from, to) * 100) / 100,
      });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Could not compute distance/bearing." });
    }
  },
};
