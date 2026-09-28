import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/server/db/client";
import { appSettings } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, inTx } from "@/server/core/context";
import { validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { DEFAULT_CALENDAR, parseHm, type WorkCalendar } from "@/server/modules/scheduling/calendar";

export const settingsSchemas = {
  business: z.object({
    name: z.string().min(1),
    phone: z.string(),
    address: z.string(),
    workdays: z.array(z.number().int().min(0).max(6)),
    thursdayHalf: z.boolean(),
    workStart: z.string().regex(/^\d{2}:\d{2}$/),
    workEnd: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  orders: z.object({
    defaultDepositPct: z.number().int().min(0).max(100),
    quoteValidityDays: z.number().int().min(1).max(90),
    autoConfirmPaidWebOrders: z.boolean(),
  }),
};
export type SettingKey = keyof typeof settingsSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingsSchemas)[K]>;

const DEFAULTS: { [K in SettingKey]: SettingValue<K> } = {
  business: { name: "چاپخانه هنر آفاق", phone: "", address: "", workdays: [6, 0, 1, 2, 3], thursdayHalf: true, workStart: "08:00", workEnd: "17:00" },
  orders: { defaultDepositPct: 50, quoteValidityDays: 7, autoConfirmPaidWebOrders: true },
};

export async function getSetting<K extends SettingKey>(db: Executor, key: K): Promise<SettingValue<K>> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  const parsed = settingsSchemas[key].safeParse(row?.value);
  return (parsed.success ? parsed.data : DEFAULTS[key]) as SettingValue<K>;
}

export async function updateSetting<K extends SettingKey>(ctx: Ctx, key: K, value: unknown) {
  assertCan(ctx, "settings.manage");
  const parsed = settingsSchemas[key].safeParse(value);
  if (!parsed.success) throw validation("تنظیمات نامعتبر است.", parsed.error.issues);
  return inTx(ctx, async (tx) => {
    const before = await getSetting(tx.db, key);
    await tx.db
      .insert(appSettings)
      .values({ key, value: parsed.data, updatedBy: actorUserId(tx) })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: parsed.data, updatedBy: actorUserId(tx) } });
    await audit(tx, { action: "settings.update", entityType: "setting", entityId: key, before, after: parsed.data });
    return parsed.data;
  });
}

export async function workCalendar(db: Executor): Promise<WorkCalendar> {
  const b = await getSetting(db, "business");
  return { ...DEFAULT_CALENDAR, workdays: b.workdays, thursdayHalf: b.thursdayHalf, startMinute: parseHm(b.workStart), endMinute: parseHm(b.workEnd) };
}
