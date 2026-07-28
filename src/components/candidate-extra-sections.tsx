import { Plus, Trash2 } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const ID_PROOF_TYPES = ["Driving License", "Passport", "Voter ID", "Ration Card", "Other"];

export function emptyDoc() {
  return { id: crypto.randomUUID(), name: "", type: "", url: "", notes: "" };
}
export function emptyProof() {
  return { id: crypto.randomUUID(), type: "", number: "", issued_by: "", valid_until: "", url: "" };
}
export function emptyContact() {
  return { id: crypto.randomUUID(), name: "", relation: "", phone: "", email: "" };
}
export function emptyIncident() {
  return { id: crypto.randomUUID(), fir_no: "", ipc_section: "", police_station: "", case_no: "", court: "", judgement_date: "", remarks: "" };
}
export const LANGUAGE_OPTIONS = [
  "English", "Hindi", "Marathi", "Gujarati", "Bengali", "Tamil", "Telugu",
  "Kannada", "Malayalam", "Punjabi", "Odia", "Assamese", "Urdu", "Konkani", "Nepali",
];
export function emptyActivity() {
  return { id: crypto.randomUUID(), activity: "", level: "", year: "" };
}
export function emptyNominee() {
  return {
    id: crypto.randomUUID(),
    name: "",
    relation: "",
    dob: "",
    share_percent: "",
    aadhaar: "",
  };
}

/**
 * When a subsection is rendered inside an outer <Section> card that already
 * shows a title, this context hides the inner SectionHeader to avoid the
 * "title shown twice" mobile pattern.
 */
export const SectionHeaderContext = createContext<{ hideHeader?: boolean }>({});

