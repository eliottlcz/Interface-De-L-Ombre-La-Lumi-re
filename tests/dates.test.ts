import { describe, expect, it } from "vitest";
import { addDaysISO, diffDaysISO, euros, parisToUtc, todayISO, utcToParis, compact } from "@/lib/dates";

describe("dates (Europe/Paris)", () => {
  it("jour courant à Paris, pas en UTC", () => {
    expect(todayISO(new Date("2026-06-30T22:30:00Z"))).toBe("2026-07-01");
    expect(todayISO(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
  });
  it("ajout de jours à travers fins de mois et d'année", () => {
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysISO("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("écart en jours", () => {
    expect(diffDaysISO("2026-12-05", "2026-11-27")).toBe(8);
    expect(diffDaysISO("2026-11-27", "2026-12-05")).toBe(-8);
  });
  it("heure de Paris ↔ UTC, été et hiver", () => {
    expect(parisToUtc("2026-07-01", "10:00").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(parisToUtc("2026-01-15", "10:00").toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(utcToParis("2026-07-01T08:00:00Z")).toEqual({ date: "2026-07-01", time: "10:00" });
  });
  it("montants et nombres lisibles", () => {
    expect(euros(123456).replace(/\s/g, " ")).toMatch(/1 234,56 €/);
    expect(compact(null)).toBe("—");
    expect(compact(950)).toBe("950");
  });
});
