import {
  buildDocumentPageHtml,
  injectSignatureImages,
  isHtmlBody,
  isIdCardBody,
  expandIdCardBody,
  A4_WIDTH_PX,
} from "@/lib/company-documents";


/**
 * Renders a company document exactly as it will be printed.
 * HTML (statutory) templates render on a fixed A4 canvas with the same CSS the
 * PDF generator uses, so the preview matches the printed form 1:1.
 * Plain-text templates keep the legacy pre-formatted look.
 */
export function DocumentPreview({
  body,
  className = "",
  employeeSignatureUrl,
  companySignatureUrl,
}: {
  body: string;
  className?: string;
  employeeSignatureUrl?: string;
  companySignatureUrl?: string;
}) {
  if (!isHtmlBody(body)) {
    return (
      <pre
        className={`whitespace-pre-wrap rounded-md bg-secondary/40 p-4 font-sans text-sm leading-relaxed text-foreground ${className}`}
      >
        {body}
      </pre>
    );
  }

  const card = isIdCardBody(body);
  const html = buildDocumentPageHtml(
    injectSignatureImages(expandIdCardBody(body), employeeSignatureUrl, companySignatureUrl),
  );

  return (
    <div className={`overflow-auto rounded-md bg-secondary/40 p-3 ${className}`}>
      <div
        className={
          card
            ? "mx-auto w-fit origin-top"
            : "mx-auto w-fit origin-top scale-[0.85] shadow-lg sm:scale-100"
        }
      >
        <div
          style={card ? undefined : { width: A4_WIDTH_PX }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

