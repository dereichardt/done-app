"use client";

import { useEffect, useRef } from "react";

import { SummarizeActivityPanel } from "./summarize-activity-panel";

export function SummarizeActivityDialog({
  projectId,
  projectCustomerName,
  onClose,
}: {
  projectId: string;
  projectCustomerName: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="app-catalog-dialog fixed left-1/2 top-1/2 z-[215] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl w-[min(100vw-2rem,42rem)] max-w-[calc(100vw-2rem)]"
      style={{
        borderRadius: "12px",
        background: "var(--app-surface)",
        color: "var(--app-text)",
        height: "min(92dvh, 44rem)",
        maxHeight: "min(92dvh, 52rem)",
      }}
      onClose={onClose}
    >
      <SummarizeActivityPanel
        projectId={projectId}
        projectCustomerName={projectCustomerName}
        variant="modal"
        onDismiss={() => dialogRef.current?.close()}
      />
    </dialog>
  );
}
