"use server"

import { GoogleGenerativeAI } from "@google/generative-ai"

interface GeminiTranscriptResponse {
  success: boolean
  transcript?: string
  error?: string
}

// Audio chunking function
const splitAudioIntoChunks = async (base64Audio: string, chunkDurationSeconds = 40): Promise<string[]> => {
  try {
    // Convert base64 to blob
    const byteCharacters = atob(base64Audio)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const audioBlob = new Blob([byteArray], { type: "audio/mpeg" })

    // Create audio context for processing
    const audioContext = new (globalThis.AudioContext || globalThis.webkitAudioContext)()
    const arrayBuffer = await audioBlob.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    const sampleRate = audioBuffer.sampleRate
    const totalSamples = audioBuffer.length
    const totalDuration = totalSamples / sampleRate
    const samplesPerChunk = chunkDurationSeconds * sampleRate

    console.log(`🎵 Splitting audio: ${totalDuration.toFixed(1)}s into ${chunkDurationSeconds}s chunks`)

    const chunks: string[] = []
    const numberOfChunks = Math.ceil(totalSamples / samplesPerChunk)

    for (let i = 0; i < numberOfChunks; i++) {
      const startSample = i * samplesPerChunk
      const endSample = Math.min(startSample + samplesPerChunk, totalSamples)
      const chunkLength = endSample - startSample

      // Create new buffer for this chunk
      const chunkBuffer = audioContext.createBuffer(1, chunkLength, sampleRate)
      const chunkData = chunkBuffer.getChannelData(0)
      const originalData = audioBuffer.getChannelData(0)

      // Copy data to chunk
      for (let j = 0; j < chunkLength; j++) {
        chunkData[j] = originalData[startSample + j]
      }

      // Convert chunk to MP3
      const leftPCM = new Int16Array(chunkLength)
      for (let j = 0; j < chunkLength; j++) {
        leftPCM[j] = Math.max(-32768, Math.min(32767, chunkData[j] * 32768))
      }

      // Encode to MP3
      const mp3encoder = new (globalThis as any).lamejs.Mp3Encoder(1, sampleRate, 64)
      const mp3Data = []
      const sampleBlockSize = 1152

      for (let j = 0; j < leftPCM.length; j += sampleBlockSize) {
        const leftChunk = leftPCM.subarray(j, j + sampleBlockSize)
        const mp3buf = mp3encoder.encodeBuffer(leftChunk, leftChunk)
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf)
        }
      }

      const mp3buf = mp3encoder.flush()
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf)
      }

      const chunkBlob = new Blob(mp3Data, { type: "audio/mpeg" })
      const chunkArrayBuffer = await chunkBlob.arrayBuffer()
      const chunkBase64 = Buffer.from(chunkArrayBuffer).toString("base64")

      chunks.push(chunkBase64)
      console.log(`✅ Chunk ${i + 1}/${numberOfChunks}: ${(chunkBlob.size / 1024).toFixed(1)}KB`)
    }

    await audioContext.close()
    return chunks
  } catch (error) {
    console.error("Audio chunking failed:", error)
    throw error
  }
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
): Promise<GeminiTranscriptResponse> {
  try {
    if (!apiKey || apiKey.trim().length === 0) {
      return {
        success: false,
        error: "Gemini API key is required. Please add your API key in Settings.",
      }
    }

    const currentSizeKB = audioSize / 1024
    console.log(`🎵 Processing audio with Gemini 2.5 Flash: ${currentSizeKB.toFixed(1)}KB, type: ${mimeType}`)

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey.trim())
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

    const userDisplayName = userName || "User"

    // Split audio into chunks if larger than 40 seconds (estimated)
    const estimatedDuration = audioSize / (16000 * 2) // Rough estimate
    let chunks: string[]

    if (estimatedDuration > 40 || currentSizeKB > 5000) {
      console.log(`🔄 Audio too long (${estimatedDuration.toFixed(1)}s), splitting into chunks...`)
      chunks = await splitAudioIntoChunks(base64Audio, 40)
    } else {
      chunks = [base64Audio]
    }

    console.log(`📦 Processing ${chunks.length} audio chunks`)

    // Process each chunk
    const transcriptParts: string[] = []

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      console.log(`🎤 Processing chunk ${i + 1}/${chunks.length}`)

      const prompt = `Please transcribe this audio chunk completely and accurately.

IMPORTANT SPEAKER IDENTIFICATION:
- The human speaker should be labeled as "${userDisplayName}"
- The AI assistant should be labeled as "AI Assistant"

Instructions:
- Provide complete word-for-word transcription with highest accuracy
- Use the exact speaker names specified above
- Do NOT add timestamps like [0:41] - just provide clean dialogue
- Include natural paragraph breaks
- Handle multiple speakers intelligently

Format the output as:
${userDisplayName}: [their speech]
AI Assistant: [AI speech]

Audio chunk ${i + 1}/${chunks.length} - Transcribe everything you can hear:`

      const audioPart = {
        inlineData: {
          data: chunk,
          mimeType: "audio/mpeg",
        },
      }

      try {
        const result = await model.generateContent([prompt, audioPart])
        const response = await result.response
        const chunkTranscript = response.text()

        if (chunkTranscript && chunkTranscript.trim().length > 0) {
          const cleanedTranscript = cleanTranscript(chunkTranscript)
          transcriptParts.push(cleanedTranscript)
          console.log(`✅ Chunk ${i + 1} transcribed: ${cleanedTranscript.length} characters`)
        }
      } catch (chunkError) {
        console.error(`❌ Chunk ${i + 1} failed:`, chunkError)
        transcriptParts.push(`[Chunk ${i + 1} transcription failed]`)
      }

      // Add delay between requests to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    // Combine all transcript parts
    const finalTranscript = transcriptParts.join("\n\n").trim()

    if (!finalTranscript || finalTranscript.length === 0) {
      return {
        success: false,
        error: "No transcript generated from the audio file",
      }
    }

    console.log(`✅ Gemini 2.5 Flash transcription completed: ${finalTranscript.length} characters`)

    return {
      success: true,
      transcript: finalTranscript,
    }
  } catch (error) {
    console.error("Gemini 2.5 Flash transcription error:", error)

    // Handle specific error types
    if (error.message?.includes("API key")) {
      return {
        success: false,
        error: "Invalid Gemini API key. Please check your API key in Settings.",
      }
    } else if (error.message?.includes("quota") || error.message?.includes("QUOTA_EXCEEDED")) {
      return {
        success: false,
        error: "Gemini API quota exceeded. Please try again later or check your billing.",
      }
    } else if (error.message?.includes("RESOURCE_EXHAUSTED")) {
      return {
        success: false,
        error: "Gemini API resource exhausted. The audio file might be too large. Try recording shorter segments.",
      }
    } else if (error.message?.includes("UNSUPPORTED_MEDIA_TYPE")) {
      return {
        success: false,
        error: "Audio format not supported by Gemini 2.5 Flash. Please try recording in a different format.",
      }
    } else if (error.message?.includes("PERMISSION_DENIED")) {
      return {
        success: false,
        error: "Permission denied. Please check your Gemini API key permissions.",
      }
    } else {
      return {
        success: false,
        error: `Gemini 2.5 Flash transcription failed: ${error.message}`,
      }
    }
  }
}

// Alternative function for MP3 files specifically - this is the missing export
export async function transcribeMP3WithGemini(
  base64Audio: string,
  audioSize: number,
  apiKey: string,
  userName?: string,
): Promise<GeminiTranscriptResponse> {
  return transcribeAudioWithGemini(base64Audio, "audio/mpeg", audioSize, apiKey, userName)
}
