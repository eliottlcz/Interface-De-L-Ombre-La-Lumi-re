import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";

describe("mots de passe", () => {
  it("politique : 10 caractères, une lettre et un chiffre", () => {
    expect(passwordProblem("court1")).toMatch(/10 caractères/);
    expect(passwordProblem("uniquementdeslettres")).toMatch(/lettre et un chiffre/);
    expect(passwordProblem("1234567890123")).toMatch(/lettre et un chiffre/);
    expect(passwordProblem("a".repeat(201) + "1")).toMatch(/trop long/);
    expect(passwordProblem("Coulisses2026!")).toBeNull();
  });
  it("Argon2id : jamais en clair, vérification juste, refus du mauvais mot de passe", async () => {
    const h = await hashPassword("Coulisses2026!");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(h).not.toContain("Coulisses");
    expect(await verifyPassword(h, "Coulisses2026!")).toBe(true);
    expect(await verifyPassword(h, "coulisses2026!")).toBe(false);
    expect(await verifyPassword("pas-un-hash", "x")).toBe(false);
  });
});
