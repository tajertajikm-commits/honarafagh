"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ title, description, children, className, footer, wide }: { title: ReactNode; description?: ReactNode; children?: ReactNode; className?: string; footer?: ReactNode; wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <D.Content
        dir="rtl"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-float focus:outline-none data-[state=open]:animate-rise",
          wide ? "max-w-3xl" : "max-w-lg",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <D.Title className="text-[17px] font-bold">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-[13px] leading-6 text-muted">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : ""}</D.Description>}
          </div>
          <D.Close className="-me-2 grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink" aria-label="بستن">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="scrollbar-thin overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-6 py-3">{footer}</div>}
      </D.Content>
    </D.Portal>
  );
}

export function Sheet({ open, onOpenChange, title, description, children, footer, width = "max-w-xl" }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
        <D.Content dir="rtl" className={cn("fixed inset-y-0 left-0 z-50 flex w-full flex-col border-e border-line bg-surface shadow-float focus:outline-none data-[state=open]:animate-sheet", width)}>
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <D.Title className="text-[17px] font-bold">{title}</D.Title>
              <D.Description className={description ? "mt-1 text-[13px] text-muted" : "sr-only"}>{description ?? ""}</D.Description>
            </div>
            <D.Close className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2" aria-label="بستن">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
