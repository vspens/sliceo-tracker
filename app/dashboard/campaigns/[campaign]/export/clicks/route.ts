import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type RangePreset = "7d" | "30d" | "90d" | "all";

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

  let query = supabaseAdmin
    .from("click_events")
    .select(
      "id,partner_slug,destination_url,session_id,utm_source,utm_medium,utm_campaign,ip_address,referrer,user_agent,created_at",
    )
    .eq("utm_source", source)
    .eq("utm_medium", medium)
    .eq("utm_campaign", campaign)
    .order("created_at", { ascending: false })
    .limit(10000);
  const since = isoOrNull(rangeStart);
  if (since) {
    query = query.gte("created_at", since);
  }
  const { data: rowsData } = await query;
  const rows = rowsData ?? [];

  const header = [
    "id",
    "created_at",
    "partner_slug",
    "session_id",
    "ip_address",
    "referrer",
    "user_agent",
    "destination_url",
    "utm_source",
    "utm_medium",
    "utm_campaign",
  ];

  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.id,
        row.created_at,
        row.partner_slug,
        row.session_id,
        row.ip_address,
        row.referrer,
        row.user_agent,
        row.destination_url,
        row.utm_source,
        row.utm_medium,
        row.utm_campaign,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaign-clicks-${campaign}.csv"`,
    },
  });
}
