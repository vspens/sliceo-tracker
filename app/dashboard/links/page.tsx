import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildTableHref, parseTableParams } from "@/lib/tableParams";
import { normalizeUtmValue } from "@/lib/tracking/utm";

export const dynamic = "force-dynamic";

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function createTrackingLink(formData: FormData) {
  "use server";

  const slug = normalizeSlug(String(formData.get("slug") ?? ""));
  const label = String(formData.get("label") ?? "").trim();
  const partnerSlug = String(formData.get("partner_slug") ?? "").trim();
  const utmSource = normalizeUtmValue(String(formData.get("utm_source") ?? ""));
  const utmMedium = normalizeUtmValue(String(formData.get("utm_medium") ?? ""));
  const utmCampaign = normalizeUtmValue(String(formData.get("utm_campaign") ?? ""));
  const utmContent = normalizeUtmValue(String(formData.get("utm_content") ?? ""));

  if (!slug || !partnerSlug) {
    redirect("/dashboard/links?status=link_invalid");
  }

  const { error } = await supabaseAdmin.from("tracking_links").insert({
    slug,
    label: label || null,
    partner_slug: partnerSlug,
    utm_source: utmSource || null,
    utm_medium: utmMedium || null,
    utm_campaign: utmCampaign || null,
    utm_content: utmContent || null,
    active: true,
  });

  if (error) {
    redirect("/dashboard/links?status=link_error");
  }

  revalidatePath("/dashboard/links");
  redirect("/dashboard/links?status=link_created");
}

async function createPartner(formData: FormData) {
  "use server";

  const slug = normalizeSlug(String(formData.get("partner_slug") ?? ""));
  const name = String(formData.get("partner_name") ?? "").trim();
  const destinationUrl = String(formData.get("destination_url") ?? "").trim();

  if (!slug || !name || !destinationUrl) {
    redirect("/dashboard/links?status=partner_invalid");
  }

  const validUrl = URL.canParse(destinationUrl);
  if (!validUrl) {
    redirect("/dashboard/links?status=partner_invalid_url");
  }

  const { error } = await supabaseAdmin.from("partners").upsert(
    {
      slug,
      name,
      destination_url: destinationUrl,
      active: true,
    },
    { onConflict: "slug" },
  );

  if (error) {
    redirect("/dashboard/links?status=partner_error");
  }

  revalidatePath("/dashboard/links");
  redirect("/dashboard/links?status=partner_saved");
}

function getStatusMessage(status: string | undefined) {
  switch (status) {
    case "link_created":
      return { tone: "success", text: "Tracking link created successfully." };
    case "partner_saved":
      return { tone: "success", text: "Partner destination saved successfully." };
    case "link_invalid":
      return { tone: "error", text: "Please provide slug and partner before saving the tracking link." };
    case "partner_invalid":
      return { tone: "error", text: "Please provide partner slug, name, and destination URL." };
    case "partner_invalid_url":
      return { tone: "error", text: "Destination URL is invalid. Use full URL like https://example.com." };
    case "link_error":
      return { tone: "error", text: "Could not save tracking link. Slug might already exist or input is invalid." };
    case "partner_error":
      return { tone: "error", text: "Could not save partner destination. Please try again." };
    default:
      return null;
  }
}

