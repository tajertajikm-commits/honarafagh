هنر آفاق — نسخه سرور (دموی اشتراکی)
=====================================

این بسته کل سامانه را با یک پایگاه داده مشترک اجرا می‌کند. هر کس لینک سایت را باز کند،
همان سفارش‌ها را می‌بیند: کارفرما سفارش ثبت می‌کند و شما در تب‌های دیگر با کارکنان آن را
جلو می‌برید. به سرور پایگاه داده (MySQL/PostgreSQL) نیازی نیست.

نیازمندی: هاست با Node.js نسخه ۲۰ یا بالاتر (در cPanel: «Setup Node.js App»).

نصب در cPanel
1. یک ساب‌دامین بسازید، مثلاً demo.yourdomain.com (سامانه باید در ریشه دامنه باشد).
2. فایل honarafagh-server.zip را در File Manager آپلود و Extract کنید
   (مثلاً در پوشه ~/honarafagh-server ؛ بیرون از public_html).
3. Setup Node.js App → Create Application:
     Node.js version: 20 یا بالاتر
     Application mode: Production
     Application root: honarafagh-server
     Application URL: demo.yourdomain.com
     Application startup file: app.js
   در بخش Environment variables اضافه کنید:
     APP_URL = https://demo.yourdomain.com
4. Start / Restart را بزنید و سایت را باز کنید. اولین اجرا چند ثانیه طول می‌کشد.
   (نیازی به «Run NPM Install» نیست؛ همه وابستگی‌ها داخل بسته است.)

نصب روی سرور (VPS)
   cd honarafagh-server && APP_URL=https://demo.yourdomain.com PORT=3000 node app.js
   (پشت Nginx یا هر reverse proxy با HTTPS)

ورود
   کارکنان: /panel/login — روی اسم هر نفر بزنید (رمز همه honar1405).
   مشتری:  /login — هر شماره موبایل؛ کد تأیید روی صفحه نمایش داده می‌شود.
   در هر مرورگر هم‌زمان یک مشتری و یک کارمند می‌توانند وارد باشند؛ برای عوض کردن کارمند
   از منوی نام بالای پنل («ورود به‌عنوان») استفاده کنید. برای چند کارمند هم‌زمان، از پنجره
   ناشناس (Incognito) یا مرورگر دیگر استفاده کنید.

داده‌ها
   همه اطلاعات در پوشه data ذخیره می‌شود (با به‌روزرسانی بسته این پوشه را نگه دارید).
   بازگرداندن دمو به حالت اول: اپ را Stop کنید، `node reset-demo.js` را اجرا کنید
   (در cPanel از «Run JS script»)، سپس Start.

نکته: پیامک، درگاه پرداخت و هلو در این نسخه نمایشی‌اند (کد تأیید روی صفحه، پرداخت آزمایشی).
