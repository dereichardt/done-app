"use client";

import { catalogImplementationNotesToEditorHtml } from "@/lib/catalog-implementation-notes-html";
import { sanitizeImplementationNotesHtml } from "@/lib/sanitize-implementation-notes";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMemo, useState, type ReactNode } from "react";

function ToolbarButton({
  pressed,
  disabled,
  onClick,
  children,
  ariaLabel,
}: {
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      className={[
        "inline-flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center rounded border px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        pressed
          ? "border-[var(--app-border)] bg-[var(--app-surface-alt)] text-[var(--app-text)]"
          : "border-transparent bg-transparent text-[var(--app-text-muted)] hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)]",
      ].join(" ")}
      style={{ borderColor: pressed ? "var(--app-border)" : undefined }}
      aria-label={ariaLabel}
      aria-pressed={pressed ?? false}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ImplementationNotesEditor({
  id,
  name,
  initialValue,
  className,
  placeholder,
}: {
  id: string;
  name: string;
  initialValue: string | null;
  className?: string;
  placeholder?: string;
}) {
  const initialDoc = useMemo(
    () => sanitizeImplementationNotesHtml(catalogImplementationNotesToEditorHtml(initialValue)),
    [initialValue],
  );
  const [html, setHtml] = useState(initialDoc);

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: true,
      extensions: [
        StarterKit.configure({
          heading: false,
          blockquote: false,
          code: false,
          codeBlock: false,
          horizontalRule: false,
          strike: false,
          link: false,
          gapcursor: false,
          dropcursor: false,
        }),
        Placeholder.configure({
          placeholder: placeholder ?? "Patterns, considerations, links to docs…",
        }),
      ],
      content: initialDoc,
      editorProps: {
        attributes: {
          id,
          class: "app-implementation-notes-editor__prose",
          "aria-label": "Implementation notes",
        },
      },
      onUpdate: ({ editor: ed }) => {
        setHtml(ed.getHTML());
      },
    },
    [initialDoc],
  );

  return (
    <div
      className={[
        "implementation-notes-editor-root input-canvas input-canvas--shell flex min-h-0 flex-1 flex-col overflow-hidden",
        className ?? "",
      ].join(" ")}
    >
      <div
        className="flex shrink-0 flex-wrap items-center gap-0.5 rounded-t-[var(--app-radius)] border-b px-2 py-1.5"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-surface-alt)",
        }}
        role="toolbar"
        aria-label="Formatting"
      >
        <ToolbarButton
          ariaLabel="Bold"
          pressed={editor?.isActive("bold")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          ariaLabel="Italic"
          pressed={editor?.isActive("italic")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          ariaLabel="Underline"
          pressed={editor?.isActive("underline")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <span className="underline">U</span>
        </ToolbarButton>
        <span className="mx-1 w-px self-stretch bg-[var(--app-border)]" aria-hidden />
        <ToolbarButton
          ariaLabel="Bulleted list"
          pressed={editor?.isActive("bulletList")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          Bulleted List
        </ToolbarButton>
        <ToolbarButton
          ariaLabel="Numbered list"
          pressed={editor?.isActive("orderedList")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          Numbered List
        </ToolbarButton>
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-b-[var(--app-radius)]">
        <EditorContent editor={editor} className="app-implementation-notes-editor__surface h-full min-h-[10rem] lg:min-h-0" />
      </div>
      <input type="hidden" name={name} value={html} readOnly />
    </div>
  );
}
