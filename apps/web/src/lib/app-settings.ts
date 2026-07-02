import { prisma } from "@/lib/db";

export async function getAppSetting<T>(key: string): Promise<T | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return JSON.parse(row.valueJson) as T;
  } catch {
    return null;
  }
}

export async function setAppSetting<T>(key: string, value: T): Promise<void> {
  const valueJson = JSON.stringify(value);
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, valueJson },
    update: { valueJson },
  });
}
