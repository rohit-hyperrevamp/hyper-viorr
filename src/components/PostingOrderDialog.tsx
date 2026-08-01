import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentPreview } from "@/components/DocumentPreview";
import { logActivity } from "@/lib/activity-log";
import { sendPostingOrderEmail } from "@/lib/posting-order.functions";
import {
  EMPTY_POSTING_DETAILS,
  POSTING_ORDER_EMAIL_SUBJECT,
  buildDocumentPageHtml,
  buildPlaceholderMap,
  fetchActiveTemplate,
  fetchCandidateForRender,
  isHtmlBody,
  renderTemplate,
  withPostingPlaceholders,
  type PostingDetails,
} from "@/lib/company-documents";

const MODULE = "Company Documents";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(v: string) {
  if (!v) return "";
  try {
    return new Date(v).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return v;
  }
}

export function PostingOrderDialog({
  open,
  onOpenChange,
  candidateId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidateId: string;
}) {
  const [form, setForm] = useState<PostingDetails>({
    ...EMPTY_POSTING_DETAILS,
    posting_date: todayIso(),
    reporting_date: todayIso(),
  });
  const [sending, setSending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["posting-order-context", candidateId],
    enabled: open,
    queryFn: async () => {
      const [candidate, doc, email, wa] = await Promise.all([
        fetchCandidateForRender(candidateId),
        fetchActiveTemplate("posting_order"),
        fetchActiveTemplate("posting_order_email"),
        fetchActiveTemplate("posting_order_whatsapp"),
      ]);
      return { candidate, doc, email, wa };
    },
  });

  // Pre-fill the site block from the employee's current unit.
  useEffect(() => {
    if (!open || !data?.candidate) return;
    setForm((f) => ({
      ...f,
      site_name: f.site_name || data.candidate.unit_name || "",
      client_name: f.client_name || data.candidate.unit_name || "",
      posting_order_no:
        f.posting_order_no ||
        `PO-${new Date().getFullYear()}-${(data.candidate.employee_code || data.candidate.candidate_code || "").replace(/\D/g, "").slice(-4) || "0001"}`,
    }));
  }, [open, data?.candidate]);

  const posting = useMemo(
    () => ({
      ...form,
      posting_date: fmtDate(form.posting_date),
      reporting_date: fmtDate(form.reporting_date),
    }),
    [form],
  );

  const rendered = useMemo(() => {
    if (!data?.candidate) return { doc: "", email: "", wa: "", subject: "" };
    const base = (html: boolean) =>
      withPostingPlaceholders(buildPlaceholderMap(data.candidate, html), posting);
    const docBody = data.doc?.body ?? "";
    const emailBody = data.email?.body ?? "";
    const waBody = data.wa?.body ?? "";
    return {
      doc: docBody ? renderTemplate(docBody, base(isHtmlBody(docBody))) : "",
      email: emailBody ? renderTemplate(emailBody, base(isHtmlBody(emailBody))) : "",
      wa: waBody ? renderTemplate(waBody, base(false)) : "",
      subject: renderTemplate(POSTING_ORDER_EMAIL_SUBJECT, base(false)),
    };
  }, [data, posting]);

  const employeeEmail = data?.candidate.email ?? "";

  async function send() {
    if (!rendered.email) {
      toast.error("No active Posting Order email template — create one in Company Documents.");
      return;
    }
    if (!employeeEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(employeeEmail)) {
      toast.error("This employee has no valid email address on their profile.");
      return;
    }
    setSending(true);
    try {
      const html = `${buildDocumentPageHtml(rendered.email)}${
        rendered.doc ? `<hr/>${buildDocumentPageHtml(rendered.doc)}` : ""
      }`;
      await sendPostingOrderEmail({
        data: {
          to: employeeEmail,
          subject: rendered.subject,
          html,
          ...(rendered.wa ? { text: rendered.wa } : {}),
        },
      });
      void logActivity({
        module: MODULE,
        action: "Send posting order email",
        entityType: "candidates",
        entityId: candidateId,
        entityLabel: data?.candidate.full_name ?? "",
        details: { to: employeeEmail, posting_order_no: form.posting_order_no },
      });
      toast.success(`Posting order emailed to ${employeeEmail}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the posting order email");
    } finally {
      setSending(false);
    }
  }

  const field = (key: keyof PostingDetails, label: string, type = "text") => (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-amber-600" /> Issue Posting Order
          </DialogTitle>
          <DialogDescription>
            Fill the site deputation details, preview the order, and email it to the employee.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="space-y-2.5">
              {field("posting_order_no", "Posting Order No.")}
              {field("posting_date", "Order Date", "date")}
              {field("client_name", "Client Name")}
              {field("site_name", "Site / Branch")}
              {field("site_address", "Site Address")}
              {field("reporting_date", "Date of Reporting", "date")}
              {field("reporting_time", "Reporting Time")}
              {field("duty_shift", "Duty Shift / Timing")}
              {field("site_supervisor", "Site Supervisor / Reporting Officer")}
              {field("authorised_signatory", "Authorised Signatory")}
              {field("signatory_designation", "Signatory Designation")}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Sending to: <b>{employeeEmail || "no email on profile"}</b>
              </p>
            </div>

            <Tabs defaultValue="doc">
              <TabsList>
                <TabsTrigger value="doc">Document</TabsTrigger>
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="wa">WhatsApp</TabsTrigger>
              </TabsList>
              <TabsContent value="doc">
                {rendered.doc ? (
                  <DocumentPreview body={rendered.doc} className="max-h-[58vh]" />
                ) : (
                  <Empty label="Posting Order" />
                )}
              </TabsContent>
              <TabsContent value="email">
                {rendered.email ? (
                  <DocumentPreview body={rendered.email} className="max-h-[58vh]" />
                ) : (
                  <Empty label="Posting Order — Email Template" />
                )}
              </TabsContent>
              <TabsContent value="wa">
                {rendered.wa ? (
                  <div className="space-y-2">
                    <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap rounded-md bg-secondary/40 p-4 font-sans text-sm">
                      {rendered.wa}
                    </pre>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(rendered.wa);
                        toast.success("WhatsApp message copied");
                      }}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy message
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      WhatsApp delivery activates once the WhatsApp Business API is purchased.
                    </p>
                  </div>
                ) : (
                  <Empty label="Posting Order — WhatsApp Template" />
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending || isLoading}>
            {sending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-1.5 h-4 w-4" />
            )}
            Send by email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      No active “{label}” template. Create it under Control Center → Company Documents.
    </div>
  );
}
