import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildTableHref, parseTableParams } from "@/lib/tableParams";

export const dynamic = "force-dynamic";

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function createPartner(formData: FormData) {
  "use server";
  const slug = normalizeSlug(String(formData.get("slug") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const destinationUrl = String(formData.get("destination_url") ?? "").trim();

  if (!slug || !name || !destinationUrl || !URL.canParse(destinationUrl)) {
    redirect("/dashboard/partners?status=create_invalid");
  }

  const { error } = await supabaseAdmin.from("partners").insert({
    slug,
    name,
    destination_url: destinationUrl,
    active: true,
  });

  if (error) {
    redirect("/dashboard/partners?status=create_error");
  }

  revalidatePath("/dashboard/partners");
  revalidatePath("/dashboard/links");
  redirect("/dashboard/partners?status=created");
}

async function updatePartner(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const destinationUrl = String(formData.get("destination_url") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";

  if (!id || !name || !destinationUrl || !URL.canParse(destinationUrl)) {
    redirect("/dashboard/partners?status=update_invalid");
  }

  const { error } = await supabaseAdmin
    .from("partners")
    .update({
      name,
      destination_url: destinationUrl,
      active,
    })
    .eq("id", id);

  if (error) {
    redirect("/dashboard/partners?status=update_error");
  }

  revalidatePath("/dashboard/partners");
  revalidatePath("/dashboard/links");
  redirect("/dashboard/partners?status=updated");
}

async function deletePartner(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) {
    redirect("/dashboard/partners?status=delete_invalid");
  }

  const { error } = await supabaseAdmin.from("partners").delete().eq("id", id);
  if (error) {
    redirect("/dashboard/partners?status=delete_error");
  }

  revalidatePath("/dashboard/partners");
  revalidatePath("/dashboard/links");
  redirect("/dashboard/partners?status=deleted");
}

function getStatusMessage(status: string | undefined) {
  switch (status) {
    case "created":
      return { tone: "success", text: "Partner created successfully." };
    case "updated":
      return { tone: "success", text: "Partner updated successfully." };
    case "deleted":
      return { tone: "success", text: "Partner deleted successfully." };
    case "create_invalid":
      return { tone: "error", text: "Please provide valid slug, name, and destination URL." };
    case "update_invalid":
      return { tone: "error", text: "Update failed: invalid fields." };
    case "delete_invalid":
      return { tone: "error", text: "Delete failed: invalid partner id." };
    case "create_error":
      return { tone: "error", text: "Could not create partner. Slug may already exist." };
    case "update_error":
      return { tone: "error", text: "Could not update partner." };
    case "delete_error":
      return {
        tone: "error",
        text: "Could not delete partner. It may still be referenced by tracking links.",
      };
    default:
      return null;
  }
}

export default async function PartnersPage({
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

  let partnersQuery = supabaseAdmin
    .from("partners")
    .select("id,slug,name,destination_url,active,created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (table.q) {
    const q = table.q.replace(/,/g, " ");
    partnersQuery = partnersQuery.or(`slug.ilike.%${q}%,name.ilike.%${q}%,destination_url.ilike.%${q}%`);
  }

  const { data: partners, count } = await partnersQuery.range(table.from, table.to);
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / table.pageSize));

  const rows = partners ?? [];

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-10">
      <div className="mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Configuration</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Partners</h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage partner destinations used by campaign tracking links.
          </p>
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
            href="/dashboard/partners?modal=create"
            className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100"
          >
            + Create partner
          </Link>
        </div>
      </section>

      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={table.q}
          placeholder="Search slug, partner name, destination URL..."
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700"
        >
          Search
        </button>
        <Link
          href="/dashboard/partners"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        >
          Clear
        </Link>
      </form>

      <section className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/50">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Destination URL</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top text-slate-700">
                  {(() => {
                    const formId = `partner-update-${row.id}`;
                    return (
                      <>
                  <td className="px-4 py-3 font-mono text-xs">{row.slug}</td>
                  <td className="px-4 py-3">
                    <input
                      form={formId}
                      name="name"
                      defaultValue={row.name}
                      required
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      form={formId}
                      name="destination_url"
                      defaultValue={row.destination_url}
                      required
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      form={formId}
                      name="active"
                      defaultValue={row.active ? "true" : "false"}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <form id={formId} action={updatePartner}>
                        <input type="hidden" name="id" value={row.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Save
                        </button>
                      </form>
                      <form action={deletePartner}>
                      <input type="hidden" name="id" value={row.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                      </>
                    );
                  })()}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  No partners yet.
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
            href={buildTableHref("/dashboard/partners", {
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
            href={buildTableHref("/dashboard/partners", {
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

      {modalParam === "create" ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Create Partner</h2>
                <p className="text-sm text-slate-600">Add a new partner and destination URL.</p>
              </div>
              <Link
                href="/dashboard/partners"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
              >
                Close
              </Link>
            </div>
            <form action={createPartner} className="grid gap-3 md:grid-cols-2">
              <input
                name="slug"
                placeholder="slug (e.g. cincsystems)"
                required
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
              <input
                name="name"
                placeholder="partner name"
                required
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
              <input
                name="destination_url"
                placeholder="destination URL (https://...)"
                required
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none md:col-span-2"
              />
              <button
                type="submit"
                className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100 md:col-span-2"
              >
                Create partner
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
