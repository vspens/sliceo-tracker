import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError, logInfo, logWarn } from "@/lib/monitoring/log";

type PushResult = {
  ok: boolean;
  status: number | null;
  body: string;
};

const MAX_ATTEMPTS = 3;

async function deliverLead(
  webhookUrl: string,
  webhookSecret: string | undefined,
  lead: Record<string, unknown>,
  leadId: string,
) {
  let status: number | null = null;
  let body = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const payload = {
        lead,
        pushed_at: new Date().toISOString(),
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { Authorization: `Bearer ${webhookSecret}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      status = response.status;
      body = await response.text();

      if (response.ok) {
        return { ok: true, status, body, attempts: attempt };
      }

      logWarn("lead_delivery_attempt_failed", { leadId, attempt, status, body: body.slice(0, 500) });
    } catch (error) {
      logError("lead_delivery_attempt_error", error, { leadId, attempt });
      body = error instanceof Error ? error.message : String(error);
    }
  }

  return { ok: false, status, body, attempts: MAX_ATTEMPTS };
}

export async function pushLeadById(leadId: string): Promise<PushResult> {
  const webhookUrl = process.env.LEAD_PUSH_WEBHOOK_URL;
  const webhookSecret = process.env.LEAD_PUSH_WEBHOOK_SECRET;

  if (!webhookUrl) {
    throw new Error("Missing LEAD_PUSH_WEBHOOK_URL");
  }

  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (error || !lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  const payload = {
    lead,
    pushed_at: new Date().toISOString(),
  };
  const result = await deliverLead(webhookUrl, webhookSecret, lead, leadId);

  await supabaseAdmin.from("webhook_deliveries").insert({
    lead_id: leadId,
    target_url: webhookUrl,
    payload,
    status: result.ok ? "success" : "failed",
    response_code: result.status,
    response_body: result.body,
    attempt_count: result.attempts,
    next_retry_at: result.ok ? null : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    last_error: result.ok ? null : result.body.slice(0, 1000),
  });

  await supabaseAdmin
    .from("leads")
    .update({ status: result.ok ? "pushed" : "failed" })
    .eq("id", leadId);

  if (result.ok) {
    logInfo("lead_delivery_success", { leadId, attempts: result.attempts });
  } else {
    logWarn("lead_delivery_failed_after_retries", { leadId, attempts: result.attempts, status: result.status });
  }

  return { ok: result.ok, status: result.status, body: result.body };
}
