import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { pushLeadById } from "@/lib/webhooks/pushLead";
import { buildTableHref, parseTableParams } from "@/lib/tableParams";

export const dynamic = "force-dynamic";

type AttributionRow = {
  lead_id: string;
  click_event_id: string;
  attribution_type: "first_touch" | "last_touch" | "multi_touch";
};

type ClickLookupRow = {
  id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  partner_slug: string;
  created_at: string | null;
};

async function pushLead(formData: FormData) {
  "use server";
  const leadId = formData.get("lead_id");
  if (typeof leadId !== "string" || !leadId) return;
  await pushLeadById(leadId);
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const table = parseTableParams(resolvedSearchParams);

  let leadsQuery = supabaseAdmin
    .from("leads")
    .select("id,full_name,email,phone,company,consent,session_id,status,created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (table.q) {
    const q = table.q.replace(/,/g, " ");
    leadsQuery = leadsQuery.or(
      `full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,company.ilike.%${q}%,status.ilike.%${q}%,session_id.ilike.%${q}%`,
    );
  }

  const { data: leads, count } = await leadsQuery.range(table.from, table.to);
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / table.pageSize));

  const { data: allLeadsForKpi } = await supabaseAdmin
    .from("leads")
    .select("id,status,consent")
    .order("created_at", { ascending: false })
    .limit(100);

  const leadRows = allLeadsForKpi ?? [];
  const leadIds = leadRows.map((lead) => lead.id);
  const { data: attributionRows } = leadIds.length
    ? await supabaseAdmin
        .from("lead_attributions")
        .select("lead_id,click_event_id,attribution_type")
        .in("lead_id", leadIds)
    : { data: [] as AttributionRow[] };

  const attributionData = (attributionRows ?? []) as AttributionRow[];
  const clickIds = Array.from(new Set(attributionData.map((row) => row.click_event_id)));
  const { data: clickLookupRows } = clickIds.length
    ? await supabaseAdmin
        .from("click_events")
        .select("id,utm_source,utm_medium,utm_campaign,partner_slug,created_at")
        .in("id", clickIds)
    : { data: [] as ClickLookupRow[] };

  const clickLookup = new Map<string, ClickLookupRow>(
    ((clickLookupRows ?? []) as ClickLookupRow[]).map((row) => [row.id, row]),
  );
  const attributionByLead = attributionData.reduce<Record<string, AttributionRow[]>>((acc, row) => {
    if (!acc[row.lead_id]) acc[row.lead_id] = [];
    acc[row.lead_id].push(row);
    return acc;
  }, {});

  const statusCounts = leadRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const consentedCount = leadRows.filter((row) => row.consent).length;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-10">
      <div className="mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            Pipeline
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Leads</h1>
          <p className="mt-2 text-sm text-slate-600">Recent leads and quick action controls for webhook push.</p>
        </div>
      </div>
      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={table.q}
          placeholder="Search name, email, company, status..."
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700"
        >
          Search
        </button>
        <Link
          href="/dashboard/leads"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        >
          Clear
        </Link>
      </form>
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rows Loaded</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{leadRows.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ready To Push</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{statusCounts.ready_to_push ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pushed</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{statusCounts.pushed ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Consented Leads</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{consentedCount}</p>
        </article>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/60">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Consent</th>
              <th className="px-4 py-3 font-medium">Session</th>
              <th className="px-4 py-3 font-medium">Attribution</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {leads?.length ? (
              leads.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 text-slate-700 transition hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.full_name || "-"}</td>
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">{row.phone || "-"}</td>
                  <td className="px-4 py-3">{row.company || "-"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {row.consent ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.session_id || "-"}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const items = attributionByLead[row.id] ?? [];
                      if (!items.length) {
                        return <span className="text-xs text-slate-500">No attribution yet</span>;
                      }

                      const first = items.find((a) => a.attribution_type === "first_touch");
                      const last = items.find((a) => a.attribution_type === "last_touch");
                      const firstClick = first ? clickLookup.get(first.click_event_id) : undefined;
                      const lastClick = last ? clickLookup.get(last.click_event_id) : undefined;
                      const firstLabel = firstClick
                        ? `${firstClick.utm_source || "direct"} / ${firstClick.utm_campaign || "untagged"}`
                        : "-";
                      const lastLabel = lastClick
                        ? `${lastClick.utm_source || "direct"} / ${lastClick.utm_campaign || "untagged"}`
                        : "-";

                      return (
                        <div className="space-y-1.5 text-xs">
                          <p className="font-semibold text-slate-700">{items.length} touches</p>
                          <p className="max-w-[200px] truncate text-slate-600">
                            First: <span className="font-medium">{firstLabel}</span>
                          </p>
                          <p className="max-w-[200px] truncate text-slate-600">
                            Last: <span className="font-medium">{lastLabel}</span>
                          </p>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</td>
                  <td className="px-4 py-3">
                    <form action={pushLead}>
                      <input type="hidden" name="lead_id" value={row.id} />
                      <button
                        className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100"
                        type="submit"
                      >
                        Push now
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                  No leads found.
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
            href={buildTableHref("/dashboard/leads", {
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
            href={buildTableHref("/dashboard/leads", {
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
