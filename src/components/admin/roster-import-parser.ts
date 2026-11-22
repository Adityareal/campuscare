export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 200;

export type RosterRow = Record<string, string | number> & { __rowNumber: number };

const HEADER_FIELDS: Record<string, string> = {
  name: "name",
  fullname: "name",
  email: "email",
  emailaddress: "email",
  role: "role",
  departmentcode: "departmentCode",
  deptcode: "departmentCode",
  studentnumber: "studentNumber",
  academicyear: "academicYear",
  locale: "locale",
  contactphone: "contactPhone",
  phone: "contactPhone",
  profession: "profession",
  qualifications: "qualifications",
  registrationbody: "registrationBody",
  registrationnumber: "registrationNumber",
  languages: "languages",
  specialisations: "specialisations",
  specializations: "specialisations",
  areasoffocus: "specialisations",
  feeinr: "feeInr",
  bio: "bio",
};

const ALL_FIELDS = [
  "name",
  "email",
  "role",
  "departmentCode",
  "studentNumber",
  "academicYear",
  "locale",
  "contactPhone",
  "profession",
  "qualifications",
  "registrationBody",
  "registrationNumber",
  "languages",
  "specialisations",
  "feeInr",
  "bio",
] as const;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

export function parseCsvMatrix(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      if (char === "\r" && source[i + 1] === "\n") i += 1;
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (quoted) throw new Error("A quoted cell was not closed. Check the CSV file and try again.");
  return rows;
}

export function normalizeRosterMatrix(matrix: unknown[][]): RosterRow[] {
  const headerRow = matrix[0];
  if (!headerRow) throw new Error("The first sheet is empty.");
  const headerNames = headerRow.map((value) => cellText(value).toLowerCase().replace(/[^a-z0-9]/g, ""));
  const fieldIndexes = new Map<string, number>();
  for (const [index, header] of headerNames.entries()) {
    if (!header) continue;
    const canonical = HEADER_FIELDS[header];
    if (!canonical) continue;
    if (fieldIndexes.has(canonical)) throw new Error(`The column “${canonical}” appears more than once.`);
    fieldIndexes.set(canonical, index);
  }

  const missing = ["name", "email", "role"].filter((field) => !fieldIndexes.has(field));
  if (missing.length) throw new Error(`Add these required columns: ${missing.join(", ")}.`);

  const rows: RosterRow[] = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const cells = matrix[index];
    if (!cells) continue;
    const mapped = Object.fromEntries(
      ALL_FIELDS.map((field) => [field, fieldIndexes.has(field) ? cellText(cells[fieldIndexes.get(field)!]) : ""]),
    ) as Record<string, string>;
    if (!Object.values(mapped).some((value) => value.trim())) continue;
    rows.push({ ...mapped, __rowNumber: index + 1 });
  }
  if (!rows.length) throw new Error("The sheet has no data rows below its header.");
  if (rows.length > MAX_ROWS) throw new Error(`Import up to ${MAX_ROWS} rows at a time. This sheet has ${rows.length}.`);
  return rows;
}
