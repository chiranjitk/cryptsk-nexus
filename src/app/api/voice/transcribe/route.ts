import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

// ─── POST /api/voice/transcribe ────────────────────────────────
// Transcribes audio to text using z-ai-web-dev-sdk ASR
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  if (!contentType.startsWith("multipart/form-data")) {
    return NextResponse.json(
      { error: "Unsupported content type. This endpoint requires multipart/form-data with an 'audio' file field." },
      { status: 400 },
    );
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // The SDK sends ASR request as JSON body.
    // Audio must be base64-encoded — the API accepts file_base64 field.
    const base64Audio = audioBuffer.toString("base64");

    const zai = await ZAI.create();
    const result = await zai.audio.asr.create({
      file_base64: base64Audio,
    });

    // ASR response varies — extract text from common formats
    const text = typeof result === "string"
      ? result
      : result?.text || result?.content || result?.result?.text || JSON.stringify(result);

    return NextResponse.json({ text });
  } catch (error: unknown) {
    console.warn("[Voice Transcribe] ASR Error:", error);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}
