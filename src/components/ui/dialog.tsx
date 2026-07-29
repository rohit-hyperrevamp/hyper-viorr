"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { confirmAction } from "@/components/ConfirmProvider";

const DialogPortalContainerContext = React.createContext<HTMLElement | null>(null);

export function useDialogPortalContainer() {
  return React.useContext(DialogPortalContainerContext);
}

// ---- Dirty-guard plumbing -----------------------------------------------
// Tracks whether the user has typed/interacted inside an open dialog. If so,
// any close attempt (Cancel button, ✕, outside click, Escape) is intercepted
// and a "Discard unsaved changes?" confirmation is shown first.
type DirtyCtx = {
  dirtyRef: React.MutableRefObject<boolean>;
  reset: () => void;
  disabled: boolean;
  markDirty: () => void;
  markPristine: () => void;
};
const DialogDirtyContext = React.createContext<DirtyCtx | null>(null);

/** Opt out of the global unsaved-changes guard for a specific Dialog. */
export const DialogDirtyGuardOff = ({ children }: { children: React.ReactNode }) => {
  const dirtyRef = React.useRef(false);
  return (
    <DialogDirtyContext.Provider
      value={{
        dirtyRef,
        reset: () => {},
        disabled: true,
        markDirty: () => {},
        markPristine: () => {},
      }}
    >
      {children}
    </DialogDirtyContext.Provider>
  );
};

type DialogRootProps = React.ComponentProps<typeof DialogPrimitive.Root>;

const Dialog = ({ onOpenChange, open, defaultOpen, children, ...props }: DialogRootProps) => {
  const dirtyRef = React.useRef(false);
  const ctxRef = React.useRef<DirtyCtx>({
    dirtyRef,
    reset: () => {
      dirtyRef.current = false;
    },
    disabled: false,
    markDirty: () => {
      dirtyRef.current = true;
    },
    markPristine: () => {
      dirtyRef.current = false;
    },
  });

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) {
        dirtyRef.current = false;
        onOpenChange?.(true);
        return;
      }
      if (!dirtyRef.current || ctxRef.current.disabled) {
        onOpenChange?.(false);
        return;
      }
      void confirmAction({
        title: "Discard unsaved changes?",
        description: "Any information you've entered will be lost.",
        confirmText: "Discard",
        cancelText: "Keep editing",
        destructive: true,
      }).then((ok) => {
        if (ok) {
          dirtyRef.current = false;
          onOpenChange?.(false);
        }
      });
    },
    [onOpenChange],
  );

  return (
    <DialogDirtyContext.Provider value={ctxRef.current}>
      <DialogPrimitive.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
        {...props}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogDirtyContext.Provider>
  );
};

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  overlayClassName?: string;
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, overlayClassName, children, ...props }, ref) => {
  const [contentElement, setContentElement] = React.useState<HTMLElement | null>(null);
  const [pristine, setPristine] = React.useState(true);
  const dirtyCtx = React.useContext(DialogDirtyContext);

  const handleRef = React.useCallback(
    (node: React.ElementRef<typeof DialogPrimitive.Content> | null) => {
      setContentElement(node);
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  // Mark the dialog dirty on any field interaction, and pristine when a
  // save-intent button is clicked or a form is submitted (so successful
  // saves close silently; failed saves re-dirty as the user resumes typing).
  // The `pristine` React state mirrors the ref so we can render
  // `data-pristine` and disable save-intent buttons via CSS until edits exist.
  React.useEffect(() => {
    if (!contentElement || !dirtyCtx || dirtyCtx.disabled) return;
    dirtyCtx.reset();
    setPristine(true);
    // Always start the dialog scrolled to the top so long forms don't open mid-way.
    requestAnimationFrame(() => contentElement.scrollTo?.({ top: 0, left: 0 }));
    // Note: action words like "add"/"import" are intentionally excluded because
    // dialogs also contain secondary controls such as "Add component" pickers.
    const SAVE_RX = /^(save|update|create|submit|confirm|apply|generate|send|approve|sign|next|continue|finish|done)\b/i;

    const markDirty = (e: Event) => {
      // Programmatic value changes (React-driven prefill) shouldn't dirty.
      if (!(e as UIEvent).isTrusted) return;
      if (!dirtyCtx.dirtyRef.current) {
        dirtyCtx.dirtyRef.current = true;
        setPristine(false);
      }
    };
    const markPristine = () => {
      dirtyCtx.reset();
      setPristine(true);
    };
    const closeDialog = () => {
      markPristine();
      requestAnimationFrame(() => {
        contentElement.querySelector<HTMLButtonElement>('[data-dialog-close]')?.click();
      });
    };
    dirtyCtx.markDirty = () => {
      if (!dirtyCtx.dirtyRef.current) {
        dirtyCtx.dirtyRef.current = true;
      }
      setPristine(false);
    };
    dirtyCtx.markPristine = markPristine;
    const onClick = (e: Event) => {
      const btn = (e.target as HTMLElement | null)?.closest?.(
        "button",
      ) as HTMLButtonElement | null;
      if (!btn) return;
      const txt = (btn.textContent || "").trim();
      if (txt === "Close" || txt === "Cancel") closeDialog();
      if (btn.type === "submit" || SAVE_RX.test(txt)) markPristine();
    };

    // Tag save-intent buttons inside the dialog so CSS can disable them
    // while pristine. Re-scan when children change.
    const scan = () => {
      contentElement.querySelectorAll("button").forEach((b) => {
        const txt = (b.textContent || "").trim();
        const isSave = b.type === "submit" || SAVE_RX.test(txt);
        if (isSave) b.setAttribute("data-save-intent", "true");
        else b.removeAttribute("data-save-intent");
      });
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(contentElement, { childList: true, subtree: true, characterData: true });

    contentElement.addEventListener("input", markDirty, true);
    contentElement.addEventListener("change", markDirty, true);
    contentElement.addEventListener("click", onClick, true);
    contentElement.addEventListener("submit", markPristine, true);
    return () => {
      dirtyCtx.markDirty = () => {
        dirtyCtx.dirtyRef.current = true;
      };
      dirtyCtx.markPristine = () => {
        dirtyCtx.reset();
      };
      mo.disconnect();
      contentElement.removeEventListener("input", markDirty, true);
      contentElement.removeEventListener("change", markDirty, true);
      contentElement.removeEventListener("click", onClick, true);
      contentElement.removeEventListener("submit", markPristine, true);
    };
  }, [contentElement, dirtyCtx]);

  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPortalContainerContext.Provider value={contentElement}>
        <DialogPrimitive.Content
          ref={handleRef}
          data-pristine={pristine ? "true" : "false"}
          className={cn(
            "dialog-content-centered fixed left-[50%] top-[50%] z-50 grid w-[calc(100vw-1.5rem)] max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain gap-4 rounded-2xl border border-border/60 bg-card text-card-foreground p-4 sm:p-6 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.25)] data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out sm:rounded-xl",
            className,
          )}
          {...props}
        >
          {children}
          <DialogPrimitive.Close data-dialog-close className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full border border-border/70 bg-card text-foreground shadow-sm ring-offset-background transition hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortalContainerContext.Provider>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

/**
 * Imperatively mark the nearest enclosing Dialog as pristine — call after a
 * successful save so the close that follows won't trigger the discard prompt.
 */
export function useDialogDirty() {
  const ctx = React.useContext(DialogDirtyContext);
  return React.useMemo(
    () => ({
      markPristine: () => ctx?.markPristine(),
      markDirty: () => ctx?.markDirty(),
    }),
    [ctx],
  );
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
