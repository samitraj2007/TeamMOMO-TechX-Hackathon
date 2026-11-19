import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

export type ButtonVariant = "solid" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  solid: "border-sage bg-sage text-bg hover:bg-[#7eab93] hover:border-[#7eab93]",
  outline: "border-hairline-strong bg-transparent text-text hover:bg-raised",
  ghost: "border-transparent bg-transparent text-muted hover:bg-raised hover:text-text",
  danger: "border-red bg-red/12 text-red-text hover:bg-red/20",
};

const SIZE: Record<ButtonSize, string> = { sm: "h-6 gap-1.5 px-2 text-xs", md: "h-8 gap-2 px-3 text-sm" };

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
        "inline-flex shrink-0 items-center justify-center border font-medium transition-colors duration-[120ms]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
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
        "inline-flex h-7 w-7 shrink-0 items-center justify-center border border-transparent transition-colors duration-[120ms]",
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
