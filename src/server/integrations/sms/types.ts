export interface OtpProvider {
  readonly name: string;
  sendOtp(phone: string, code: string): Promise<void>;
}

export interface SmsProvider {
  readonly name: string;
  send(phone: string, text: string): Promise<{ messageId: string | null }>;
}
