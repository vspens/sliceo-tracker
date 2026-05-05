import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pushLeadById } from "@/lib/webhooks/pushLead";

const schema = z.object({
  lead_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await pushLeadById(parsed.data.lead_id);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
