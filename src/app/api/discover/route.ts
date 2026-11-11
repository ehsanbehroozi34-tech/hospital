import { NextResponse } from "next/server";
import { getDiscoverState, startDiscovery } from "@/lib/discover";
import { parseSpecialty } from "@/lib/batch";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getDiscoverState());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { specialty?: string };
  const started = startDiscovery(parseSpecialty(body.specialty));
  return NextResponse.json({ started, state: getDiscoverState() });
}
