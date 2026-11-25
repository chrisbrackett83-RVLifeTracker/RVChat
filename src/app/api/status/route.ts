import { NextResponse } from "next/server";
import { requireIdentity } from "../../../../cursor/identity";
import { getProviderStatus } from "@/lib/config";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const identity = await requireIdentity(req);
  if (identity instanceof Response) {
    return NextResponse.json(
      {
        demoMode: true,
        llm: "none",
        search: "none",
        missing: ["Sign in to Cursor to use RV Chat."],
      },
      { status: 401, headers: { "cache-control": "private, no-store" } },
    );
  }
  return NextResponse.json(getProviderStatus(), {
    headers: { "cache-control": "private, no-store" },
  });
}
