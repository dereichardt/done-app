"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { summaryMarkdownToSafeHtml } from "@/lib/project-summary-markdown";

type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ChatBubble({ role, content, streaming }: { role: ChatRole; content: string; streaming?: boolean }) {
  const html = useMemo(() => {
    if (role === "assistant") return summaryMarkdownToSafeHtml(content);
    return "";
  }, [role, content]);

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[min(100%,34rem)] rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-surface-alt)",
            color: "var(--app-text)",
          }}
        >
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[min(100%,40rem)] rounded-lg border px-3 py-2 text-sm"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-info-surface)",
          color: "var(--app-text)",
        }}
      >
        {streaming && !content ? (
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
            Thinking…
          </p>
        ) : html ? (
          <div
            className="project-summary-body leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_strong]:font-semibold [&_a]:font-medium [&_a]:text-[var(--app-action)] [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}
      </div>
    </div>
  );
}

export function HomeInsightsChat({ aiConfigured }: { aiConfigured: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending || !aiConfigured) return;

    const userMsg: ChatMessage = { id: newId(), role: "user", content: text };
    const assistantId = newId();
    const assistantPlaceholder: ChatMessage = { id: assistantId, role: "assistant", content: "" };

    setDraft("");
    setError(null);
    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setSending(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const payload = {
      messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
    };

    try {
      const res = await fetch("/api/home/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const json = (await res.json()) as { error?: string };
          if (json.error) message = json.error;
        } catch {
          /* ignore */
        }
        setError(message);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }

      if (!res.body) {
        setError("Empty response from server.");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let accumulated = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += value;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m)),
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setSending(false);
    }
  }, [aiConfigured, draft, messages, sending]);

  const emptyState = messages.length === 0;

  return (
    <section aria-label="Cross-project insights" className="mt-6">
      <h2 className="section-heading">Ask across your projects</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--app-text-muted)" }}>
        Insights from your recent activity only — this chat does not change data in Done.
      </p>

      <div
        className="mt-4 flex min-h-[50vh] flex-col overflow-hidden border"
        style={{
          borderRadius: "var(--app-radius)",
          borderColor: "var(--app-border)",
          background: "var(--app-surface)",
          boxShadow: "var(--app-shadow-card)",
        }}
      >
        {!aiConfigured ? (
          <div className="p-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
            AI is not configured for this environment. Set{" "}
            <span className="font-medium" style={{ color: "var(--app-text)" }}>
              OPENAI_API_KEY
            </span>{" "}
            to enable cross-project insights.
          </div>
        ) : (
          <>
            <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {emptyState ? (
                <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
                  Ask what needs attention tomorrow, which integrations are at risk, or how open tasks line up
                  with project phases — answers use your phases, integration snapshots, open tasks with due
                  dates, and recent activity.
                </p>
              ) : null}
              {messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  streaming={sending && m.role === "assistant" && m.id === messages[messages.length - 1]?.id}
                />
              ))}
            </div>
            {error ? (
              <div className="border-t px-4 py-2 text-sm" style={{ borderColor: "var(--app-border)", color: "var(--app-danger)" }}>
                {error}
              </div>
            ) : null}
            <div
              className="shrink-0 border-t p-3"
              style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="sr-only" htmlFor="home-insights-input">
                  Message
                </label>
                <textarea
                  id="home-insights-input"
                  rows={3}
                  className="input-canvas min-h-[5.5rem] w-full flex-1 resize-y px-3 py-2 text-sm"
                  style={{ color: "var(--app-text)" }}
                  placeholder="What needs attention across my projects?"
                  value={draft}
                  disabled={sending}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-cta-dark shrink-0 self-stretch sm:self-auto"
                  disabled={sending || !draft.trim()}
                  onClick={() => void send()}
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
