"use client";
import clsx from "clsx";
import Link from "next/link";
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";

export { clsx as cx };

/* ───────── Boutons ───────── */
type BtnVariant = "gold" | "ghost" | "outline" | "danger" | "cream";
const btnBase = "touch-lg inline-flex items-center justify-center gap-2 rounded-full px-4 h-10 text-sm font-semibold transition disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap";
const btnVariants: Record<BtnVariant, string> = {
  gold: "bg-gold text-black hover:bg-[#e8d27a] active:scale-[0.98]",
  cream: "bg-cream text-black hover:bg-white active:scale-[0.98]",
  ghost: "text-soft hover:text-cream hover:bg-panel-2",
  outline: "border border-line-strong text-cream hover:border-gold hover:text-gold",
  danger: "border border-alert/50 text-alert hover:bg-alert/10",
};
export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md"; loading?: boolean }>(
  function Button({ variant = "outline", size = "md", loading, className, children, ...rest }, ref) {
    return (
      <button ref={ref} {...rest} disabled={rest.disabled || loading}
        className={clsx(btnBase, btnVariants[variant], size === "sm" && "h-8 px-3 text-xs", className)}>
        {loading && <Loader2 className="size-4 animate-spin" />}
        {children}
      </button>
    );
  });
export function ButtonLink({ href, variant = "outline", className, children, ...rest }: { href: string; variant?: BtnVariant; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const external = href.startsWith("http");
  return external
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={clsx(btnBase, btnVariants[variant], className)} {...rest}>{children}</a>
    : <Link href={href} className={clsx(btnBase, btnVariants[variant], className)} {...rest}>{children}</Link>;
}
export function IconButton({ label, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} {...rest}
      className={clsx("touch-lg inline-flex size-10 items-center justify-center rounded-full text-soft hover:bg-panel-2 hover:text-cream transition disabled:opacity-40", className)}>
      {children}
    </button>
  );
}

/* ───────── Champs ───────── */
const fieldBase = "w-full rounded-lg border border-line bg-night px-3 h-10 text-cream placeholder:text-muted/70 focus:border-gold focus:outline-none transition";
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={clsx(fieldBase, className)} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} rows={p.rows ?? 4} {...p} className={clsx(fieldBase, "h-auto py-2 leading-relaxed", className)} />;
});
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return <select ref={ref} {...p} className={clsx(fieldBase, "appearance-none pr-8 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238f8a80%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-no-repeat bg-[right_10px_center]", className)}>{children}</select>;
});
export function Field({ label, hint, children, className, required }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={clsx("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-soft">{label}{required && <span className="text-gold"> *</span>}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}
export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx("inline-flex items-center gap-3 cursor-pointer select-none touch-lg", disabled && "opacity-50 pointer-events-none")}>
      <span role="checkbox" aria-checked={checked} tabIndex={0}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); } }}
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        className={clsx("flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition",
          checked ? "bg-gold border-gold" : "border-line-strong hover:border-gold")}>
        {checked && <svg viewBox="0 0 16 16" className="size-3.5 text-black"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      {label && <span className="text-sm" onClick={(e) => { e.preventDefault(); onChange(!checked); }}>{label}</span>}
    </label>
  );
}

