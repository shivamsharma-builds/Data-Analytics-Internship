export type AttritionEmployee = {
  id: number;
  age: number;
  attrition: "Yes" | "No";
  department: string;
  jobRole: string;
  monthlyIncome: number;
  overtime: "Yes" | "No";
  yearsAtCompany: number;
  jobSatisfaction: number;
  environmentSatisfaction: number;
  workLifeBalance: number;
  jobLevel: number;
  stockOptionLevel: number;
  numCompaniesWorked: number;
  distanceFromHome: number;
  totalWorkingYears: number;
  riskScore: number;
  riskTier: "Monitor" | "Elevated" | "Priority";
  signals: string[];
};

export type Filters = {
  department: string;
  jobRole: string;
  overtime: string;
  attrition: string;
};

const toNumber = (value: string) => Number(value) || 0;

function csvRows(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const parseLine = (line: string) => {
    const result: string[] = [];
    let value = "";
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { result.push(value); value = ""; }
      else value += char;
    }
    result.push(value);
    return result.map((entry) => entry.replace(/^"|"$/g, ""));
  };
  const headers = parseLine(lines[0] ?? "");
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = parseLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function scoreEmployee(raw: Record<string, string>, index: number): AttritionEmployee {
  const overtime = raw.OverTime === "Yes" ? 19 : 0;
  const satisfaction = (4 - toNumber(raw.JobSatisfaction)) * 5 + (4 - toNumber(raw.EnvironmentSatisfaction)) * 4 + (4 - toNumber(raw.WorkLifeBalance)) * 4;
  const tenure = toNumber(raw.YearsAtCompany) <= 2 ? 17 : toNumber(raw.YearsAtCompany) <= 5 ? 8 : 0;
  const mobility = toNumber(raw.NumCompaniesWorked) >= 4 ? 9 : 0;
  const commute = toNumber(raw.DistanceFromHome) >= 15 ? 8 : 0;
  const level = toNumber(raw.JobLevel) === 1 ? 8 : 0;
  const stock = toNumber(raw.StockOptionLevel) === 0 ? 6 : 0;
  const score = Math.min(99, Math.round(12 + overtime + satisfaction + tenure + mobility + commute + level + stock));
  const signals: string[] = [];
  if (overtime) signals.push("Frequent overtime");
  if (satisfaction >= 14) signals.push("Low satisfaction signals");
  if (tenure) signals.push("Early tenure");
  if (mobility) signals.push("Multiple prior employers");
  if (commute) signals.push("Long commute");
  if (stock) signals.push("No stock options");
  const tier = score >= 62 ? "Priority" : score >= 40 ? "Elevated" : "Monitor";
  return {
    id: toNumber(raw.EmployeeNumber) || index + 1,
    age: toNumber(raw.Age),
    attrition: raw.Attrition === "Yes" ? "Yes" : "No",
    department: raw.Department || "Unknown",
    jobRole: raw.JobRole || "Unknown",
    monthlyIncome: toNumber(raw.MonthlyIncome),
    overtime: raw.OverTime === "Yes" ? "Yes" : "No",
    yearsAtCompany: toNumber(raw.YearsAtCompany),
    jobSatisfaction: toNumber(raw.JobSatisfaction),
    environmentSatisfaction: toNumber(raw.EnvironmentSatisfaction),
    workLifeBalance: toNumber(raw.WorkLifeBalance),
    jobLevel: toNumber(raw.JobLevel),
    stockOptionLevel: toNumber(raw.StockOptionLevel),
    numCompaniesWorked: toNumber(raw.NumCompaniesWorked),
    distanceFromHome: toNumber(raw.DistanceFromHome),
    totalWorkingYears: toNumber(raw.TotalWorkingYears),
    riskScore: score,
    riskTier: tier,
    signals: signals.length ? signals.slice(0, 3) : ["Stable profile"],
  };
}

export async function loadEmployees(signal?: AbortSignal): Promise<AttritionEmployee[]> {
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}/api/employees`, { signal });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Unable to load the workforce dataset.");
  }
  return response.json() as Promise<AttritionEmployee[]>;
}

export async function uploadEmployeeCsv(file: File): Promise<{ employees: AttritionEmployee[]; filename: string; rowCount: number }> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}/api/dataset/upload`, { method: "POST", body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "Unable to upload the CSV.");
  const employees = payload?.analysis ? await loadEmployees() : [];
  return { employees, filename: payload.dataset.filename, rowCount: payload.dataset.rowCount };
}

export async function resetEmployeeDataset(): Promise<AttritionEmployee[]> {
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}/api/dataset/reset`, { method: "POST" });
  if (!response.ok) throw new Error("Unable to restore the sample dataset.");
  return loadEmployees();
}

export function filterEmployees(employees: AttritionEmployee[], filters: Filters) {
  return employees.filter((employee) =>
    (!filters.department || employee.department === filters.department) &&
    (!filters.jobRole || employee.jobRole === filters.jobRole) &&
    (!filters.overtime || employee.overtime === filters.overtime) &&
    (!filters.attrition || employee.attrition === filters.attrition)
  );
}

export function groupBy<T, K extends keyof T>(rows: T[], key: K, measure?: (row: T) => number) {
  const values = new Map<string, { name: string; value: number }>();
  rows.forEach((row) => {
    const name = String(row[key]);
    const current = values.get(name) ?? { name, value: 0 };
    current.value += measure ? measure(row) : 1;
    values.set(name, current);
  });
  return [...values.values()].sort((a, b) => b.value - a.value);
}

export function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const body = [headers.join(","), ...rows.map((row) => headers.map((header) => `"${String(row[header]).replaceAll('"', '""')}"`).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}