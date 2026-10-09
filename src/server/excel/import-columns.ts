import en from "../../../messages/en.json";
import ru from "../../../messages/ru.json";
import uz from "../../../messages/uz.json";

/*
 * Header-based column lookup for imports (A-109). A file made outside Kampus
 * (an export of another CRM, a hand-written sheet) rarely follows the template's
 * column order, so the importer finds each column by its header: the label
 * Kampus prints in any of the three UI languages, the key itself, or a known
 * alias. When no header is recognised the template's order applies.
 */

export interface ColumnSpec {
  key: string;
  /** Extra header spellings, any language, matched after normalisation. */
  aliases?: readonly string[];
}

export interface ColumnMap {
  /** Column index per key; a key missing from the file is absent. */
  index: Record<string, number>;
  /** Whether the header row was understood (else the template order was assumed). */
  byHeader: boolean;
}

type Messages = { excel: { columns: Record<string, string> } };
const LOCALE_MESSAGES: Messages[] = [en, ru, uz];

/** "Full name", "full_name", "F.I.O." and "fullname" are the same header. */
export function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s_\-.,:;'ʼ’`"()№#*]+/g, "")
    .trim();
}

export function mapColumns(header: string[], specs: readonly ColumnSpec[]): ColumnMap {
  const labels = new Map<string, string>();
  for (const spec of specs) {
    labels.set(normalizeHeader(spec.key), spec.key);
    for (const alias of spec.aliases ?? []) labels.set(normalizeHeader(alias), spec.key);
    for (const messages of LOCALE_MESSAGES) {
      const label = messages.excel.columns[spec.key];
      if (label) labels.set(normalizeHeader(label), spec.key);
    }
  }
  const index: Record<string, number> = {};
  header.forEach((cellText, i) => {
    const key = labels.get(normalizeHeader(cellText));
    if (key && !(key in index)) index[key] = i;
  });
  if (Object.keys(index).length > 0) return { index, byHeader: true };
  specs.forEach((spec, i) => {
    index[spec.key] = i;
  });
  return { index, byHeader: false };
}

/** The cell of `key` in `row`, trimmed, or null when the column is absent or empty. */
export function pick(map: ColumnMap, row: string[], key: string): string | null {
  const i = map.index[key];
  if (i === undefined) return null;
  return (row[i] ?? "").trim() || null;
}

/**
 * "-1 200 000", "−1200000", "1,200,000.50", "(500000)", "500 000 so'm" → a number.
 * Returns null when nothing numeric is left.
 */
export function parseSignedMoney(raw: string): number | null {
  let v = raw.trim().replace(/[−–—]/g, "-");
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  if (v.startsWith("-")) {
    negative = !negative;
    v = v.slice(1);
  }
  // Thousands separators: spaces, apostrophes, or commas/dots followed by exactly three digits.
  v = v.replace(/[\s']/g, "").replace(/[.,](?=\d{3}(\D|$))/g, "");
  v = v.replace(",", ".").replace(/[^\d.]/g, "");
  if (!v || !/\d/.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}
