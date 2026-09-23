import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, BriefcaseBusiness,
  Check, ChevronDown, CircleHelp, Download, Filter, LayoutDashboard, Moon, Printer,
  RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sun, Upload, Users, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  downloadCsv, filterEmployees, groupBy, loadEmployees, uploadEmployeeCsv, resetEmployeeDataset, type AttritionEmployee, type Filters,
} from "@/lib/attrition-data";

const CHART_COLORS = {
  blue: "#0079F2",
  purple: "#795EFF",
  green: "#009118",
  red: "#A60808",
  pink: "#ec4899",
};
const CHART_COLOR_LIST = [CHART_COLORS.blue, CHART_COLORS.purple, CHART_COLORS.green, CHART_COLORS.red, CHART_COLORS.pink];
const INTERVALS = [
  { label: "Off", value: 0 },
  { label: "Every 5 min", value: 5 * 60 * 1000 },
  { label: "Every 15 min", value: 15 * 60 * 1000 },
  { label: "Every 1 hour", value: 60 * 60 * 1000 },
];
const EMPTY_FILTERS: Filters = { department: "", jobRole: "", overtime: "", attrition: "" };
const NAV_ITEMS: Array<[string, string, LucideIcon]> = [["overview", "Overview", LayoutDashboard], ["drivers", "Driver analysis", BarChart3], ["employees", "Employee risk", Users]];

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#d9d5ca] bg-[#fffdf7] px-3 py-2 text-[13px] text-[#20333a]">
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((entry, index) => (
        <div className="flex items-center gap-2" key={`${entry.name}-${index}`}>
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: entry.color }} />
          <span className="text-[#66747a]">{entry.name}</span>
          <strong className="ml-auto">{typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}</strong>
        </div>
      ))}
    </div>
  );
}

function RiskBadge({ tier }: { tier: AttritionEmployee["riskTier"] }) {
  const style = tier === "Priority"
    ? "border-[#efb8ab] bg-[#fff0ec] text-[#9f3e30]"
    : tier === "Elevated"
      ? "border-[#ecd18c] bg-[#fff8df] text-[#8e6813]"
      : "border-[#a7d6cd] bg-[#edf8f5] text-[#217568]";
  return <Badge variant="outline" className={`font-medium ${style}`}>{tier}</Badge>;
}

function MetricCard({ label, value, note, accent, icon: Icon }: { label: string; value: string; note: string; accent: string; icon: typeof Users }) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</p>
            <p className="mt-2 font-mono text-[28px] font-bold leading-none tracking-[-.05em]" style={{ color: accent }}>{value}</p>
            <p className="mt-2 text-[12px] text-muted-foreground">{note}</p>
          </div>
          <span className="rounded-lg border border-border bg-muted/60 p-2" style={{ color: accent }}><Icon className="h-4 w-4" /></span>
        </div>
      </CardContent>
      <div className="absolute bottom-0 left-0 h-1 w-full opacity-70" style={{ backgroundColor: accent }} />
    </Card>
  );
}

function ExportButton({ label, rows, filename }: { label: string; rows: Record<string, string | number>[]; filename: string }) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, rows)}
      className="print-hide inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      aria-label={`Export ${label} as CSV`}
    >
      <Download className="h-3 w-3" /> CSV
    </button>
  );
}

