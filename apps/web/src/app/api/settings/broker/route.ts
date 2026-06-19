import { NextRequest, NextResponse } from "next/server";
import { loadBrokerConfig, saveBrokerConfig, getBrokerStatusSummary } from "@/lib/broker-config";

export async function GET() {
  return NextResponse.json(getBrokerStatusSummary());
}

export async function POST(req: NextRequest) {
  let body: {
    apiKey?: string;
    secretKey?: string;
    paper?: boolean;
    paperApiKey?: string;
    paperSecretKey?: string;
    liveApiKey?: string;
    liveSecretKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const existing = loadBrokerConfig() ?? {};
  const next = { ...existing };

  if (body.paperApiKey?.trim() && body.paperSecretKey?.trim()) {
    next.paperApiKey = body.paperApiKey.trim();
    next.paperSecretKey = body.paperSecretKey.trim();
  }

  if (body.liveApiKey?.trim() && body.liveSecretKey?.trim()) {
    next.liveApiKey = body.liveApiKey.trim();
    next.liveSecretKey = body.liveSecretKey.trim();
  }

  if (body.apiKey?.trim() && body.secretKey?.trim()) {
    if (body.paper ?? true) {
      next.paperApiKey = body.apiKey.trim();
      next.paperSecretKey = body.secretKey.trim();
    } else {
      next.liveApiKey = body.apiKey.trim();
      next.liveSecretKey = body.secretKey.trim();
    }
  }

  const hasAny =
    (next.paperApiKey && next.paperSecretKey) || (next.liveApiKey && next.liveSecretKey);

  if (!hasAny) {
    return NextResponse.json({ error: "At least one API key pair is required" }, { status: 400 });
  }

  saveBrokerConfig(next);

  return NextResponse.json({
    success: true,
    ...getBrokerStatusSummary(),
  });
}
