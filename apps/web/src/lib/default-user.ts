import { prisma } from "@/lib/db";

const LOCAL_USER_EMAIL = "local@wicksense.local";

export async function ensureDefaultUserId(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: LOCAL_USER_EMAIL } });
  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: {
      email: LOCAL_USER_EMAIL,
      name: "Local Trader",
      settings: { create: {} },
    },
  });
  return created.id;
}
