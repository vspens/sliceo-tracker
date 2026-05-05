import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOrCreateSessionId } from "@/lib/tracking/session";
import { logError, logInfo } from "@/lib/monitoring/log";
import { isLikelyBot, normalizeUtmValue } from "@/lib/tracking/utm";

function getIpAddress(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

function isPrefetchRequest(req: NextRequest) {
  const purpose = req.headers.get("purpose")?.toLowerCase();
  const secPurpose = req.headers.get("sec-purpose")?.toLowerCase();
  const nextPrefetch = req.headers.get("next-router-prefetch");
  const prefetchHeader = req.headers.get("x-middleware-prefetch");

  return (
    purpose?.includes("prefetch") ||
    secPurpose?.includes("prefetch") ||
    nextPrefetch !== null ||
    prefetchHeader !== null
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (isPrefetchRequest(req)) {
    return new NextResponse(null, { status: 204 });
  }
  const sessionId = await getOrCreateSessionId();

  const { data: trackingLink } = await supabaseAdmin
    .from("tracking_links")
    .select("slug,partner_slug,utm_source,utm_medium,utm_campaign,utm_content,active")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  const effectivePartnerSlug = trackingLink?.partner_slug ?? slug;

  const { data: partner } = await supabaseAdmin
    .from("partners")
    .select("slug,destination_url,active")
    .eq("slug", effectivePartnerSlug)
    .eq("active", true)
    .maybeSingle();

  const destination = partner?.destination_url ?? process.env.FALLBACK_REDIRECT_URL ?? "https://sliceo.co";
  const url = new URL(req.url);

  const utmSource = normalizeUtmValue(url.searchParams.get("utm_source") ?? trackingLink?.utm_source, "direct");
  const utmMedium = normalizeUtmValue(url.searchParams.get("utm_medium") ?? trackingLink?.utm_medium);
  const utmCampaign = normalizeUtmValue(url.searchParams.get("utm_campaign") ?? trackingLink?.utm_campaign);
  const utmContent = normalizeUtmValue(url.searchParams.get("utm_content") ?? trackingLink?.utm_content);
  const userAgent = req.headers.get("user-agent");
  const isBot = isLikelyBot(userAgent);

  const { error: clickInsertError } = await supabaseAdmin.from("click_events").insert({
    partner_slug: effectivePartnerSlug,
    destination_url: destination,
    session_id: sessionId,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    referrer: req.headers.get("referer"),
    user_agent: userAgent,
    ip_address: getIpAddress(req),
    is_bot: isBot,
  });

  if (clickInsertError) {
    logError("click_event_insert_failed", clickInsertError, { slug, sessionId, effectivePartnerSlug });
  } else {
    logInfo("click_event_inserted", { slug, sessionId, effectivePartnerSlug, utmSource, utmMedium, utmCampaign });
  }

  const { data: existingSession } = await supabaseAdmin
    .from("sessions")
    .select("session_id,total_clicks")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existingSession) {
    const { error: sessionUpdateError } = await supabaseAdmin
      .from("sessions")
      .update({
        last_seen_at: new Date().toISOString(),
        total_clicks: (existingSession.total_clicks ?? 0) + 1,
      })
      .eq("session_id", sessionId);
    if (sessionUpdateError) {
      logError("session_update_failed", sessionUpdateError, { sessionId });
    }
  } else {
    const { error: sessionInsertError } = await supabaseAdmin.from("sessions").insert({
      session_id: sessionId,
      first_utm_source: utmSource,
      first_utm_campaign: utmCampaign,
      total_clicks: 1,
    });
    if (sessionInsertError) {
      logError("session_insert_failed", sessionInsertError, { sessionId });
    }
  }

  return NextResponse.redirect(destination, { status: 302 });
}
