"use client";
import { useActionState } from "react";
import type { FormState } from "@/actions/auth";

export function AuthForm({ action, children, submit }: { action: (s: FormState, f: FormData) => Promise<FormState>; children: React.ReactNode; submit: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children}
      {state?.error && <p role="alert" className="rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-[#f3c3b7]">{state.error}</p>}
      {state?.message && <p className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-cream">{state.message}</p>}
      <button disabled={pending} className="mt-2 h-12 rounded-full bg-gold font-semibold text-black transition hover:bg-[#e8d27a] disabled:opacity-60">
        {pending ? "Un instant…" : submit}
      </button>
    </form>
  );
}
export function AuthInput(p: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = p;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-soft">{label}</span>
      <input {...rest} className="h-12 rounded-lg border border-line bg-night px-4 text-cream focus:border-gold focus:outline-none" />
    </label>
  );
}
