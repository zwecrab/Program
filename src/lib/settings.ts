import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { translate, type Dict, type Locale } from "@/i18n";

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** Locale for this request (cached per render). */
export const getLocale = cache(async (): Promise<Locale> => {
  const v = await getSetting("locale");
  return v === "my" ? "my" : "en";
});

/** Server-side translator bound to the current locale. */
export async function getT() {
  const locale = await getLocale();
  return (key: keyof Dict, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
