import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DayPoint = { label: string; value: number };

function buildDailySeries(items: { created_at: string | null }[], days: number): DayPoint[] {
  const today = new Date();
  const byDay = new Map<string, number>();

  items.forEach((item) => {
    if (!item.created_at) return;
    const key = new Date(item.created_at).toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  });

  return Array.from({ length: days }).map((_, idx) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - idx - 1));
    const key = date.toISOString().slice(0, 10);
    return {
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      value: byDay.get(key) ?? 0,
    };
  });
}

export default async function DashboardHomePage() {
  const [clicksCount, leadsCount, deliveriesCount, recentClicks, recentLeads, recentDeliveries] = await Promise.all([
    supabaseAdmin.from("click_events").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("leads").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("webhook_deliveries").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("click_events").select("created_at,utm_campaign,is_bot").order("created_at", { ascending: false }).limit(300),
    supabaseAdmin.from("leads").select("created_at,status").order("created_at", { ascending: false }).limit(300),
    supabaseAdmin.from("webhook_deliveries").select("status,created_at").order("created_at", { ascending: false }).limit(300),
  ]);

  const totalClicks = clicksCount.count ?? 0;
  const totalLeads = leadsCount.count ?? 0;
  const totalDeliveries = deliveriesCount.count ?? 0;
  const clickRows = recentClicks.data ?? [];
  const leadRows = recentLeads.data ?? [];
  const deliveryRows = recentDeliveries.data ?? [];

  const clickSeries = buildDailySeries(clickRows, 7);
  const leadSeries = buildDailySeries(leadRows, 7);
  const maxChartValue = Math.max(1, ...clickSeries.map((p) => p.value), ...leadSeries.map((p) => p.value));
  const deliverySuccess = deliveryRows.filter((d) => d.status === "success").length;
  const failedDeliveries = deliveryRows.filter((d) => d.status === "failed").length;
  const botClicks = clickRows.filter((row) => row.is_bot).length;
  const deliveryRate = totalDeliveries ? Math.round((deliverySuccess / totalDeliveries) * 100) : 0;

  const campaignCounts = clickRows.reduce<Record<string, number>>((acc, row) => {
    const key = row.utm_campaign?.trim() || "untagged";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const topCampaigns = Object.entries(campaignCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Executive Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Sliceo Performance Center</h1>
        <p className="mt-2 text-sm text-slate-600">
          Decision-first view of campaign performance, lead outcomes, and delivery health.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Clicks</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{totalClicks}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Leads</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{totalLeads}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery Success</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{deliveryRate}%</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bot Click Signals</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{botClicks}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">7-Day Trend</h2>
          <p className="text-sm text-slate-600">Clicks vs leads to spot momentum and conversion gaps.</p>
          <div className="mt-4 grid grid-cols-7 gap-2">
            {clickSeries.map((point, idx) => (
              <div key={point.label} className="flex flex-col items-center gap-2">
                <div className="flex h-28 w-full items-end gap-1 rounded-lg bg-slate-50 p-2">
                  <div className="w-1/2 rounded-sm bg-teal-500" style={{ height: `${Math.max(6, (point.value / maxChartValue) * 100)}%` }} />
                  <div
                    className="w-1/2 rounded-sm bg-sky-400"
                    style={{ height: `${Math.max(6, ((leadSeries[idx]?.value ?? 0) / maxChartValue) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] font-medium text-slate-500">{point.label}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Alerts & Actions</h2>
          <div className="mt-4 space-y-3 text-sm">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
              {failedDeliveries > 0
                ? `${failedDeliveries} failed delivery events need replay review.`
                : "No failed deliveries in recent logs."}
            </p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              Track top campaigns and export partner-ready reports from Campaigns.
            </p>
          </div>
          <div className="mt-4 space-y-2">
            <Link href="/dashboard/deliveries" className="block rounded-lg border border-slate-300 bg-white px-3 py-2 text-center font-medium text-slate-700 hover:bg-slate-50">
              Open Delivery Center
            </Link>
            <Link href="/dashboard/campaigns" className="block rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-center font-medium text-teal-700 hover:bg-teal-100">
              Open Campaign Insights
            </Link>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Top Campaigns</h2>
          <div className="mt-4 space-y-3">
            {topCampaigns.length ? (
              topCampaigns.map(([name, count]) => (
                <div key={name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <p className="max-w-[75%] truncate font-medium text-slate-800">{name}</p>
                    <p className="text-slate-500">{count}</p>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-teal-500" style={{ width: `${Math.max(8, (count / (topCampaigns[0]?.[1] ?? 1)) * 100)}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No campaign data available yet.
              </p>
            )}
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Quick Access</h2>
          <div className="mt-4 space-y-2 text-sm">
            <Link href="/dashboard/clicks" className="block rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
              Click Stream
            </Link>
            <Link href="/dashboard/leads" className="block rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
              Lead Management
            </Link>
            <Link href="/dashboard/links" className="block rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
              Link Builder
            </Link>
            <Link href="/dashboard/partners" className="block rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
              Partner Config
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
