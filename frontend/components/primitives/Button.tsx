import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

export type ButtonVariant = "solid" | "outline" | "ghost" | "danger" | "accent" | "key";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  solid: "border-transparent bg-sage text-bg shadow-sheen-strong hover:bg-sage/90",
  /** Run/act on data. Teal, not amber: amber is reserved for the Needs review status. */
  accent: "border-sage/55 bg-sage/[0.07] text-sage hover:border-sage hover:bg-sage/[0.13]",
  /** Primary action on the black key: a cream face. Disabled drops to an outline so its label stays legible. */
  key:
    "border-transparent bg-text text-surface hover:bg-text/90 " +
    "disabled:border-hairline-strong disabled:bg-transparent disabled:text-muted",
  outline: "border-hairline-strong bg-surface text-text hover:border-muted/40 hover:bg-raised",
  ghost: "border-transparent bg-transparent text-muted hover:bg-raised hover:text-text",
  danger: "border-red/40 bg-red/[0.08] text-red-text hover:border-red/70 hover:bg-red/[0.14]",
};

const SIZE: Record<ButtonSize, string> = { sm: "h-7 gap-1.5 px-3 text-xs", md: "h-9 gap-2 px-4 text-sm" };

export function Button({
  variant = "outline",
  size = "md",
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }) {
  return (
    <button
      type={type}
      className={cx(
        "press inline-flex shrink-0 items-center justify-center rounded-control border font-medium shadow-sheen",
        "disabled:cursor-not-allowed",
        variant !== "key" && "disabled:opacity-40",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/** Icon button with a rounded hover plate. */
export function IconButton({
  label,
  className,
  children,
  active = false,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-transparent",
        active ? "bg-raised text-text" : "text-muted hover:bg-raised hover:text-text",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
