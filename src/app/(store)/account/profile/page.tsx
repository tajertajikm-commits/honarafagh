import { eq } from "drizzle-orm";
import { ProfileForm } from "@/components/store/profile-form";
import { addresses, customers } from "@/server/db/schema";
import { requireCustomerPage } from "@/server/http/session";

export default async function ProfilePage() {
  const ctx = await requireCustomerPage("/account/profile");
  const [c] = await ctx.db.select().from(customers).where(eq(customers.id, ctx.actor.customerId));
  const addrs = await ctx.db.select().from(addresses).where(eq(addresses.customerId, ctx.actor.customerId));
  return <ProfileForm customer={{ id: c!.id, fullName: c!.fullName, phone: c!.phone, type: c!.type, companyName: c!.companyName, nationalId: c!.nationalId, economicCode: c!.economicCode, email: c!.email }} addresses={addrs.map((a) => ({ id: a.id, title: a.title, province: a.province, city: a.city, line: a.line, postalCode: a.postalCode, recipientName: a.recipientName, recipientPhone: a.recipientPhone, isDefault: a.isDefault }))} />;
}
