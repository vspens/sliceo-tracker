import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildTableHref, parseTableParams } from "@/lib/tableParams";

export const dynamic = "force-dynamic";

export default async function ClicksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const table = parseTableParams(resolvedSearchParams);

  let query = supabaseAdmin
    .from("click_events")
    .select(
      "id,partner_slug,destination_url,utm_source,utm_medium,utm_campaign,session_id,referrer,user_agent,is_bot,created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (table.q) {
    const q = table.q.replace(/,/g, " ");
    query = query.or(
      `partner_slug.ilike.%${q}%,utm_source.ilike.%${q}%,utm_medium.ilike.%${q}%,utm_campaign.ilike.%${q}%,session_id.ilike.%${q}%,destination_url.ilike.%${q}%,referrer.ilike.%${q}%`,
    );
  }

  const { data: clicks, count } = await query.range(table.from, table.to);
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / table.pageSize));

  const clickRows = clicks ?? [];
  const uniqueSessions = new Set(clickRows.map((row) => row.session_id)).size;
  const botCount = clickRows.filter((row) => row.is_bot).length;
  const topSources = clickRows.reduce<Record<string, number>>((acc, row) => {
    const key = row.utm_source?.trim() || "direct";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const topSource = Object.entries(topSources).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-10">
      <div className="mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            Traffic
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Click Stream</h1>
          <p className="mt-2 text-sm text-slate-600">Most recent click events with source attribution data.</p>
        </div>
      </div>
      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={table.q}
          placeholder="Search partner, source, campaign, referrer..."
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700"
        >
          Search
        </button>
        <Link
          href="/dashboard/clicks"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        >
          Clear
        </Link>
      </form>
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rows Loaded</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{clickRows.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unique Sessions</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{uniqueSessions}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top Source</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{topSource}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bot Flags</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{botCount}</p>
        </article>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/60">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Partner</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Medium</th>
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 font-medium">Session</th>
              <th className="px-4 py-3 font-medium">Destination</th>
              <th className="px-4 py-3 font-medium">Referrer</th>
              <th className="px-4 py-3 font-medium">Bot</th>
              <th className="px-4 py-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {clicks?.length ? (
              clickRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 text-slate-700 transition hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.partner_slug}</td>
                  <td className="px-4 py-3">{row.utm_source || "-"}</td>
                  <td className="px-4 py-3">{row.utm_medium || "-"}</td>
                  <td className="px-4 py-3">{row.utm_campaign || "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.session_id}</td>
                  <td className="px-4 py-3">
                    <span className="block max-w-[220px] truncate">{row.destination_url}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block max-w-[220px] truncate">{row.referrer || "-"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {row.is_bot ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                  No click events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <p>
          Page {table.page} of {totalPages} ({totalCount} records)
        </p>
        <div className="flex gap-2">
          <Link
            href={buildTableHref("/dashboard/clicks", {
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
            href={buildTableHref("/dashboard/clicks", {
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
