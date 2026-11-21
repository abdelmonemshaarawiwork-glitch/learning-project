"use client";

import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { Input } from "./Field";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-[#1f231f]/30 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <RD.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[18px] border border-line bg-surface p-6 shadow-float data-[state=open]:animate-pop",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <RD.Title className="font-display text-xl font-medium text-ink">{title}</RD.Title>
            <RD.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("common.close")} className="-me-2 -mt-1">
                <X className="h-4 w-4" />
              </Button>
            </RD.Close>
          </div>
          {description ? (
            <RD.Description className="mt-2 text-sm leading-relaxed text-ink-2">{description}</RD.Description>
          ) : (
            <RD.Description className="sr-only">{typeof title === "string" ? title : ""}</RD.Description>
          )}
          {children ? <div className="mt-4">{children}</div> : null}
          {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/** Confirmation dialog, optionally requiring the user to type a phrase. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  tone = "primary",
  requireText,
  requireLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  tone?: "primary" | "danger";
  requireText?: string;
  requireLabel?: string;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const ok = !requireText || typed.trim() === requireText.trim();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) {
          onOpenChange(o);
          if (!o) setTyped("");
        }
      }}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={busy}
            disabled={!ok}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
                setTyped("");
              } catch {
                // Keep the dialog open; the caller already reported the error.
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {requireText ? (
        <div className="space-y-1.5">
          <label className="block text-[13px] font-medium text-ink-2" htmlFor="confirm-text">
            {requireLabel}
          </label>
          <Input id="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" dir="auto" />
        </div>
      ) : null}
    </Dialog>
  );
}

/** Side sheet on desktop, bottom sheet on small screens. */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-[#1f231f]/25 data-[state=open]:animate-fade-in" />
        <RD.Content
          className={cn(
            "fixed z-50 flex flex-col bg-surface shadow-float data-[state=open]:animate-rise",
            "inset-x-0 bottom-0 max-h-[88vh] rounded-t-[22px] border-t border-line",
            "md:inset-y-3 md:end-3 md:start-auto md:bottom-3 md:max-h-none md:w-[440px] md:rounded-[20px] md:border",
          )}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-muted md:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 md:px-6 md:pt-6">
            <RD.Title className="min-w-0 text-ink">{title}</RD.Title>
            <RD.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("common.close")} className="-me-2">
                <X className="h-4 w-4" />
              </Button>
            </RD.Close>
          </div>
          <RD.Description className="sr-only">{typeof title === "string" ? title : ""}</RD.Description>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:px-6">{children}</div>
          {footer ? <div className="border-t border-line px-5 py-4 md:px-6">{footer}</div> : null}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
