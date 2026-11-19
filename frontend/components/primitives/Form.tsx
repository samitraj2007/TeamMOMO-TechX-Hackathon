import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

const CONTROL =
  "w-full rounded-control border border-hairline-strong bg-bg/80 px-2.5 text-sm text-text placeholder:text-muted shadow-sheen " +
  "outline-none transition-colors duration-[120ms] hover:border-[#405647] focus:border-brass/80 focus:bg-bg disabled:opacity-40 " +
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
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="text-2xs font-medium uppercase tracking-[0.08em] text-muted">
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

export function Input({ className, mono, ...rest }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input className={cx(CONTROL, "h-9", mono && "num", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(CONTROL, "h-9 pe-6", className)} {...rest}>
      {children}
    </select>
  );
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, "min-h-20 py-1.5 leading-5", className)} dir="auto" {...rest} />;
}
