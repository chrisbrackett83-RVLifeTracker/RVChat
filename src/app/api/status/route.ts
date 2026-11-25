import { NextResponse } from "next/server";
import { requireIdentity } from "../../../../cursor/identity";
import { getProviderStatus } from "@/lib/config";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const identity = await requireIdentity(req);
  if (identity instanceof Response) return identity;
  return NextResponse.json(getProviderStatus(), {
    headers: { "cache-control": "private, no-store" },
  });
}
