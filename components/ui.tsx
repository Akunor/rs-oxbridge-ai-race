import type { ReactNode } from "react";

/** Bordered panel with a labelled header strip. */
export function Module({
  label,
  right,
  variant,
  children,
  className,
}: {
  label: ReactNode;
  right?: ReactNode;
  variant?: "diagram" | "inverse";
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`module${variant ? ` module--${variant}` : ""}${className ? ` ${className}` : ""}`}>
      <div className="module-strip">
        <span>{label}</span>
        {right !== undefined && <span>{right}</span>}
      </div>
      <div className="module-body">{children}</div>
    </section>
  );
}

/** Status light. Decorative: always pair with text. */
export function Led({ tone, blink }: { tone?: "signal" | "ok" | "fault"; blink?: boolean }) {
  return <span aria-hidden="true" className={`led${tone ? ` led--${tone}` : ""}${blink ? " led--blink" : ""}`} />;
}

/** Page heading: eyebrow, display title, optional lead. */
export function PageHeader({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`stack${className ? ` ${className}` : ""}`} style={{ marginBottom: 4, gap: 10 }}>
      <span className="eyebrow">{eyebrow}</span>
      <h1 className="display">{title}</h1>
      {children && <p className="lead">{children}</p>}
    </header>
  );
}

/** 20-cell budget meter. */
export function Meter({ spent, total, label }: { spent: number; total: number; label: string }) {
  const spentCells = total > 0 ? Math.min(20, Math.round((spent / total) * 20)) : 0;
  return (
    <div className="meter" role="img" aria-label={label}>
      {Array.from({ length: 20 }, (_, i) => (
        <span key={i} className={i < spentCells ? "spent" : "left"} />
      ))}
    </div>
  );
}

/** Links a Solana devnet transaction signature to the explorer. */
export function ExplorerLink({ signature }: { signature: string }) {
  return (
    <a href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer">
      {signature.slice(0, 8)}…{signature.slice(-8)} ↗
    </a>
  );
}
