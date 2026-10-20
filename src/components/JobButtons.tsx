"use client";

import { deleteApplication, saveJob, setApplicationStatus, updateNotes } from "@/app/actions";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/constants";
import { useState, useTransition } from "react";
import { TransitionButton } from "./forms";

export function SaveJobButton({ jobId }: { jobId: number }) {
  return <TransitionButton onRun={() => saveJob(jobId)}>Save</TransitionButton>;
}

export function MarkAppliedButton({ jobId }: { jobId: number }) {
  return (
    <TransitionButton className="btn btn-sm" onRun={() => saveJob(jobId, "applied")}>
      Mark as applied
    </TransitionButton>
  );
}

export function StatusSelect({ id, status }: { id: number; status: ApplicationStatus }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Application status"
      className="input h-8 w-auto py-0 text-sm capitalize"
      defaultValue={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as ApplicationStatus;
        start(() => setApplicationStatus(id, next));
      }}
    >
      {APPLICATION_STATUSES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

export function NotesEditor({ id, notes }: { id: number; notes: string }) {
  const [value, setValue] = useState(notes);
  const [saved, setSaved] = useState(notes);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <textarea
        aria-label="Notes"
        className="input text-sm"
        rows={2}
        placeholder="Notes: referral from…, OA on…, interviewer…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value === saved) return;
          start(async () => {
            await updateNotes(id, value);
            setSaved(value);
          });
        }}
      />
      {pending && <span className="hint">Saving…</span>}
    </div>
  );
}

export function DeleteApplicationButton({ id }: { id: number }) {
  return (
    <TransitionButton className="btn btn-sm text-bad" confirmText="Remove this application?" onRun={() => deleteApplication(id)}>
      Remove
    </TransitionButton>
  );
}
