import { env } from "@/server/config/env";
import { FakeOtpProvider, FakeSmsProvider } from "./fake";
import { SmsIrOtpProvider, SmsIrSmsProvider } from "./smsir";
import type { OtpProvider, SmsProvider } from "./types";

let otp: OtpProvider | undefined;
let sms: SmsProvider | undefined;

/** Selected by OTP_PROVIDER — switching never touches the auth code. */
export function otpProvider(): OtpProvider {
  if (!otp) {
    const e = env();
    otp =
      e.OTP_PROVIDER === "smsir"
        ? new SmsIrOtpProvider({ apiKey: e.SMSIR_API_KEY!, templateId: e.SMSIR_OTP_TEMPLATE_ID!, paramName: e.SMSIR_OTP_PARAM_NAME })
        : new FakeOtpProvider();
  }
  return otp;
}

export function smsProvider(): SmsProvider {
  if (!sms) {
    const e = env();
    sms = e.SMS_PROVIDER === "smsir" ? new SmsIrSmsProvider({ apiKey: e.SMSIR_API_KEY!, lineNumber: e.SMSIR_LINE_NUMBER! }) : new FakeSmsProvider();
  }
  return sms;
}

export type { OtpProvider, SmsProvider };
