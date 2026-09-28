HONAR AFAGH — STATIC DEMO (نسخه نمایشی)
========================================

Built for the folder:  {{BASE}}/

DEPLOY (cPanel)
  1. Create the folder public_html{{BASE}}/
  2. Upload printing-house-demo.zip into it and choose "Extract".
     index.html must end up directly inside public_html{{BASE}}/
  3. Open https://YOUR-DOMAIN{{BASE}}/

No database, no Node.js, no cron and no API keys are needed.
Everything runs in the visitor's browser (PostgreSQL compiled to
WebAssembly, stored in the browser's IndexedDB).

LOGIN
  Customer:  Store → "ورود" → any mobile number → the demo OTP is shown on
             screen (new code per request, 2 min validity, 5 attempts,
             resend after 1 min).
  Staff:     /panel/login → mobile 09120000001 … 09120000012,
             password honar1405  (or use the DEMO MODE button, bottom-left).

RESET
  DEMO MODE button → "بازنشانی دمو". Restores all sample data.

NOTES
  * Data is per browser: other visitors do not see your changes.
  * Only one tab writes at a time; opening a second tab hands over the data.
  * SMS, bank gateway and accounting (Holoo) are simulated, not connected.
