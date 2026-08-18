import { loadBoard, type ComponentView } from "@/lib/queries";
import { supabaseConfigured } from "@/lib/supabase";
import { overallStatus, type DisplayStatus } from "@/lib/view";
import { LiveRefresh } from "./live-refresh";

// The whole point is what is true right now, so nothing here is prerendered.
export const dynamic = "force-dynamic";

const RANGES = [
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
] as const;

/**
 * One table for the whole vocabulary. Three parallel maps meant a new status
 * had to be added in three places, and the one that was missed would render
 * with no colour at all — a status that silently looks like nothing.
 *
 * Tailwind needs literal class strings, so these cannot be built from a token.
 */
const STYLE: Record<DisplayStatus, { bar: string; banner: string; label: string; headline: string }> = {
  operational: {
    bar: "bg-emerald-500",
    banner: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
    label: "Operational",
    headline: "All systems operational",
  },
  degraded: {
    bar: "bg-amber-500",
    banner: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
    label: "Degraded",
    headline: "Degraded performance",
  },
  down: {
    bar: "bg-red-500",
    banner: "bg-red-500/10 text-red-300 ring-red-500/30",
    label: "Down",
    headline: "Major outage",
  },
  misconfigured: {
    bar: "bg-neutral-500",
    banner: "bg-neutral-500/10 text-neutral-300 ring-neutral-500/30",
    label: "Misconfigured",
    headline: "We cannot check — our credentials are wrong",
  },
  unknown: {
    bar: "bg-neutral-500",
    banner: "bg-neutral-500/10 text-neutral-300 ring-neutral-500/30",
    label: "Unknown",
    headline: "We cannot reach some sources",
  },
  stale: {
    bar: "bg-neutral-500",
    banner: "bg-neutral-500/10 text-neutral-300 ring-neutral-500/30",
    label: "Stale",
    headline: "Not currently checking — this page may be out of date",
  },
};

function ComponentRow({ component }: { component: ComponentView }) {
  return (
    <li className="border-t border-neutral-800 px-5 py-4 first:border-t-0">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <span className="font-medium text-neutral-100">{component.name}</span>
          {component.variant && component.variant !== component.name && (
            <span className="ml-2 text-xs text-neutral-500">{component.variant}</span>
          )}
        </div>
        <span className="shrink-0 text-sm text-neutral-400">
          {component.latencyMs !== null && <span className="mr-3 tabular-nums">{component.latencyMs} ms</span>}
          {STYLE[component.status].label}
        </span>
      </div>

      <div className="flex gap-px overflow-hidden" aria-label={`${component.name} history`}>
        {component.bars.map((bar) => (
          <span
            key={bar.day}
            title={bar.status ? `${bar.day} — ${bar.status}` : `${bar.day} — no data, we did not check`}
            // No colour is a claim. Grey means "we do not know"; a day with no
            // row is fainter still, and never green.
            className={`h-8 min-w-0 flex-1 rounded-[1px] ${bar.status ? STYLE[bar.status].bar : "bg-neutral-800"}`}
          />
        ))}
      </div>

      <div className="mt-1 flex justify-between text-xs text-neutral-600">
        <span>{component.bars[0]?.day}</span>
        <span className="tabular-nums">
          {component.uptimePct === null ? "no uptime data" : `${component.uptimePct.toFixed(2)} % uptime`}
        </span>
        <span>today</span>
      </div>
    </li>
  );
}

export default async function Page({
  searchParams,
}: {
  // Next 16 removed synchronous access to request APIs.
  searchParams: Promise<{ range?: string }>;
}) {
  if (!supabaseConfigured) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-lg font-medium text-neutral-100">Status Hub is not configured</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Set <code className="text-neutral-300">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-neutral-300">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>. See{" "}
          <code className="text-neutral-300">.env.example</code>.
        </p>
      </main>
    );
  }

  const { range } = await searchParams;
  const days = RANGES.find((r) => String(r.days) === range)?.days ?? 90;
  const board = await loadBoard(days);

  const overall = overallStatus(board.components.map((c) => c.status));

  const bySource = new Map<string, ComponentView[]>();
  for (const component of board.components) {
    const group = bySource.get(component.sourceName);
    if (group) group.push(component);
    else bySource.set(component.sourceName, [component]);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-100">Status Hub</h1>
        <LiveRefresh />
      </header>

      <div className={`mb-8 rounded-lg px-4 py-3 text-sm ring-1 ${STYLE[overall].banner}`}>
        {STYLE[overall].headline}
      </div>

      {board.components.length === 0 ? (
        <p className="rounded-lg border border-neutral-800 px-5 py-8 text-center text-sm text-neutral-500">
          Nothing has been checked yet. The collector writes the first reading on its next run.
        </p>
      ) : (
        <div className="space-y-6">
          {[...bySource].map(([source, components]) => (
            <section key={source} className="rounded-lg border border-neutral-800">
              <h2 className="border-b border-neutral-800 px-5 py-3 text-sm font-medium text-neutral-300">
                {source}
              </h2>
              <ul>
                {components.map((component) => (
                  <ComponentRow key={component.id} component={component} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <nav className="mt-6 flex gap-4 text-sm">
        {RANGES.map((r) => (
          <a
            key={r.days}
            href={`/?range=${r.days}`}
            className={r.days === days ? "text-neutral-100" : "text-neutral-500 hover:text-neutral-300"}
          >
            {r.label}
          </a>
        ))}
      </nav>

      {board.incidents.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-neutral-300">Recent incidents</h2>
          <ul className="space-y-3 text-sm">
            {board.incidents.map((incident) => (
              <li key={incident.id} className="border-l-2 border-neutral-700 pl-3">
                <div className="text-neutral-200">{incident.title}</div>
                <div className="text-xs text-neutral-500">
                  {incident.componentName} · {incident.severity} ·{" "}
                  {incident.origin === "vendor" ? "reported by the vendor" : "detected by us"} ·{" "}
                  {new Date(incident.startedAt).toISOString().replace("T", " ").slice(0, 16)}
                  {incident.endedAt ? "" : " · ongoing"}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
