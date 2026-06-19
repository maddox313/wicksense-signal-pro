import fs from "fs";
import path from "path";
import type { AlertSettings } from "@wicksense/core";
import { DEFAULT_ALERT_SETTINGS } from "@wicksense/core";

export interface UserProfile {
  displayName: string;
  email: string;
  phone: string;
  alertSettings: AlertSettings;
}

const CONFIG_PATH = path.join(process.cwd(), "user.local.json");

const DEFAULT_PROFILE: UserProfile = {
  displayName: "Trader",
  email: "",
  phone: "",
  alertSettings: DEFAULT_ALERT_SETTINGS,
};

export function loadUserProfile(): UserProfile {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_PROFILE };
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const data = JSON.parse(raw) as Partial<UserProfile>;
    return {
      displayName: data.displayName?.trim() || DEFAULT_PROFILE.displayName,
      email: data.email?.trim() || "",
      phone: data.phone?.trim() || "",
      alertSettings: { ...DEFAULT_ALERT_SETTINGS, ...data.alertSettings },
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveUserProfile(updates: Partial<UserProfile>): UserProfile {
  const current = loadUserProfile();
  const next: UserProfile = {
    displayName: updates.displayName?.trim() ?? current.displayName,
    email: updates.email?.trim() ?? current.email,
    phone: updates.phone?.trim() ?? current.phone,
    alertSettings: updates.alertSettings
      ? { ...current.alertSettings, ...updates.alertSettings }
      : current.alertSettings,
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function getUserContact() {
  const { email, phone } = loadUserProfile();
  return { email: email || undefined, phone: phone || undefined };
}

export function maskEmail(email: string) {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function maskPhone(phone: string) {
  if (!phone || phone.length < 4) return phone;
  return `***${phone.slice(-4)}`;
}
