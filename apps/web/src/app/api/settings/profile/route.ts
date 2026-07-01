import { NextRequest, NextResponse } from "next/server";
import {
  loadUserProfile,
  saveUserProfile,
  maskEmail,
  maskPhone,
  type UserProfile,
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
  let body: Partial<UserProfile>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/settings/profile] save failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
