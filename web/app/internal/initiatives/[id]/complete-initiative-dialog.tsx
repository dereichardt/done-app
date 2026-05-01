"use client";

import { DialogCloseButton } from "@/components/dialog-close-button";
import { completeInternalInitiative } from "@/lib/actions/internal-tasks";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

function CompleteInitiativeCheckbox({
  id,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-[color:var(--app-border)] bg-[var(--app-surface)] transition-colors peer-checked:border-[color:var(--app-cta-dark-fill)] peer-checked:bg-[color:var(--app-cta-dark-fill)] peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)] peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-checked:[&>svg]:opacity-100"
        aria-hidden
      >
        <svg viewBox="0 0 16 16" className="pointer-events-none h-[11px] w-[11px] opacity-0" aria-hidden>
          <path
            d="M3.5 8 L7 11.5 L12.5 4.5"
            fill="none"
            stroke="var(--app-cta-dark-fg)"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </>
  );
}

interface CompleteInitiativeDialogProps {
  initiativeId: string;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  onClose: () => void;
}

export function CompleteInitiativeDialog({ initiativeId, dialogRef, onClose }: CompleteInitiativeDialogProps) {
  const router = useRouter();
  const tasksFieldId = useId();
  const [completeOpenTasks, setCompleteOpenTasks] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setError(null);
    onClose();
    dialogRef.current?.close();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await completeInternalInitiative(initiativeId, { completeOpenTasks: completeOpenTasks });
      if (result.error) {
        setError(result.error);
        return;
      }
      dialogRef.current?.close();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="fixed left-1/2 top-1/2 z-[200] w-[min(100vw-2rem,28rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl"
      style={{
        borderRadius: "12px",
        background: "var(--app-surface)",
        color: "var(--app-text)",
      }}
      onClose={handleClose}
    >
      <form onSubmit={handleSubmit}>
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <h2 className="text-base font-medium" style={{ color: "var(--app-text)" }}>
            Complete initiative
          </h2>
          <DialogCloseButton onClick={handleClose} />
        </div>

        <div className="flex flex-col gap-4 px-4 py-5">
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
            Choose what to update when completing this initiative.
          </p>

          <label htmlFor={tasksFieldId} className="flex cursor-pointer items-start gap-3">
            <CompleteInitiativeCheckbox
              id={tasksFieldId}
              checked={completeOpenTasks}
              disabled={pending}
              onCheckedChange={setCompleteOpenTasks}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium" style={{ color: "var(--app-text)" }}>
                Mark open tasks as done
              </span>
              <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                All open tasks on this initiative will be marked as done.
              </span>
            </span>
          </label>

          {error ? (
            <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div
          className="flex items-center justify-end gap-3 border-t px-4 py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <button type="button" className="btn-cta text-sm" onClick={handleClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn-cta-dark text-sm whitespace-nowrap">
            {pending ? "Completing…" : "Complete initiative"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
