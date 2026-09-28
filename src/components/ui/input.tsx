import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const field =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink shadow-soft transition-[border,box-shadow] duration-150 hover:border-subtle focus:border-ink focus:outline-none focus:ring-4 focus:ring-ink/8 disabled:bg-surface-2 disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/10";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { ltr?: boolean }>(function Input({ className, ltr, ...props }, ref) {
  return <input ref={ref} className={cn(field, "h-10", ltr && "text-left [direction:ltr]", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(field, "min-h-[88px] py-2.5 leading-7", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(field, "h-10 cursor-pointer appearance-none ps-3 pe-9", className)} {...props}>
        {children}
      </select>
      <svg className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
});

/**
 * Label + control. When no htmlFor is given the label wraps the control, so the
 * association is implicit and screen readers (and getByLabel) always find it.
 */
export function Field({ label, hint, error, children, className, htmlFor, required }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; htmlFor?: string; required?: boolean }) {
  const caption = label && (
    <span className="text-[13px] font-bold text-ink-2">
      {label}
      {required && <span className="ms-0.5 text-danger">*</span>}
    </span>
  );
  const help = error ? <p className="text-[12.5px] text-danger" role="alert">{error}</p> : hint ? <p className="text-[12.5px] leading-6 text-muted">{hint}</p> : null;
  if (htmlFor || !label) {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        {label && <label htmlFor={htmlFor}>{caption}</label>}
        {children}
        {help}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="flex flex-col gap-1.5">
        {caption}
        {children}
      </label>
      {help}
    </div>
  );
}
