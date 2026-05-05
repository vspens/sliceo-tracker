import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildTableHref, parseTableParams } from "@/lib/tableParams";
import { pushLeadById } from "@/lib/webhooks/pushLead";

export const dynamic = "force-dynamic";

async function replayDelivery(formData: FormData) {
  "use server";
  const leadId = String(formData.get("lead_id") ?? "");
  if (!leadId) {
    redirect("/dashboard/deliveries?status=replay_invalid");
  }
  try {
    const result = await pushLeadById(leadId);
    revalidatePath("/dashboard/deliveries");
    redirect(`/dashboard/deliveries?status=${result.ok ? "replay_success" : "replay_failed"}`);
  } catch {
    redirect("/dashboard/deliveries?status=replay_failed");
  }
}

function getStatusMessage(status: string | undefined) {
  switch (status) {
    case "replay_success":
      return { tone: "success", text: "Delivery replay succeeded." };
    case "replay_failed":
      return { tone: "error", text: "Delivery replay failed after retries." };
    case "replay_invalid":
      return { tone: "error", text: "Replay failed: invalid lead id." };
    default:
      return null;
  }
}

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const table = parseTableParams(resolvedSearchParams);
  const statusParam = Array.isArray(resolvedSearchParams?.status)
    ? resolvedSearchParams?.status[0]
    : resolvedSearchParams?.status;
  const status = getStatusMessage(statusParam);

  let query = supabaseAdmin
    .from("webhook_deliveries")
    .select("id,lead_id,target_url,status,response_code,response_body,attempt_count,last_error,created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (table.q) {
    const q = table.q.replace(/,/g, " ");
    query = query.or(
      `lead_id.ilike.%${q}%,target_url.ilike.%${q}%,status.ilike.%${q}%,response_body.ilike.%${q}%`,
    );
  }

  const { data, count } = await query.range(table.from, table.to);
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / table.pageSize));

  const deliveryRows = data ?? [];
  const successCount = deliveryRows.filter((row) => row.status === "success").length;
  const failedCount = deliveryRows.filter((row) => row.status === "failed").length;
  const successRate = deliveryRows.length ? Math.round((successCount / deliveryRows.length) * 100) : 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-10">
      <div className="mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            Reliability
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Webhook Deliveries</h1>
          <p className="mt-2 text-sm text-slate-600">Delivery attempts and response outcomes for pushed leads.</p>
        </div>
      </div>
      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={table.q}
          placeholder="Search lead, target URL, status..."
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700"
        >
          Search
        </button>
        <Link
          href="/dashboard/deliveries"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        >
          Clear
        </Link>
      </form>
      {status ? (
        <section
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            status.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {status.text}
        </section>
      ) : null}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rows Loaded</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{deliveryRows.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Success</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{successCount}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Failed</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{failedCount}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Success Rate</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{successRate}%</p>
        </article>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/60">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Lead</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Attempts</th>
              <th className="px-4 py-3 font-medium">Response</th>
              <th className="px-4 py-3 font-medium">Replay</th>
              <th className="px-4 py-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {data?.length ? (
              data.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 text-slate-700 transition hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.lead_id}</td>
                  <td className="px-4 py-3 text-slate-700">{row.target_url}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{row.response_code ?? "-"}</td>
                  <td className="px-4 py-3">{row.attempt_count ?? 1}</td>
                  <td className="px-4 py-3">
                    <span className="block max-w-[220px] truncate">{row.last_error || row.response_body || "-"}</span>
                  </td>
                  <td className="px-4 py-3">
                    {row.status === "failed" ? (
                      <form action={replayDelivery}>
                        <input type="hidden" name="lead_id" value={row.lead_id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                        >
                          Retry
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                  No delivery attempts yet.
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
            href={buildTableHref("/dashboard/deliveries", {
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
            href={buildTableHref("/dashboard/deliveries", {
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
