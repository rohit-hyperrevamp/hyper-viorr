import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_PRESET,
  FORMULA_VARIABLES,
  slugifyVar,
  type CompositeComponent,
  type FormulaConfig,
  type PresetBase,
  type PresetDivisor,
  type PresetFormula,
  type PresetMultiplier,
  evaluateFormula,
  presetToExpression,
  validateExpression,
} from "@/lib/formula-engine";

type Props = {
  value: FormulaConfig | null;
  onChange: (next: FormulaConfig | null) => void;
  availableBases?: string[];
};

const MULTIPLIER_OPTIONS: { value: PresetMultiplier; label: string }[] = [
  { value: "present", label: "Present Duties" },
  { value: "ot",      label: "ED Duties" },
  { value: "ph",      label: "PH Duties" },
  { value: "wo",      label: "Weekly Off" },
  { value: "el",      label: "Earned Leave" },
  { value: "pl",      label: "Paid Leave" },
];

const DIVISOR_OPTIONS: { value: string; label: string }[] = [
  { value: "none",          label: "—" },
  { value: "fixed_days",    label: "Fixed Days (client)" },
  { value: "working_days",  label: "Working Days" },
  { value: "payable_days",  label: "Payable Days" },
  { value: "month_26",      label: "÷ 26" },
  { value: "month_28",      label: "÷ 28" },
  { value: "month_30",      label: "÷ 30" },
  { value: "month_31",      label: "÷ 31" },
];

const CORE_LABELS = new Set(["Basic", "DA", "HRA"]);
const DERIVED_LABELS = new Set(["Gross", "CTC"]);
const DAYS_LABELS = ["Days in Month", "Working Days", "Payable Days", "Fixed Days", "Present", "Worked"];
const DAYS_SET = new Set(DAYS_LABELS);

function divisorFromUi(v: string): PresetDivisor {
  if (v.startsWith("month_")) {
    const d = Number(v.split("_")[1]);
    return { kind: "fixed_days_month", days: d as 26 | 28 | 30 | 31 };
  }
  return v as PresetDivisor;
}
function divisorToUi(d: PresetDivisor | undefined): string {
  if (!d || d === "none") return "none";
  if (typeof d === "string") return d;
  return `month_${d.days}`;
}

const SAMPLE_CTX = {
  basic: 10000, da: 2000, spl_allow: 2000, splallow: 2000, special_allowance: 2000, specialallowance: 2000,
  conv_allow: 1200, conveyance_allowance: 1200, washing_allowance: 500, wa: 500,
  gross: 15000, fixed_amount: 200,
  fixed_days: 26, working_days: 30, payable_days: 26, days_in_month: 30,
  present: 24, worked: 24, ot: 2, ph: 1, wo: 4, el: 0, pl: 0,
};

const DEFAULT_AVAILABLE_BASES = ["Basic", "DA", "HRA", "Special Allowance", "Conveyance", "Gross", ...DAYS_LABELS];

function asComposite(b: PresetBase): CompositeComponent[] {
  switch (b.kind) {
    case "basic":         return [{ name: "Basic", operator: "+" }];
    case "da":            return [{ name: "DA", operator: "+" }];
    case "basic_plus_da": return [{ name: "Basic", operator: "+" }, { name: "DA", operator: "+" }];
    case "gross":         return [{ name: "Gross", operator: "+" }];
    case "composite":     return b.components ?? [];
    default:              return [];
  }
}

