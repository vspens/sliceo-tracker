import { createClient } from "@supabase/supabase-js";
import { assertRequiredEnv } from "@/lib/env";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";

assertRequiredEnv();

const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!);
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
