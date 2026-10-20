"use client";

import { useActionState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

export function SubmitButton({ children, pendingText, className = "btn btn-primary" }: { children: ReactNode; pendingText?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-bad" role="alert">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-good" role="status">{state.ok}</p>;
  return null;
}

/** A <form> bound to a server action with inline success/error feedback. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}

/** Button that runs a no-argument server action and shows its result. */
export function ActionButton({
  action,
  children,
  pendingText,
  className = "btn",
}: {
  action: () => Promise<ActionState | void>;
  children: ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const [state, run, pending] = useActionState(async () => (await action()) ?? undefined, undefined);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <form action={run}>
        <button className={className} disabled={pending}>
          {pending ? (pendingText ?? "Working…") : children}
        </button>
      </form>
      <FormMessage state={state} />
    </span>
  );
}

/** Small button for fire-and-forget server actions that take arguments. */
export function TransitionButton({
  onRun,
  children,
  className = "btn btn-sm",
  confirmText,
}: {
  onRun: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  confirmText?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        if (confirmText && !window.confirm(confirmText)) return;
        start(async () => {
          await onRun();
        });
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}
