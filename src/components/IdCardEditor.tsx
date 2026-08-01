import { useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DocumentPreview } from "@/components/DocumentPreview";
import {
  absoluteAssetUrl,
  PLACEHOLDERS,
  previewPlaceholderMap,
  renderTemplate,
  serializeIdCardSpec,
  type IdCardSpec,
} from "@/lib/company-documents";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function LineList({
  label,
  lines,
  onChange,
}: {
  label: string;
  lines: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {lines.map((l, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={l}
            onChange={(e) => onChange(lines.map((x, j) => (j === i ? e.target.value : x)))}
            className="h-8 text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-fit text-xs"
        onClick={() => onChange([...lines, ""])}
      >
        <Plus className="mr-1 h-3 w-3" /> Add line
      </Button>
    </div>
  );
}

/**
 * Form-based editor for the employee ID card master template.
 * Every label, line, logo and size is a plain text box; the values that come
 * from the employee profile stay as $placeholders picked from a dropdown.
 */
export function IdCardEditor({
  spec,
  onChange,
}: {
  spec: IdCardSpec;
  onChange: (next: IdCardSpec) => void;
}) {
  const set = (patch: Partial<IdCardSpec>) => onChange({ ...spec, ...patch });
  const setFront = (patch: Partial<IdCardSpec["front"]>) => set({ front: { ...spec.front, ...patch } });
  const setFooter = (patch: Partial<IdCardSpec["footer"]>) => set({ footer: { ...spec.footer, ...patch } });

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadLogo(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `id-card-logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("org-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("org-logos").getPublicUrl(path);
      set({ logoUrl: data.publicUrl });
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Logo upload failed");
    } finally {
      setUploading(false);
    }
  }

  const previewBody = renderTemplate(serializeIdCardSpec(spec), previewPlaceholderMap(true));


  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
      <div className="space-y-3">
        <Section title="Logo">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
              {spec.logoUrl ? (
                <img src={absoluteAssetUrl(spec.logoUrl)} alt="ID card logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Logo</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-3 w-3" />
                  )}
                  {spec.logoUrl ? "Replace logo" : "Upload logo"}
                </Button>
                {spec.logoUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => set({ logoUrl: "" })}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void uploadLogo(f);
                }}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Logo height (px)</Label>
            <Input
              type="number"
              value={spec.frontLogoHeight}
              onChange={(e) => set({ frontLogoHeight: Number(e.target.value) || 0 })}
              className="h-8 text-xs"
            />
          </div>
        </Section>

        <Section title="Front card">
          <div className="grid gap-1.5">
            <Label className="text-xs">Company name</Label>
            <Input
              value={spec.front.companyName}
              onChange={(e) => setFront({ companyName: e.target.value })}
              className="h-8 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={spec.front.showPhoto} onCheckedChange={(v) => setFront({ showPhoto: v })} />
              Employee photo
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={spec.front.showPhotoStamp}
                onCheckedChange={(v) => setFront({ showPhotoStamp: v })}
              />
              Stamp over photo
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={spec.front.showAuthoritySignature}
                onCheckedChange={(v) => setFront({ showAuthoritySignature: v })}
              />
              Authority signature
            </label>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Detail rows — label is free text, value comes from the employee</Label>
            {spec.front.fields.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  value={f.label}
                  placeholder="Label"
                  onChange={(e) =>
                    setFront({
                      fields: spec.front.fields.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                  className="h-8 w-[38%] text-xs"
                />
                <select
                  value={f.value}
                  onChange={(e) =>
                    setFront({
                      fields: spec.front.fields.map((x, j) =>
                        j === i ? { ...x, value: e.target.value } : x,
                      ),
                    })
                  }
                  className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {!PLACEHOLDERS.some((p) => `$${p.key}` === f.value) && (
                    <option value={f.value}>{f.value || "— fixed text —"}</option>
                  )}
                  {PLACEHOLDERS.map((p) => (
                    <option key={p.key} value={`$${p.key}`}>
                      {p.label} (${p.key})
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setFront({ fields: spec.front.fields.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-fit text-xs"
              onClick={() =>
                setFront({ fields: [...spec.front.fields, { label: "New field", value: "$employee_name" }] })
              }
            >
              <Plus className="mr-1 h-3 w-3" /> Add row
            </Button>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Signature caption</Label>
            <Input
              value={spec.front.authorityLabel}
              onChange={(e) => setFront({ authorityLabel: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
        </Section>

        <Section title="Address, contact & validity (printed on the front)">
          <div className="grid gap-1.5">
            <Label className="text-xs">Address heading</Label>
            <Input
              value={spec.footer.addressTitle}
              onChange={(e) => setFooter({ addressTitle: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
          <LineList
            label="Address lines"
            lines={spec.footer.addressLines}
            onChange={(addressLines) => setFooter({ addressLines })}
          />
          <LineList
            label="Phone / mobile lines"
            lines={spec.footer.contactLines}
            onChange={(contactLines) => setFooter({ contactLines })}
          />
          <div className="grid gap-1.5">
            <Label className="text-xs">Validity line</Label>
            <Input
              value={spec.footer.validityLine}
              onChange={(e) => setFooter({ validityLine: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
        </Section>
      </div>

      <div className="lg:sticky lg:top-2 lg:h-fit">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Live preview
        </p>
        <DocumentPreview body={previewBody} />
      </div>
    </div>
  );
}
