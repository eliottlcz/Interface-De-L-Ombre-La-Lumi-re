import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { safeEqual, sha256 } from "@/lib/crypto";

/** Déverrouillage temporaire du coffre (10 min), lié à la session en cours. */
const COOKIE = "dlal_coffre";
const TTL = 10 * 60_000;
function sign(payload: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET manquant");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
export async function setVaultUnlocked() {
  const jar = await cookies();
  const sess = jar.get(SESSION_COOKIE)?.value ?? "";
  const exp = Date.now() + TTL;
  jar.set(COOKIE, `${exp}.${sign(`${sha256(sess)}.${exp}`)}`, { httpOnly: true, sameSite: "strict", path: "/", maxAge: TTL / 1000, secure: process.env.NODE_ENV === "production" });
  return exp;
}
export async function vaultUnlockedUntil(): Promise<number | null> {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value; const sess = jar.get(SESSION_COOKIE)?.value ?? "";
  if (!v) return null;
  const [exp, sig] = v.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return null;
  return safeEqual(sig, sign(`${sha256(sess)}.${exp}`)) ? Number(exp) : null;
}
export async function lockVault() { (await cookies()).delete(COOKIE); }
