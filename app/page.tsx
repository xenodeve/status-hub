import { loadBoard, type ComponentView } from "@/lib/queries";
import { supabaseConfigured } from "@/lib/supabase";
import type { Status } from "@/lib/status";
import { overallStatus, type DisplayStatus } from "@/lib/view";
import { LiveRefresh } from "./live-refresh";

// The whole point is what is true right now, so nothing here is prerendered.
export const dynamic = "force-dynamic";

const RANGES = [
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
] as const;

// The three greys all mean "we cannot see". They stay identical on purpose:
// a reader who could tell them apart by colour would be reading a distinction
// that is not there.
const GREY_BANNER = "bg-neutral-500/10 text-neutral-300 ring-neutral-500/30";

/** The history strip is SVG, so it needs the colours as values, not classes. */
const FILL: Record<Status, string> = {
  operational: "#10b981",
  degraded: "#f59e0b",
  down: "#ef4444",
  misconfigured: "#737373",
  unknown: "#737373",
};

const NO_DATA_FILL = "#262626";

/**
 * One table for the whole vocabulary. Three parallel maps meant a new status
 * had to be added in three places, and the one that was missed would render
 * with no colour at all — a status that silently looks like nothing.
 *
 * Tailwind needs literal class strings, so these cannot be built from a token.
 */
const STYLE: Record<DisplayStatus, { banner: string; label: string; headline: string }> = {
  operational: {
    banner: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
    label: "Operational",
    headline: "All systems operational",
  },
  degraded: {
    banner: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
    label: "Degraded",
    headline: "Degraded performance",
  },
  down: {
    banner: "bg-red-500/10 text-red-300 ring-red-500/30",
    label: "Down",
    headline: "Major outage",
  },
  misconfigured: {
    banner: GREY_BANNER,
    label: "Misconfigured",
    headline: "We cannot check — our credentials are wrong",
  },
  unknown: {
    banner: GREY_BANNER,
    label: "Unknown",
    headline: "We cannot reach some sources",
  },
  stale: {
    banner: GREY_BANNER,
    label: "Stale",
    headline: "Not currently checking — this page may be out of date",
  },
};

function ComponentRow({ component }: { component: ComponentView }) {
  return (
    <li className="border-t border-neutral-800 px-5 py-4 first:border-t-0">
      {/*
        Stacked on a phone, one line from `sm` up. Side by side at 390 px the
        variant string pushed the name into a second line and then wrapped
        itself onto a third — and a status page is opened on a phone precisely
        when something has gone wrong.
      */}
      <div className="mb-2 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <span className="font-medium break-words text-neutral-100">{component.name}</span>
          {component.variant && component.variant !== component.name && (
            <span className="ml-2 text-xs break-all text-neutral-500">{component.variant}</span>
          )}
        </div>
        <span className="shrink-0 text-sm text-neutral-400">
          {component.latencyMs !== null && <span className="mr-3 tabular-nums">{component.latencyMs} ms</span>}
          {STYLE[component.status].label}
        </span>
      </div>

      {/*
        One SVG rather than one element per day. At 34 components and a
        one-year range that was 12,410 spans, each carrying a class string and
        a title — measured at 4 MB of HTML and 13 s to render. Here the strip
        is one background rect plus a rect only for days that have data, so an
        empty history costs two nodes instead of 365.
      */}
      <svg
        viewBox={`0 0 ${component.bars.length} 10`}
        preserveAspectRatio="none"
        className="h-8 w-full"
        role="img"
        aria-label={`${component.name}: ${component.uptimePct === null ? "no uptime data" : `${component.uptimePct.toFixed(2)} % uptime`} over the last ${component.bars.length} days`}
      >
        {/* A day with no row is fainter than grey, and never green. */}
        <rect x="0" y="0" width={component.bars.length} height="10" fill={NO_DATA_FILL} />
        {component.bars.map((bar, i) =>
          bar.status ? (
            <rect key={bar.day} x={i} y="0" width="0.85" height="10" fill={FILL[bar.status]}>
              <title>{`${bar.day} — ${bar.status}`}</title>
            </rect>
          ) : null,
        )}
      </svg>

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

      {/*
        The page re-renders itself when the collector writes, so this line can
        change while someone is reading it. role="status" is what makes a
        screen reader announce the change instead of silently replacing it.
      */}
      <div role="status" className={`mb-8 rounded-lg px-4 py-3 text-sm ring-1 ${STYLE[overall].banner}`}>
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
            // Which range is selected was signalled by colour alone, which a
            // screen reader cannot report and a colour-blind reader may not see.
            aria-current={r.days === days ? "page" : undefined}
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
