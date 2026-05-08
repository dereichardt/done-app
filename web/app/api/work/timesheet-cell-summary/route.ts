import { streamText } from "ai";
import { z } from "zod";

import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  defaultSummarizationModel,
  isAiConfigured,
} from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { timesheetFallbackBullets } from "@/lib/timesheet-fallback-bullets";

export const runtime = "nodejs";
export const maxDuration = 45;

const BodySchema = z.object({
  trackLabel: z.string().trim().min(1).max(400),
  dayYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(z.string()).min(1).max(48).refine(
    (arr) => arr.reduce((n, s) => n + s.length, 0) <= 12_000,
    { message: "lines total length exceeds limit" },
  ),
});

const SYSTEM = `You condense work log lines into at most 5 concise bullet points for a timesheet cell.
Rules:
- Output ONLY bullet lines: each line starts with "- " (hyphen and space).
- No heading, no preamble, no numbering other than "- ".
- Merge duplicates; keep facts the reader needs for billing / status.
- If input is only meeting titles with no substance, say so briefly.
- Maximum 5 bullets.`;

function parseBulletLines(text: string): string[] {
  const bullets: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*-\s+(.+)$/);
    if (m?.[1]) {
      const b = `- ${m[1].trim()}`;
      if (b.length > 2) bullets.push(b);
    }
    if (bullets.length >= 5) break;
  }
  return bullets;
}

export async function POST(request: Request) {
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

  if (!isAiConfigured()) {
    return Response.json({
      bullets: timesheetFallbackBullets(body.lines),
      source: "fallback" as const,
    });
  }

  const userPrompt = `Track: ${body.trackLabel}
Day: ${body.dayYmd}

Raw log lines (summarize into at most 5 bullets):
${body.lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`;

  try {
    const result = streamText({
      model: defaultSummarizationModel,
      system: SYSTEM,
      prompt: userPrompt,
      maxOutputTokens: Math.min(600, DEFAULT_MAX_OUTPUT_TOKENS),
      temperature: 0.25,
    });
    const text = await result.text;
    const bullets = parseBulletLines(text);
    const finalBullets = bullets.length > 0 ? bullets : timesheetFallbackBullets(body.lines);
    return Response.json({ bullets: finalBullets, source: "model" as const });
  } catch (err) {
    console.error("[timesheet-cell-summary]", err);
    return Response.json({
      bullets: timesheetFallbackBullets(body.lines),
      source: "fallback" as const,
      error: "Summary generation failed; showing condensed raw lines.",
    });
  }
}