export default async function LinksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const modalParam = Array.isArray(resolvedSearchParams?.modal)
    ? resolvedSearchParams?.modal[0]
    : resolvedSearchParams?.modal;
  const statusParam = Array.isArray(resolvedSearchParams?.status)
    ? resolvedSearchParams?.status[0]
    : resolvedSearchParams?.status;
  const status = getStatusMessage(statusParam);
  const table = parseTableParams(resolvedSearchParams);

  let linksQuery = supabaseAdmin
      .from("tracking_links")
      .select("id,slug,label,partner_slug,utm_source,utm_medium,utm_campaign,utm_content,active,created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false });

  if (table.q) {
    const q = table.q.replace(/,/g, " ");
    linksQuery = linksQuery.or(
      `slug.ilike.%${q}%,label.ilike.%${q}%,partner_slug.ilike.%${q}%,utm_source.ilike.%${q}%,utm_medium.ilike.%${q}%,utm_campaign.ilike.%${q}%`,
    );
  }

  const [{ data: links, count }, { data: partners }] = await Promise.all([
    linksQuery.range(table.from, table.to),
    supabaseAdmin.from("partners").select("slug,name").eq("active", true).order("slug"),
  ]);

  const rows = links ?? [];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / table.pageSize));
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-10">
      <div className="mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Campaign Ops</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Link Builder</h1>
          <p className="mt-2 text-sm text-slate-600">Create clean short links for LinkedIn, email, and paid campaigns.</p>
        </div>
      </div>

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

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Actions</h2>
        <p className="mt-1 text-sm text-slate-600">Open forms in a focused modal flow.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/dashboard/links?modal=tracking"
            className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100"
          >
            + Create tracking link
          </Link>
          <Link
            href="/dashboard/partners"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Manage partners
          </Link>
        </div>
      </section>

      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={table.q}
          placeholder="Search slug, partner, campaign tags..."
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700"
        >
          Search
        </button>
        <Link
          href="/dashboard/links"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        >
          Clear
        </Link>
      </form>

      <section className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/50">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Link</th>
              <th className="px-4 py-3 font-medium">Partner</th>
              <th className="px-4 py-3 font-medium">Campaign Tags</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 text-slate-700">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{appUrl}/go/{row.slug}</p>
                    <p className="text-xs text-slate-500">{row.label || "-"}</p>
                  </td>
                  <td className="px-4 py-3">{row.partner_slug}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-slate-600">src: {row.utm_source || "-"}</p>
                    <p className="text-xs text-slate-600">med: {row.utm_medium || "-"}</p>
                    <p className="text-xs text-slate-600">cmp: {row.utm_campaign || "-"}</p>
                    <p className="text-xs text-slate-600">cnt: {row.utm_content || "-"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {row.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  No tracking links yet.
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
            href={buildTableHref("/dashboard/links", {
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
            href={buildTableHref("/dashboard/links", {
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

      {modalParam === "tracking" ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <section className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Create New Tracking Link</h2>
                <p className="text-sm text-slate-600">Set up a clean slug and campaign defaults.</p>
              </div>
              <Link href="/dashboard/links" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
                Close
              </Link>
            </div>
            <form action={createTrackingLink} className="grid gap-3 md:grid-cols-3">
              <input
                name="slug"
                placeholder="slug (e.g. li-hoa-guide)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                required
              />
              <input
                name="label"
                placeholder="label (optional)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
              <select
                name="partner_slug"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select partner
                </option>
                {partners?.map((partner) => (
                  <option key={partner.slug} value={partner.slug}>
                    {partner.slug} - {partner.name}
                  </option>
                ))}
              </select>
              <input
                name="utm_source"
                placeholder="utm_source (e.g. linkedin)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
              <input
                name="utm_medium"
                placeholder="utm_medium (e.g. social)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
              <input
                name="utm_campaign"
                placeholder="utm_campaign (e.g. hoa-guide-apr)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
              <input
                name="utm_content"
                placeholder="utm_content (optional)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none md:col-span-2"
              />
              <button
                type="submit"
                className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100"
              >
                Save link
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {modalParam === "partner" ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Add Partner Destination</h2>
                <p className="text-sm text-slate-600">Create or update a partner landing destination.</p>
              </div>
              <Link href="/dashboard/links" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
                Close
              </Link>
            </div>
            <form action={createPartner} className="grid gap-3 md:grid-cols-2">
              <input
                name="partner_slug"
                placeholder="partner slug (e.g. audit)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                required
              />
              <input
                name="partner_name"
                placeholder="partner name"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                required
              />
              <input
                name="destination_url"
                placeholder="destination URL (https://...)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none md:col-span-2"
                required
              />
              <button
                type="submit"
                className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100 md:col-span-2"
              >
                Save partner
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
