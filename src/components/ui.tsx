import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export function Button({
  variant = "primary",
  className,
  loading = false,
  loadingLabel,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "quiet" | "danger";
  loading?: boolean;
  loadingLabel?: string;
}) {
  const busy = Boolean(loading);
  return (
    <button
      type={type}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-primary text-surface hover:bg-primary-hover",
        variant === "accent" && "bg-accent text-ink hover:bg-accent/90",
        variant === "quiet" && "border border-[#D9D3C7] bg-white text-ink hover:bg-bg",
        variant === "danger" && "bg-danger text-surface hover:bg-danger/90",
        className,
      )}
      {...props}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {busy ? (loadingLabel ?? children) : children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-ink">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </span>
      {children}
      {error ? <span className="block text-xs text-danger">{error}</span> : null}
      {!error && hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const controlClass =
  "h-11 w-full rounded-[10px] border border-[#D9D3C7] bg-white px-3.5 text-sm text-ink shadow-none placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:bg-bg disabled:text-muted aria-[invalid=true]:border-danger";

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, "h-auto min-h-28 py-3", className)} {...props} />;
}

export function SelectInput({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-button bg-line", className)} />;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center shadow-soft">
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-card bg-surface p-5 shadow-soft">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums text-ink">{value}</p>
      {note ? <p className="mt-2 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

export function StatusPill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ok" | "warn" | "bad" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-button px-2 py-1 text-xs font-medium",
        tone === "muted" && "bg-bg text-muted",
        tone === "ok" && "bg-success/10 text-success",
        tone === "warn" && "bg-warning/15 text-ink",
        tone === "bad" && "bg-danger/10 text-danger",
      )}
    >
      {children}
    </span>
  );
}
