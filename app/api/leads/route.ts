import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

const leadSchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().optional(),
  consent: z.boolean().default(false),
  session_id: z.string().optional(),
});

const IP_FALLBACK_WINDOW_HOURS = 48;

function getIpAddress(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

async function createAttributions(leadId: string, clickIds: string[]) {
  if (!clickIds.length) return;

  const first = clickIds[0];
  const last = clickIds[clickIds.length - 1];
  const items = clickIds.map((clickId) => ({
    lead_id: leadId,
    click_event_id: clickId,
    attribution_type:
      clickId === first ? "first_touch" : clickId === last ? "last_touch" : "multi_touch",
  }));

  await supabaseAdmin.from("lead_attributions").insert(items);
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = leadSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid lead payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const status = payload.consent ? "ready_to_push" : "new";

  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .insert({ ...payload, status })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let clickIdsForAttribution: string[] = [];

  if (payload.session_id) {
    const { data: clicks } = await supabaseAdmin
      .from("click_events")
      .select("id,created_at")
      .eq("session_id", payload.session_id)
      .order("created_at", { ascending: true });

    clickIdsForAttribution = (clicks ?? []).map((click) => click.id);
  }

  // Fallback: when session matching is unavailable, infer from recent clicks using same IP.
  if (!clickIdsForAttribution.length) {
    const ipAddress = getIpAddress(req);
    if (ipAddress) {
      const since = new Date(Date.now() - IP_FALLBACK_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
      const { data: ipClicks } = await supabaseAdmin
        .from("click_events")
        .select("id,created_at")
        .eq("ip_address", ipAddress)
        .gte("created_at", since)
        .order("created_at", { ascending: true });

      clickIdsForAttribution = (ipClicks ?? []).map((click) => click.id);
    }
  }

  await createAttributions(lead.id, clickIdsForAttribution);

  return NextResponse.json({ lead }, { status: 201 });
}
