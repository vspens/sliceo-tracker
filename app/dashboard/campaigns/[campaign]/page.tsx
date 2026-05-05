import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseTableParams } from "@/lib/tableParams";

export const dynamic = "force-dynamic";

type RangePreset = "7d" | "30d" | "90d" | "all";

type LeadRow = {
  id: string;
  full_name: string | null;
  email: string;
  company: string | null;
  status: string;
  session_id: string | null;
  created_at: string | null;
};

function getRangeStart(range: RangePreset) {
  if (range === "all") return null;
  const now = new Date();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  now.setDate(now.getDate() - days);
  return now;
}

function isoOrNull(date: Date | null) {
  return date ? date.toISOString() : null;
}

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

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaign: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { campaign: campaignParam } = await params;
  const resolvedSearchParams = await searchParams;

  const sourceParamRaw = Array.isArray(resolvedSearchParams?.source)
    ? resolvedSearchParams?.source[0]
    : resolvedSearchParams?.source;
  const mediumParamRaw = Array.isArray(resolvedSearchParams?.medium)
    ? resolvedSearchParams?.medium[0]
    : resolvedSearchParams?.medium;

  const rangeParamRaw = Array.isArray(resolvedSearchParams?.range)
    ? resolvedSearchParams?.range[0]
    : resolvedSearchParams?.range;

  const campaign = decodeURIComponent(campaignParam);
  const source = sourceParamRaw?.trim() || "direct";
  const medium = mediumParamRaw?.trim() || "(none)";
  const range: RangePreset =
    rangeParamRaw === "7d" || rangeParamRaw === "30d" || rangeParamRaw === "90d" || rangeParamRaw === "all"
      ? rangeParamRaw
      : "30d";
  const rangeStart = getRangeStart(range);
  const clicksTable = parseTableParams(resolvedSearchParams, {
    qKey: "clickQ",
    pageKey: "clickPage",
    defaultPageSize: 15,
  });
  const leadsTable = parseTableParams(resolvedSearchParams, {
    qKey: "leadQ",
    pageKey: "leadPage",
    defaultPageSize: 15,
  });

  let clickQuery = supabaseAdmin
    .from("click_events")
    .select(
      "id,partner_slug,destination_url,session_id,utm_source,utm_medium,utm_campaign,ip_address,referrer,user_agent,created_at",
    )
    .eq("utm_source", source)
    .eq("utm_medium", medium)
    .eq("utm_campaign", campaign)
    .order("created_at", { ascending: false })
    .limit(5000);
  const since = isoOrNull(rangeStart);
  if (since) {
    clickQuery = clickQuery.gte("created_at", since);
  }
  const { data: campaignClicksData } = await clickQuery;
  const campaignClicks = campaignClicksData ?? [];

  const clickIds = campaignClicks.map((row) => row.id);
  const sessionIds = Array.from(new Set(campaignClicks.map((row) => row.session_id).filter(Boolean))) as string[];
  const uniqueIps = new Set(campaignClicks.map((row) => row.ip_address || "unknown")).size;
  const uniqueSessions = new Set(campaignClicks.map((row) => row.session_id).filter(Boolean)).size;

  const [{ data: sessionLeads }, { data: attributions }] = await Promise.all([
    sessionIds.length
      ? supabaseAdmin
          .from("leads")
          .select("id,full_name,email,company,status,session_id,created_at")
          .in("session_id", sessionIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as LeadRow[] }),
    clickIds.length
      ? supabaseAdmin
          .from("lead_attributions")
          .select("lead_id,click_event_id,attribution_type")
          .in("click_event_id", clickIds)
      : Promise.resolve({ data: [] as { lead_id: string; click_event_id: string; attribution_type: string }[] }),
  ]);

  const attributedLeadIds = Array.from(new Set((attributions ?? []).map((a) => a.lead_id)));
  const { data: attributedLeads } = attributedLeadIds.length
    ? await supabaseAdmin
        .from("leads")
        .select("id,full_name,email,company,status,session_id,created_at")
        .in("id", attributedLeadIds)
        .order("created_at", { ascending: false })
    : { data: [] as LeadRow[] };

  const attributionByLead = (attributions ?? []).reduce<Record<string, string[]>>((acc, row) => {
    if (!acc[row.lead_id]) acc[row.lead_id] = [];
    acc[row.lead_id].push(row.attribution_type);
    return acc;
  }, {});

  const leadMap = new Map<string, LeadRow>();
  (sessionLeads ?? []).forEach((lead) => leadMap.set(lead.id, lead));
  (attributedLeads ?? []).forEach((lead) => leadMap.set(lead.id, lead));
  const leads = Array.from(leadMap.values()).sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
  );

  const firstTouch = (attributions ?? []).filter((a) => a.attribution_type === "first_touch").length;
  const lastTouch = (attributions ?? []).filter((a) => a.attribution_type === "last_touch").length;
  const assists = (attributions ?? []).filter((a) => a.attribution_type === "multi_touch").length;
  const leadConversionRate = campaignClicks.length ? Math.round((leads.length / campaignClicks.length) * 100) : 0;
  const referrerCounts = campaignClicks.reduce<Record<string, number>>((acc, row) => {
    const key = row.referrer?.trim() || "direct / none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const topReferrers = Object.entries(referrerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const filteredCampaignClicks = clicksTable.q
    ? campaignClicks.filter((row) =>
        `${row.session_id ?? ""} ${row.ip_address ?? ""} ${row.partner_slug ?? ""} ${row.referrer ?? ""} ${
          row.user_agent ?? ""
        }`
          .toLowerCase()
          .includes(clicksTable.q.toLowerCase()),
      )
    : campaignClicks;
  const clickTotalCount = filteredCampaignClicks.length;
  const clickTotalPages = Math.max(1, Math.ceil(clickTotalCount / clicksTable.pageSize));
  const pagedCampaignClicks = filteredCampaignClicks.slice(clicksTable.from, clicksTable.to + 1);

  const filteredLeads = leadsTable.q
    ? leads.filter((lead) =>
        `${lead.full_name ?? ""} ${lead.email ?? ""} ${lead.company ?? ""} ${lead.status ?? ""} ${lead.session_id ?? ""}`
          .toLowerCase()
          .includes(leadsTable.q.toLowerCase()),
      )
    : leads;
  const leadTotalCount = filteredLeads.length;
  const leadTotalPages = Math.max(1, Math.ceil(leadTotalCount / leadsTable.pageSize));
  const pagedLeads = filteredLeads.slice(leadsTable.from, leadsTable.to + 1);

  const encodedCampaign = encodeURIComponent(campaign);
  const encodedSource = encodeURIComponent(source);
  const encodedMedium = encodeURIComponent(medium);
  const exportQuery = `source=${encodedSource}&medium=${encodedMedium}&range=${range}`;
  const baseParams = new URLSearchParams({
    source,
    medium,
    range,
  });
  const detailHref = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams(baseParams.toString());
    Object.entries(extra).forEach(([key, value]) => {
      if (value === undefined || value === "") return;
      params.set(key, String(value));
    });
    return `/dashboard/campaigns/${encodedCampaign}?${params.toString()}`;
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Campaign Deep Dive</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{campaign}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Source: <span className="font-medium">{source}</span> / Medium:{" "}
            <span className="font-medium">{medium}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/campaigns/${encodedCampaign}/report?${exportQuery}`}
            className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100"
          >
            Generate Report (PDF)
          </Link>
          <Link
            href="/dashboard/campaigns"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Back to campaigns
          </Link>
        </div>
      </div>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
        <form className="flex flex-wrap items-center gap-3" method="get">
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="medium" value={medium} />
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date Range</label>
          <select
            name="range"
            defaultValue={range}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <button
            type="submit"
            className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700"
          >
            Apply
          </button>
        </form>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-5">
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clicks</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{campaignClicks.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unique Sessions</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{uniqueSessions}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unique IPs</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{uniqueIps}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Leads Linked</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{leads.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lead Conversion</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{leadConversionRate}%</p>
        </article>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            First-Touch Credits
            <MetricHelp text="This campaign started the journey (first recorded touch) for these leads." />
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{firstTouch}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Last-Touch Credits
            <MetricHelp text="This campaign was the final touch right before lead conversion." />
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{lastTouch}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Assist Touches
            <MetricHelp text="This campaign influenced leads mid-journey (not first or last touch)." />
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{assists}</p>
        </article>
      </section>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Top Referrers</h2>
        <p className="mt-1 text-xs text-slate-500">Where this campaign traffic is coming from.</p>
        <div className="mt-4 space-y-3">
          {topReferrers.length ? (
            topReferrers.map(([referrer, count]) => (
              <div key={referrer}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <p className="max-w-[85%] truncate text-slate-700">{referrer}</p>
                  <p className="font-medium text-slate-900">{count}</p>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-teal-500"
                    style={{ width: `${Math.max(8, (count / (topReferrers[0]?.[1] ?? 1)) * 100)}%` }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No referrer data found.</p>
          )}
        </div>
      </section>

      <section className="mb-6 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/50">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">Click Events (Who Clicked)</h2>
            <Link
              href={`/dashboard/campaigns/${encodedCampaign}/export/clicks?${exportQuery}`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </Link>
          </div>
          <p className="text-xs text-slate-500">
            Visitor identity is anonymous; use session, IP, user agent, and referrer as forensic indicators.
          </p>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Session</th>
              <th className="px-4 py-3 font-medium">IP</th>
              <th className="px-4 py-3 font-medium">Partner</th>
              <th className="px-4 py-3 font-medium">Referrer</th>
              <th className="px-4 py-3 font-medium">User Agent</th>
            </tr>
          </thead>
          <tbody>
            {pagedCampaignClicks.length ? (
              pagedCampaignClicks.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 text-slate-700">
                  <td className="px-4 py-3">{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.session_id}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.ip_address || "-"}</td>
                  <td className="px-4 py-3">{row.partner_slug}</td>
                  <td className="px-4 py-3">
                    <span className="block max-w-[260px] truncate">{row.referrer || "-"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block max-w-[320px] truncate">{row.user_agent || "-"}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  No click events for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <form method="get" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="source" value={source} />
              <input type="hidden" name="medium" value={medium} />
              <input type="hidden" name="range" value={range} />
              <input
                name="clickQ"
                defaultValue={clicksTable.q}
                placeholder="Search click events..."
                suppressHydrationWarning
                className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                suppressHydrationWarning
                className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700"
              >
                Search
              </button>
            </form>
          </div>
          <div className="flex items-center justify-between">
            <p>
              Page {clicksTable.page} of {clickTotalPages} ({clickTotalCount} records)
            </p>
            <div className="flex gap-2">
              <Link
                href={detailHref({
                  clickQ: clicksTable.q || undefined,
                  clickPage: Math.max(1, clicksTable.page - 1),
                  leadQ: leadsTable.q || undefined,
                  leadPage: leadsTable.page > 1 ? leadsTable.page : undefined,
                })}
                className={`rounded-lg border px-3 py-1.5 ${
                  clicksTable.page <= 1
                    ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Previous
              </Link>
              <Link
                href={detailHref({
                  clickQ: clicksTable.q || undefined,
                  clickPage: Math.min(clickTotalPages, clicksTable.page + 1),
                  leadQ: leadsTable.q || undefined,
                  leadPage: leadsTable.page > 1 ? leadsTable.page : undefined,
                })}
                className={`rounded-lg border px-3 py-1.5 ${
                  clicksTable.page >= clickTotalPages
                    ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Next
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/50">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">Related Leads</h2>
            <Link
              href={`/dashboard/campaigns/${encodedCampaign}/export/leads?${exportQuery}`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </Link>
          </div>
          <p className="text-xs text-slate-500">Leads found via session match and attribution match.</p>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Lead</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Session</th>
              <th className="px-4 py-3 font-medium">Attribution Types</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {pagedLeads.length ? (
              pagedLeads.map((lead) => (
                <tr key={lead.id} className="border-t border-slate-100 text-slate-700">
                  <td className="px-4 py-3 font-medium text-slate-900">{lead.full_name || "-"}</td>
                  <td className="px-4 py-3">{lead.email}</td>
                  <td className="px-4 py-3">{lead.company || "-"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{lead.session_id || "-"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-600">
                      {Array.from(new Set(attributionByLead[lead.id] ?? [])).join(", ") || "session_match"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{lead.created_at ? new Date(lead.created_at).toLocaleString() : "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  No related leads for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <form method="get" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="source" value={source} />
              <input type="hidden" name="medium" value={medium} />
              <input type="hidden" name="range" value={range} />
              <input
                name="leadQ"
                defaultValue={leadsTable.q}
                placeholder="Search related leads..."
                suppressHydrationWarning
                className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                suppressHydrationWarning
                className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700"
              >
                Search
              </button>
            </form>
          </div>
          <div className="flex items-center justify-between">
            <p>
              Page {leadsTable.page} of {leadTotalPages} ({leadTotalCount} records)
            </p>
            <div className="flex gap-2">
              <Link
                href={detailHref({
                  leadQ: leadsTable.q || undefined,
                  leadPage: Math.max(1, leadsTable.page - 1),
                  clickQ: clicksTable.q || undefined,
                  clickPage: clicksTable.page > 1 ? clicksTable.page : undefined,
                })}
                className={`rounded-lg border px-3 py-1.5 ${
                  leadsTable.page <= 1
                    ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Previous
              </Link>
              <Link
                href={detailHref({
                  leadQ: leadsTable.q || undefined,
                  leadPage: Math.min(leadTotalPages, leadsTable.page + 1),
                  clickQ: clicksTable.q || undefined,
                  clickPage: clicksTable.page > 1 ? clicksTable.page : undefined,
                })}
                className={`rounded-lg border px-3 py-1.5 ${
                  leadsTable.page >= leadTotalPages
                    ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Next
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
