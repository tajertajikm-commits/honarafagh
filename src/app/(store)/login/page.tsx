import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OtpLogin } from "@/components/store/otp-login";
import { env } from "@/server/config/env";
import { getCustomerActor } from "@/server/http/session";

export const metadata: Metadata = { title: "ورود" };

function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCustomerActor()) redirect(safeNext(next));
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 pt-16">
      <OtpLogin next={safeNext(next)} demo={env().OTP_PROVIDER === "fake"} />
    </div>
  );
}
