import { env } from "@/server/config/env";

export const STAFF_COOKIE = "ha_staff";
export const CUSTOMER_COOKIE = "ha_session";
export const CART_COOKIE = "ha_cart";

export function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === "production" && env().APP_URL.startsWith("https"),
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
