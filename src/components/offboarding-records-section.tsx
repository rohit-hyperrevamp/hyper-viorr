import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/candidate-extra-sections";
import { ExternalLink, FileText, Package, ImageOff } from "lucide-react";

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium break-words">{value === "" || value == null ? "—" : value}</div>
    </div>
  );
}

export function OffboardingRecordsSection({ details, hideHeader = false }: { details: any; hideHeader?: boolean }) {
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  const d = details && typeof details === "object" ? details : {};
  const docs: any[] = Array.isArray(d.exit_documents) ? d.exit_documents : [];
  const returns: any[] = Array.isArray(d.inventory_returns) ? d.inventory_returns : [];
  const notes: any[] = Array.isArray(d.exit_asset_notes) ? d.exit_asset_notes : [];
  const hasAny = docs.length > 0 || returns.length > 0 || notes.length > 0 || Object.keys(d).length > 0;

  if (!hasAny) {
    return (
      <div className="space-y-4">
        {!hideHeader && <SectionHeader title="Offboarding Records" desc="Exit documents and asset collection history." />}
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No offboarding record for this employee.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!hideHeader && (
        <SectionHeader
          title="Offboarding Records"
          desc="Exit documents, asset collection and settlement history — retained for re-onboarding."
        />
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <InfoRow label="Resignation date" value={fmtDate(d.date_of_resignation)} />
        <InfoRow label="Last working day" value={fmtDate(d.date_of_last_working)} />
        <InfoRow label="Offboarded on" value={fmtDate(d.date_of_offboarding)} />
        <InfoRow
          label="Collection status"
          value={
            d.collection_status ? (
              <Badge variant={d.collection_status === "completed" ? "default" : "secondary"} className="capitalize">
                {String(d.collection_status).replace(/_/g, " ")}
              </Badge>
            ) : (
              "—"
            )
          }
        />
        <InfoRow label="Exit reason" value={d.reason_text} />
        <InfoRow label="Exit rating" value={d.rating ? `${d.rating}/5` : "—"} />
        <InfoRow label="PF updated" value={fmtDate(d.date_of_pf_update)} />
        <InfoRow label="ESIC updated" value={fmtDate(d.date_of_esic_update)} />
      </div>

      {(d.review || d.rating_remarks) && (
        <div className="rounded-lg border p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Exit review</div>
          <p className="text-sm">{d.review || d.rating_remarks}</p>
        </div>
      )}

      {/* Documents */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4" /> Exit documents ({docs.length})
        </div>
        {docs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No documents uploaded.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((doc, i) => (
              <div key={doc.key ?? i} className="overflow-hidden rounded-xl border bg-card">
                <button
                  type="button"
                  className="block w-full bg-muted/40"
                  onClick={() => doc.file_url && setPreview({ url: doc.file_url, label: doc.label ?? doc.key })}
                >
                  {doc.file_url ? (
                    <img
                      src={doc.file_url}
                      alt={doc.label ?? "Exit document"}
                      loading="lazy"
                      className="h-40 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-6 w-6" />
                    </div>
                  )}
                </button>
                <div className="space-y-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{doc.label ?? doc.key}</span>
                    <Badge variant={doc.collected ? "default" : "secondary"}>
                      {doc.collected ? "Collected" : "Pending"}
                    </Badge>
                  </div>
                  {doc.reason ? <p className="text-xs text-muted-foreground">{doc.reason}</p> : null}
                  {doc.file_url ? (
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open original <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assets */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Package className="h-4 w-4" /> Assets held &amp; recovered
        </div>
        {notes.length === 0 && returns.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No assets recorded.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-left">Size</th>
                  <th className="px-3 py-2 text-right">Held</th>
                  <th className="px-3 py-2 text-right">Collected</th>
                  <th className="px-3 py-2 text-left">Returned to</th>
                  <th className="px-3 py-2 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((n, i) => {
                  const ret = returns.find(
                    (r) => r.item_id === n.item_id && (r.size_value ?? "") === (n.size_value ?? ""),
                  );
                  return (
                    <tr key={`${n.item_id}-${i}`} className="border-t">
                      <td className="px-3 py-2 font-medium">{n.item_name ?? "—"}</td>
                      <td className="px-3 py-2">{n.size_value || "—"}</td>
                      <td className="px-3 py-2 text-right">{n.held ?? 0}</td>
                      <td className="px-3 py-2 text-right">{ret?.qty_returned ?? n.collected ?? 0}</td>
                      <td className="px-3 py-2">{ret?.destination_label ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{n.reason || ret?.remarks || "—"}</td>
                    </tr>
                  );
                })}
                {returns
                  .filter((r) => !notes.some((n) => n.item_id === r.item_id && (n.size_value ?? "") === (r.size_value ?? "")))
                  .map((r, i) => (
                    <tr key={`ret-${r.item_id}-${i}`} className="border-t">
                      <td className="px-3 py-2 font-medium">{r.item_name ?? "—"}</td>
                      <td className="px-3 py-2">{r.size_value || "—"}</td>
                      <td className="px-3 py-2 text-right">{r.on_hand ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{r.qty_returned ?? 0}</td>
                      <td className="px-3 py-2">{r.destination_label ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.remarks || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {d.pending_collection_fo_name ? (
          <p className="text-xs text-muted-foreground">
            Collection handled by {d.pending_collection_fo_name}
            {d.collection_completed_at ? ` · completed ${fmtDate(d.collection_completed_at)}` : ""}
          </p>
        ) : null}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.label}</DialogTitle>
          </DialogHeader>
          {preview ? (
            <div className="space-y-3">
              <img src={preview.url} alt={preview.label} className="max-h-[70vh] w-full rounded-lg object-contain" />
              <Button asChild variant="outline" size="sm">
                <a href={preview.url} target="_blank" rel="noreferrer">
                  Open in new tab
                </a>
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default OffboardingRecordsSection;
