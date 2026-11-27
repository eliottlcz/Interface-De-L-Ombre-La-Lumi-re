import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, can, effectivePermissions, type Permission } from "@/lib/auth/permissions";

describe("permissions", () => {
  it("l'administrateur a tous les droits", () => {
    for (const p of Object.keys(PERMISSIONS) as Permission[]) expect(can({ role: "administrateur" }, p)).toBe(true);
  });
  it("le collaborateur n'a ni finances, ni coffre-fort, ni gestion des comptes, ni exports", () => {
    for (const p of ["finances.voir", "finances.modifier", "coffre.voir", "coffre.modifier", "utilisateurs.gerer", "permissions.gerer", "exports.faire", "journal.voir"] as Permission[]) {
      expect(can({ role: "collaborateur" }, p), p).toBe(false);
    }
  });
  it("le lecteur n'a aucun droit d'écriture", () => {
    const ecriture = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => /modifier|gerer|saisir|generer|faire/.test(p));
    for (const p of ecriture) expect(can({ role: "lecteur" }, p), p).toBe(false);
  });
  it("le producteur ne gère ni les comptes ni les permissions", () => {
    expect(can({ role: "producteur" }, "utilisateurs.gerer")).toBe(false);
    expect(can({ role: "producteur" }, "permissions.gerer")).toBe(false);
    expect(can({ role: "producteur" }, "finances.voir")).toBe(true);
  });
  it("les dérogations individuelles accordent ou retirent un droit", () => {
    expect(can({ role: "collaborateur", permissionOverrides: { "finances.voir": true } }, "finances.voir")).toBe(true);
    expect(can({ role: "collaborateur", permissionOverrides: { "taches.modifier": false } }, "taches.modifier")).toBe(false);
  });
  it("une dérogation inconnue est ignorée et un sujet absent n'a aucun droit", () => {
    const set = effectivePermissions({ role: "lecteur", permissionOverrides: { "droit.inconnu": true } });
    expect(set.has("droit.inconnu" as Permission)).toBe(false);
    expect(can(null, "crm.voir")).toBe(false);
    expect(can(undefined, "crm.voir")).toBe(false);
  });
  it("chaque permission de rôle existe bien", () => {
    for (const list of Object.values(ROLE_PERMISSIONS)) for (const p of list) expect(p in PERMISSIONS).toBe(true);
  });
});
