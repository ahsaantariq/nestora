import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "accent" | "quiet" | "danger" }) {
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-button px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-primary text-surface hover:bg-primary-hover",
        variant === "accent" && "bg-accent text-ink hover:bg-accent/90",
        variant === "quiet" && "border border-line bg-surface text-ink hover:bg-bg",
        variant === "danger" && "bg-danger text-surface hover:bg-danger/90",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const control =
  "h-11 w-full rounded-button border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, props.className)} {...props} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(control, "h-auto min-h-28 py-3", props.className)}
      {...props}
    />
  );
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, props.className)} {...props} />;
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
