/**
 * Landing uchun mahsulot skrinshotlarini oladi.
 *
 * Rasmlar demo rejimdagi ilovadan olinadi — ular `services/demoData.ts`
 * ichidagi o'ylab topilgan ma'lumotlar, hech qanday haqiqiy bemor
 * ma'lumoti tushmaydi.
 *
 * Talablar:
 *   1) Dev server ishlab turishi kerak:  npm run dev   (http://localhost:3000)
 *   2) Tizimda Google Chrome yoki Edge bo'lishi kerak (playwright-core o'z
 *      brauzerini yuklab olmaydi)
 *   3) ffmpeg — PNG ni WebP ga o'girish uchun
 *
 * Ishlatish:
 *   npm run landing:shots                    — barcha rasmlarni oladi
 *   node scripts/landing-shots.mjs --headed  — jarayonni ko'rib turish uchun
 *   node scripts/landing-shots.mjs --prep    — brauzerni ochiq qoldiradi,
 *        ekranlarni qo'lda sozlab olish uchun
 *
 * Ma'lumotlar: standart demo yozuvlari 2026-yil yanvariga qotirilgan, shu
 * sababli panel bo'sh ko'rinardi. `scripts/landing-seed.mjs` o'sha
 * o'ylab topilgan bemorlar bilan bugungi sanaga bog'langan qabullar,
 * to'lovlar va tish holatlarini tayyorlab beradi.
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { buildDemoSeed } from "./landing-seed.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "landing");
const TMP_DIR = join(ROOT, "node_modules", ".cache", "landing-shots");
const PROFILE_DIR = join(ROOT, "node_modules", ".cache", "landing-profile");

const BASE = process.env.LANDING_SHOTS_URL || "http://localhost:3000";
const PREP = process.argv.includes("--prep");
const HEADED = process.argv.includes("--headed") || PREP;

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const DEMO_USER = "demoklinikaadmin";
const DEMO_PASS = "demoklinikaparol";

/** InstallPWA tugmasi va boshqa suzuvchi elementlar rasmga tushmasin */
const HIDE_CSS = `
  button.fixed.bottom-4.right-4 { display: none !important; }
  *, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }
`;

function findChrome() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      "Chrome yoki Edge topilmadi. CHROME_PATH muhit o'zgaruvchisida yo'lni ko'rsating."
    );
  }
  return found;
}

function checkFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg topilmadi. WebP ga o'girish uchun u kerak.");
  }
}

async function checkServer() {
  try {
    const res = await fetch(BASE, { method: "GET" });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    throw new Error(`${BASE} javob bermayapti. Avval "npm run dev" ni ishga tushiring.`);
  }
}

const ask = (q) =>
  new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, () => {
      rl.close();
      resolve();
    });
  });

async function settle(page, ms = 1200) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

