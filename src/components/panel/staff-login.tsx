"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { toEnDigits } from "@/lib/persian";

export function StaffLogin() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="mt-8 max-w-sm space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
          await api("staff/auth/login", { body: { phone, password } });
          router.replace("/panel");
          router.refresh();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "ورود ناموفق بود.");
          setLoading(false);
        }
      }}
    >
      <Field label="شماره موبایل"><Input ltr inputMode="tel" autoComplete="username" value={phone} onChange={(e) => setPhone(toEnDigits(e.target.value))} className="h-11" required /></Field>
      <Field label="رمز عبور" error={error}><Input ltr type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" required /></Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>ورود</Button>
    </form>
  );
}
