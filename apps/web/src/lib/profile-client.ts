import type { AlertSettings } from "@wicksense/core";
import { useAppStore } from "@/lib/store";

export async function loadProfileIntoStore(): Promise<void> {
  try {
    const res = await fetch("/api/settings/profile");
    if (!res.ok) return;

    const data = (await res.json()) as { alertSettings?: AlertSettings };
    if (data.alertSettings) {
      useAppStore.getState().setAlertSettings(data.alertSettings);
    }
  } catch {
    /* keep in-memory defaults on load failure */
  }
}
