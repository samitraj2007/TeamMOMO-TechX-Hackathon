import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

export type ButtonVariant = "solid" | "outline" | "ghost" | "danger" | "accent" | "key";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  solid: "border-sage bg-sage text-bg hover:bg-sage/90",
  accent: "border-brass/80 bg-brass/15 text-brass hover:bg-brass/25",
  /** Primary action on the black key: a cream face. Disabled drops to an outline so its label stays legible. */
  key:
    "border-text bg-text text-surface hover:bg-text/90 " +
    "disabled:border-hairline-strong disabled:bg-transparent disabled:text-muted",
  outline: "border-hairline-strong bg-raised/40 text-text hover:bg-raised hover:border-muted/50",
  ghost: "border-transparent bg-transparent text-muted hover:bg-raised hover:text-text",
  danger: "border-red/80 bg-red/12 text-red-text hover:bg-red/22",
};

const SIZE: Record<ButtonSize, string> = { sm: "h-7 gap-1.5 px-2.5 text-xs", md: "h-9 gap-2 px-3.5 text-sm" };

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

/** Square icon button (3px radius; never a circle). */
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
