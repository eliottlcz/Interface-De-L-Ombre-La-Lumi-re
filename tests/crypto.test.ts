import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, randomToken, safeEqual, sha256 } from "@/lib/crypto";

describe("chiffrement AES-256-GCM", () => {
  it("chiffre puis déchiffre à l'identique, sans laisser le clair dans le résultat", () => {
    const c = encryptSecret("Mot-de-passe-très-secret é€", "vault:1");
    expect(c).not.toContain("secret");
    expect(c.startsWith("v1:")).toBe(true);
    expect(decryptSecret(c, "vault:1")).toBe("Mot-de-passe-très-secret é€");
  });
  it("deux chiffrements du même secret diffèrent (IV aléatoire)", () => {
    expect(encryptSecret("a", "x")).not.toBe(encryptSecret("a", "x"));
  });
  it("refuse un déchiffrement avec un autre contexte (AAD) ou un contenu altéré", () => {
    const c = encryptSecret("secret", "vault:1");
    expect(() => decryptSecret(c, "vault:2")).toThrow();
    const [v, iv, tag, enc] = c.split(":");
    const flipped = Buffer.from(enc, "base64"); flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"), "vault:1")).toThrow();
    expect(() => decryptSecret("n'importe quoi", "vault:1")).toThrow();
  });
  it("jetons : aléatoires, hachage SHA-256 stable, comparaison à temps constant", () => {
    expect(randomToken()).not.toBe(randomToken());
    expect(sha256("a")).toBe("ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb");
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
