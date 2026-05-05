import Link from "next/link";
import Image from "next/image";

const navItems = [
  { href: "/dashboard", label: "Dashboard", group: "Overview" },
  { href: "/dashboard/campaigns", label: "Campaigns", group: "Analysis" },
  { href: "/dashboard/leads", label: "Leads", group: "Analysis" },
  { href: "/dashboard/clicks", label: "Click Stream", group: "Analysis" },
  { href: "/dashboard/deliveries", label: "Deliveries", group: "Operations" },
  { href: "/dashboard/links", label: "Link Builder", group: "Operations" },
  { href: "/dashboard/partners", label: "Partners", group: "Configuration" },
];

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#f3f7fb_100%)]">
      <div className="mx-auto flex w-full max-w-[1500px] gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-64 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex">
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Image src="/icon.svg" alt="Sliceo" width={32} height={32} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Sliceo</p>
              <p className="text-sm font-semibold text-slate-900">Tracker CRM</p>
            </div>
          </div>
          <nav className="space-y-1">
            {navItems.map((item, index) => (
              <div key={item.href}>
                {(index === 0 || navItems[index - 1].group !== item.group) && (
                  <p className="mb-1 mt-3 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {item.group}
                  </p>
                )}
                <Link
                  href={item.href}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-teal-50 hover:text-teal-700"
                >
                  {item.label}
                </Link>
              </div>
            ))}
          </nav>
          <div className="mt-auto border-t border-slate-200 pt-4">
            <Link
              href="/logout"
              className="block rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Logout
            </Link>
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
