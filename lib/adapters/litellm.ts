/**
 * The 9arm gateway is a LiteLLM proxy. Three endpoints matter, and they need
 * different credentials — see docs/superpowers/specs for the capability probe.
 *
 *   /health/readiness   no key      is the gateway itself up
 *   /v1/models          a key       which models exist right now
 *   /health             master key  LiteLLM checks every model itself
 *
 * Nothing here fetches. These are pure readers over whatever came back, so the
 * tests run without a network and catch the day a payload shape changes.
 */

import { familyOf } from "../model-name";
import type { Status } from "../status";
import type { ComponentReading } from "./types";

type Json = Record<string, unknown>;

const isJson = (v: unknown): v is Json => Boolean(v) && typeof v === "object";

/** `{"status":"healthy","db":"connected"}` */
export function readReadiness(payload: unknown): Status {
  if (!isJson(payload)) return "unknown";
  const status = payload.status;
  if (status === "healthy") return "operational";
  if (typeof status === "string") return "down";
  // We reached something and could not understand it. Grey, not green.
  return "unknown";
}

export type DiscoveredModel = { key: string; name: string; variant: string };

/** OpenAI-shaped model listing: `{ data: [{ id }] }`. */
export function readModels(payload: unknown): DiscoveredModel[] {
  if (!isJson(payload) || !Array.isArray(payload.data)) return [];

  const byFamily = new Map<string, DiscoveredModel>();
  for (const entry of payload.data) {
    if (!isJson(entry) || typeof entry.id !== "string") continue;
    const variant = entry.id;
    const key = familyOf(variant);
    // Two snapshots of one model are one component; the newest variant wins,
    // so the page shows what is actually being served today.
    byFamily.set(key, { key, name: key, variant });
  }
  return [...byFamily.values()];
}

/**
 * LiteLLM's own per-model health check.
 *
 * HYPOTHESIS: this shape is LiteLLM's documented response. It has not been
 * confirmed against gateway.9arm.co, which needs a master key we do not hold.
 * If the real payload differs, this reader returns [] rather than guessing —
 * the collector then falls back to probing each model itself.
 */
export function readHealth(payload: unknown): ComponentReading[] {
  if (!isJson(payload)) return [];

  const healthy = Array.isArray(payload.healthy_endpoints) ? payload.healthy_endpoints : [];
  const unhealthy = Array.isArray(payload.unhealthy_endpoints) ? payload.unhealthy_endpoints : [];

  const byKey = new Map<string, ComponentReading>();

  const put = (entry: unknown, status: Status, detail?: string) => {
    if (!isJson(entry) || typeof entry.model !== "string") return;
    const key = familyOf(entry.model);
    const existing = byKey.get(key);
    // A model in both lists resolves toward the worse reading. Calling a
    // contradiction healthy is the false-green failure in another costume.
    if (existing && existing.status === "down") return;
    byKey.set(key, { key, name: key, status, latencyMs: null, detail });
  };

  for (const entry of healthy) put(entry, "operational");
  for (const entry of unhealthy) {
    const error = isJson(entry) && typeof entry.error === "string" ? entry.error : "unhealthy";
    put(entry, "down", error);
  }

  return [...byKey.values()];
}
