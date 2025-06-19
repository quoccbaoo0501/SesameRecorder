"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Download, Loader2, Clock, ExternalLink, Sparkles, Zap, RotateCcw } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { transcribeMP3WithGemini } from "@/lib/gemini-actions"

interface AudioChunk {
  blob: Blob
  timestamp: string
  duration: number
  chunkNumber: number
}

interface FinalTranscriptProps {
  audioChunks: AudioChunk[]
  onTranscriptComplete: (transcript: string, chunkIndex: number) => void
  autoStart?: boolean
  userName?: string
  liveTranscriptContext?: string
  onResetSession?: () => void
  geminiApiKeys: string[]
}

export function FinalTranscript({
  audioChunks,
  onTranscriptComplete,
  autoStart = false,
  userName,
  liveTranscriptContext,
  onResetSession,
  geminiApiKeys: propApiKeys,
}: FinalTranscriptProps) {
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [completedTranscripts, setCompletedTranscripts] = useState<string[]>([])
  const [transcriptionStatus, setTranscriptionStatus] = useState("")
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [processedChunks, setProcessedChunks] = useState<Set<number>>(new Set())
  const [apiKeyUsage, setApiKeyUsage] = useState<{ [key: number]: number }>({})
  const [geminiApiKeys, setGeminiApiKeys] = useState<string[]>([])

  const processingRef = useRef(false)

  // Load API keys from localStorage on mount
  useEffect(() => {
    const loadApiKeys = () => {
      try {
        const saved = localStorage.getItem("gemini-api-keys")
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed)) {
            setGeminiApiKeys(parsed.filter((key) => key && key.trim().length > 0))
          }
        }
      } catch (error) {
        console.error("Failed to load API keys:", error)
      }
    }

    loadApiKeys()

    // Also use prop keys as fallback
    if (propApiKeys && propApiKeys.length > 0) {
      setGeminiApiKeys(propApiKeys)
    }
  }, [propApiKeys])

  const showToast = (message: string, type: "success" | "error" | "loading" = "success") => {
    const notification = document.createElement("div")
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg text-white transition-all duration-300 ${
      type === "success" ? "bg-green-500" : type === "error" ? "bg-red-500" : "bg-blue-500"
    }`
    notification.textContent = message
    document.body.appendChild(notification)

    setTimeout(() => {
      notification.style.opacity = "0"
      setTimeout(() => {
        document.body.removeChild(notification)
      }, 300)
    }, 3000)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  // Get API key for current chunk using rotation
  const getApiKeyForChunk = (chunkIndex: number): string => {
    if (geminiApiKeys.length === 0) {
      throw new Error("No Gemini API keys configured")
    }

    const keyIndex = chunkIndex % geminiApiKeys.length
    const apiKey = geminiApiKeys[keyIndex]

    // Track usage
    setApiKeyUsage((prev) => ({
      ...prev,
      [keyIndex]: (prev[keyIndex] || 0) + 1,
    }))

    console.log(`🔑 Using API key ${keyIndex + 1}/${geminiApiKeys.length} for chunk ${chunkIndex + 1}`)
    return apiKey
  }

  // Convert WebM to MP3 for better Gemini compatibility
  const convertToMp3 = async (audioBlob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer
          const audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 48000,
          })
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

          const numberOfChannels = audioBuffer.numberOfChannels
          const leftChannel = audioBuffer.getChannelData(0)
          const rightChannel = numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel

          const leftPCM = new Int16Array(leftChannel.length)
          const rightPCM = new Int16Array(rightChannel.length)

          for (let i = 0; i < leftChannel.length; i++) {
            leftPCM[i] = Math.max(-32768, Math.min(32767, leftChannel[i] * 32767))
            rightPCM[i] = Math.max(-32768, Math.min(32767, rightChannel[i] * 32767))
          }

          const mp3encoder = new (window as any).lamejs.Mp3Encoder(
            numberOfChannels,
            audioBuffer.sampleRate,
            192, // High quality
          )

          const mp3Data = []
          const sampleBlockSize = 1152

          for (let i = 0; i < leftPCM.length; i += sampleBlockSize) {
            const leftChunk = leftPCM.subarray(i, i + sampleBlockSize)
            const rightChunk = rightPCM.subarray(i, i + sampleBlockSize)
            const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk)
            if (mp3buf.length > 0) {
              mp3Data.push(mp3buf)
            }
          }

          const mp3buf = mp3encoder.flush()
          if (mp3buf.length > 0) {
            mp3Data.push(mp3buf)
          }

          const mp3Blob = new Blob(mp3Data, { type: "audio/mpeg" })
          resolve(mp3Blob)
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(audioBlob)
    })
  }

  const processAudioChunk = async (chunkIndex: number) => {
    if (processedChunks.has(chunkIndex) || chunkIndex >= audioChunks.length) {
      return
    }

    const chunk = audioChunks[chunkIndex]
    console.log(`🚀 Processing chunk ${chunkIndex + 1}/${audioChunks.length} (Chunk #${chunk.chunkNumber})`)

    try {
      setCurrentChunkIndex(chunkIndex)
      setTranscriptionStatus(
        `Processing chunk ${chunkIndex + 1}/${audioChunks.length} with API key ${(chunkIndex % geminiApiKeys.length) + 1}...`,
      )
      setProgress((chunkIndex / audioChunks.length) * 100)

      // Convert to MP3
      let mp3Blob: Blob
      if (chunk.blob.type.includes("mp3") || chunk.blob.type.includes("mpeg")) {
        mp3Blob = chunk.blob
      } else {
        mp3Blob = await convertToMp3(chunk.blob)
      }

      // Convert to base64
      const arrayBuffer = await mp3Blob.arrayBuffer()
      const base64Audio = Buffer.from(arrayBuffer).toString("base64")

      // Get API key for this chunk (with rotation)
      const apiKey = getApiKeyForChunk(chunkIndex)

      // Send to Gemini with retry logic
      let result
      let retryCount = 0
      const maxRetries = 2

      while (retryCount <= maxRetries) {
        try {
          result = await transcribeMP3WithGemini(
            base64Audio,
            mp3Blob.size,
            apiKey,
            userName,
            liveTranscriptContext,
            chunkIndex,
          )
          break // Success, exit retry loop
        } catch (apiError) {
          retryCount++
          if (retryCount > maxRetries) {
            throw apiError
          }
          console.log(`Retry ${retryCount}/${maxRetries} for chunk ${chunkIndex + 1}`)
          await new Promise((resolve) => setTimeout(resolve, 2000)) // Wait 2 seconds before retry
        }
      }

      if (!result.success) {
        throw new Error(result.error || "Gemini transcription failed")
      }

      // Update completed transcripts
      setCompletedTranscripts((prev) => {
        const newTranscripts = [...prev]
        newTranscripts[chunkIndex] = result.transcript!
        return newTranscripts
      })

      setProcessedChunks((prev) => new Set([...prev, chunkIndex]))
      onTranscriptComplete(result.transcript!, chunkIndex)

      showToast(
        `✅ Chunk ${chunkIndex + 1} transcribed with API key ${(chunkIndex % geminiApiKeys.length) + 1}!`,
        "success",
      )
    } catch (error) {
      console.error(`❌ Chunk ${chunkIndex + 1} failed:`, error)
      setError(`Chunk ${chunkIndex + 1} failed: ${error.message}`)
      showToast(`❌ Chunk ${chunkIndex + 1} failed`, "error")
    }
  }

  // Process new chunks automatically
  useEffect(() => {
    if (audioChunks.length > 0 && autoStart && !processingRef.current && geminiApiKeys.length > 0) {
      const unprocessedChunks = audioChunks.map((_, index) => index).filter((index) => !processedChunks.has(index))

      if (unprocessedChunks.length > 0) {
        processingRef.current = true
        setIsTranscribing(true)
        setError(null)

        // Process all unprocessed chunks
        const processChunks = async () => {
          for (const chunkIndex of unprocessedChunks) {
            await processAudioChunk(chunkIndex)
            // Small delay between chunks
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }

          setIsTranscribing(false)
          setTranscriptionStatus("All chunks processed!")
          setProgress(100)
          processingRef.current = false
        }

        processChunks()
      }
    }
  }, [audioChunks.length, autoStart, processedChunks, geminiApiKeys.length])

  const handleResetSession = () => {
    setCompletedTranscripts([])
    setProcessedChunks(new Set())
    setCurrentChunkIndex(0)
    setProgress(0)
    setError(null)
    setTranscriptionStatus("")
    setIsTranscribing(false)
    setApiKeyUsage({})
    processingRef.current = false

    if (onResetSession) {
      onResetSession()
    }

    showToast("🗑️ Session reset!", "success")
  }

  const downloadAllTranscripts = () => {
    if (completedTranscripts.length === 0) {
      showToast("No transcripts available to download", "error")
      return
    }

    const combinedTranscript = completedTranscripts
      .filter((t) => t && t.trim().length > 0)
      .join("\n\n--- Next Segment ---\n\n")

    const fullTranscript = `Complete Audio Transcript (Gemini 2.5 Flash)\nGenerated: ${new Date().toLocaleString()}\nTotal Segments: ${completedTranscripts.filter((t) => t).length}\nUser: ${userName || "User"}\nAPI Keys Used: ${geminiApiKeys.length}\n\n=== COMPLETE TRANSCRIPT ===\n\n${combinedTranscript}`

    const blob = new Blob([fullTranscript], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.style.display = "none"
    a.href = url
    a.download = `complete-transcript-${new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-")}.txt`
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    a.remove()
    showToast("Complete transcript downloaded!", "success")
  }

  // Format transcript for better display
  const formatTranscriptForDisplay = (text: string) => {
    return text
      .split("\n")
      .map((line, index) => {
        const trimmedLine = line.trim()
        if (!trimmedLine) return null

        if (trimmedLine.includes(":")) {
          const [speaker, ...content] = trimmedLine.split(":")
          const speakerName = speaker.trim()
          const speakerContent = content.join(":").trim()

          const isUser = speakerName === userName || speakerName === "User"

          return (
            <div key={index} className="mb-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center space-x-2 mb-2">
                <Badge variant={isUser ? "default" : "secondary"} className="text-xs">
                  {speakerName}
                </Badge>
              </div>
              <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{speakerContent}</p>
            </div>
          )
        }

        return (
          <p key={index} className="text-slate-700 dark:text-slate-200 leading-relaxed mb-2">
            {trimmedLine}
          </p>
        )
      })
      .filter(Boolean)
  }

  const totalWords = completedTranscripts
    .filter((t) => t)
    .reduce((acc, transcript) => acc + transcript.split(" ").length, 0)

  return (
    <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm transition-colors duration-300">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <span>Final Audio Transcript</span>
          {isTranscribing && (
            <Badge variant="secondary" className="ml-auto animate-pulse">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              {transcriptionStatus}
            </Badge>
          )}
          {completedTranscripts.length > 0 && (
            <Badge variant="default" className="ml-auto bg-purple-600">
              <Zap className="h-3 w-3 mr-1" />
              {totalWords} words
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              {error.includes("API key") && (
                <div className="mt-2">
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-600 hover:text-blue-800 underline"
                  >
                    Get Gemini API Key <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {audioChunks.length === 0 ? (
          <div className="text-center text-slate-400 dark:text-slate-500 py-8">
            <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50 text-purple-400" />
            <p>Start recording to see automatic transcription</p>
            <p className="text-xs mt-2">Audio will be processed in 30-second chunks automatically</p>
            {geminiApiKeys.length > 1 && (
              <p className="text-xs mt-1">Using {geminiApiKeys.length} API keys with rotation</p>
            )}
            {geminiApiKeys.length === 0 && (
              <p className="text-xs mt-2 text-orange-600 dark:text-orange-400">
                Add Gemini API keys in Settings to enable transcription
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Progress Section */}
            {isTranscribing && (
              <div className="space-y-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center space-x-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    <span className="text-purple-700 dark:text-purple-300">{transcriptionStatus}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Clock className="h-3 w-3" />
                    <span>
                      Chunk {currentChunkIndex + 1}/{audioChunks.length}
                    </span>
                  </span>
                </div>
                <Progress value={progress} className="w-full" />
                <div className="text-xs text-purple-600 dark:text-purple-400 text-center">
                  {Math.round(progress)}% complete • Gemini 2.5 Flash AI processing
                  {geminiApiKeys.length > 1 && ` • Rotating ${geminiApiKeys.length} API keys`}
                </div>
              </div>
            )}

            {/* API Key Usage Stats */}
            {geminiApiKeys.length > 1 && Object.keys(apiKeyUsage).length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  <div className="font-medium mb-2">🔑 API Key Usage</div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(apiKeyUsage).map(([keyIndex, usage]) => (
                      <div key={keyIndex} className="flex justify-between">
                        <span>Key #{Number.parseInt(keyIndex) + 1}:</span>
                        <span>{usage} chunks</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              <Button
                onClick={downloadAllTranscripts}
                variant="outline"
                size="sm"
                disabled={completedTranscripts.length === 0}
              >
                <Download className="h-3 w-3 mr-1" />
                Download All
              </Button>
              <Button
                onClick={handleResetSession}
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset Session
              </Button>
            </div>

            {/* Completed Transcripts */}
            {completedTranscripts.some((t) => t) && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">
                  Complete Conversation ({completedTranscripts.filter((t) => t).length} segments processed)
                </h4>

                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {completedTranscripts.map((transcript, index) => {
                      if (!transcript) return null

                      return (
                        <div key={index} className="space-y-2">
                          {formatTranscriptForDisplay(transcript)}
                          {index < completedTranscripts.length - 1 && completedTranscripts[index + 1] && (
                            <div className="border-t border-slate-200 dark:border-slate-700 my-4"></div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-sm border border-purple-200 dark:border-purple-800">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="font-medium text-purple-700 dark:text-purple-300">{totalWords}</div>
                      <div className="text-xs text-purple-600 dark:text-purple-400">Total Words</div>
                    </div>
                    <div>
                      <div className="font-medium text-purple-700 dark:text-purple-300">
                        {completedTranscripts.filter((t) => t).length}
                      </div>
                      <div className="text-xs text-purple-600 dark:text-purple-400">Segments</div>
                    </div>
                    <div>
                      <div className="font-medium text-purple-700 dark:text-purple-300">
                        {formatTime(audioChunks.reduce((acc, chunk) => acc + chunk.duration, 0))}
                      </div>
                      <div className="text-xs text-purple-600 dark:text-purple-400">Total Duration</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
