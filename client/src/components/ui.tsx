import type { ReactNode } from "react";
import type { AiSource } from "@app/shared";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-label="Loading" />;
}

export function Card({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white p-4 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-ink">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div role="alert" className="no-print flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span>{message}</span>
      <button onClick={onClose} className="font-bold text-red-500 hover:text-red-700" aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

const SOURCE_STYLES: Record<AiSource, [string, string]> = {
  ai: ["Aivana", "bg-violet-100 text-violet-800"],
  mock: ["Aivana (mock)", "bg-stone-100 text-stone-600"],
  fallback: ["Rules fallback", "bg-amber-100 text-amber-800"],
};

export function SourceBadge({ source }: { source: AiSource }) {
  const [label, cls] = SOURCE_STYLES[source];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>✦ {label}</span>;
}

export function Button({
  children,
  loading,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; variant?: "primary" | "secondary" }) {
  const styles =
    variant === "primary"
      ? "bg-brand text-white hover:bg-brand-dark disabled:bg-stone-300"
      : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:text-stone-400";
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${styles} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
