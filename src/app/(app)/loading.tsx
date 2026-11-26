export default function Loading() {
  return (
    <div className="flex flex-col gap-3 pt-2" aria-busy="true" aria-live="polite">
      <div className="focus-line w-48 rounded-full" />
      <p className="text-xs uppercase tracking-[0.22em] text-muted">Mise au point…</p>
    </div>
  );
}
