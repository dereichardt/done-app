import { streamText } from "ai";
import { z } from "zod";

import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  defaultSummarizationModel,
  isAiConfigured,
} from "@/lib/ai/client";
import {
  HOME_INSIGHTS_SYSTEM_PROMPT,
  buildCrossProjectInsightsContext,
} from "@/lib/home-insights-context";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(12_000),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(28),
});

function totalChars(messages: z.infer<typeof BodySchema>["messages"]): number {
  return messages.reduce((acc, m) => acc + m.content.length, 0);
}

export async function POST(request: Request) {
  if (!isAiConfigured()) {
    return Response.json(
      { error: "AI is not configured. Set OPENAI_API_KEY in the server environment." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request body";
    return Response.json({ error: message }, { status: 400 });
  }

  if (totalChars(body.messages) > 48_000) {
    return Response.json({ error: "Messages exceed size limit" }, { status: 400 });
  }

  const last = body.messages[body.messages.length - 1];
  if (last.role !== "user") {
    return Response.json({ error: "Last message must be from the user" }, { status: 400 });
  }

  const bundle = await buildCrossProjectInsightsContext(user.id);
  const system = `${HOME_INSIGHTS_SYSTEM_PROMPT}\n\n${bundle.contextBlock}`;

  const result = streamText({
    model: defaultSummarizationModel,
    system,
    messages: body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: 0.35,
    onError({ error }) {
      console.error("[home-insights] stream error", error);
    },
  });

  return result.toTextStreamResponse({
    headers: {
      "X-Project-Count": String(bundle.projectCount),
      "X-Has-Signal": bundle.hasIntegrationSignal ? "1" : "0",
    },
  });
}
