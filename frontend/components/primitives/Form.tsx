import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

const CONTROL =
  "rounded-control border border-hairline-strong bg-surface px-3 text-sm text-text placeholder:text-muted shadow-sheen " +
  "outline-none transition-[border-color,box-shadow,background-color] duration-150 hover:border-muted/50 " +
  "focus:border-sage focus:shadow-[0_0_0_3px_rgb(47_93_78/0.14)] disabled:opacity-40 " +
  "aria-[invalid=true]:border-red";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <span role="alert" className="text-xs text-red-text">{error}</span>
      ) : (
        hint && <span className="text-xs text-muted">{hint}</span>
      )}
    </div>
  );
}

/** Controls fill their container unless the caller sets a width (a later w-full would otherwise win in the cascade). */
const fill = (className?: string) => (className && /(^|\s)([a-z0-9-]+:)*(w-|flex-1)/.test(className) ? null : "w-full");

export function Input({ className, mono, ...rest }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input className={cx(CONTROL, fill(className), "h-9", mono && "num", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(CONTROL, fill(className), "h-9 pe-6", className)} {...rest}>
      {children}
    </select>
  );
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, fill(className), "min-h-20 py-1.5 leading-5", className)} dir="auto" {...rest} />;
}
