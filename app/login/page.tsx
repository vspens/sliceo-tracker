import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function signIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("next") ?? "/");

  if (!email || !password) {
    redirect(`/login?error=missing_credentials&next=${encodeURIComponent(nextPath)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=invalid_login&next=${encodeURIComponent(nextPath)}`);
  }

  redirect(nextPath || "/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextParam = Array.isArray(resolvedSearchParams?.next)
    ? resolvedSearchParams?.next[0]
    : resolvedSearchParams?.next;
  const nextPath = nextParam && nextParam.startsWith("/") ? nextParam : "/";

  const errorParam = Array.isArray(resolvedSearchParams?.error)
    ? resolvedSearchParams?.error[0]
    : resolvedSearchParams?.error;

  const errorMessage =
    errorParam === "invalid_login"
      ? "Invalid email or password."
      : errorParam === "missing_credentials"
        ? "Please enter both email and password."
        : "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f8fbff_0%,#f1f6fc_100%)] px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <Image src="/icon.svg" alt="Sliceo" width={30} height={30} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Private Access</p>
            <p className="text-sm font-semibold text-slate-900">Sliceo Tracker</p>
          </div>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Sign in to Sliceo Tracker</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use your Supabase user credentials to access the private dashboard.
        </p>

        {errorMessage ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        <form action={signIn} className="mt-6 space-y-3">
          <input type="hidden" name="next" value={nextPath} />
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-teal-500"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</label>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-teal-500"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100"
          >
            Sign in
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-500">
          Need a user? Create one in Supabase Auth Users, then come back and log in.
        </p>
        <Link href="https://supabase.com/dashboard" className="mt-2 inline-block text-xs font-medium text-teal-700 hover:underline">
          Open Supabase dashboard
        </Link>
      </section>
    </main>
  );
}
