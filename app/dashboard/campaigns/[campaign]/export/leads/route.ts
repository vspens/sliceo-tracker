import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

function csvEscape(value: string | number | null | undefined) {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaign: string }> },
) {
  const { campaign: campaignParam } = await params;
  const url = new URL(request.url);
  const source = url.searchParams.get("source")?.trim() || "direct";
  const medium = url.searchParams.get("medium")?.trim() || "(none)";
  const rangeParam = (url.searchParams.get("range") as RangePreset | null) ?? "30d";
  const range: RangePreset =
    rangeParam === "7d" || rangeParam === "30d" || rangeParam === "90d" || rangeParam === "all"
      ? rangeParam
      : "30d";
  const rangeStart = getRangeStart(range);
  const campaign = decodeURIComponent(campaignParam);

  let clickQuery = supabaseAdmin
    .from("click_events")
    .select("id,session_id,created_at")
    .eq("utm_source", source)
    .eq("utm_medium", medium)
    .eq("utm_campaign", campaign)
    .order("created_at", { ascending: false })
    .limit(10000);
  const since = isoOrNull(rangeStart);
  if (since) {
    clickQuery = clickQuery.gte("created_at", since);
  }
  const { data: campaignClickRows } = await clickQuery;
  const campaignClicks = campaignClickRows ?? [];

  const clickIds = campaignClicks.map((row) => row.id);
  const sessionIds = Array.from(new Set(campaignClicks.map((row) => row.session_id).filter(Boolean))) as string[];

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
      : Promise.resolve({ data: [] as { lead_id: string; attribution_type: string }[] }),
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

  const header = [
    "id",
    "created_at",
    "full_name",
    "email",
    "company",
    "status",
    "session_id",
    "attribution_types",
  ];

  const lines = [
    header.join(","),
    ...leads.map((lead) =>
      [
        lead.id,
        lead.created_at,
        lead.full_name,
        lead.email,
        lead.company,
        lead.status,
        lead.session_id,
        Array.from(new Set(attributionByLead[lead.id] ?? [])).join("|") || "session_match",
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaign-leads-${campaign}.csv"`,
    },
  });
}
