import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  primary:
    "bg-sage-strong text-white hover:bg-[color-mix(in_oklab,var(--sage-strong),black_8%)] dark:text-sage-ink dark:bg-sage-strong dark:hover:bg-[color-mix(in_oklab,var(--sage-strong),white_10%)] shadow-soft",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2 shadow-soft",
  soft: "bg-sage-soft text-sage-strong hover:bg-[color-mix(in_oklab,var(--sage-soft),var(--sage)_14%)]",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
  danger: "bg-danger text-white hover:bg-[color-mix(in_oklab,var(--danger),black_10%)] dark:text-[#1d1210]",
  link: "text-sage-strong underline-offset-4 hover:underline px-0 h-auto",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[10px]",
  md: "h-10 px-4 text-sm gap-2 rounded-[var(--radius-control)]",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-[14px]",
  icon: "h-10 w-10 rounded-[var(--radius-control)]",
  "icon-sm": "h-8 w-8 rounded-[10px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none transition-[background-color,color,box-shadow,opacity] duration-150 disabled:pointer-events-none disabled:opacity-55",
        variants[variant],
        variant !== "link" && sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
});
