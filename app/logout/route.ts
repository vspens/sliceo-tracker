import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function loginRedirect(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  return loginRedirect(request);
}

export async function GET(request: Request) {
  // Avoid side effects on GET so link prefetches cannot sign users out.
  return loginRedirect(request);
}
