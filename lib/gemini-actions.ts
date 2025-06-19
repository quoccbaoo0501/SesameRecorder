"use server"

import { GoogleGenerativeAI } from "@google/generative-ai"

interface GeminiTranscriptResponse {
  success: boolean
  transcript?: string
  error?: string
}

// Process transcript to remove timestamps and clean up
const cleanTranscript = (transcript: string): string => {
  return transcript
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, "") // Remove [0:41] timestamps
    .replace(/\n\s*\n/g, "\n") // Remove extra blank lines
    .trim()
}

export async function transcribeAudioWithGemini(
  base64Audio: string,
  mimeType: string,
  audioSize: number,
  apiKey: string,
  userName?: string,
  liveTranscriptContext?: string,
  chunkIndex?: number,
): Promise<GeminiTranscriptResponse> {
  try {
    if (!apiKey || apiKey.trim().length === 0) {
      return {
        success: false,
        error: "Gemini API key is required. Please add your API key in Settings.",
      }
    }

    const currentSizeKB = audioSize / 1024
    console.log(`🎵 Processing audio chunk with Gemini 2.5 Flash: ${currentSizeKB.toFixed(1)}KB, type: ${mimeType}`)

    // Initialize Gemini with proper error handling
    let genAI: GoogleGenerativeAI
    let model: any

    try {
      genAI = new GoogleGenerativeAI(apiKey.trim())
      model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
    } catch (initError) {
      console.error("Failed to initialize Gemini:", initError)
      return {
        success: false,
        error: "Failed to initialize Gemini API. Please check your API key.",
      }
    }

    const userDisplayName = userName || "User"
    const chunkInfo = chunkIndex !== undefined ? ` (Chunk ${chunkIndex + 1})` : ""

    // Simplified prompt to avoid rendering issues
    const prompt = `Transcribe this audio${chunkInfo} accurately. Identify speakers as "${userDisplayName}" for human speech and "AI Assistant" for AI responses. Format as:

${userDisplayName}: [human speech]
AI Assistant: [AI speech]

Provide clean dialogue without timestamps.`

    const audioPart = {
      inlineData: {
        data: base64Audio,
        mimeType: "audio/mpeg",
      },
    }

    try {
      const result = await model.generateContent([prompt, audioPart])
      const response = await result.response
      const transcript = response.text()

      if (transcript && transcript.trim().length > 0) {
        const cleanedTranscript = cleanTranscript(transcript)
        console.log(`✅ Audio transcribed: ${cleanedTranscript.length} characters`)

        return {
          success: true,
          transcript: cleanedTranscript,
        }
      } else {
        return {
          success: false,
          error: "No transcript generated from the audio file",
        }
      }
    } catch (transcriptionError) {
      console.error(`❌ Transcription failed:`, transcriptionError)

      // Handle specific Gemini errors
      if (transcriptionError.message?.includes("API_KEY_INVALID")) {
        return {
          success: false,
          error: "Invalid Gemini API key. Please check your API key in Settings.",
        }
      } else if (transcriptionError.message?.includes("QUOTA_EXCEEDED")) {
        return {
          success: false,
          error: "Gemini API quota exceeded. Please try again later.",
        }
      } else if (transcriptionError.message?.includes("RESOURCE_EXHAUSTED")) {
        return {
          success: false,
          error: "Gemini API resource exhausted. Audio file may be too large.",
        }
      } else {
        return {
          success: false,
          error: `Transcription failed: ${transcriptionError.message || "Unknown error"}`,
        }
      }
    }
  } catch (error) {
    console.error("Gemini API error:", error)
    return {
      success: false,
      error: `Gemini API error: ${error.message || "Unknown error"}`,
    }
  }
}

// Update the MP3 function signature
export async function transcribeMP3WithGemini(
  base64Audio: string,
  audioSize: number,
  apiKey: string,
  userName?: string,
  liveTranscriptContext?: string,
  chunkIndex?: number,
): Promise<GeminiTranscriptResponse> {
  return transcribeAudioWithGemini(
    base64Audio,
    "audio/mpeg",
    audioSize,
    apiKey,
    userName,
    liveTranscriptContext,
    chunkIndex,
  )
}