/* ───────── Badges, cartes, états ───────── */
export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "gold" | "cream" | "alert" | "ok" | "muted" | "olive"; children: React.ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-panel-2 text-soft border-line", gold: "bg-gold/15 text-gold border-gold/30", cream: "bg-cream text-black border-cream",
    alert: "bg-alert/12 text-alert border-alert/30", ok: "bg-ok/12 text-ok border-ok/30", muted: "bg-transparent text-muted border-line",
    olive: "bg-olive/40 text-[#e6d68f] border-olive",
  };
  return <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", tones[tone], className)}>{children}</span>;
}
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={clsx("card", className)}>{children}</div>;
}
export function SectionTitle({ eyebrow, title, action, className }: { eyebrow?: string; title: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-end justify-between gap-4 mb-3", className)}>
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="display text-[15px] tracking-wide">{title}</h2>
      </div>
      {action}
    </div>
  );
}
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-in">
      <div className="max-w-3xl">
        {eyebrow && <div className="tag-gold mb-3">{eyebrow}</div>}
        <h1 className="display text-3xl md:text-[40px]">{title}</h1>
        {description && <p className="mt-3 text-soft text-[15px] leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-[14px] border border-dashed border-line px-6 py-10">
      <div className="mb-3 h-8 w-1.5 -skew-x-12 bg-gold/70" aria-hidden />
      <div className="font-semibold">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Progress({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-line", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}
export function Avatar({ name, size = 28, className }: { name?: string | null; size?: number; className?: string }) {
  const initials = (name ?? "?").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span title={name ?? "Non attribué"} style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-bold", name ? "bg-gold text-black" : "border border-dashed border-line-strong text-muted", className)}>
      {name ? initials : "—"}
    </span>
  );
}

/* ───────── Onglets (pilotés par l'URL ou l'état) ───────── */
export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: React.ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={clsx("flex gap-1 overflow-x-auto border-b border-line", className)} role="tablist">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)}
          className={clsx("touch-lg -mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition",
            value === it.value ? "border-gold text-cream" : "border-transparent text-muted hover:text-cream")}>
          {it.label}{it.count !== undefined && <span className="ml-1.5 text-xs text-muted">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function Segmented<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: React.ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-full border border-line bg-night p-1">
      {items.map((it) => (
        <button key={it.value} onClick={() => onChange(it.value)}
          className={clsx("touch-lg rounded-full px-3 h-8 text-xs font-semibold transition", value === it.value ? "bg-cream text-black" : "text-muted hover:text-cream")}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ───────── Modale / panneau latéral ───────── */
export function Modal({ open, onClose, title, children, wide, side }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; wide?: boolean; side?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input,textarea,select")?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 backdrop-blur-sm md:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true"
        className={clsx("animate-in flex max-h-full w-full flex-col overflow-hidden border border-line bg-panel shadow-2xl",
          side ? "ml-auto h-full max-w-2xl md:rounded-l-2xl" : clsx("md:max-h-[90vh] md:rounded-2xl", wide ? "md:max-w-4xl" : "md:max-w-xl"))}>
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
          <div className="display text-sm">{title}</div>
          <IconButton label="Fermer" onClick={onClose}><X className="size-5" /></IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ───────── Toasts ───────── */
type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastCtx = createContext<(text: string, tone?: "ok" | "error") => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, tone }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), tone === "error" ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={clsx("animate-in pointer-events-auto max-w-sm rounded-xl border px-4 py-3 text-sm shadow-xl",
            t.tone === "ok" ? "border-gold/40 bg-panel-2 text-cream" : "border-alert/50 bg-[#2a1611] text-[#f3c3b7]")}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

type Result = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };
/** Exécute une action serveur, affiche un toast et rafraîchit les données. */
export function useAction() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const exec = useCallback(<R extends Result>(fn: () => Promise<R>, opts?: { success?: string; onSuccess?: (r: R) => void; refresh?: boolean }) => {
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) { toast(r.error, "error"); return; }
        if (opts?.success || r.message) toast((r.message ?? opts?.success)!);
        opts?.onSuccess?.(r);
        if (opts?.refresh !== false) router.refresh();
      } catch (e) {
        toast("Connexion au serveur impossible. Réessayez.", "error");
        console.error(e);
      }
    });
  }, [router, toast]);
  return { pending, exec };
}

/** Bouton avec confirmation (actions importantes ou irréversibles). */
export function ConfirmButton({ onConfirm, children, message, variant = "danger", size, confirmLabel = "Confirmer", disabled }: {
  onConfirm: () => void; children: React.ReactNode; message: string; variant?: BtnVariant; size?: "sm" | "md"; confirmLabel?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)} disabled={disabled}>{children}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Confirmation">
        <p className="text-soft leading-relaxed">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant={variant === "danger" ? "danger" : "gold"} onClick={() => { setOpen(false); onConfirm(); }}>{confirmLabel}</Button>
        </div>
      </Modal>
    </>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={clsx("text-gold hover:underline underline-offset-2 break-all", className)}>{children}</a>;
}
