import fs from "fs";

export interface BrokerKeySet {
  apiKey: string;
  secretKey: string;
}

export interface BrokerConfig {
  paperApiKey?: string;
  paperSecretKey?: string;
  liveApiKey?: string;
  liveSecretKey?: string;
  /** @deprecated use paperApiKey / liveApiKey */
  apiKey?: string;
  /** @deprecated use paperSecretKey / liveSecretKey */
  secretKey?: string;
  /** @deprecated */
  paper?: boolean;
}

import { dataFile } from "@/lib/data-paths";

const CONFIG_PATH = dataFile("broker.local.json");

export function loadBrokerConfig(): BrokerConfig | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as BrokerConfig;
  } catch {
    return null;
  }
}

export function saveBrokerConfig(config: BrokerConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

export function getPaperCredentials(): BrokerKeySet {
  const file = loadBrokerConfig();
  if (file?.paperApiKey && file?.paperSecretKey) {
    return { apiKey: file.paperApiKey, secretKey: file.paperSecretKey };
  }
  if (file?.apiKey && file?.secretKey && (file.paper ?? true)) {
    return { apiKey: file.apiKey, secretKey: file.secretKey };
  }
  return {
    apiKey: process.env.ALPACA_API_KEY || "",
    secretKey: process.env.ALPACA_SECRET_KEY || "",
  };
}

export function getLiveCredentials(): BrokerKeySet {
  const file = loadBrokerConfig();
  if (file?.liveApiKey && file?.liveSecretKey) {
    return { apiKey: file.liveApiKey, secretKey: file.liveSecretKey };
  }
  if (file?.apiKey && file?.secretKey && file.paper === false) {
    return { apiKey: file.apiKey, secretKey: file.secretKey };
  }
  return { apiKey: "", secretKey: "" };
}

export function getBrokerCredentials(): BrokerKeySet & { paper: boolean } {
  const file = loadBrokerConfig();
  const paper = file?.paper ?? process.env.ALPACA_PAPER !== "false";
  if (paper) {
    return { ...getPaperCredentials(), paper: true };
  }
  const live = getLiveCredentials();
  if (live.apiKey && live.secretKey) {
    return { ...live, paper: false };
  }
  return { ...getPaperCredentials(), paper: false };
}

export function hasPaperCredentials(): boolean {
  const { apiKey, secretKey } = getPaperCredentials();
  return Boolean(apiKey && secretKey);
}

export function hasLiveCredentials(): boolean {
  const { apiKey, secretKey } = getLiveCredentials();
  return Boolean(apiKey && secretKey);
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return `${key.slice(0, 2)}***`;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export function getBrokerStatusSummary() {
  const file = loadBrokerConfig();
  const paper = getPaperCredentials();
  const live = getLiveCredentials();
  return {
    paperConfigured: Boolean(paper.apiKey && paper.secretKey),
    liveConfigured: Boolean(live.apiKey && live.secretKey),
    paperKeyPreview: paper.apiKey ? maskKey(paper.apiKey) : "",
    liveKeyPreview: live.apiKey ? maskKey(live.apiKey) : "",
    source: file ? "settings" : hasPaperCredentials() ? "env" : "none",
  };
}
