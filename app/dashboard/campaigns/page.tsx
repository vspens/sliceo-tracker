import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildTableHref, parseTableParams } from "@/lib/tableParams";

export const dynamic = "force-dynamic";

type CampaignMetric = {
  key: string;
  source: string;
  medium: string;
  campaign: string;
  clicks: number;
  uniqueSessions: number;
  firstTouchLeads: number;
  lastTouchLeads: number;
  assistTouches: number;
  totalAttributedLeads: number;
};

type DayPoint = {
  day: string;
  clicks: number;
};

function MetricHelp({ text }: { text: string }) {
  return (
    <span
      className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-500"
      title={text}
      aria-label={text}
    >
      ?
    </span>
  );
}

function getCampaignKey(source: string, medium: string, campaign: string) {
  return `${source}||${medium}||${campaign}`;
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const table = parseTableParams(resolvedSearchParams);

  const [{ data: clicks }, { data: attributions }] = await Promise.all([
    supabaseAdmin
      .from("click_events")
      .select("id,session_id,partner_slug,utm_source,utm_medium,utm_campaign,created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabaseAdmin
      .from("lead_attributions")
      .select("lead_id,click_event_id,attribution_type")
      .limit(5000),
  ]);

  const clickRows = clicks ?? [];
  const attributionRows = attributions ?? [];
  const clickById = new Map(clickRows.map((row) => [row.id, row]));
  const metrics = new Map<string, CampaignMetric>();
  const sessionsByCampaign = new Map<string, Set<string>>();
  const totalAttributedLeadsByCampaign = new Map<string, Set<string>>();
  const uniqueLeadsByCampaign = new Map<string, Set<string>>();
  const dailyByCampaign = new Map<string, Map<string, number>>();

  const ensureMetric = (source: string, medium: string, campaign: string) => {
    const key = getCampaignKey(source, medium, campaign);
    if (!metrics.has(key)) {
      metrics.set(key, {
        key,
        source,
        medium,
        campaign,
        clicks: 0,
        uniqueSessions: 0,
        firstTouchLeads: 0,
        lastTouchLeads: 0,
        assistTouches: 0,
        totalAttributedLeads: 0,
      });
      sessionsByCampaign.set(key, new Set());
      totalAttributedLeadsByCampaign.set(key, new Set());
      uniqueLeadsByCampaign.set(key, new Set());
      dailyByCampaign.set(key, new Map());
    }
    return metrics.get(key)!;
  };

  clickRows.forEach((row) => {
    const source = row.utm_source?.trim() || "direct";
    const medium = row.utm_medium?.trim() || "(none)";
    const campaign = row.utm_campaign?.trim() || "untagged";
    const metric = ensureMetric(source, medium, campaign);
    metric.clicks += 1;
    sessionsByCampaign.get(metric.key)?.add(row.session_id);

    if (row.created_at) {
      const dayKey = new Date(row.created_at).toISOString().slice(0, 10);
      const dailyMap = dailyByCampaign.get(metric.key)!;
      dailyMap.set(dayKey, (dailyMap.get(dayKey) ?? 0) + 1);
    }
  });

  attributionRows.forEach((attr) => {
    const click = clickById.get(attr.click_event_id);
    if (!click) return;

    const source = click.utm_source?.trim() || "direct";
    const medium = click.utm_medium?.trim() || "(none)";
    const campaign = click.utm_campaign?.trim() || "untagged";
    const metric = ensureMetric(source, medium, campaign);
    totalAttributedLeadsByCampaign.get(metric.key)?.add(attr.lead_id);

    if (attr.attribution_type === "first_touch") {
      metric.firstTouchLeads += 1;
      uniqueLeadsByCampaign.get(metric.key)?.add(attr.lead_id);
    } else if (attr.attribution_type === "last_touch") {
      metric.lastTouchLeads += 1;
      uniqueLeadsByCampaign.get(metric.key)?.add(attr.lead_id);
    } else {
      metric.assistTouches += 1;
      uniqueLeadsByCampaign.get(metric.key)?.add(attr.lead_id);
    }
  });

  const campaignRows = Array.from(metrics.values())
    .map((row) => ({
      ...row,
      uniqueSessions: sessionsByCampaign.get(row.key)?.size ?? 0,
      totalAttributedLeads: totalAttributedLeadsByCampaign.get(row.key)?.size ?? 0,
    }))
    .sort((a, b) => b.clicks - a.clicks);
  const filteredCampaignRows = table.q
    ? campaignRows.filter((row) => {
        const haystack = `${row.source} ${row.medium} ${row.campaign}`.toLowerCase();
        return haystack.includes(table.q.toLowerCase());
      })
    : campaignRows;
  const totalCount = filteredCampaignRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / table.pageSize));
  const pagedCampaignRows = filteredCampaignRows.slice(table.from, table.to + 1);

  const totalClicks = clickRows.length;
  const totalCampaigns = campaignRows.length;
  const topCampaign = campaignRows[0];
  const topConversion = campaignRows
    .filter((row) => row.clicks > 0)
    .sort((a, b) => b.lastTouchLeads / b.clicks - a.lastTouchLeads / a.clicks)[0];

  const topTrendRows = campaignRows.slice(0, 6).map((row) => {
    const today = new Date();
    const points: DayPoint[] = Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - idx));
      const dayKey = date.toISOString().slice(0, 10);
      return {
        day: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        clicks: dailyByCampaign.get(row.key)?.get(dayKey) ?? 0,
      };
    });
    return { ...row, points };
  });

  const maxTrendValue = Math.max(
    1,
    ...topTrendRows.flatMap((row) => row.points.map((point) => point.clicks)),
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-10">
      <div className="mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Deep Analytics</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Campaign Insights</h1>
          <p className="mt-2 text-sm text-slate-600">Drill into UTM performance, quality, and lead attribution outcomes.</p>
        </div>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clicks Loaded</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{totalClicks}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Campaign Groups</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{totalCampaigns}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top Volume Campaign</p>
          <p className="mt-2 truncate text-lg font-semibold text-slate-900">{topCampaign?.campaign ?? "-"}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Best Last-Touch Rate</p>
          <p className="mt-2 truncate text-lg font-semibold text-slate-900">
            {topConversion ? `${topConversion.campaign} (${Math.round((topConversion.lastTouchLeads / topConversion.clicks) * 100)}%)` : "-"}
          </p>
        </article>
      </section>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">7-Day Click Trend by Top Campaigns</h2>
        <p className="mt-1 text-sm text-slate-600">Shows last 7 days click volume for top 6 campaigns.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {topTrendRows.length ? (
            topTrendRows.map((row) => (
              <article key={row.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <Link
                  href={`/dashboard/campaigns/${encodeURIComponent(row.campaign)}?source=${encodeURIComponent(row.source)}&medium=${encodeURIComponent(row.medium)}`}
                  className="truncate text-sm font-semibold text-slate-900 hover:text-teal-700 hover:underline"
                >
                  {row.campaign}
                </Link>
                <p className="truncate text-xs text-slate-500">
                  {row.source} / {row.medium}
                </p>
                <div className="mt-3 grid grid-cols-7 gap-1">
                  {row.points.map((point) => (
                    <div key={`${row.key}-${point.day}`} className="flex flex-col items-center gap-1">
                      <div className="flex h-16 w-full items-end rounded bg-white p-1">
                        <div
                          className="w-full rounded-sm bg-teal-500/85"
                          style={{ height: `${Math.max(6, (point.clicks / maxTrendValue) * 100)}%` }}
                          title={`${point.day}: ${point.clicks}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              No campaign trend data yet.
            </p>
          )}
        </div>
      </section>

      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={table.q}
          placeholder="Search campaign, source, medium..."
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700"
        >
          Search
        </button>
        <Link
          href="/dashboard/campaigns"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        >
          Clear
        </Link>
      </form>

      <section className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/50">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Medium</th>
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 font-medium">Clicks</th>
              <th className="px-4 py-3 font-medium">Unique Sessions</th>
              <th className="px-4 py-3 font-medium">
                First Touch Leads
                <MetricHelp text="Leads where this campaign is the first recorded touch in the attribution path." />
              </th>
              <th className="px-4 py-3 font-medium">
                Last Touch Leads
                <MetricHelp text="Leads where this campaign is the final touch before conversion." />
              </th>
              <th className="px-4 py-3 font-medium">
                Assist Touches
                <MetricHelp text="Attribution touches where this campaign helped mid-journey (neither first nor last touch)." />
              </th>
              <th className="px-4 py-3 font-medium">Attributed Leads</th>
              <th className="px-4 py-3 font-medium">Last-Touch CVR</th>
            </tr>
          </thead>
          <tbody>
            {pagedCampaignRows.length ? (
              pagedCampaignRows.map((row) => {
                const conversionRate = row.clicks > 0 ? Math.round((row.lastTouchLeads / row.clicks) * 100) : 0;
                return (
                  <tr key={row.key} className="border-t border-slate-100 text-slate-700 transition hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.source}</td>
                    <td className="px-4 py-3">{row.medium}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/campaigns/${encodeURIComponent(row.campaign)}?source=${encodeURIComponent(row.source)}&medium=${encodeURIComponent(row.medium)}`}
                        className="font-medium text-teal-700 hover:underline"
                      >
                        {row.campaign}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.clicks}</td>
                    <td className="px-4 py-3">{row.uniqueSessions}</td>
                    <td className="px-4 py-3">{row.firstTouchLeads}</td>
                    <td className="px-4 py-3">{row.lastTouchLeads}</td>
                    <td className="px-4 py-3">{row.assistTouches}</td>
                    <td className="px-4 py-3">{row.totalAttributedLeads}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {conversionRate}%
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                  No campaign data for the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <p>
          Page {table.page} of {totalPages} ({totalCount} records)
        </p>
        <div className="flex gap-2">
          <Link
            href={buildTableHref("/dashboard/campaigns", {
              q: table.q,
              page: Math.max(1, table.page - 1),
              pageSize: table.pageSize,
            })}
            className={`rounded-lg border px-3 py-1.5 ${
              table.page <= 1
                ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Previous
          </Link>
          <Link
            href={buildTableHref("/dashboard/campaigns", {
              q: table.q,
              page: Math.min(totalPages, table.page + 1),
              pageSize: table.pageSize,
            })}
            className={`rounded-lg border px-3 py-1.5 ${
              table.page >= totalPages
                ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Next
          </Link>
        </div>
      </div>
    </main>
  );
}
