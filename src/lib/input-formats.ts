// Indian field format helpers — keep one source of truth for sanitisers/validators.

export const digitsOnly = (v: string, max?: number) => {
  const d = (v ?? "").replace(/\D/g, "");
  return max ? d.slice(0, max) : d;
};

export const upperAlnum = (v: string, max?: number) => {
  const u = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return max ? u.slice(0, max) : u;
};

// Mobile / phone — 10 digits, leading 6-9 valid
export const sanitizeMobile = (v: string) => digitsOnly(v, 10);
export const isValidMobile = (v: string) => /^[6-9]\d{9}$/.test((v ?? "").trim());

// Aadhaar — 12 digits, cannot start with 0 or 1 (UIDAI rule)
export const sanitizeAadhaar = (v: string) => digitsOnly(v, 12);
export const isValidAadhaar = (v: string) => /^[2-9]\d{11}$/.test((v ?? "").trim());

// PAN — AAAAA9999A (5 letters + 4 digits + 1 letter)
export const sanitizePan = (v: string) => upperAlnum(v, 10);
export const isValidPan = (v: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test((v ?? "").trim().toUpperCase());

// GSTIN — 15 chars, 2 digits + 10 char PAN + 1 entity + Z + 1 checksum
export const sanitizeGstin = (v: string) => upperAlnum(v, 15);
export const isValidGstin = (v: string) =>
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test((v ?? "").trim().toUpperCase());

// UAN — 12 digits (EPFO Universal Account Number), always starts with 1
export const sanitizeUan = (v: string) => digitsOnly(v, 12);
export const isValidUan = (v: string) => /^1\d{11}$/.test((v ?? "").trim());

// ESIC insurance number — 17 digits
export const sanitizeEsic = (v: string) => digitsOnly(v, 17);
export const isValidEsic = (v: string) => /^\d{17}$/.test((v ?? "").trim());

// IFSC — 11 chars: 4 letters + '0' + 6 alnum
export const sanitizeIfsc = (v: string) => upperAlnum(v, 11);
export const isValidIfsc = (v: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test((v ?? "").trim().toUpperCase());

// Pincode — 6 digits, cannot start with 0
export const sanitizePincode = (v: string) => digitsOnly(v, 6);
export const isValidPincode = (v: string) => /^[1-9]\d{5}$/.test((v ?? "").trim());
