import { useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtINR } from "@/lib/payroll-calc";

export type InvoicePreviewLine = {
  id: string;
  description: string;
  qtyLabel: string;
  amount: number;
};

export type InvoicePreviewData = {
  invoiceNumber: string;
  invoiceDate: string;
  periodLabel: string;
  companyName: string;
  companyGstin: string;
  companyState: string;
  customerName: string;
  customerGstin: string;
  billingAddress: string[];
  unitLabel: string;
  lines: InvoicePreviewLine[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
};

/** Amount in words (Indian numbering), used on the printed tax invoice. */
function amountInWords(value: number): string {
  const n = Math.round(value);
  if (n === 0) return "Zero Rupees Only";
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number): string =>
    x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ""}`;
  const three = (x: number): string =>
    x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${two(x % 100)}` : ""}` : two(x);
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${three(lakh)} Lakh`);
  if (thousand) parts.push(`${three(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  return `${parts.join(" ")} Rupees Only`;
}

export function InvoicePreviewDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: InvoicePreviewData;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);

  const print = () => {
    const html = sheetRef.current?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${data.invoiceNumber}</title>
      <style>
        *{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;}
        body{margin:24px;color:#111;font-size:12px;}
        table{width:100%;border-collapse:collapse;}
        th,td{border:1px solid #d4d4d8;padding:6px 8px;}
        th{background:#f4f4f5;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;}
        .right{text-align:right;}
        .muted{color:#71717a;}
        .title{font-size:18px;font-weight:700;}
        .grid{display:flex;gap:16px;}
        .grid > div{flex:1;}
        .totals{width:280px;margin-left:auto;margin-top:12px;}
      </style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tax invoice preview</DialogTitle>
          <DialogDescription>
            Generated from approved attendance for {data.periodLabel}. Print or save as PDF.
          </DialogDescription>
        </DialogHeader>

        <div ref={sheetRef} className="rounded-2xl border border-border/70 bg-background p-5 text-[12px]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="title text-base font-bold">{data.companyName}</div>
              <div className="muted text-muted-foreground">GSTIN: {data.companyGstin || "—"}</div>
              <div className="muted text-muted-foreground">State: {data.companyState}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold uppercase tracking-[0.14em]">Tax invoice</div>
              <div className="muted text-muted-foreground">No. {data.invoiceNumber}</div>
              <div className="muted text-muted-foreground">Date: {data.invoiceDate}</div>
              <div className="muted text-muted-foreground">Period: {data.periodLabel}</div>
            </div>
          </div>

          <div className="grid mt-4 flex gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Bill to
              </div>
              <div className="font-semibold">{data.customerName}</div>
              {data.billingAddress.filter(Boolean).map((l) => (
                <div key={l} className="muted text-muted-foreground">
                  {l}
                </div>
              ))}
              <div className="muted text-muted-foreground">GSTIN: {data.customerGstin || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Place of supply / site
              </div>
              <div className="font-semibold">{data.unitLabel}</div>
            </div>
          </div>

          <table className="mt-4 w-full">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Qty</th>
                <th className="right text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l, i) => (
                <tr key={l.id}>
                  <td>{i + 1}</td>
                  <td>{l.description}</td>
                  <td>{l.qtyLabel}</td>
                  <td className="right text-right tabular-nums">{fmtINR(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="totals mt-3 w-[280px] md:ml-auto">
            <tbody>
              <tr>
                <td>Taxable value</td>
                <td className="right text-right tabular-nums">{fmtINR(data.subtotal)}</td>
              </tr>
              {data.igst > 0 ? (
                <tr>
                  <td>IGST 18%</td>
                  <td className="right text-right tabular-nums">{fmtINR(data.igst)}</td>
                </tr>
              ) : (
                <>
                  <tr>
                    <td>CGST 9%</td>
                    <td className="right text-right tabular-nums">{fmtINR(data.cgst)}</td>
                  </tr>
                  <tr>
                    <td>SGST 9%</td>
                    <td className="right text-right tabular-nums">{fmtINR(data.sgst)}</td>
                  </tr>
                </>
              )}
              <tr>
                <td className="font-semibold">Grand total</td>
                <td className="right text-right font-semibold tabular-nums">{fmtINR(data.grandTotal)}</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-3 text-[11px]">
            <span className="muted text-muted-foreground">Amount in words: </span>
            <span className="font-medium">{amountInWords(data.grandTotal)}</span>
          </div>

          <div className="mt-6 flex items-end justify-between text-[11px]">
            <div className="muted text-muted-foreground">
              Computed from approved attendance. Subject to contract terms.
            </div>
            <div className="text-right">
              <div className="h-10" />
              <div className="border-t border-border pt-1">Authorised signatory</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={print}>
            <Printer className="mr-1.5 h-4 w-4" /> Print / Save PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