async function shoot(page, name) {
  const file = join(TMP_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ✓ ${name}.png`);
  return { name, file };
}

function toWebp(name, file, width) {
  const out = join(OUT_DIR, `${name}.webp`);
  const args = ["-y", "-i", file];
  if (width) args.push("-vf", `scale=${width}:-2`);
  args.push("-c:v", "libwebp", "-quality", "82", out);
  execFileSync("ffmpeg", args, { stdio: "ignore" });
  console.log(`  → landing/${name}.webp`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: HIDE_CSS });

  // Profil saqlanadi — ikkinchi ishga tushirishda sessiya allaqachon ochiq
  // bo'lishi mumkin, bunda login formasi umuman chizilmaydi.
  const inputs = page.locator("form input");
  try {
    await inputs.first().waitFor({ timeout: 8000 });
  } catch {
    console.log("Sessiya avvaldan ochiq — qayta kirish shart emas.");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await settle(page, 2000);
    return;
  }
  await inputs.nth(0).fill(DEMO_USER);
  await inputs.nth(1).fill(DEMO_PASS);
  await page.locator('form button[type="submit"]').click();

  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await settle(page, 2000);
}

async function main() {
  checkFfmpeg();
  await checkServer();

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(TMP_DIR, { recursive: true });

  const executablePath = findChrome();
  console.log(`Brauzer: ${executablePath}`);
  console.log(`Manzil:  ${BASE}\n`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath,
    headless: !HEADED,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "uz-UZ",
    colorScheme: "light",
    args: ["--hide-scrollbars"],
  });

  // Standart demo ma'lumotlar 2026-yil yanvariga qotirilgan — panel bo'sh
  // ko'rinadi. Shu sababli qabullar, to'lovlar va tish holatlarini bugungi
  // kunga moslab yozib qo'yamiz (scripts/landing-seed.mjs).
  // `addInitScript` sahifa skriptlaridan OLDIN ishlaydi, shuning uchun
  // demoData moduli yuklanganda ma'lumot allaqachon joyida bo'ladi.
  await context.addInitScript((seed) => {
    try {
      const KEY = "dentalflow_demo_data";
      const prev = JSON.parse(localStorage.getItem(KEY) || "{}");
      localStorage.setItem(KEY, JSON.stringify({ ...prev, ...seed }));
    } catch {
      /* private rejim */
    }
  }, buildDemoSeed());

  const page = context.pages()[0] ?? (await context.newPage());
  page.on("console", (m) => m.type() === "error" && console.warn("  [brauzer]", m.text()));

  await login(page);
  await page.evaluate(() => localStorage.setItem("app_language", "uz"));
  await page.reload();
  await settle(page, 2000);
  await page.addStyleTag({ content: HIDE_CSS });

  if (PREP) {
    console.log("\n--- TAYYORGARLIK REJIMI ---");
    console.log("Brauzerda bemor kartasini oching (Bemorlar → birinchi bemor →");
    console.log("«Tish Kartasi») va 5-6 ta tishga holat belgilang.");
    await ask("Tayyor bo'lgach shu yerda Enter bosing...\n");
    await context.close();
    console.log("Holatlar saqlandi. Endi oddiy rejimda ishga tushiring:");
    console.log("  node scripts/landing-shots.mjs");
    return;
  }

  /** Bir tilda barcha ekranlarni oladi. `suffix` — ruscha nusxa uchun ".ru" */
  async function captureLanguage(lang, suffix) {
    const shots = [];
    console.log(`\nSkrinshotlar (${lang}):`);

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate((l) => localStorage.setItem("app_language", l), lang);
    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page, 2500);
    await page.addStyleTag({ content: HIDE_CSS });
    shots.push(await shoot(page, `dashboard${suffix}`));

    // DentaAI oynasi. Sarlavhada ikkita bir xil tugma bor: mobil va
    // kompyuter uchun — ko'rinib turganini tanlaymiz.
    const aiBtn = page.locator('button[aria-label="DentaAI"]:visible').first();
    if (await aiBtn.isVisible().catch(() => false)) {
      await aiBtn.click();
      await settle(page, 1500);
      shots.push(await shoot(page, `dentaai${suffix}`));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    } else {
      console.warn("  ! DentaAI tugmasi topilmadi — o'tkazib yuborildi");
    }

    // Tish xaritasi (bemor kartasi)
    await page.goto(`${BASE}/patients/demo-patient-1`, { waitUntil: "domcontentloaded" });
    await settle(page, 2000);
    await page.addStyleTag({ content: HIDE_CSS });
    const chartTab = page.getByRole("button", { name: /Tish Kartasi|Зубная карта/i }).first();
    if (await chartTab.isVisible().catch(() => false)) {
      await chartTab.click();
      await settle(page, 1800);
      // Odontogramma to'liq ko'rinishi uchun biroz pastga suramiz
      await page.evaluate(() => window.scrollTo({ top: 360, behavior: "instant" }));
      await page.waitForTimeout(600);
      shots.push(await shoot(page, `tooth-chart${suffix}`));
    } else {
      console.warn("  ! «Tish Kartasi» tabi topilmadi — o'tkazib yuborildi");
    }

    for (const [name, path] of [
      ["calendar", "/calendar"],
      ["finance", "/finance"],
      ["leads", "/leads"],
    ]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await settle(page, 2000);
      await page.addStyleTag({ content: HIDE_CSS });
      shots.push(await shoot(page, `${name}${suffix}`));
    }

    // Mobil ko'rinish
    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await settle(mobile, 2500);
    await mobile.addStyleTag({ content: HIDE_CSS });
    shots.push(await shoot(mobile, `dashboard-mobile${suffix}`));
    await mobile.close();

    return shots;
  }

  const shots = [...(await captureLanguage("uz", "")), ...(await captureLanguage("ru", ".ru"))];

  // Ijtimoiy tarmoqlar uchun rasm (og.png) — faqat o'zbekcha
  const og = await context.newPage();
  await og.setViewportSize({ width: 1200, height: 630 });
  const tpl = join(ROOT, "scripts", "og-template.html");
  await og.goto(`file:///${tpl.replace(/\\/g, "/")}`, { waitUntil: "load" });
  await og.waitForTimeout(800);
  await og.screenshot({ path: join(ROOT, "public", "og.png"), scale: "css" });
  console.log("  ✓ og.png");
  await og.close();

  await context.close();

  console.log("\nWebP ga o'girish:");
  for (const s of shots) {
    toWebp(s.name, s.file, s.name.startsWith("dashboard-mobile") ? 780 : 1600);
  }

  rmSync(TMP_DIR, { recursive: true, force: true });

  console.log("\nTayyor. public/landing/ ichidagi fayllar:");
  for (const f of readdirSync(OUT_DIR)) console.log("  -", f);
}

main().catch((err) => {
  console.error("\nXATO:", err.message);
  process.exit(1);
});
