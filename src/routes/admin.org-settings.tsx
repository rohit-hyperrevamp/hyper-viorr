import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useOrgSettings } from "@/lib/org-settings";
import { logActivity } from "@/lib/activity-log";

export const Route = createFileRoute("/admin/org-settings")({
  component: OrgSettingsPage,
});

function OrgSettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useOrgSettings();
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState("");
  const [stateCode, setStateCode] = useState("");

  useEffect(() => {
    if (!data) return;
    setName(data.company_name ?? "");
    setGstin(data.company_gstin ?? "");
    setState(data.company_state ?? "");
    setStateCode(data.company_state_code ?? "");
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        company_name: name.trim() || null,
        company_gstin: gstin.trim() || null,
        company_state: state.trim() || null,
        company_state_code: stateCode.trim() || null,
      };
      if (data?.id) {
        const { error } = await supabase
          .from("org_settings" as never)
          .update(payload as never)
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("org_settings" as never)
          .insert(payload as never);
        if (error) throw error;
      }
      void logActivity({
        module: "Company Settings",
        action: "update",
        entityType: "org_settings",
        entityId: data?.id,
        entityLabel: name,
        details: payload,
      });
    },
    onSuccess: () => {
      toast.success("Company settings saved");
      void qc.invalidateQueries({ queryKey: ["org_settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <div>
      <PageHeader
        title="Company Settings"
        description="Company name, GSTIN and state — used by invoicing to split GST into CGST+SGST (same state) or IGST (inter-state)."
        crumbs={[{ label: "Control Center", to: "/admin/control-center" }, { label: "Company Settings" }]}
      />

      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold">Registered entity</div>
            <div className="text-sm text-muted-foreground">These values appear on every invoice.</div>
          </div>
        </div>

        <div className="grid gap-4">
          <div>
            <Label>Company Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hyper Viorr" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>GSTIN</Label>
              <Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="27AABCU1234R1Z5" maxLength={15} />
            </div>
            <div>
              <Label>State Code</Label>
              <Input value={stateCode} onChange={(e) => setStateCode(e.target.value)} placeholder="27" maxLength={2} />
            </div>
          </div>
          <div>
            <Label>State</Label>
            <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="Maharashtra" />
            <p className="mt-1 text-xs text-muted-foreground">
              Invoices to customers in this state → CGST + SGST. Other states → IGST.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || isLoading}>
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
