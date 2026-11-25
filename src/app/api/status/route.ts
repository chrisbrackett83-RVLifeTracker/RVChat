import { NextResponse } from "next/server";
import { getProviderStatus } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getProviderStatus());
}
