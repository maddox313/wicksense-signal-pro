import { NextRequest, NextResponse } from "next/server";
import {
  loadUserProfile,
  saveUserProfile,
  maskEmail,
  maskPhone,
} from "@/lib/user-config";
import { getAlertProviderStatus } from "@/lib/alerts";

export async function GET() {
  const profile = loadUserProfile();
  const providers = getAlertProviderStatus();

  return NextResponse.json({
    displayName: profile.displayName,
    email: profile.email,
    phone: profile.phone,
    emailPreview: maskEmail(profile.email),
    phonePreview: maskPhone(profile.phone),
    alertSettings: profile.alertSettings,
    providers,
  });
}

export async function POST(req: NextRequest) {
  let body: Partial<{
    displayName: string;
    email: string;
    phone: string;
    alertSettings: Record<string, boolean>;
  }>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const profile = saveUserProfile(body);

  return NextResponse.json({
    success: true,
    displayName: profile.displayName,
    email: profile.email,
    phone: profile.phone,
    emailPreview: maskEmail(profile.email),
    phonePreview: maskPhone(profile.phone),
    alertSettings: profile.alertSettings,
  });
}
