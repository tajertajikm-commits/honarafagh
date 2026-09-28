// Dev helper: prints a staff session cookie for screenshots. node scripts/staff-cookie.mjs 09120000001
const phone = process.argv[2] ?? "09120000001";
const res = await fetch("http://localhost:3000/api/v1/staff/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: process.env.PW ?? "honar1405" }) });
const c = res.headers.get("set-cookie") ?? "";
process.stdout.write(c.split(";")[0]);
