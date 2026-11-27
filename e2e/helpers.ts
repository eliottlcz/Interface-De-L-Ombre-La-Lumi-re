import { Browser, BrowserContext, Page, expect, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import postgres from "postgres";

export const PASSWORD = "MotDePasse2026";
export const URL = process.env.E2E_URL ?? "http://localhost:3100";
export const invites = () => JSON.parse(readFileSync("e2e/.invites.json", "utf8")) as { eliott: string; arthur: string };
export const sql = () => postgres(process.env.DATABASE_URL!, { max: 1 });

export type Who = "eliott" | "arthur";
export const EMAIL: Record<Who, string> = { eliott: "eliott@test.local", arthur: "arthur@test.local" };

export async function login(page: Page, who: Who, password = PASSWORD) {
  await page.goto("/connexion");
  await page.fill("input[name=email]", EMAIL[who]);
  await page.fill("input[name=password]", password);
  await page.click("form button[type=submit], form button");
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30_000 });
}
export async function session(browser: Browser, who: Who, viewport?: { width: number; height: number }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: viewport ?? { width: 1440, height: 900 }, locale: "fr-FR", timezoneId: "Europe/Paris", baseURL: URL });
  const page = await ctx.newPage();
  await login(page, who);
  return { ctx, page };
}
export const dialog = (page: Page) => page.getByRole("dialog");
export async function toastText(page: Page) { return page.locator("[aria-live=polite]").innerText(); }
export { expect, devices };

/** Clique sur le bouton de validation et attend la réponse du serveur ET la fin de la réinitialisation du formulaire. */
export async function submit(page: Page, selector = "form button[type=submit], form button") {
  const resp = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 30_000 });
  await page.click(selector);
  await resp;
  await page.waitForTimeout(350);
}
