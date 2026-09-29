import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { buildCommandSystemPrompt, VOICE_COMMANDS } from "@/lib/voice-commands";

// ─── Helpers ──────────────────────────────────────────────────

/** Fuzzy-match an LLM-returned label to a known VOICE_COMMANDS entry */
function findBestMatch(label: string | undefined): (typeof VOICE_COMMANDS)[number] | null {
  if (!label) return null;

  const normalized = label.trim().toLowerCase();

  // 1. Exact case-insensitive match
  const exact = VOICE_COMMANDS.find((c) => c.label.toLowerCase() === normalized);
  if (exact) return exact;

  // 2. Label is contained in a known command label (or vice-versa)
  const contains = VOICE_COMMANDS.find(
    (c) => c.label.toLowerCase().includes(normalized) || normalized.includes(c.label.toLowerCase())
  );
  if (contains) return contains;

  // 3. Word overlap: at least one significant word matches
  const words = normalized.split(/\s+/).filter((w) => w.length > 2);
  const wordMatch = VOICE_COMMANDS.find((c) => {
    const cmdWords = c.label.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    return words.some((w) => cmdWords.some((cw) => cw.includes(w) || w.includes(cw)));
  });
  if (wordMatch) return wordMatch;

  return null;
}

// ─── POST /api/voice/command ───────────────────────────────────
// Parses user voice/text command and returns navigation or chat action
export async function POST(req: NextRequest) {
  try {
    const { command } = await req.json();

    if (!command || command.trim().length === 0) {
      return NextResponse.json({ error: "No command provided" }, { status: 400 });
    }

    const userMessage = command.trim();

    // ── Fast path: keyword matching ──
    const lower = userMessage.toLowerCase();
    const matched = VOICE_COMMANDS.find((cmd) =>
      cmd.keywords.some((kw) => lower.includes(kw))
    );

    if (matched) {
      return NextResponse.json({
        action: "navigate",
        route: matched.route,
        label: matched.label,
        section: matched.section,
        description: `Opening ${matched.label}`,
      });
    }

    // ── Slow path: LLM fuzzy matching ──
    const zai = await ZAI.create();
    const systemPrompt = buildCommandSystemPrompt();

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    // Strip markdown code blocks if present
    const jsonStr = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    try {
      const result = JSON.parse(jsonStr);

      if (result.action === "navigate" && result.route) {
        // Always normalize label & section to match known commands exactly.
        // This prevents LLM hallucinations from causing 404 pages.
        const bestMatch = findBestMatch(result.label);
        if (bestMatch) {
          return NextResponse.json({
            action: "navigate",
            route: bestMatch.route,
            label: bestMatch.label,
            section: bestMatch.section,
            description: result.description || `Opening ${bestMatch.label}`,
          });
        }
        // No match found — fall back to chat with helpful message
        return NextResponse.json({
          action: "chat",
          message: `I couldn't find a page called "${result.label}". Try saying something like "show dashboard" or "open subscribers".`,
        });
      }

      if (result.action === "chat" && result.message) {
        return NextResponse.json(result);
      }

      return NextResponse.json({
        action: "chat",
        message: result.message || "I understood but couldn't find the right page. Try rephrasing your command.",
      });
    } catch {
      // LLM didn't return valid JSON — return raw as chat message
      return NextResponse.json({
        action: "chat",
        message: jsonStr || "I couldn't process that command. Try saying something like 'show dashboard' or 'open subscribers'.",
      });
    }
  } catch (error: unknown) {
    console.warn("[Voice Command] Error:", error);
    return NextResponse.json({ error: "Command processing failed" }, { status: 500 });
  }
}