export function FormulaBuilder({ value, onChange, availableBases }: Props) {
  const baseChoices = availableBases && availableBases.length > 0 ? availableBases : DEFAULT_AVAILABLE_BASES;
  const [search, setSearch] = useState("");

  const mode = value?.mode ?? "preset";
  const preset = value?.mode === "preset" ? value.preset : DEFAULT_PRESET;
  const expression = value?.mode === "advanced" ? value.expression : "";

  const setMode = (m: "preset" | "advanced") => {
    if (m === "preset") onChange({ mode: "preset", preset });
    else onChange({ mode: "advanced", expression: expression || presetToExpression(preset) });
  };
  const updatePreset = (p: Partial<PresetFormula>) =>
    onChange({ mode: "preset", preset: { ...preset, ...p } });

  // Treat the canvas as "composite" by default. Migrate simple bases on first chip add.
  const composite = asComposite(preset.base);
  const selectedNames = new Set(composite.map((c) => c.name));

  const setComposite = (next: CompositeComponent[]) =>
    updatePreset({ base: { kind: "composite", components: next } });

  const addComponent = (name: string) => {
    if (selectedNames.has(name)) return;
    setComposite([...composite, { name, operator: "+" }]);
  };
  const removeComponent = (idx: number) => setComposite(composite.filter((_, i) => i !== idx));
  const toggleSign = (idx: number) => {
    const next = composite.slice();
    next[idx] = { ...next[idx], operator: next[idx].operator === "+" ? "-" : "+" };
    setComposite(next);
  };

  const filteredBases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseChoices.filter((b) => !q || b.toLowerCase().includes(q));
  }, [baseChoices, search]);

  const coreBases = filteredBases.filter((b) => CORE_LABELS.has(b));
  const derivedBases = filteredBases.filter((b) => DERIVED_LABELS.has(b));
  const daysBases = filteredBases.filter((b) => DAYS_SET.has(b));
  const otherBases = filteredBases.filter((b) => !CORE_LABELS.has(b) && !DERIVED_LABELS.has(b) && !DAYS_SET.has(b));

  const compiledPreview = useMemo(() => {
    if (!value) return { expr: "", amount: 0, error: undefined as string | undefined };
    if (value.mode === "preset") {
      const expr = presetToExpression(value.preset);
      const res = evaluateFormula(value, SAMPLE_CTX);
      return { expr, amount: res.amount, error: res.error };
    }
    const v = validateExpression(value.expression);
    if (!v.ok) return { expr: value.expression, amount: 0, error: v.error };
    const res = evaluateFormula(value, SAMPLE_CTX);
    return { expr: value.expression, amount: res.amount, error: res.error };
  }, [value]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Hybrid Formula Builder</div>
          <div className="text-[11px] text-muted-foreground">Combine components, modifiers and bounds — preview updates live.</div>
        </div>
        <div className="inline-flex rounded-lg bg-secondary p-1">
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${mode === "preset" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setMode("preset")}
          >Preset</button>
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${mode === "advanced" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setMode("advanced")}
          >Advanced</button>
        </div>
      </div>

      {mode === "preset" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left: searchable pool */}
          <aside className="lg:col-span-4 border-b border-border bg-secondary/30 lg:border-b-0 lg:border-r">
            <div className="border-b border-border bg-card p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search components…"
                  className="h-9 pl-8 text-sm"
                />
              </div>
            </div>
            <div className="max-h-[260px] space-y-4 overflow-y-auto p-4 lg:max-h-[380px]">
              {coreBases.length > 0 && (
                <ComponentGroup title="Core Components" tone="primary" items={coreBases} selected={selectedNames} onAdd={addComponent} />
              )}
              {derivedBases.length > 0 && (
                <ComponentGroup title="Derived Values" tone="success" items={derivedBases} selected={selectedNames} onAdd={addComponent} />
              )}
              {daysBases.length > 0 && (
                <ComponentGroup title="Days & Attendance" tone="primary" items={daysBases} selected={selectedNames} onAdd={addComponent} />
              )}
              {otherBases.length > 0 && (
                <ComponentGroup title="Allowances & Custom" tone="muted" items={otherBases} selected={selectedNames} onAdd={addComponent} />
              )}
              {filteredBases.length === 0 && (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No components match "{search}".
                </div>
              )}
            </div>
          </aside>

          {/* Right: canvas + modifiers */}
          <section className="lg:col-span-8 flex flex-col">
            <div className="flex flex-col gap-5 p-5">
              {/* Canvas */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formula Canvas</Label>
                  {composite.length > 0 && (
                    <button type="button" onClick={() => setComposite([])} className="text-xs font-medium text-primary hover:underline">Clear All</button>
                  )}
                </div>
                <div className="flex min-h-[100px] flex-wrap content-start items-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/30 p-3">
                  {composite.length === 0 && (
                    <div className="w-full text-center text-xs text-muted-foreground">
                      Pick components from the left to build the base of the formula.
                    </div>
                  )}
                  {composite.map((c, idx) => (
                    <div key={`${c.name}-${idx}`} className="flex items-center gap-2">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleSign(idx)}
                          title="Toggle + / −"
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold shadow-sm transition ${
                            c.operator === "-"
                              ? "bg-destructive text-destructive-foreground"
                              : "bg-foreground text-background"
                          }`}
                        >{c.operator}</button>
                      )}
                      <div className={`flex items-center rounded-lg border bg-card px-2 py-1 shadow-sm ${
                        idx === 0 && c.operator === "-" ? "border-destructive/40" : "border-border"
                      }`}>
                        {idx === 0 && c.operator === "-" && <span className="px-1 text-sm font-bold text-destructive">−</span>}
                        <span className="px-2 text-sm font-medium text-foreground">{c.name}</span>
                        <button
                          type="button"
                          onClick={() => removeComponent(idx)}
                          className="ml-1 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${c.name}`}
                        ><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                  {composite.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-border bg-secondary text-muted-foreground">
                        <Plus className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-[11px] text-muted-foreground">Add from left</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Modifiers row */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Operator</Label>
                  <Select value={preset.operator} onValueChange={(v) => updatePreset({ operator: v as PresetFormula["operator"] })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">Flat — use base as-is</SelectItem>
                      <SelectItem value="percent">× % of base</SelectItem>
                      <SelectItem value="per_day">Per day × multiplier</SelectItem>
                      <SelectItem value="divide">Divide base by …</SelectItem>
                    </SelectContent>
                  </Select>
                  {preset.operator === "percent" && (
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-9 pr-8"
                        value={preset.percent ?? 0}
                        onChange={(e) => updatePreset({ percent: Number(e.target.value) || 0 })}
                        placeholder="e.g. 12"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                  )}
                  {(preset.operator === "per_day" || preset.operator === "divide") && (
                    <Select value={divisorToUi(preset.divisor)} onValueChange={(v) => updatePreset({ divisor: divisorFromUi(v) })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Divisor" /></SelectTrigger>
                      <SelectContent>
                        {DIVISOR_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bounds (₹)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-muted-foreground">Min</span>
                      <Input
                        type="number"
                        className="h-9 pl-10"
                        placeholder="0"
                        value={preset.floorAmount ?? ""}
                        onChange={(e) => updatePreset({ floorAmount: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-muted-foreground">Max</span>
                      <Input
                        type="number"
                        className="h-9 pl-10"
                        placeholder="∞"
                        value={preset.capAmount ?? ""}
                        onChange={(e) => updatePreset({ capAmount: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Multipliers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attendance Multipliers</Label>
                  <span className="text-[11px] text-muted-foreground">{(preset.multipliers ?? []).length === 0 ? "Optional · summed when set" : `${(preset.multipliers ?? []).length} selected`}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MULTIPLIER_OPTIONS.map((o) => {
                    const active = (preset.multipliers ?? []).includes(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => {
                          const cur = preset.multipliers ?? [];
                          updatePreset({ multipliers: active ? cur.filter((m) => m !== o.value) : [...cur, o.value] });
                        }}
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition ${
                          active
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        {active ? "✓" : "+"} {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-3 p-5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Free-form Expression</Label>
          <Textarea
            rows={4}
            className="font-mono text-sm"
            value={expression}
            onChange={(e) => onChange({ mode: "advanced", expression: e.target.value })}
            placeholder="e.g. (basic + da) * 0.12   ·   min(15000, basic) * 0.05"
          />
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Available variables &amp; functions</summary>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 md:grid-cols-3">
              {FORMULA_VARIABLES.map((v) => (
                <div key={String(v.key)} className="text-[11px]"><code className="text-foreground">{v.label}</code> — <span className="text-muted-foreground">{v.desc}</span></div>
              ))}
              <div className="col-span-full mt-1 text-[11px]"><code>min(a,b)</code> · <code>max(a,b)</code> · <code>round(x)</code> · <code>floor(x)</code> · <code>ceil(x)</code> · operators <code>+ − × ÷ ( )</code></div>
            </div>
          </details>
        </div>
      )}

      {/* Live Preview Footer */}
      <div className="flex flex-col gap-2 border-t border-border bg-slate-900 px-5 py-4 text-slate-100 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Live Formula Preview</div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <code className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded bg-slate-800 px-2 py-1 font-mono text-xs text-blue-300">
              {compiledPreview.expr || "—"}
            </code>
            <span className="text-slate-500">=</span>
            {compiledPreview.error ? (
              <span className="font-semibold text-red-400">{compiledPreview.error}</span>
            ) : (
              <span className="font-bold tabular-nums text-emerald-400">₹ {compiledPreview.amount.toFixed(2)}</span>
            )}
          </div>
        </div>
        <span className="text-[10px] italic text-slate-500">Sample · Basic 10,000 · DA 2,000 · Gross 15,000 · 24 P / 26 base</span>
      </div>
    </div>
  );
}

function ComponentGroup({
  title,
  tone,
  items,
  selected,
  onAdd,
}: {
  title: string;
  tone: "primary" | "success" | "muted";
  items: string[];
  selected: Set<string>;
  onAdd: (label: string) => void;
}) {
  const cls =
    tone === "primary"
      ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15"
      : tone === "success"
      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 hover:bg-emerald-500/15 dark:text-emerald-300"
      : "bg-secondary text-foreground border-border hover:bg-secondary/70";

  return (
    <section>
      <h3 className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {items.map((b) => {
          const isSel = selected.has(b);
          return (
            <button
              key={b}
              type="button"
              disabled={isSel}
              onClick={() => onAdd(b)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                isSel ? "cursor-not-allowed border-border bg-muted text-muted-foreground line-through" : cls
              }`}
            >
              {b}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function FormulaBuilderToggle({
  enabled,
  onToggle,
  value,
  onChange,
  availableBases,
}: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  value: FormulaConfig | null;
  onChange: (next: FormulaConfig | null) => void;
  availableBases?: string[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
        <div>
          <div className="text-sm font-medium">Use Hybrid Formula (advanced)</div>
          <div className="text-xs text-muted-foreground">Override the standard calc with a preset or free-form expression.</div>
        </div>
        <Switch checked={enabled} onCheckedChange={(v) => { onToggle(v); if (v && !value) onChange({ mode: "preset", preset: DEFAULT_PRESET }); }} />
      </div>
      {enabled && <FormulaBuilder value={value} onChange={onChange} availableBases={availableBases} />}
    </div>
  );
}

export { useState };
