import { describe, expect, it } from "vitest";
import { toCSV, toXLSX } from "@/lib/export";
import ExcelJS from "exceljs";

type R = { nom: string; montant: number | null };
const cols = [{ header: "Nom", value: (r: R) => r.nom }, { header: "Montant", value: (r: R) => r.montant }];

describe("exports", () => {
  it("CSV : BOM, séparateur « ; », décimales françaises", () => {
    const csv = toCSV<R>([{ nom: "Studio", montant: 12.5 }, { nom: "Autre", montant: 3 }], cols);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Nom;Montant");
    expect(csv).toContain("Studio;12,50");
    expect(csv).toContain("Autre;3");
  });
  it("CSV : guillemets, points-virgules et retours à la ligne protégés", () => {
    const csv = toCSV<R>([{ nom: 'Dit "bonjour"; puis\nsalut', montant: null }], cols);
    expect(csv).toContain('"Dit ""bonjour""; puis\nsalut";');
  });
  it("neutralise l'injection de formules (CSV et Excel)", async () => {
    const evil = ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)"];
    const rows = evil.map((nom) => ({ nom, montant: 1 }));
    const csv = toCSV<R>(rows, cols);
    for (const e of evil) expect(csv).toContain(`'${e.replace(/"/g, '""')}`);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await toXLSX("Test", rows, cols)) as unknown as ArrayBuffer);
    wb.getWorksheet("Test")!.eachRow((row, i) => { if (i > 1) expect(String(row.getCell(1).value).startsWith("'")).toBe(true); });
  });
  it("Excel : feuille nommée, en-tête, lignes", async () => {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await toXLSX("Finances", [{ nom: "A", montant: 10 }], cols)) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Finances")!;
    expect(ws.getRow(1).getCell(1).value).toBe("Nom");
    expect(ws.getRow(2).getCell(2).value).toBe(10);
  });
});
