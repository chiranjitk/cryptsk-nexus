import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

// ─── POST /api/voice/speak ─────────────────────────────────────
// Generates speech audio from text using z-ai-web-dev-sdk TTS
export async function POST(req: NextRequest) {
  try {
    const { text, voice = "tongtong", speed = 1.0 } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({ error: "Text cannot be empty" }, { status: 400 });
    }

    // Enforce max length
    const inputText = trimmed.length > 1000 ? trimmed.slice(0, 1000) : trimmed;

    const zai = await ZAI.create();

    // Request WAV format — the API returns raw PCM by default which browsers
    // can't play. WAV includes the proper header for browser Audio elements.
    const response = await zai.audio.tts.create({
      input: inputText,
      voice: voice as string,
      speed,
      response_format: "wav",
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));

    // Forward the content-type from SDK response
    const contentType = response.headers.get("content-type") || "audio/wav";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.warn("[Voice Speak] TTS Error:", error);
    return NextResponse.json(
      { error: "Failed to generate speech" },
      { status: 500 },
    );
  }
}
