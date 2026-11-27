import "server-only";
import ExcelJS from "exceljs";

export type Column<T> = { header: string; value: (row: T) => string | number | null | undefined; width?: number };

/** Neutralise l'injection de formules dans Excel/Sheets (=, +, -, @ en début de cellule). */
function safeCell(v: string | number | null | undefined) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** Nombre au format français pour Excel : virgule décimale, deux décimales, sans séparateur de milliers. */
const frNumber = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","));

export function toCSV<T>(rows: T[], cols: Column<T>[]): string {
  const esc = (v: string | number) => { const s = typeof v === "number" ? frNumber(v) : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.map((c) => esc(c.header)).join(";"), ...rows.map((r) => cols.map((c) => esc(safeCell(c.value(r)))).join(";"))];
  return "﻿" + lines.join("\r\n"); // BOM + « ; » : ouverture directe dans Excel en français
}

export async function toXLSX<T>(sheet: string, rows: T[], cols: Column<T>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "QG De l'Ombre à la Lumière";
  const ws = wb.addWorksheet(sheet.slice(0, 31));
  ws.columns = cols.map((c) => ({ header: c.header, width: c.width ?? 20 }));
  ws.getRow(1).font = { bold: true, color: { argb: "FF000000" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDFC662" } };
  for (const r of rows) ws.addRow(cols.map((c) => safeCell(c.value(r))));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
