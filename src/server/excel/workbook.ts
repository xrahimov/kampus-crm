import ExcelJS from "exceljs";

/*
 * Excel export/import (A-24, Phase 12). One sheet per file, a bold header row,
 * values written as the cell types Excel understands (numbers stay numbers,
 * dates stay dates). Reading returns plain strings so the import validation
 * works on one shape whatever the spreadsheet program wrote.
 */

export interface ExcelColumn<Row> {
  header: string;
  key: keyof Row & string;
  width?: number;
}

export type ExcelCell = string | number | boolean | Date | null | undefined;

export async function buildWorkbook<Row extends Record<string, ExcelCell>>(
  sheetName: string,
  columns: Array<ExcelColumn<Row>>,
  rows: Row[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kampus";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31) || "Sheet1");
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? Math.min(60, Math.max(12, c.header.length + 4)),
  }));
  for (const row of rows) {
    const values: Record<string, ExcelCell> = {};
    for (const c of columns) values[c.key] = row[c.key] ?? null;
    sheet.addRow(values);
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A download response; the file name is ASCII-safe for the plain header and UTF-8 for `filename*`. */
export function xlsxResponse(buffer: Buffer, filename: string): Response {
  const safe = filename.replace(/[^\w.-]+/g, "_");
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

/** Cell → string: dates become YYYY-MM-DD, numbers keep their digits, rich text is flattened. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return String(value.text);
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("error" in value) return "";
    return "";
  }
  return String(value).trim();
}

/** The first sheet as rows of strings (header row included); fully empty rows are dropped. */
export async function readFirstSheet(bytes: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  const buffer =
    bytes instanceof Uint8Array ? Buffer.from(bytes) : Buffer.from(new Uint8Array(bytes));
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    const count = Math.max(row.cellCount, sheet.columnCount);
    for (let i = 1; i <= count; i++) cells.push(cellText(row.getCell(i).value));
    if (cells.some((c) => c !== "")) rows.push(cells);
  });
  return rows;
}
