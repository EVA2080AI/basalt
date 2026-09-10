import type { Product } from "../../products/types.js";

function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isoOffset(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(date);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  return raw.replace("GMT", "") || "+00:00";
}

function localWallClock(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}`;
}

/**
 * Fourteenth Basalt product: converts an absolute instant into the local
 * wall-clock time of any IANA time zone, DST-aware. Zero new dependencies —
 * Node's built-in Intl carries the full IANA time zone database already.
 * Built for agents coordinating tasks or schedules across time zones.
 */
export const timezoneConvertProduct: Product = {
  id: "timezone-convert",
  method: "POST",
  path: "/timezone-convert",
  priceUsd: Number(process.env.AUTOMATON_PRICE_TIMEZONE_CONVERT_USD ?? 0.002),
  description: "Converts an ISO 8601 instant into the local wall-clock time of any IANA time zone, DST-aware.",
  launchedAt: "2026-09-10",
  inputSchema: {
    type: "object",
    required: ["datetime", "timezone"],
    properties: {
      datetime: { type: "string", description: "ISO 8601 instant, must include an offset or 'Z'" },
      timezone: { type: "string", description: "IANA time zone name, e.g. 'America/New_York'" },
    },
  },
  inputExample: { datetime: "2026-09-09T15:30:00Z", timezone: "America/New_York" },
  outputSchema: {
    type: "object",
    properties: {
      utc: { type: "string" },
      local: { type: "string" },
      offset: { type: "string" },
      timezone: { type: "string" },
    },
    required: ["utc", "local", "offset", "timezone"],
  },
  outputExample: { utc: "2026-09-09T15:30:00.000Z", local: "2026-09-09T11:30:00", offset: "-04:00", timezone: "America/New_York" },
  handler(req, res) {
    const { datetime, timezone } = req.body ?? {};
    if (typeof datetime !== "string" || typeof timezone !== "string") {
      res.status(400).json({ error: "Body must include { datetime: string, timezone: string }" });
      return;
    }
    if (!isValidTimeZone(timezone)) {
      res.status(400).json({ error: `Unknown IANA time zone: '${timezone}'` });
      return;
    }
    const date = new Date(datetime);
    if (Number.isNaN(date.getTime())) {
      res.status(400).json({ error: `'${datetime}' is not a valid ISO 8601 datetime` });
      return;
    }
    try {
      res.json({
        utc: date.toISOString(),
        local: localWallClock(date, timezone),
        offset: isoOffset(date, timezone),
        timezone,
      });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Could not convert the time zone." });
    }
  },
};
