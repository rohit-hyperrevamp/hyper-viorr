import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

const baseClasses =
  "flex h-10 w-full rounded-lg border border-border/70 bg-card px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-accent/50 focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

const DateInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, value, defaultValue, onChange, disabled, name, id, placeholder, min, max, ...props }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [internal, setInternal] = React.useState<string>(
      typeof value === "string" ? value : typeof defaultValue === "string" ? defaultValue : "",
    );
    const hiddenRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => hiddenRef.current as HTMLInputElement);

    React.useEffect(() => {
      if (typeof value === "string") {
        setInternal(value);
      }
    }, [value]);

    const strValue = internal;
    const parsed = strValue ? parse(strValue, "yyyy-MM-dd", new Date()) : undefined;
    const selected = parsed && isValid(parsed) ? parsed : undefined;
    const display = selected ? format(selected, "dd/MM/yyyy") : "";

    const fireChange = (v: string) => {
      setInternal(v);
      const el = hiddenRef.current;
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        onChange?.({
          target: el,
          currentTarget: el,
        } as React.ChangeEvent<HTMLInputElement>);
      } else {
        onChange?.({
          target: { value: v, name, id } as EventTarget & HTMLInputElement,
          currentTarget: { value: v, name, id } as EventTarget & HTMLInputElement,
        } as React.ChangeEvent<HTMLInputElement>);
      }
    };

    const minDate = typeof min === "string" && min ? parse(min, "yyyy-MM-dd", new Date()) : undefined;
    const maxDate = typeof max === "string" && max ? parse(max, "yyyy-MM-dd", new Date()) : undefined;

    return (
      <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(baseClasses, "flex items-center justify-between text-left font-normal", !selected && "text-muted-foreground", className)}
          >
            <span>{display || placeholder || "dd/mm/yyyy"}</span>
            <CalendarIcon className="ml-2 h-4 w-4 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden border-0 bg-transparent p-0 pointer-events-auto shadow-none"
          align="start"
          collisionPadding={16}
        >
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? new Date()}
            captionLayout="dropdown"
            startMonth={minDate ?? new Date(new Date().getFullYear() - 100, 0)}
            endMonth={maxDate ?? new Date(new Date().getFullYear() + 50, 11)}
            className="text-sm"
            onSelect={(d) => {
              if (d) {
                fireChange(format(d, "yyyy-MM-dd"));
                setOpen(false);
              } else {
                fireChange("");
              }
            }}
            disabled={
              minDate || maxDate
                ? (date) => (minDate && date < minDate) || (maxDate && date > maxDate) || false
                : undefined
            }
          />
        </PopoverContent>
        <input
          ref={hiddenRef}
          type="hidden"
          name={name}
          id={id}
          value={strValue}
          onChange={onChange}
          {...props}
        />
      </Popover>
    );
  },
);
DateInput.displayName = "DateInput";

const DECIMAL_RE = /^-?\d*\.?\d*$/;

const NumberInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, value, defaultValue, onChange, onBlur, ...props }, ref) => {
    const toStr = (v: unknown) =>
      v === undefined || v === null || (typeof v === "number" && Number.isNaN(v)) ? "" : String(v);
    const [draft, setDraft] = React.useState<string>(() =>
      value !== undefined ? toStr(value) : toStr(defaultValue),
    );

    React.useEffect(() => {
      if (value === undefined) return;
      const incoming = toStr(value);
      // Avoid clobbering an in-progress decimal like "1." when parent echoes 1
      if (parseFloat(incoming) !== parseFloat(draft) || (draft === "" && incoming !== "")) {
        setDraft(incoming);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (v !== "" && !DECIMAL_RE.test(v)) return;
      setDraft(v);
      onChange?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (draft.endsWith(".") || draft === "-" || draft === "-.") {
        const cleaned = draft.replace(/\.$/, "").replace(/^-\.?$/, "");
        setDraft(cleaned);
      }
      onBlur?.(e);
    };

    return (
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(baseClasses, className)}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";

export type InputFormat =
  | "pan"
  | "gstin"
  | "aadhaar"
  | "uan"
  | "esic"
  | "mobile"
  | "ifsc"
  | "pincode";

type FormatSpec = {
  sanitize: (v: string) => string;
  validate: (v: string) => boolean;
  maxLength: number;
  inputMode: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder: string;
  mono: boolean;
  title: string;
};

const L = /[A-Z]/;
const D = /[0-9]/;
const ALNUM = /[A-Z0-9]/;
const NZ_ALNUM = /[1-9A-Z]/;
const Z_ONLY = /Z/;
const ZERO_ONLY = /0/;
const NZ_DIGIT = /[1-9]/;
const MOB_FIRST = /[6-9]/;
const AADH_FIRST = /[2-9]/;

// Position-aware sanitiser: walks the input and only keeps chars that match
// the regex at the *current accepted position*, so a wrong-class character
// (e.g. a digit where a letter is required) is rejected instead of appended.
const bySlot = (slots: RegExp[], raw: string): string => {
  const src = (raw ?? "").toUpperCase();
  let out = "";
  for (const ch of src) {
    if (out.length >= slots.length) break;
    if (slots[out.length].test(ch)) out += ch;
  }
  return out;
};

const PAN_SLOTS = [L, L, L, L, L, D, D, D, D, L];
const GSTIN_SLOTS = [D, D, L, L, L, L, L, D, D, D, D, L, NZ_ALNUM, Z_ONLY, ALNUM];
const IFSC_SLOTS = [L, L, L, L, ZERO_ONLY, ALNUM, ALNUM, ALNUM, ALNUM, ALNUM, ALNUM];
const MOBILE_SLOTS = [MOB_FIRST, D, D, D, D, D, D, D, D, D];
const AADHAAR_SLOTS = [AADH_FIRST, D, D, D, D, D, D, D, D, D, D, D];
const PINCODE_SLOTS = [NZ_DIGIT, D, D, D, D, D];
const UAN_SLOTS = Array.from({ length: 12 }, () => D);
const ESIC_SLOTS = Array.from({ length: 17 }, () => D);

const FORMAT_SPECS: Record<InputFormat, FormatSpec> = {
  pan: {
    sanitize: (v) => bySlot(PAN_SLOTS, v),
    validate: (v) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v),
    maxLength: 10,
    inputMode: "text",
    placeholder: "ABCDE1234F",
    mono: true,
    title: "PAN must be 10 chars: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)",
  },
  gstin: {
    sanitize: (v) => bySlot(GSTIN_SLOTS, v),
    validate: (v) =>
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v),
    maxLength: 15,
    inputMode: "text",
    placeholder: "22ABCDE1234F1Z5",
    mono: true,
    title: "GSTIN must be 15 chars: 2-digit state + 10-char PAN + entity + Z + checksum",
  },
  aadhaar: {
    sanitize: (v) => bySlot(AADHAAR_SLOTS, v),
    validate: (v) => /^[2-9]\d{11}$/.test(v),
    maxLength: 12,
    inputMode: "numeric",
    placeholder: "12-digit Aadhaar",
    mono: true,
    title: "Aadhaar must be 12 digits (cannot start with 0 or 1)",
  },
  uan: {
    sanitize: (v) => bySlot(UAN_SLOTS, v),
    validate: (v) => /^\d{12}$/.test(v),
    maxLength: 12,
    inputMode: "numeric",
    placeholder: "12-digit UAN",
    mono: true,
    title: "UAN must be exactly 12 digits",
  },
  esic: {
    sanitize: (v) => bySlot(ESIC_SLOTS, v),
    validate: (v) => /^\d{17}$/.test(v),
    maxLength: 17,
    inputMode: "numeric",
    placeholder: "17-digit ESIC IP",
    mono: true,
    title: "ESIC IP number must be exactly 17 digits",
  },
  mobile: {
    sanitize: (v) => bySlot(MOBILE_SLOTS, v),
    validate: (v) => /^[6-9]\d{9}$/.test(v),
    maxLength: 10,
    inputMode: "tel",
    placeholder: "10-digit mobile",
    mono: false,
    title: "Mobile must be 10 digits starting with 6-9",
  },
  ifsc: {
    sanitize: (v) => bySlot(IFSC_SLOTS, v),
    validate: (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v),
    maxLength: 11,
    inputMode: "text",
    placeholder: "SBIN0001234",
    mono: true,
    title: "IFSC must be 11 chars: 4 letters + 0 + 6 alphanumerics",
  },
  pincode: {
    sanitize: (v) => bySlot(PINCODE_SLOTS, v),
    validate: (v) => /^[1-9]\d{5}$/.test(v),
    maxLength: 6,
    inputMode: "numeric",
    placeholder: "6-digit PIN",
    mono: false,
    title: "Pincode must be 6 digits (cannot start with 0)",
  },
};

type FormattedInputProps = React.ComponentProps<"input"> & { format: InputFormat };

const FormattedInput = React.forwardRef<HTMLInputElement, FormattedInputProps>(
  ({ className, format, onChange, onBlur, value, placeholder, title, ...props }, ref) => {
    const spec = FORMAT_SPECS[format];
    const [touched, setTouched] = React.useState(false);
    const str = value == null ? "" : String(value);
    const invalid = touched && str.length > 0 && !spec.validate(str);

    return (
      <input
        {...props}
        ref={ref}
        type="text"
        value={value as never}
        inputMode={spec.inputMode}
        maxLength={spec.maxLength}
        placeholder={placeholder ?? spec.placeholder}
        title={title ?? spec.title}
        aria-invalid={invalid || undefined}
        autoCapitalize={spec.mono ? "characters" : undefined}
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => {
          const cleaned = spec.sanitize(e.target.value);
          if (cleaned !== e.target.value) {
            e.target.value = cleaned;
          }
          onChange?.(e);
        }}
        onBlur={(e) => {
          setTouched(true);
          onBlur?.(e);
        }}
        className={cn(
          baseClasses,
          spec.mono && "font-mono tracking-wide uppercase placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground/60",
          invalid &&
            "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
          className,
        )}
      />
    );
  },
);
FormattedInput.displayName = "FormattedInput";

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { format?: InputFormat }
>(({ className, type, format, ...props }, ref) => {
  if (format) {
    return <FormattedInput className={className} format={format} {...props} ref={ref} />;
  }
  if (type === "date") {
    return <DateInput className={className} {...props} ref={ref} />;
  }
  if (type === "number") {
    return <NumberInput className={className} {...props} ref={ref} />;
  }
  return <input type={type} className={cn(baseClasses, className)} ref={ref} {...props} />;
});
Input.displayName = "Input";

export { Input };
