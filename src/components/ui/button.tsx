import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

const variants = {
  primary: "bg-ink text-surface hover:bg-ink/88 active:bg-ink/80 shadow-soft",
  accent: "bg-accent-ink text-white hover:brightness-110 active:brightness-95 shadow-soft",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2 active:bg-surface-3",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3",
  danger: "bg-danger text-white hover:brightness-110 active:brightness-95",
  "danger-ghost": "text-danger hover:bg-danger-soft",
  link: "text-accent-ink hover:underline underline-offset-4 px-0 h-auto",
} as const;

const sizes = {
  xs: "h-7 px-2.5 text-[12.5px] gap-1 rounded-sm",
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-sm",
  md: "h-10 px-4 text-sm gap-2 rounded-md",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-lg",
  icon: "h-9 w-9 rounded-md",
  "icon-sm": "h-8 w-8 rounded-sm",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = "primary", size = "md", loading, asChild, disabled, children, ...props }, ref) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-bold transition-[background,color,box-shadow,filter,transform] duration-150 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[1.1em] [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? children : (
        <>
          {loading && <Spinner className="size-4" />}
          {children}
        </>
      )}
    </Comp>
  );
});