export function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  const { hideHeader } = useContext(SectionHeaderContext);
  if (hideHeader) {
    return desc ? (
      <p className="mb-4 text-xs text-muted-foreground leading-relaxed">{desc}</p>
    ) : null;
  }
  return (
    <div className="mb-4 border-b pb-3">
      <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
      {desc && <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{desc}</p>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

type SetSection = (k: string, v: any) => void;
type SetField = (k: string, v: any) => void;

export function PhysicalSection({ form, setSection, set }: { form: any; setSection: SetSection; set?: SetField }) {
  const ph = form.physical_health ?? {};
  return (
    <div>
      <SectionHeader title="Physical & Health" desc="Fill the Physical and Health details" />
      <h3 className="mb-3 text-sm font-medium">Physical Info</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          ["Height (in cm)", "height"],
          ["Weight (in kg)", "weight"],
          ["Chest (in cm)", "chest"],
          ["Waist (in cm)", "waist"],
          ["Shoe (in cm)", "shoe"],
        ].map(([label, key]) => (
          <Field key={key} label={label}>
            <Input
              type="number"
              value={ph[key] ?? ""}
              onChange={(e) => setSection("physical_health", { [key]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Field label="Blood Group">
          <Select
            value={ph.blood_group ?? ""}
            onValueChange={(v) => setSection("physical_health", { blood_group: v })}
          >
            <SelectTrigger><SelectValue placeholder="Select blood group" /></SelectTrigger>
            <SelectContent>
              {BLOOD_GROUPS.map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Identification Marks">
          <Textarea
            rows={2}
            value={ph.identification_marks ?? ""}
            onChange={(e) => setSection("physical_health", { identification_marks: e.target.value })}
          />
        </Field>
      </div>
      {set && (
        <div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-4 py-3">
          <div>
            <div className="text-sm font-medium">Person with Disability (PwD)</div>
            <p className="text-xs text-muted-foreground">
              Raises the ESI wage ceiling to ₹25,000 for this employee (statutory).
            </p>
          </div>
          <Switch checked={Boolean(form.is_disabled)} onCheckedChange={(v) => set("is_disabled", v)} />
        </div>
      )}
    </div>
  );
}

export function ComplianceSection({
  form,
  setSection,
  esicBranches,
}: {
  form: any;
  setSection: SetSection;
  esicBranches?: Array<{ id: string; location: string; esic_code: string }>;
}) {
  const c = form.compliance ?? {};
  const pf = c.pf_enabled ?? true;
  const eps = c.eps_enabled ?? true;
  const esic = c.esic_enabled ?? true;
  const pt = c.pt_enabled ?? true;
  const branches = esicBranches ?? [];
  
  const toggleRow = (label: string, desc: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
  return (
    <div>
      <SectionHeader title="Compliance" desc="Statutory contributions applicable to the candidate" />
      <div className="space-y-3">
        {toggleRow("Provident Fund (PF)", "Enable PF contributions for this candidate", pf, (v) => setSection("compliance", { pf_enabled: v }))}
        {pf && (
          <div className="ml-3 border-l-2 border-primary/30 pl-4">
            <Field label="UAN (Universal Account Number)">
              <Input format="uan" value={c.uan ?? ""} onChange={(e) => setSection("compliance", { uan: e.target.value })} />
            </Field>
          </div>
        )}
        {toggleRow("Employees' Pension Scheme (EPS)", "Enable EPS contributions", eps, (v) => setSection("compliance", { eps_enabled: v }))}
        {toggleRow("Employees' State Insurance (ESIC)", "Enable ESIC coverage", esic, (v) => setSection("compliance", { esic_enabled: v }))}
        {esic && (
          <div className="ml-3 space-y-3 border-l-2 border-primary/30 pl-4">
            <Field label="ESIC Branch">
              {branches.length === 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  No ESIC branches found. Please add branches in{" "}
                  <a href="/admin/esic-branch-manager" className="font-semibold underline">
                    ESIC Branch Manager
                  </a>{" "}
                  before mapping.
                </div>
              ) : (
                <Select
                  value={c.esic_branch_id ?? ""}
                  onValueChange={(v) => setSection("compliance", { esic_branch_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select ESIC branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.location} ({b.esic_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="ESIC Number">
              <Input format="esic" value={c.esic_number ?? ""} onChange={(e) => setSection("compliance", { esic_number: e.target.value })} />
            </Field>
          </div>
        )}
        {toggleRow("Professional Tax (PT)", "Apply Professional Tax deduction", pt, (v) => setSection("compliance", { pt_enabled: v }))}
      </div>
    </div>
  );
}

export function KnowledgeSection({ form, set }: { form: any; set: SetField }) {
  const educations = Array.isArray(form.educations) ? form.educations : [];
  const experiences = Array.isArray(form.experiences) ? form.experiences : [];
  return (
    <div>
      <SectionHeader title="Knowledge & Experience" desc="Education and work history" />
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">Education</h3>
          <Button size="sm" variant="outline" onClick={() => set("educations", [...educations, { id: crypto.randomUUID(), qualification: "", institute: "", year: "", percentage: "" }])}>
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
        {educations.length === 0 ? (
          <p className="text-xs text-muted-foreground">No education records</p>
        ) : (
          <div className="space-y-3">
            {educations.map((ed: any, i: number) => (
              <div key={ed.id ?? i} className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-5">
                {["qualification", "institute", "year", "percentage"].map((k) => (
                  <Input
                    key={k}
                    placeholder={k === "percentage" ? "Percentage / Grade" : k.charAt(0).toUpperCase() + k.slice(1)}
                    value={ed[k] ?? ""}
                    onChange={(e) => {
                      const copy = [...educations];
                      copy[i] = { ...copy[i], [k]: e.target.value };
                      set("educations", copy);
                    }}
                  />
                ))}
                <Button variant="ghost" size="icon" className="justify-self-end text-rose-500" onClick={() => set("educations", educations.filter((_: any, j: number) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">Experience</h3>
          <Button size="sm" variant="outline" onClick={() => set("experiences", [...experiences, { id: crypto.randomUUID(), company: "", designation: "", location: "", from: "", to: "", reason: "" }])}>
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
        {experiences.length === 0 ? (
          <p className="text-xs text-muted-foreground">No experience records</p>
        ) : (
          <div className="space-y-3">
            {experiences.map((ex: any, i: number) => (
              <div key={ex.id ?? i} className="space-y-2 rounded-md border p-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {["company", "designation", "location"].map((k) => (
                    <Input
                      key={k}
                      placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
                      value={ex[k] ?? ""}
                      onChange={(e) => {
                        const copy = [...experiences];
                        copy[i] = { ...copy[i], [k]: e.target.value };
                        set("experiences", copy);
                      }}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Input type="date" value={ex.from ?? ""} onChange={(e) => { const copy = [...experiences]; copy[i] = { ...copy[i], from: e.target.value }; set("experiences", copy); }} />
                  <Input type="date" value={ex.to ?? ""} onChange={(e) => { const copy = [...experiences]; copy[i] = { ...copy[i], to: e.target.value }; set("experiences", copy); }} />
                  <Input placeholder="Reason for leaving" value={ex.reason ?? ""} onChange={(e) => { const copy = [...experiences]; copy[i] = { ...copy[i], reason: e.target.value }; set("experiences", copy); }} />
                </div>
                <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => set("experiences", experiences.filter((_: any, j: number) => j !== i))}>
                  <Trash2 className="mr-1 h-3 w-3" /> Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-medium">Languages Known</h3>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((lang) => {
            const langs: string[] = Array.isArray(form.languages) ? form.languages : [];
            const selected = langs.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => {
                  const next = selected ? langs.filter((l) => l !== lang) : [...langs, lang];
                  set("languages", next);
                }}
                className={`rounded-full border px-3 py-1 text-xs transition ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
              >
                {lang}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CriminalSection({ form, set }: { form: any; set: SetField }) {
  const ch = form.criminal_history ?? { has_history: false, incidents: [] };
  const hasHistory = !!ch.has_history;
  return (
    <div>
      <SectionHeader title="Criminal History" desc="Declaration of past criminal record" />
      <div className="mb-4 flex items-center gap-3 rounded-md border p-3">
        <Switch
          checked={hasHistory}
          onCheckedChange={(v) => {
            set("criminal_history", { ...ch, has_history: v, incidents: [] });
            if (v) set("no_hire", true);
          }}
        />
        <div>
          <p className="text-sm font-medium">Candidate has criminal history</p>
          <p className="text-xs text-muted-foreground">
            If turned on, the candidate is automatically marked Do-Not-Hire and cannot be onboarded.
          </p>
        </div>
      </div>
      {hasHistory && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <p className="font-semibold">Marked as Do-Not-Hire</p>
          <p className="mt-1 text-xs">
            This candidate has declared a criminal history and will not be processed further.
            Approval, onboarding and asset assignment are blocked.
          </p>
        </div>
      )}
    </div>
  );
}

const NOMINEE_SLOTS = [
  { key: "pf", label: "Provident Fund (PF)", enabledKey: "pf_enabled", defaultEnabled: true },
  { key: "eps", label: "Employees' Pension Scheme (EPS)", enabledKey: "eps_enabled", defaultEnabled: true },
  { key: "esic", label: "Employees' State Insurance (ESIC)", enabledKey: "esic_enabled", defaultEnabled: true },
  { key: "gratuity", label: "Gratuity", enabledKey: "gratuity_enabled", defaultEnabled: true },
] as const;

function contactKey(c: any, idx: number) {
  if (c?.id) return String(c.id);
  const name = (c?.name ?? "").trim();
  const mob = (c?.mobile ?? c?.phone ?? "").trim();
  return name || mob ? `${name}|${mob}` : `idx:${idx}`;
}

function contactLabel(c: any) {
  const name = (c?.name ?? "").trim() || "Unnamed contact";
  const rel = (c?.relation ?? "").trim();
  const mob = (c?.mobile ?? c?.phone ?? "").trim();
  const extra = [rel, mob].filter(Boolean).join(" · ");
  return extra ? `${name} (${extra})` : name;
}

type NomineeEntry = { contact: string; percent: number };

function normalizeSlot(v: any): NomineeEntry[] {
  if (!v) return [];
  if (typeof v === "string") return [{ contact: v, percent: 100 }];
  if (Array.isArray(v)) {
    return v
      .filter((e) => e && typeof e === "object")
      .map((e) => ({ contact: String(e.contact ?? ""), percent: Number(e.percent ?? 0) }));
  }
  return [];
}

function PercentInput({ value, disabled, onChange }: { value: number; disabled?: boolean; onChange: (n: number) => void }) {
  const [raw, setRaw] = useState<string>(String(value ?? 0));
  useEffect(() => {
    setRaw((prev) => (Number(prev) === Number(value) ? prev : String(value ?? 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      type="text"
      inputMode="numeric"
      className="w-20"
      disabled={disabled}
      value={raw}
      onChange={(ev) => {
        const v = ev.target.value.replace(/[^0-9]/g, "");
        setRaw(v);
        const n = v === "" ? 0 : Math.max(0, Math.min(100, Number(v)));
        onChange(n);
      }}
      onBlur={() => {
        if (raw === "") setRaw("0");
      }}
    />
  );
}

export function NomineeSection({ form, setSection }: { form: any; setSection: SetSection }) {
  const compliance = form.compliance ?? {};
  const contacts: any[] = Array.isArray(form.contacts) ? form.contacts : [];
  const rawNominees: Record<string, any> = compliance.nominees ?? {};

  const options = contacts
    .map((c, idx) => ({ key: contactKey(c, idx), label: contactLabel(c) }))
    .filter((o) => o.label && o.label !== "Unnamed contact" || true);

  const setSlot = (slot: string, entries: NomineeEntry[]) => {
    const next: Record<string, any> = { ...(rawNominees ?? {}) };
    if (entries.length === 0) delete next[slot];
    else next[slot] = entries;
    setSection("compliance", { nominees: next });
  };

  const noContacts = contacts.length === 0;

  return (
    <div>
      <SectionHeader
        title="Nominee"
        desc="Assign a nominee from your contacts to each statutory benefit. The same contact may be nominated for multiple benefits, or split across different contacts."
      />

      {noContacts ? (
        <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-6 text-center text-sm text-amber-800">
          Add at least one contact in the <span className="font-semibold">Contacts</span> section first.
          Nominees are picked from your candidate's contacts list.
        </div>
      ) : (
        <div className="space-y-3">
          {NOMINEE_SLOTS.map((s) => {
            const enabled = compliance[s.enabledKey] ?? s.defaultEnabled;
            const entries = normalizeSlot(rawNominees[s.key]);
            const total = entries.reduce((a, e) => a + (Number.isFinite(e.percent) ? e.percent : 0), 0);
            const balanced = entries.length === 0 || total === 100;
            return (
              <div key={s.key} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{s.label}</p>
                  {!enabled && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Disabled
                    </span>
                  )}
                </div>
                {entries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No nominees assigned.</p>
                ) : (
                  <div className="space-y-2">
                    {entries.map((e, i) => {
                      const stale = e.contact && !options.some((o) => o.key === e.contact);
                      const update = (patch: Partial<NomineeEntry>) => {
                        const copy = [...entries];
                        copy[i] = { ...copy[i], ...patch };
                        setSlot(s.key, copy);
                      };
                      return (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <div className="min-w-[200px] flex-1">
                            <Select
                              value={e.contact || undefined}
                              onValueChange={(v) => update({ contact: v })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select contact" />
                              </SelectTrigger>
                              <SelectContent>
                                {options.map((o) => (
                                  <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {stale && (
                              <p className="mt-1 text-[11px] text-amber-600">Contact no longer available.</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <PercentInput
                              value={e.percent}
                              onChange={(n) => update({ percent: n })}
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-rose-500"
                            onClick={() => setSlot(s.key, entries.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const remaining = Math.max(0, 100 - total);
                      setSlot(s.key, [...entries, { contact: "", percent: remaining }]);
                    }}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add nominee
                  </Button>
                  {entries.length > 0 && (
                    <span className={`text-xs ${balanced ? "text-muted-foreground" : "text-rose-600 font-medium"}`}>
                      Total: {total}%{balanced ? "" : " — must equal 100%"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


export function OtherSection({ form, setSection }: { form: any; setSection: SetSection }) {
  const o = form.other_info ?? {};
  return (
    <div>
      <SectionHeader title="Other Info" desc="Additional candidate-related notes" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Marital Anniversary"><Input type="date" value={o.anniversary ?? ""} onChange={(e) => setSection("other_info", { anniversary: e.target.value })} /></Field>
        <Field label="Spouse Name"><Input value={o.spouse_name ?? ""} onChange={(e) => setSection("other_info", { spouse_name: e.target.value })} /></Field>
        <Field label="Father's Name"><Input value={o.father_name ?? ""} onChange={(e) => setSection("other_info", { father_name: e.target.value })} /></Field>
        <Field label="Mother's Name"><Input value={o.mother_name ?? ""} onChange={(e) => setSection("other_info", { mother_name: e.target.value })} /></Field>
        <Field label="Vehicle Number"><Input value={o.vehicle_number ?? ""} onChange={(e) => setSection("other_info", { vehicle_number: e.target.value })} /></Field>
        <Field label="Driving License"><Input value={o.driving_license ?? ""} onChange={(e) => setSection("other_info", { driving_license: e.target.value })} /></Field>
      </div>
      <div className="mt-4">
        <Field label="Additional Notes"><Textarea rows={4} value={o.notes ?? ""} onChange={(e) => setSection("other_info", { notes: e.target.value })} /></Field>
      </div>
    </div>
  );
}

export function ListSection({
  title,
  description,
  items,
  onChange,
  empty,
  fields,
}: {
  title: string;
  description?: string;
  items: any[];
  onChange: (next: any[]) => void;
  empty: () => any;
  fields: { key: string; label: string; type?: string }[];
}) {
  return (
    <div>
      <SectionHeader title={title} desc={description} />
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{items.length} item(s)</p>
        <Button size="sm" variant="outline" onClick={() => onChange([...items, empty()])}>
          <Plus className="mr-1 h-3 w-3" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed py-8 text-center text-xs text-muted-foreground">
          No records yet. Click Add to create one.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={item.id ?? i} className="rounded-md border p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {fields.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Input
                      type={f.type ?? "text"}
                      value={item[f.key] ?? ""}
                      onChange={(e) => {
                        const copy = [...items];
                        copy[i] = { ...copy[i], [f.key]: e.target.value };
                        onChange(copy);
                      }}
                    />
                  </Field>
                ))}
              </div>
              <div className="mt-2 text-right">
                <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                  <Trash2 className="mr-1 h-3 w-3" /> Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function IdentificationSection({ form, set, setSection, hideWeapon = false }: { form: any; set: SetField; setSection: SetSection; hideWeapon?: boolean }) {
  const proofs: any[] = Array.isArray(form.identification_proofs) ? form.identification_proofs : [];
  const weapon = form.other_info?.weapon_license ?? { has_weapon: false, uan: "", number: "", valid_until: "", valid_area: "" };
  const uploaded = [
    { label: "Photo", url: form.photo_url },
    { label: "Aadhaar Card", url: form.aadhaar_image_url, number: form.aadhaar_number },
    { label: "PAN Card", url: form.pan_image_url, number: form.pan_number },
    { label: "Signature", url: form.signature_url },
  ];
  return (
    <div>
      <SectionHeader title="Identification Proofs" desc={hideWeapon ? "Uploaded documents and additional proofs" : "Uploaded documents, additional proofs and weapon license"} />
      <h3 className="mb-3 text-sm font-medium">Uploaded Documents</h3>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {uploaded.map((u) => (
          <div key={u.label} className="rounded-md border p-3 text-center">
            {u.url ? (
              <a href={u.url} target="_blank" rel="noreferrer" className="block">
                <img src={u.url} alt={u.label} className="mx-auto h-24 w-full rounded object-contain" />
              </a>
            ) : (
              <div className="flex h-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">Not uploaded</div>
            )}
            <p className="mt-2 text-xs font-medium">{u.label}</p>
            {u.number && <p className="text-[10px] text-muted-foreground">{u.number}</p>}
          </div>
        ))}
      </div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Additional Identification Documents</h3>
        <Button size="sm" variant="outline" onClick={() => set("identification_proofs", [...proofs, emptyProof()])}>
          <Plus className="mr-1 h-3 w-3" /> Add Another Document
        </Button>
      </div>
      {proofs.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
          No additional documents. Click "Add Another Document" to add Driving License, Passport, Voter ID, etc.
        </p>
      ) : (
        <div className="space-y-3">
          {proofs.map((p, i) => (
            <div key={p.id ?? i} className="rounded-md border p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Document Type">
                  <Select value={p.type ?? ""} onValueChange={(v) => { const copy = [...proofs]; copy[i] = { ...copy[i], type: v }; set("identification_proofs", copy); }}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {ID_PROOF_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Document Number">
                  <Input value={p.number ?? ""} onChange={(e) => { const copy = [...proofs]; copy[i] = { ...copy[i], number: e.target.value }; set("identification_proofs", copy); }} />
                </Field>
                <Field label="Issued By">
                  <Input value={p.issued_by ?? ""} onChange={(e) => { const copy = [...proofs]; copy[i] = { ...copy[i], issued_by: e.target.value }; set("identification_proofs", copy); }} />
                </Field>
                <Field label="Valid Until">
                  <Input type="date" value={p.valid_until ?? ""} onChange={(e) => { const copy = [...proofs]; copy[i] = { ...copy[i], valid_until: e.target.value }; set("identification_proofs", copy); }} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="File URL">
                    <Input value={p.url ?? ""} placeholder="https://..." onChange={(e) => { const copy = [...proofs]; copy[i] = { ...copy[i], url: e.target.value }; set("identification_proofs", copy); }} />
                  </Field>
                </div>
              </div>
              <div className="mt-2 text-right">
                <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => set("identification_proofs", proofs.filter((_, j) => j !== i))}>
                  <Trash2 className="mr-1 h-3 w-3" /> Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!hideWeapon && (
      <div className="mt-8">
        <h3 className="mb-3 text-sm font-medium">Weapon License</h3>
        <div className="mb-3 flex items-center gap-3 rounded-md border p-3">
          <Switch checked={!!weapon.has_weapon} onCheckedChange={(v) => setSection("other_info", { weapon_license: { ...weapon, has_weapon: v } })} />
          <div>
            <p className="text-sm font-medium">Candidate holds a weapon license</p>
            <p className="text-xs text-muted-foreground">Toggle on to record license details</p>
          </div>
        </div>
        {weapon.has_weapon && (
          <div className="grid grid-cols-1 gap-3 rounded-md border p-3 md:grid-cols-3">
            <Field label="UAN Number"><Input value={weapon.uan ?? ""} placeholder="Unique Arms Number" onChange={(e) => setSection("other_info", { weapon_license: { ...weapon, uan: e.target.value } })} /></Field>
            <Field label="License Number"><Input value={weapon.number ?? ""} onChange={(e) => setSection("other_info", { weapon_license: { ...weapon, number: e.target.value } })} /></Field>
            <Field label="Valid Until"><Input type="date" value={weapon.valid_until ?? ""} onChange={(e) => setSection("other_info", { weapon_license: { ...weapon, valid_until: e.target.value } })} /></Field>
            <Field label="Valid Area"><Input placeholder="e.g. Delhi NCR" value={weapon.valid_area ?? ""} onChange={(e) => setSection("other_info", { weapon_license: { ...weapon, valid_area: e.target.value } })} /></Field>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