export default function AttritionDashboard() {
  const [employees, setEmployees] = useState<AttritionEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [view, setView] = useState<"overview" | "drivers" | "employees">("overview");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [interval, setInterval] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const pageSize = 9;

  const refresh = async () => {
    setIsSpinning(true);
    setError(null);
    try {
      const data = await loadEmployees();
      setEmployees(data);
      setLastRefreshed(new Date());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong loading the dataset.");
    } finally {
      window.setTimeout(() => setIsSpinning(false), 600);
      setIsLoading(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setIsLoading(true);
    try {
      const uploaded = await uploadEmployeeCsv(file);
      setEmployees(uploaded.employees);
      setUploadedFileName(uploaded.filename);
      setLastRefreshed(new Date());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload the CSV.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const data = await resetEmployeeDataset();
      setEmployees(data);
      setUploadedFileName(null);
      setLastRefreshed(new Date());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to restore the sample dataset.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    return () => document.documentElement.classList.remove("dark");
  }, [isDark]);
  useEffect(() => {
    if (!interval) return undefined;
    const timer = window.setInterval(() => { void refresh(); }, interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = useMemo(() => filterEmployees(employees, filters), [employees, filters]);
  const searched = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return filtered;
    return filtered.filter((employee) => [employee.id, employee.department, employee.jobRole, employee.riskTier, ...employee.signals].join(" ").toLowerCase().includes(query));
  }, [filtered, search]);
  const metrics = useMemo(() => {
    const attrition = filtered.filter((employee) => employee.attrition === "Yes").length;
    const priority = filtered.filter((employee) => employee.riskTier === "Priority").length;
    const overtime = filtered.filter((employee) => employee.overtime === "Yes").length;
    return {
      population: filtered.length,
      attritionRate: filtered.length ? (attrition / filtered.length) * 100 : 0,
      priority,
      overtimeRate: filtered.length ? (overtime / filtered.length) * 100 : 0,
      avgRisk: filtered.length ? filtered.reduce((sum, employee) => sum + employee.riskScore, 0) / filtered.length : 0,
    };
  }, [filtered]);
  const deptData = useMemo(() => groupBy(filtered, "department"), [filtered]);
  const roleData = useMemo(() => groupBy(filtered, "jobRole"), [filtered]);
  const tierData = useMemo(() => groupBy(filtered, "riskTier"), [filtered]);
  const satisfactionData = useMemo(() => [
    { name: "Job satisfaction", score: filtered.length ? filtered.reduce((sum, employee) => sum + employee.jobSatisfaction, 0) / filtered.length : 0 },
    { name: "Environment", score: filtered.length ? filtered.reduce((sum, employee) => sum + employee.environmentSatisfaction, 0) / filtered.length : 0 },
    { name: "Work-life balance", score: filtered.length ? filtered.reduce((sum, employee) => sum + employee.workLifeBalance, 0) / filtered.length : 0 },
  ], [filtered]);
  const pageCount = Math.max(1, Math.ceil(searched.length / pageSize));
  const pageRows = searched.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [search, filters]);

  const departments = [...new Set(employees.map((employee) => employee.department))].sort();
  const roles = [...new Set(employees.map((employee) => employee.jobRole))].sort();
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const tickColor = isDark ? "#a9b5b8" : "#6f7e81";
  const gridColor = isDark ? "rgba(255,255,255,.08)" : "#e6e1d8";

  if (isLoading) {
    return <div className="min-h-[100dvh] bg-background p-6"><div className="mx-auto max-w-[1480px] space-y-5"><Skeleton className="h-14 w-full" /><div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-32" />)}</div><Skeleton className="h-[420px] w-full" /></div></div>;
  }
  if (error) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6"><Card className="max-w-md"><CardContent className="p-8 text-center"><AlertTriangle className="mx-auto mb-4 h-9 w-9 text-accent" /><h1 className="text-xl font-bold">Dataset unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p><Button className="mt-5" onClick={() => { setIsLoading(true); void refresh(); }}>Retry load</Button></CardContent></Card></div>;
  }

  return (
    <div className="grain min-h-[100dvh] bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Activity className="h-5 w-5" /></div>
          <div><div className="font-mono text-[12px] font-bold tracking-[.08em]">PEOPLE / SIGNAL</div><div className="text-[11px] text-sidebar-foreground/60">workforce intelligence</div></div>
        </div>
        <nav className="space-y-1 px-3 py-7">
          {NAV_ITEMS.map(([key, label, Icon]) => (
            <button type="button" key={key} onClick={() => setView(key as typeof view)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${view === key ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"}`}>
              <Icon className="h-4 w-4" /> {label}
              {key === "employees" && <span className="ml-auto rounded-full bg-sidebar-primary/20 px-1.5 py-0.5 font-mono text-[10px] text-sidebar-primary">{metrics.priority}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-sidebar-border p-5">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.13em] text-sidebar-foreground/50"><ShieldCheck className="h-3.5 w-3.5 text-sidebar-primary" /> Trust & guardrails</div>
          <p className="text-[11px] leading-relaxed text-sidebar-foreground/60">Prioritization signals are explainable and directional. Never a medical or employment decision.</p>
        </div>
      </aside>

      <main className="md:pl-[236px]">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur print-hide">
          <div className="mx-auto flex min-h-[74px] max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-7">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.15em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-accent" />Workforce intelligence cockpit</div>
              <h1 className="mt-1 text-xl font-bold tracking-[-.025em] sm:text-2xl">Attrition, made actionable.</h1>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <input ref={uploadRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void handleUpload(event)} />
              <button type="button" onClick={() => uploadRef.current?.click()} className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted" aria-label="Upload employee CSV"><Upload className="h-3.5 w-3.5" /><span className="hidden sm:inline">Upload CSV</span></button>
              {uploadedFileName && <button type="button" onClick={() => void handleReset()} className="hidden h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted sm:flex" aria-label="Restore sample dataset"><RefreshCw className="h-3.5 w-3.5" /> Sample</button>}
              <div className="relative" ref={dropdownRef}>
                <div className="flex h-8 overflow-hidden rounded-md border border-border bg-card">
                  <button type="button" onClick={() => { setIsLoading(true); void refresh(); }} className="flex items-center gap-1.5 px-2.5 text-xs font-semibold transition-colors hover:bg-muted" disabled={isSpinning}><RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Refresh</span></button>
                  <div className="w-px bg-border" />
                  <button type="button" onClick={() => setMenuOpen((open) => !open)} className="px-2 transition-colors hover:bg-muted" aria-label="Auto-refresh options"><ChevronDown className="h-3.5 w-3.5" /></button>
                </div>
                {menuOpen && <div className="absolute right-0 top-10 z-50 w-44 rounded-lg border border-border bg-popover p-1.5 text-sm text-popover-foreground">
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground">Auto-refresh</p>
                  {INTERVALS.map((option) => <button type="button" key={option.label} onClick={() => { setInterval(option.value); setMenuOpen(false); }} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-muted">{option.label}{interval === option.value && <Check className="h-3.5 w-3.5 text-primary" />}</button>)}
                </div>}
              </div>
              <button type="button" onClick={() => window.print()} className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted" aria-label="Export as PDF"><Printer className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => setIsDark((dark) => !dark)} className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted" aria-label="Toggle dark mode">{isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}</button>
            </div>
          </div>
        </header>

        <div className="dashboard-grid min-h-[calc(100dvh-74px)]">
          <div className="mx-auto max-w-[1480px] space-y-5 px-4 py-5 sm:px-7 sm:py-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><p className="text-sm text-muted-foreground">{uploadedFileName ? `${uploadedFileName} · ${employees.length.toLocaleString()} employee records` : `IBM HR Analytics dataset · ${employees.length.toLocaleString()} employee records`}</p><p className="mt-1 text-[11px] text-muted-foreground">Last refresh: {lastRefreshed?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) ?? "—"} · Analytical prioritization, not a decision.</p></div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className={`h-2 w-2 rounded-full ${interval ? "bg-accent" : "bg-primary"}`} />{interval ? `Auto-refresh ${INTERVALS.find((item) => item.value === interval)?.label.toLowerCase()}` : "Auto-refresh off"}</div>
            </div>

            <section className="rounded-xl border border-border bg-card/70 p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="mr-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.11em] text-muted-foreground"><SlidersHorizontal className="h-3.5 w-3.5 text-primary" /> Focus lens</div>
                {[
                  ["department", "Department", departments],
                  ["jobRole", "Job role", roles],
                  ["overtime", "Overtime", ["Yes", "No"]],
                  ["attrition", "Attrition", ["Yes", "No"]],
                ].map(([key, label, options]) => <select key={key as string} aria-label={label as string} value={filters[key as keyof Filters]} onChange={(event) => setFilters((current) => ({ ...current, [key as keyof Filters]: event.target.value }))} className="h-9 min-w-[132px] flex-1 rounded-md border border-border bg-background px-2.5 text-sm outline-none transition-colors focus:border-primary sm:flex-none"><option value="">All {label as string}</option>{(options as string[]).map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select>)}
                {activeFilters > 0 && <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-accent hover:bg-accent/10"><X className="h-3.5 w-3.5" /> Clear ({activeFilters})</button>}
                <button type="button" onClick={() => setFilterOpen((open) => !open)} className="ml-auto inline-flex h-9 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted"><Filter className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{filterOpen ? "Hide" : "More"} context</span></button>
              </div>
              {filterOpen && <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">Filters apply across every view. Risk score weights transparent workforce signals: overtime, early tenure, satisfaction, mobility, commute, job level and stock options.</div>}
            </section>

            <div className="flex items-center justify-between">
              <div className="flex gap-1 rounded-lg border border-border bg-card p-1 md:hidden">
                {[["overview", "Overview"], ["drivers", "Drivers"], ["employees", "Risk table"]].map(([key, label]) => <button type="button" key={key} onClick={() => setView(key as typeof view)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{label}</button>)}
              </div>
              <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><BriefcaseBusiness className="h-3.5 w-3.5" /> Decision surface / {view === "overview" ? "overview" : view === "drivers" ? "driver analysis" : "employee risk"}</div>
              <div className="ml-auto font-mono text-[11px] text-muted-foreground">{filtered.length.toLocaleString()} in view</div>
            </div>

            {view !== "employees" && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Population" value={metrics.population.toLocaleString()} note="Employees in current lens" accent={CHART_COLORS.blue} icon={Users} />
              <MetricCard label="Observed attrition" value={formatPercent(metrics.attritionRate)} note="Historical Yes in dataset" accent={CHART_COLORS.red} icon={ArrowDownRight} />
              <MetricCard label="Priority signals" value={metrics.priority.toLocaleString()} note="Highest prioritization tier" accent={CHART_COLORS.purple} icon={AlertTriangle} />
              <MetricCard label="Overtime exposure" value={formatPercent(metrics.overtimeRate)} note="People working overtime" accent={CHART_COLORS.green} icon={Activity} />
            </div>}

            {view === "overview" && <OverviewView filtered={filtered} deptData={deptData} tierData={tierData} satisfactionData={satisfactionData} gridColor={gridColor} tickColor={tickColor} />}
            {view === "drivers" && <DriversView filtered={filtered} roleData={roleData} satisfactionData={satisfactionData} gridColor={gridColor} tickColor={tickColor} />}
            {view === "employees" && <EmployeesView rows={pageRows} total={searched.length} search={search} setSearch={setSearch} page={page} pageCount={pageCount} setPage={setPage} />}
          </div>
        </div>
      </main>
    </div>
  );
}

function ChartCard({ title, description, children, rows, filename }: { title: string; description: string; children: ReactNode; rows: Record<string, string | number>[]; filename: string }) {
  return <Card className="overflow-hidden"><CardHeader className="flex-row items-start justify-between space-y-0 border-b border-border/60 px-4 py-4 sm:px-5"><div><CardTitle className="text-base">{title}</CardTitle><CardDescription className="mt-1 text-xs">{description}</CardDescription></div><ExportButton label={title} rows={rows} filename={filename} /></CardHeader><CardContent className="p-4 sm:p-5">{children}</CardContent></Card>;
}

function OverviewView({ filtered, deptData, tierData, satisfactionData, gridColor, tickColor }: { filtered: AttritionEmployee[]; deptData: { name: string; value: number }[]; tierData: { name: string; value: number }[]; satisfactionData: { name: string; score: number }[]; gridColor: string; tickColor: string }) {
  const deptRows = deptData.map((row) => ({ department: row.name, employees: row.value }));
  const tierRows = tierData.map((row) => ({ tier: row.name, employees: row.value }));
  return <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
    <ChartCard title="Population by department" description="Where the current workforce sits" rows={deptRows} filename="population-by-department.csv"><ResponsiveContainer width="100%" height={286} debounce={0}><BarChart data={deptData} layout="vertical" margin={{ left: 16, right: 14 }}><CartesianGrid horizontal={false} stroke={gridColor} /><XAxis type="number" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} allowDecimals={false} /><YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12, fill: tickColor }} stroke="none" /><Tooltip content={<ChartTooltip />} cursor={false} isAnimationActive={false} /><Bar dataKey="value" name="Employees" fill={CHART_COLORS.blue} fillOpacity={.8} radius={[0, 4, 4, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></ChartCard>
    <ChartCard title="Risk tier mix" description="A directional view of attention required" rows={tierRows} filename="risk-tier-mix.csv"><div className="relative"><ResponsiveContainer width="100%" height={244} debounce={0}><PieChart><Pie data={tierData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={66} outerRadius={94} paddingAngle={3} cornerRadius={3} stroke="none" isAnimationActive={false}>{tierData.map((entry, index) => <Cell key={entry.name} fill={entry.name === "Priority" ? CHART_COLORS.red : entry.name === "Elevated" ? CHART_COLORS.purple : CHART_COLORS.green} />)}</Pie><Tooltip content={<ChartTooltip />} isAnimationActive={false} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="font-mono text-2xl">{filtered.length.toLocaleString()}</strong><span className="text-[11px] text-muted-foreground">people</span></div></div><div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">{tierData.map((entry) => <div key={entry.name} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.name === "Priority" ? CHART_COLORS.red : entry.name === "Elevated" ? CHART_COLORS.purple : CHART_COLORS.green }} />{entry.name} <span className="font-mono text-muted-foreground">{entry.value}</span></div>)}</div></ChartCard>
    <ChartCard title="Satisfaction signals" description="Average score across three interpretable inputs (1–4)" rows={satisfactionData.map((row) => ({ signal: row.name, average: Number(row.score.toFixed(2)) }))} filename="satisfaction-signals.csv"><ResponsiveContainer width="100%" height={255} debounce={0}><AreaChart data={satisfactionData} margin={{ left: -12, right: 12 }}><defs><linearGradient id="satisfaction-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART_COLORS.purple} stopOpacity={.28} /><stop offset="100%" stopColor={CHART_COLORS.purple} stopOpacity={.03} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={gridColor} /><XAxis dataKey="name" tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} /><YAxis domain={[0, 4]} tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} /><Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,.05)", stroke: "none" }} isAnimationActive={false} /><Area dataKey="score" name="Average score" type="linear" stroke={CHART_COLORS.purple} strokeWidth={2} fill="url(#satisfaction-fill)" isAnimationActive={false} /></AreaChart></ResponsiveContainer></ChartCard>
    <Card className="bg-primary p-0 text-primary-foreground"><CardContent className="flex h-full min-h-[255px] flex-col justify-between p-5"><div><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.14em] text-primary-foreground/65"><CircleHelp className="h-3.5 w-3.5" /> How to read this cockpit</div><h2 className="mt-5 max-w-sm text-2xl font-bold leading-tight tracking-[-.04em]">Start with the signal. Then bring the human context.</h2></div><p className="max-w-md text-sm leading-relaxed text-primary-foreground/75">Use the driver view to understand patterns, then use the risk table to focus a conversation. Scores are transparent prioritization aids — not predictions or employment decisions.</p></CardContent></Card>
  </div>;
}

function DriversView({ filtered, roleData, satisfactionData, gridColor, tickColor }: { filtered: AttritionEmployee[]; roleData: { name: string; value: number }[]; satisfactionData: { name: string; score: number }[]; gridColor: string; tickColor: string }) {
  const overtimeRows = groupBy(filtered, "overtime").map((row) => ({ overtime: row.name, employees: row.value }));
  const roleRows = roleData.map((row) => ({ role: row.name, employees: row.value }));
  const riskByRole = roleData.map((role) => {
    const people = filtered.filter((employee) => employee.jobRole === role.name);
    return { name: role.name.replace("Human Resources", "HR"), risk: people.length ? Number((people.reduce((sum, employee) => sum + employee.riskScore, 0) / people.length).toFixed(1)) : 0 };
  });
  return <div className="space-y-4"><div className="grid gap-4 lg:grid-cols-2"><ChartCard title="Average analytical risk by role" description="Role groups with stronger prioritization signals" rows={riskByRole} filename="risk-by-role.csv"><ResponsiveContainer width="100%" height={330} debounce={0}><BarChart data={riskByRole} margin={{ bottom: 42, left: -14 }}><CartesianGrid vertical={false} stroke={gridColor} /><XAxis dataKey="name" angle={-28} textAnchor="end" interval={0} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} /><YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} /><Tooltip content={<ChartTooltip />} cursor={false} isAnimationActive={false} /><Bar dataKey="risk" name="Avg. score" fill={CHART_COLORS.red} fillOpacity={.78} radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></ChartCard><ChartCard title="Work pattern exposure" description="Overtime is one of the strongest weighted signals" rows={overtimeRows} filename="work-pattern-exposure.csv"><ResponsiveContainer width="100%" height={330} debounce={0}><BarChart data={overtimeRows} margin={{ top: 14, right: 14, bottom: 14, left: 0 }}><CartesianGrid vertical={false} stroke={gridColor} /><XAxis dataKey="overtime" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} /><YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} allowDecimals={false} /><Tooltip content={<ChartTooltip />} cursor={false} isAnimationActive={false} /><Bar dataKey="employees" name="Employees" fill={CHART_COLORS.green} fillOpacity={.8} radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></ChartCard></div><ChartCard title="Role population context" description="Use role size alongside risk — small groups need careful interpretation" rows={roleRows} filename="role-population.csv"><ResponsiveContainer width="100%" height={290} debounce={0}><BarChart data={roleData} margin={{ bottom: 48, left: -10, right: 10 }}><CartesianGrid vertical={false} stroke={gridColor} /><XAxis dataKey="name" angle={-26} textAnchor="end" interval={0} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} /><YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} allowDecimals={false} /><Tooltip content={<ChartTooltip />} cursor={false} isAnimationActive={false} /><Bar dataKey="value" name="Employees" fill={CHART_COLORS.blue} fillOpacity={.8} radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></ChartCard><div className="grid gap-4 md:grid-cols-[1fr_1fr]"><Card><CardHeader><CardTitle className="text-base">What moves the score?</CardTitle><CardDescription>Signals are intentionally legible.</CardDescription></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{["Overtime exposure", "Low satisfaction", "Early tenure", "Multiple employers", "Long commute", "No stock options"].map((signal, index) => <div key={signal} className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2 text-sm"><span>{signal}</span><span className="font-mono text-xs text-accent">{[19, 13, 17, 9, 8, 6][index]} pts</span></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Guardrail</CardTitle><CardDescription>Use scores to ask better questions.</CardDescription></CardHeader><CardContent className="text-sm leading-relaxed text-muted-foreground">A high score means the observed profile shares more historical signals with attrition records. It does not explain an individual, establish causality, or prescribe an HR action.</CardContent></Card></div></div>;
}

function EmployeesView({ rows, total, search, setSearch, page, pageCount, setPage }: { rows: AttritionEmployee[]; total: number; search: string; setSearch: (value: string) => void; page: number; pageCount: number; setPage: (value: number) => void }) {
  return <Card><CardHeader className="gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><CardTitle className="text-base">Employee risk table</CardTitle><CardDescription className="mt-1">A starting list for human review, ordered by analytical prioritization score.</CardDescription></div><div className="relative w-full sm:w-64"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search role, signal, tier..." className="h-9 pl-9" /></div></CardHeader><CardContent className="px-0 pb-4 sm:px-5"><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/40"><TableHead className="pl-4 text-[11px] uppercase tracking-wider sm:pl-0">Employee</TableHead><TableHead>Role / department</TableHead><TableHead>Signals</TableHead><TableHead className="text-right">Score</TableHead><TableHead className="pr-4 sm:pr-0">Tier</TableHead></TableRow></TableHeader><TableBody>{rows.length ? rows.map((employee) => <TableRow key={employee.id} className="transition-colors hover:bg-muted/35"><TableCell className="pl-4 font-mono text-sm sm:pl-0">#{employee.id}<div className="mt-0.5 font-sans text-[11px] text-muted-foreground">{employee.age} yrs · {employee.yearsAtCompany} yrs here</div></TableCell><TableCell className="min-w-[175px] text-sm"><div className="font-semibold">{employee.jobRole}</div><div className="text-[12px] text-muted-foreground">{employee.department}</div></TableCell><TableCell className="min-w-[230px]"><div className="flex flex-wrap gap-1">{employee.signals.map((signal) => <span key={signal} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{signal}</span>)}</div></TableCell><TableCell className="text-right"><span className="font-mono text-base font-bold">{employee.riskScore}</span><div className="text-[10px] text-muted-foreground">/ 99</div></TableCell><TableCell className="pr-4 sm:pr-0"><RiskBadge tier={employee.riskTier} /></TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="h-36 text-center text-sm text-muted-foreground"><Search className="mx-auto mb-2 h-5 w-5" />No employees match this search.</TableCell></TableRow>}</TableBody></Table></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Showing {total ? (page - 1) * 9 + 1 : 0}–{Math.min(page * 9, total)} of {total.toLocaleString()}</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>Previous</Button><span className="font-mono text-xs text-muted-foreground">{page} / {pageCount}</span><Button variant="outline" size="sm" onClick={() => setPage(Math.min(pageCount, page + 1))} disabled={page === pageCount}>Next</Button></div></div></CardContent></Card>;
}