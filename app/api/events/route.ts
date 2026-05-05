import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

const eventSchema = z.object({
  partner_slug: z.string().min(1),
  destination_url: z.string().url(),
  session_id: z.string().min(1),
  fingerprint_hash: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  referrer: z.string().optional(),
  user_agent: z.string().optional(),
  ip_address: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = eventSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid event payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin.from("click_events").insert(parsed.data);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
