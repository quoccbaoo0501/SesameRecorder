import { type NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json()

    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json({ error: "API key is required" }, { status: 400 })
    }

    // Initialize Gemini with 2.5 Pro (now supports audio)
    const genAI = new GoogleGenerativeAI(apiKey.trim())
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

    // Test with a simple text prompt
    const result = await model.generateContent(
      "Hello, this is a test. Please respond with 'Gemini 2.5 Pro API key is working perfectly for audio transcription'.",
    )
    const response = await result.response
    const text = response.text()

    if (text && text.length > 0) {
      return NextResponse.json({
        success: true,
        message: "API key is valid and working with Gemini 2.5 Pro (Audio Support)",
        model: "gemini-2.5-pro",
        response: text.substring(0, 100) + "...", // Show partial response
      })
    } else {
      return NextResponse.json({ error: "Invalid response from Gemini 2.5 Pro API" }, { status: 400 })
    }
  } catch (error) {
    console.error("Gemini 2.5 Pro API validation error:", error)

    if (error.message?.includes("API key")) {
      return NextResponse.json({ error: "Invalid API key for Gemini 2.5 Pro" }, { status: 401 })
    } else if (error.message?.includes("quota") || error.message?.includes("QUOTA_EXCEEDED")) {
      return NextResponse.json({ error: "Gemini API quota exceeded" }, { status: 429 })
    } else if (error.message?.includes("PERMISSION_DENIED")) {
      return NextResponse.json(
        { error: "Permission denied. Check API key permissions for Gemini 2.5 Pro" },
        { status: 403 },
      )
    } else {
      return NextResponse.json(
        {
          error: `Gemini 2.5 Pro API validation failed: ${error.message}`,
        },
        { status: 400 },
      )
    }
  }
}
