/**
 * Landing sahifasini brauzerda tekshiradi.
 *
 * Nimani tekshiradi:
 *   - barcha bo'limlar chizilishi va navigatsiya havolalari to'g'ri joyga olib borishi
 *   - UZ / RU almashtirgichi butun sahifani almashtirishi
 *   - demo formasi to'g'ri manzilga (API_URL) so'rov yuborishi, xato holatini
 *     ko'rsatishi va noto'g'ri telefonni o'tkazmasligi
 *   - avtomatik oyna bir sessiyada faqat bir marta chiqishi
 *   - mobil kenglikda gorizontal siljish bo'lmasligi
 *   - "harakatni kamaytirish" rejimida animatsiyalar o'chishi
 *
 * Talab: npm run dev (http://localhost:3000)
 * Ishlatish: npm run landing:smoke
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOT_DIR = join(ROOT, "node_modules", ".cache", "landing-smoke");
const BASE = process.env.LANDING_SHOTS_URL || "http://localhost:3000";
const HEADED = process.argv.includes("--headed");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const executablePath =
  (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH) && process.env.CHROME_PATH) ||
  CHROME_CANDIDATES.find((p) => existsSync(p));

let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`);
  }
}

const SECTIONS = [
  "hero",
  "showcase",
  "features",
  "demo-dashboard",
  "tooth-map",
  "ai",
  "how",
  "calculator",
  "compare",
  "integrations",
  "pricing",
  "testimonials",
  "faq",
];

async function run() {
  if (!executablePath) throw new Error("Chrome topilmadi (CHROME_PATH ni ko'rsating).");
  mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ executablePath, headless: !HEADED });

  /* ── 1. Tuzilish va navigatsiya ─────────────────────────────── */
  console.log("\n1) Tuzilish va navigatsiya");
  let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "uz-UZ" });
  let page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  // Bu bosqichda avtomatik oyna xalaqit bermasin — u 5-bo'limda alohida
  // tekshiriladi. Belgini sahifa yuklanishidan oldin qo'yamiz.
  await page.addInitScript(() => sessionStorage.setItem("lp_demo_popup_shown", "1"));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("h1", { timeout: 15000 });

  const h1uz = (await page.locator("h1").first().innerText()).trim();
  check("h1 ko'rinadi", h1uz.length > 10, h1uz);

  for (const id of SECTIONS) {
    const found = await page.locator(`#${id}`).count();
    if (!found) {
      check(`#${id} bo'limi bor`, false);
      continue;
    }
    check(`#${id} bo'limi bor`, true);
  }

  // Navigatsiya havolalari
  const navLinks = await page.locator('nav a[href^="#"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute("href")).filter((h) => h && h !== "#hero")
  );
  for (const href of navLinks) {
    await page.locator(`nav a[href="${href}"]`).first().click();
    // Silliq skroll uzoq masofada bir soniyadan ko'proq davom etadi
    await page
      .waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const top = el.getBoundingClientRect().top;
          return top >= -10 && top <= 120;
        },
        href,
        { timeout: 6000 }
      )
      .catch(() => {});
    const top = await page.locator(href).evaluate((el) => el.getBoundingClientRect().top);
    check(`${href} ga o'tish`, top >= -10 && top <= 120, `top=${Math.round(top)}`);
  }

  // Skrinshot — ko'z bilan tekshirish uchun
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOT_DIR, "landing-desktop.png"), fullPage: true });

  /* ── 2. Til almashtirish ────────────────────────────────────── */
  console.log("\n2) UZ / RU");
  await page.locator('nav button[aria-pressed]').filter({ hasText: "RU" }).first().click();
  await page.waitForTimeout(700);
  const h1ru = (await page.locator("h1").first().innerText()).trim();
  check("h1 ruschaga o'tdi", h1ru !== h1uz && /[\u0400-\u04FF]/.test(h1ru), h1ru);

  const stored = await page.evaluate(() => localStorage.getItem("app_language"));
  check("app_language = ru", stored === "ru", String(stored));

  const htmlLang = await page.evaluate(() => document.documentElement.lang);
  check("html[lang] = ru", htmlLang === "ru", htmlLang);

  const cyrillicHeads = await page
    .locator("h2")
    .evaluateAll((els) => els.filter((e) => /[\u0400-\u04FF]/.test(e.textContent || "")).length);
  const totalHeads = await page.locator("h2").count();
  check("barcha sarlavhalar ruscha", cyrillicHeads >= totalHeads - 1, `${cyrillicHeads}/${totalHeads}`);

  await page.locator('nav button[aria-pressed]').filter({ hasText: "UZ" }).first().click();
  await page.waitForTimeout(500);

  /* ── 3. Demo formasi ────────────────────────────────────────── */
  console.log("\n3) Demo formasi");
  let requestUrl = null;
  await page.route("**/public/demo-request", async (route) => {
    requestUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, id: "test" }),
    });
  });

  await page.locator('button:has-text("7 kun bepul sinash")').first().click();
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

  // Noto'g'ri telefon — so'rov ketmasligi kerak
  await page.fill("#lp-name", "Test Foydalanuvchi");
  await page.fill("#lp-clinic", "Test Klinika");
  await page.fill("#lp-phone", "+998 12");
  await page.locator('[role="dialog"] button[type="submit"]').click();
  await page.waitForTimeout(400);
  check("noto'g'ri telefon to'xtatildi", requestUrl === null && (await page.locator("#lp-phone-err").count()) === 1);

  // To'g'ri telefon
  await page.fill("#lp-phone", "+998 90 123 45 67");
  await page.locator('[role="dialog"] button[type="submit"]').click();
  await page.waitForTimeout(900);

  check("so'rov API_URL ga ketdi", !!requestUrl && !requestUrl.includes("/api/public/demo-request?"), String(requestUrl));
  check(
    "so'rov manzili to'g'ri host",
    !!requestUrl && new URL(requestUrl).port === "3001",
    requestUrl ? new URL(requestUrl).host : "yo'q"
  );
  const successVisible = await page.locator('[role="dialog"] h3').count();
  check("muvaffaqiyat ekrani ko'rindi", successVisible > 0);

  const submitted = await page.evaluate(() => localStorage.getItem("lp_demo_submitted"));
  check("lp_demo_submitted yozildi", submitted === "1");

  await ctx.close();

  /* ── 4. Xato holati ─────────────────────────────────────────── */
  console.log("\n4) Server xatosi");
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage();
  await page.route("**/public/demo-request", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
  );
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('button:has-text("7 kun bepul sinash")').first().click();
  await page.waitForSelector('[role="dialog"]');
  await page.fill("#lp-name", "Test");
  await page.fill("#lp-clinic", "Klinika");
  await page.fill("#lp-phone", "+998 90 123 45 67");
  await page.locator('[role="dialog"] button[type="submit"]').click();
  await page.waitForTimeout(900);
  const errText = await page.locator('[role="dialog"]').innerText();
  check("xato xabari ko'rindi", /Yuborilmadi|Не отправлено/.test(errText));
  check("telefon havolasi taklif qilindi", (await page.locator('[role="dialog"] a[href^="tel:"]').count()) > 0);
  await ctx.close();

  /* ── 4b. DentaAI demosi ─────────────────────────────────────── */
  console.log("\n4b) DentaAI demo cheklovi");
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage();
  await page.addInitScript(() => sessionStorage.setItem("lp_demo_popup_shown", "1"));
  await page.route("**/ai/dental-advisor", (route) =>
    route.fulfill({ status: 429, contentType: "application/json", body: "{}" })
  );
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator("#lp-ai-input").scrollIntoViewIfNeeded();
  await page.locator('button:has-text("DentaAI\'ni sinab ko\'rish")').first().click();
  await page.waitForTimeout(1000);
  const aiText = await page.locator("#ai").innerText();
  check("429 uchun tushunarli xabar", /soatiga 5 ta so'rov/i.test(aiText));
  await ctx.close();

  /* ── 5. Avtomatik oyna ──────────────────────────────────────── */
  console.log("\n5) Avtomatik oyna");
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
  await page.waitForTimeout(1200);
  check("skroll bilan oyna ochildi", (await page.locator('[role="dialog"]').count()) === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
  await page.waitForTimeout(1500);
  check("qayta yuklashda chiqmadi", (await page.locator('[role="dialog"]').count()) === 0);
  await ctx.close();

  /* ── 6. Mobil ───────────────────────────────────────────────── */
  console.log("\n6) Mobil (390px)");
  ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check("gorizontal siljish yo'q", scrollW <= 391, `scrollWidth=${scrollW}`);

  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(700);
  check("pastki CTA paneli chiqdi", (await page.locator('a[href^="tel:"]:visible').count()) > 0);
  check("PWA tugmasi yo'q", (await page.locator("button.fixed.bottom-4.right-4").count()) === 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOT_DIR, "landing-mobile.png"), fullPage: true });
  await ctx.close();

  /* ── 7. Harakatni kamaytirish ───────────────────────────────── */
  console.log("\n7) prefers-reduced-motion");
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const marqueeAnim = await page
    .locator(".lp-marquee")
    .first()
    .evaluate((el) => getComputedStyle(el).animationName)
    .catch(() => "none");
  check("marquee to'xtatilgan", marqueeAnim === "none", marqueeAnim);

  const hiddenBlocks = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("#lp-root h2"));
    return nodes.filter((n) => {
      const box = n.getBoundingClientRect();
      if (box.top > window.innerHeight * 2) return false;
      return getComputedStyle(n).opacity === "0";
    }).length;
  });
  check("matn darhol ko'rinadi", hiddenBlocks === 0, `yashirin: ${hiddenBlocks}`);
  await ctx.close();

  await browser.close();

  console.log(`\nSahifa xatolari: ${consoleErrors.length ? consoleErrors.join(" | ") : "yo'q"}`);
  console.log(`Skrinshotlar: ${SHOT_DIR}`);
  console.log(`\nNatija: ${passed} ok, ${failures.length} xato`);
  if (failures.length) {
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("\nXATO:", e.message);
  process.exit(1);
});
