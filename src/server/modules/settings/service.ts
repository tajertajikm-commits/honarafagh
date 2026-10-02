import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/server/db/client";
import { appSettings } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, inTx } from "@/server/core/context";
import { validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";

const optional = z.string().trim().max(200).default("");
/** Seller details printed on invoices; every legal/tax field is editable, none is hard-coded. */
export const settingsSchemas = {
  business: z.object({
    name: z.string().min(1),
    legalName: optional,
    phone: optional,
    address: optional,
    postalCode: optional,
    economicCode: optional,
    nationalId: optional,
    registrationNo: optional,
  }),
  invoice: z.object({
    vatPct: z.number().int().min(0).max(30),
    paymentTerms: z.string().max(300).default(""),
    officialNote: z.string().max(500).default(""),
  }),
};
export type SettingKey = keyof typeof settingsSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingsSchemas)[K]>;

const DEFAULTS: { [K in SettingKey]: SettingValue<K> } = {
  business: { name: "چاپخانه هنر آفاق", legalName: "", phone: "", address: "", postalCode: "", economicCode: "", nationalId: "", registrationNo: "" },
  invoice: { vatPct: 10, paymentTerms: "", officialNote: "" },
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
