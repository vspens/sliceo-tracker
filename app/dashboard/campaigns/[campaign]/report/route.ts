import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabase/admin";
import fs from "node:fs/promises";
import path from "node:path";
import { Buffer } from "node:buffer";

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

function rangeLabel(range: RangePreset) {
  if (range === "all") return "All time";
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";
  return "Last 90 days";
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").slice(0, 80);
}

async function loadBrandLogo() {
  const candidates = [
    path.join(process.cwd(), "public", "brand", "sliceo-dark.png"),
    path.join(process.cwd(), "dark.png"),
    "C:/Users/Hazel/Downloads/dark.png",
    "C:/Users/Hazel/.cursor/projects/c-Users-Hazel-Downloads-sliceo-tracker/assets/c__Users_Hazel_AppData_Roaming_Cursor_User_workspaceStorage_87e766972f9364dc5eda45cebc724016_images_dark-89d0c7ac-c2a5-44b5-b56b-f251f419c8dd.png",
  ];

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate);
    } catch {
      // Try next path.
    }
  }
  return null;
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
    clickQuery = clickQuery.gte("created_at", since);
  }
  const { data: campaignClickRows } = await clickQuery;
  const campaignClicks = campaignClickRows ?? [];

  const partnerCounts = campaignClicks.reduce<Record<string, number>>((acc, row) => {
    acc[row.partner_slug] = (acc[row.partner_slug] ?? 0) + 1;
    return acc;
  }, {});
  const topPartnerSlug =
    Object.entries(partnerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  const destinationCounts = campaignClicks.reduce<Record<string, number>>((acc, row) => {
    const key = row.destination_url || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const topDestinationUrl =
    Object.entries(destinationCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

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

  const leadMap = new Map<string, LeadRow>();
  (sessionLeads ?? []).forEach((lead) => leadMap.set(lead.id, lead));
  (attributedLeads ?? []).forEach((lead) => leadMap.set(lead.id, lead));
  const leads = Array.from(leadMap.values()).sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
  );

  const firstTouch = (attributions ?? []).filter((a) => a.attribution_type === "first_touch").length;
  const lastTouch = (attributions ?? []).filter((a) => a.attribution_type === "last_touch").length;
  const assists = (attributions ?? []).filter((a) => a.attribution_type === "multi_touch").length;

  const uniqueSessions = new Set(campaignClicks.map((row) => row.session_id)).size;
  const uniqueIps = new Set(campaignClicks.map((row) => row.ip_address || "unknown")).size;
  const leadConversionRate = campaignClicks.length ? Math.round((leads.length / campaignClicks.length) * 100) : 0;

  const referrerCounts = campaignClicks.reduce<Record<string, number>>((acc, row) => {
    const key = row.referrer?.trim() || "direct / none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const topReferrers = Object.entries(referrerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const recentLeads = leads.slice(0, 8);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]); // A4 landscape
  const page2 = pdf.addPage([842, 595]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await loadBrandLogo();
  const logoImage = logoBytes ? await pdf.embedPng(logoBytes) : null;

  const colors = {
    textPrimary: rgb(0.08, 0.12, 0.18),
    textMuted: rgb(0.36, 0.43, 0.52),
    slateBg: rgb(0.96, 0.97, 0.98),
    border: rgb(0.86, 0.89, 0.92),
    brand: rgb(0.23, 0.66, 0.96),
    brandSoft: rgb(0.92, 0.97, 1),
  };

  const drawLine = (
    text: string,
    x: number,
    y: number,
    size = 11,
    bold = false,
    targetPage: typeof page = page,
  ) => {
    targetPage.drawText(text, {
      x,
      y,
      size,
      font: bold ? boldFont : font,
      color: colors.textPrimary,
    });
  };
  const drawWrappedText = (
    targetPage: typeof page,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    size = 10,
    lineHeight = 13,
    bold = false,
  ) => {
    const words = text.split(" ");
    let line = "";
    let cursorY = y;
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      const width = (bold ? boldFont : font).widthOfTextAtSize(candidate, size);
      if (width > maxWidth && line) {
        targetPage.drawText(line, {
          x,
          y: cursorY,
          size,
          font: bold ? boldFont : font,
          color: colors.textMuted,
        });
        cursorY -= lineHeight;
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) {
      targetPage.drawText(line, {
        x,
        y: cursorY,
        size,
        font: bold ? boldFont : font,
        color: colors.textMuted,
      });
    }
    return cursorY;
  };

  page.drawRectangle({
    x: 0,
    y: 530,
    width: 842,
    height: 65,
    color: colors.slateBg,
    borderColor: colors.border,
    borderWidth: 1,
  });

  let titleX = 36;
  if (logoImage) {
    const maxLogoWidth = 150;
    const maxLogoHeight = 42;
    const ratio = Math.min(maxLogoWidth / logoImage.width, maxLogoHeight / logoImage.height);
    const width = logoImage.width * ratio;
    const height = logoImage.height * ratio;
    page.drawImage(logoImage, {
      x: 36,
      y: 543,
      width,
      height,
    });
    titleX = 36 + width + 16;
  }

  drawLine("Sliceo Partner Campaign Report", titleX, 564, 20, true);
  page.drawText(`Generated ${new Date().toLocaleString()}`, {
    x: titleX,
    y: 546,
    size: 10,
    font,
    color: colors.textMuted,
  });

  page.drawRectangle({
    x: 36,
    y: 480,
    width: 770,
    height: 42,
    color: colors.brandSoft,
    borderColor: colors.border,
    borderWidth: 1,
  });
  drawLine(`Campaign: ${campaign}`, 48, 505, 12, true);
  page.drawText(
    `Source/Medium: ${source} / ${medium} | Date range: ${rangeLabel(range)}`,
    {
      x: 48,
      y: 489,
      size: 10,
      font,
      color: colors.textMuted,
    },
  );
  page.drawText(`Partner: ${topPartnerSlug}`, {
    x: 520,
    y: 505,
    size: 10,
    font: boldFont,
    color: colors.textPrimary,
  });
  page.drawText(`Destination: ${topDestinationUrl}`.slice(0, 72), {
    x: 520,
    y: 489,
    size: 9,
    font,
    color: colors.textMuted,
  });

  const cards = [
    { label: "Clicks", value: String(campaignClicks.length) },
    { label: "Unique Sessions", value: String(uniqueSessions) },
    { label: "Leads", value: String(leads.length) },
    { label: "Lead CVR", value: `${leadConversionRate}%` },
    { label: "Delivery Signals", value: `${firstTouch + lastTouch + assists}` },
  ];

  let cardX = 36;
  cards.forEach((card) => {
    page.drawRectangle({
      x: cardX,
      y: 404,
      width: 148,
      height: 64,
      color: rgb(1, 1, 1),
      borderColor: colors.border,
      borderWidth: 1,
    });
    page.drawRectangle({
      x: cardX,
      y: 458,
      width: 148,
      height: 10,
      color: colors.brand,
    });
    page.drawText(card.label, { x: cardX + 10, y: 438, size: 9, font, color: colors.textMuted });
    page.drawText(card.value, {
      x: cardX + 10,
      y: 416,
      size: 18,
      font: boldFont,
      color: colors.textPrimary,
    });
    cardX += 156;
  });

  drawLine("Attribution Summary", 36, 380, 12, true);
  page.drawText(`First Touch: ${firstTouch}`, { x: 36, y: 364, size: 10, font, color: colors.textMuted });
  page.drawText(`Last Touch: ${lastTouch}`, { x: 170, y: 364, size: 10, font, color: colors.textMuted });
  page.drawText(`Assist Touches: ${assists}`, { x: 290, y: 364, size: 10, font, color: colors.textMuted });
  page.drawText(`Unique IPs: ${uniqueIps}`, { x: 440, y: 364, size: 10, font, color: colors.textMuted });

  page.drawRectangle({
    x: 36,
    y: 190,
    width: 380,
    height: 155,
    color: rgb(1, 1, 1),
    borderColor: colors.border,
    borderWidth: 1,
  });
  drawLine("Top Referrers", 48, 327, 12, true);
  let leftY = 309;
  if (topReferrers.length) {
    topReferrers.forEach(([referrer, count], idx) => {
      const text = `${idx + 1}. ${referrer.slice(0, 48)} (${count})`;
      page.drawText(text, { x: 48, y: leftY, size: 10, font, color: colors.textMuted });
      leftY -= 16;
    });
  } else {
    page.drawText("No referrer data for selected range.", {
      x: 48,
      y: leftY,
      size: 10,
      font,
      color: colors.textMuted,
    });
  }

  page.drawRectangle({
    x: 426,
    y: 190,
    width: 380,
    height: 155,
    color: rgb(1, 1, 1),
    borderColor: colors.border,
    borderWidth: 1,
  });
  drawLine("Recent Leads", 438, 327, 12, true);
  let rightY = 309;
  if (recentLeads.length) {
    recentLeads.forEach((lead, idx) => {
      const leadLine = `${idx + 1}. ${(lead.full_name || "Unknown").slice(0, 20)} | ${lead.status}`;
      const subLine = `${lead.email.slice(0, 28)} | ${lead.created_at ? new Date(lead.created_at).toLocaleDateString() : "-"}`;
      page.drawText(leadLine, { x: 438, y: rightY, size: 9, font: boldFont, color: colors.textPrimary });
      rightY -= 11;
      page.drawText(subLine, { x: 438, y: rightY, size: 8, font, color: colors.textMuted });
      rightY -= 13;
    });
  } else {
    page.drawText("No leads linked for selected range.", {
      x: 438,
      y: rightY,
      size: 10,
      font,
      color: colors.textMuted,
    });
  }

  page.drawRectangle({
    x: 36,
    y: 98,
    width: 770,
    height: 78,
    color: colors.brandSoft,
    borderColor: colors.border,
    borderWidth: 1,
  });
  drawLine("Partner Insight", 48, 156, 12, true);
  const insight =
    leadConversionRate >= 10
      ? "Strong campaign momentum. Recommend scaling this theme and retargeting engaged sessions for higher close rates."
      : "Campaign is generating awareness but conversion can improve. Optimize CTA, landing alignment, and audience quality.";
  drawWrappedText(page, insight, 48, 135, 740, 10, 13, false);

  // Page 2: metric definitions and methodology (client-friendly glossary).
  page2.drawRectangle({
    x: 0,
    y: 530,
    width: 842,
    height: 65,
    color: colors.slateBg,
    borderColor: colors.border,
    borderWidth: 1,
  });
  drawLine("How to Read This Report", 36, 564, 20, true, page2);
  page2.drawText(`Campaign: ${campaign} | ${source} / ${medium} | ${rangeLabel(range)}`, {
    x: 36,
    y: 546,
    size: 10,
    font,
    color: colors.textMuted,
  });
  page2.drawText(`Partner: ${topPartnerSlug}`, {
    x: 500,
    y: 546,
    size: 10,
    font: boldFont,
    color: colors.textPrimary,
  });
  page2.drawText(`Destination: ${topDestinationUrl}`.slice(0, 58), {
    x: 500,
    y: 532,
    size: 8,
    font,
    color: colors.textMuted,
  });

  page2.drawRectangle({
    x: 36,
    y: 470,
    width: 770,
    height: 46,
    color: colors.brandSoft,
    borderColor: colors.border,
    borderWidth: 1,
  });
  drawLine("Metric Definitions", 48, 498, 13, true, page2);
  page2.drawText("These terms are included in your monthly campaign report for transparency and decision-making.", {
    x: 48,
    y: 482,
    size: 10,
    font,
    color: colors.textMuted,
  });

  const definitions: Array<[string, string]> = [
    ["Clicks", "Total number of recorded visits to this campaign link within the selected date range."],
    ["Unique Sessions", "Estimated count of distinct visitor sessions that interacted with this campaign."],
    ["Unique IPs", "Distinct IP addresses seen for this campaign. Helpful for traffic diversity checks."],
    ["Leads", "Number of lead records linked to this campaign through session matching and/or attribution."],
    ["Lead CVR", "Lead conversion rate. Formula: Leads ÷ Clicks."],
    ["First Touch", "Leads where this campaign was the first known interaction in the conversion journey."],
    ["Last Touch", "Leads where this campaign was the final interaction before conversion."],
    ["Assist Touches", "Interactions where this campaign influenced the lead journey between first and last touch."],
    ["Top Referrers", "Domains/pages that sent campaign traffic. Useful for channel and placement diagnostics."],
    ["Recent Leads", "Latest leads associated to this campaign based on attribution or session linkage."],
  ];

  let defY = 448;
  for (const [term, meaning] of definitions) {
    if (defY < 130) break;
    page2.drawText(term, {
      x: 48,
      y: defY,
      size: 10,
      font: boldFont,
      color: colors.textPrimary,
    });
    drawWrappedText(page2, meaning, 180, defY, 610, 10, 13);
    defY -= 34;
  }

  page2.drawRectangle({
    x: 36,
    y: 62,
    width: 770,
    height: 52,
    color: rgb(0.98, 0.99, 1),
    borderColor: colors.border,
    borderWidth: 1,
  });
  page2.drawText("Interpretation Tip", {
    x: 48,
    y: 95,
    size: 11,
    font: boldFont,
    color: colors.textPrimary,
  });
  page2.drawText(
    "Use First Touch to measure awareness impact, Last Touch to measure conversion-closing impact, and Assist Touches to understand supporting influence. Reviewing all three gives a more complete campaign story than last-click alone.",
    {
      x: 148,
      y: 95,
      size: 9,
      font,
      color: colors.textMuted,
      maxWidth: 648,
      lineHeight: 12,
    },
  );

  const bytes = await pdf.save();
  const body = new Blob([Buffer.from(bytes)], { type: "application/pdf" });
  const fileName = `sliceo-campaign-report-${safeName(campaign)}.pdf`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
