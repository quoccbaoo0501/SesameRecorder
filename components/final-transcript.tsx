"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Download, Loader2, Clock, ExternalLink, Sparkles, Zap } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { transcribeMP3WithGemini } from "@/lib/gemini-actions"

interface FinalTranscriptProps {
  audioBlob: Blob | null
  onTranscriptComplete: (transcript: string) => void
  autoStart?: boolean
  userName?: string
}

export function FinalTranscript({
  audioBlob,
  onTranscriptComplete,
  autoStart = false,
  userName,
}: FinalTranscriptProps) {
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [finalTranscriptText, setFinalTranscriptText] = useState("")
  const [transcriptionStatus, setTranscriptionStatus] = useState("")
  const [currentChunk, setCurrentChunk] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)

  const audioRef = useRef<HTMLAudioElement>(null)
  const hasStartedRef = useRef(false)

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

  // Convert WebM to MP3 for better Gemini compatibility
  const convertToMp3 = async (audioBlob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer
          const audioContext = new (window.AudioContext || window.webkitAudioContext)()
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

          // Get audio data
          const leftChannel = audioBuffer.getChannelData(0)
          const rightChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel

          // Convert to 16-bit PCM
          const leftPCM = new Int16Array(leftChannel.length)
          const rightPCM = new Int16Array(rightChannel.length)

          for (let i = 0; i < leftChannel.length; i++) {
            leftPCM[i] = Math.max(-32768, Math.min(32767, leftChannel[i] * 32768))
            rightPCM[i] = Math.max(-32768, Math.min(32767, rightChannel[i] * 32768))
          }

          // Initialize MP3 encoder
          const mp3encoder = new (window as any).lamejs.Mp3Encoder(
            audioBuffer.numberOfChannels,
            audioBuffer.sampleRate,
            128, // bitrate
          )

          const mp3Data = []
          const sampleBlockSize = 1152 // samples per frame

          for (let i = 0; i < leftPCM.length; i += sampleBlockSize) {
            const leftChunk = leftPCM.subarray(i, i + sampleBlockSize)
            const rightChunk = rightPCM.subarray(i, i + sampleBlockSize)
            const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk)
            if (mp3buf.length > 0) {
              mp3Data.push(mp3buf)
            }
          }

          // Finalize encoding
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

  const startTranscription = async () => {
    if (!audioBlob || isTranscribing) {
      return
    }

    console.log("🚀 Starting Gemini 2.5 Flash transcription with audio blob:", audioBlob.type, audioBlob.size)
    setIsTranscribing(true)
    setError(null)
    setProgress(0)
    setIsComplete(false)
    setFinalTranscriptText("")
    setCurrentChunk(0)
    setTotalChunks(0)
    setTranscriptionStatus("Initializing Gemini 2.5 Flash...")

    try {
      // Get audio duration for progress estimation
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Audio loading timeout"))
        }, 10000)

        audio.addEventListener("loadedmetadata", () => {
          clearTimeout(timeout)
          const duration = audio.duration

          if (!isFinite(duration) || duration === 0) {
            const estimatedDuration = audioBlob.size / (16000 * 2)
            setDuration(Math.max(10, Math.min(300, estimatedDuration)))
          } else {
            setDuration(duration)
          }

          // Estimate number of chunks
          const estimatedChunks = Math.ceil(duration / 40)
          setTotalChunks(estimatedChunks)

          resolve(null)
        })

        audio.addEventListener("error", (e) => {
          clearTimeout(timeout)
          reject(new Error("Failed to load audio file"))
        })

        audio.load()
      })

      URL.revokeObjectURL(audioUrl)

      // Step 1: Convert to MP3 for better Gemini compatibility
      setTranscriptionStatus("Converting audio to MP3...")
      setProgress(10)
      showToast("🔄 Converting audio for Gemini 2.5 Flash...", "loading")

      let mp3Blob: Blob
      if (audioBlob.type.includes("mp3") || audioBlob.type.includes("mpeg")) {
        mp3Blob = audioBlob
        console.log("✅ Audio is already MP3")
      } else {
        console.log("🔄 Converting WebM to MP3...")
        mp3Blob = await convertToMp3(audioBlob)
        console.log(`✅ Converted to MP3: ${mp3Blob.size} bytes`)
      }

      // Step 2: Convert to base64 for Server Action
      setTranscriptionStatus("Preparing for Gemini 2.5 Flash...")
      setProgress(20)

      const arrayBuffer = await mp3Blob.arrayBuffer()
      const base64Audio = Buffer.from(arrayBuffer).toString("base64")

      // Check if chunking will be needed
      const sizeKB = mp3Blob.size / 1024
      const estimatedDuration = duration

      if (estimatedDuration > 40 || sizeKB > 5000) {
        const chunks = Math.ceil(estimatedDuration / 40)
        setTotalChunks(chunks)
        setTranscriptionStatus(`Processing ${chunks} audio chunks...`)
        showToast(`🔄 Splitting into ${chunks} chunks for processing...`, "loading")
      } else {
        setTotalChunks(1)
        setTranscriptionStatus("Processing single audio file...")
      }

      // Get API key from localStorage - REQUIRED
      const savedApiKey = localStorage.getItem("gemini-api-key")

      if (!savedApiKey || savedApiKey.trim().length === 0) {
        throw new Error("Gemini API key not found. Please add your API key in Settings first.")
      }

      // Step 3: Send to Gemini 2.5 Flash for transcription
      setTranscriptionStatus("Processing with Gemini 2.5 Flash...")
      setProgress(30)
      showToast("🤖 Gemini 2.5 Flash is analyzing your audio...", "loading")

      const result = await transcribeMP3WithGemini(base64Audio, mp3Blob.size, savedApiKey, userName)

      if (!result.success) {
        throw new Error(result.error || "Gemini 2.5 Flash transcription failed")
      }

      // Step 4: Process results
      setTranscriptionStatus("Finalizing transcript...")
      setProgress(90)

      const transcript = result.transcript!
      setFinalTranscriptText(transcript)

      setProgress(100)
      setIsComplete(true)
      setIsTranscribing(false)
      setTranscriptionStatus("Completed!")

      onTranscriptComplete(transcript)
      showToast(
        `✨ Gemini 2.5 Flash transcription completed! ${transcript.split(" ").length} words transcribed.`,
        "success",
      )
    } catch (err) {
      console.error("Gemini 2.5 Flash transcription failed:", err)
      setError(`Transcription failed: ${err.message}`)
      setIsTranscribing(false)
      setTranscriptionStatus("Failed")
      showToast("❌ Transcription failed", "error")
    }
  }

  // Auto-start transcription when audioBlob is provided
  useEffect(() => {
    if (audioBlob && autoStart && !hasStartedRef.current && !isTranscribing) {
      hasStartedRef.current = true
      console.log("🚀 Auto-starting Gemini 2.5 Flash transcription")
      setTimeout(() => {
        startTranscription()
      }, 1500)
    }
  }, [audioBlob, autoStart])

  // Reset when new audioBlob is provided
  useEffect(() => {
    if (audioBlob) {
      hasStartedRef.current = false
      setFinalTranscriptText("")
      setIsComplete(false)
      setError(null)
      setTranscriptionStatus("")
      setCurrentChunk(0)
      setTotalChunks(0)
    }
  }, [audioBlob])

  const downloadFinalTranscript = () => {
    if (!finalTranscriptText) {
      showToast("No final transcript available to download", "error")
      return
    }

    const fullTranscript = `Final Audio Transcript (Gemini 2.5 Flash)\nGenerated: ${new Date().toLocaleString()}\nDuration: ${formatTime(duration)}\nTotal Words: ${finalTranscriptText.split(" ").length}\nUser: ${userName || "User"}\n\n=== COMPLETE TRANSCRIPT ===\n\n${finalTranscriptText}`

    const blob = new Blob([fullTranscript], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.style.display = "none"
    a.href = url
    a.download = `final-transcript-gemini-2.5-flash-${new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-")}.txt`
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    a.remove()
    showToast("Final transcript downloaded!", "success")
  }

  const manualStart = () => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true
      startTranscription()
    }
  }

  // Format transcript for better display
  const formatTranscriptForDisplay = (text: string) => {
    return text
      .split("\n")
      .map((line, index) => {
        const trimmedLine = line.trim()
        if (!trimmedLine) return null

        // Check if line starts with speaker name
        if (trimmedLine.includes(":")) {
          const [speaker, ...content] = trimmedLine.split(":")
          const speakerName = speaker.trim()
          const speakerContent = content.join(":").trim()

          const isUser = speakerName === userName || speakerName === "User"

          return (
            <div key={index} className="mb-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
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

  return (
    <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <span>Final Audio Transcript (Gemini 2.5 Flash)</span>
          {isTranscribing && (
            <Badge variant="secondary" className="ml-auto animate-pulse">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              {transcriptionStatus}
            </Badge>
          )}
          {isComplete && finalTranscriptText && (
            <Badge variant="default" className="ml-auto bg-purple-600">
              <Zap className="h-3 w-3 mr-1" />
              {finalTranscriptText.split(" ").length} words
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

        {!audioBlob ? (
          <div className="text-center text-slate-400 dark:text-slate-500 py-8">
            <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50 text-purple-400" />
            <p>Complete a recording to transcribe with Gemini 2.5 Flash</p>
            <p className="text-xs mt-2">Advanced AI transcription with automatic chunking for long recordings</p>
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
                    <span>Est. {formatTime(duration)}</span>
                  </span>
                </div>
                <Progress value={progress} className="w-full" />
                <div className="text-xs text-purple-600 dark:text-purple-400 text-center">
                  {Math.round(progress)}% complete • Gemini 2.5 Flash AI processing
                  {totalChunks > 1 && ` • ${totalChunks} chunks`}
                </div>
              </div>
            )}

            {/* Manual Start Button */}
            {!isTranscribing && !isComplete && !hasStartedRef.current && (
              <div className="text-center py-6">
                <Button onClick={manualStart} className="mb-4 bg-purple-600 hover:bg-purple-700">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Start Gemini 2.5 Flash Transcription
                </Button>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Click to transcribe your audio with Google's most advanced Gemini 2.5 Flash AI
                </p>
              </div>
            )}

            {/* Final Complete Transcript */}
            {finalTranscriptText && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Complete Final Transcript</h4>
                  <Button onClick={downloadFinalTranscript} variant="outline" size="sm">
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
                  <div className="max-h-96 overflow-y-auto">
                    <div className="space-y-2">{formatTranscriptForDisplay(finalTranscriptText)}</div>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-sm border border-purple-200 dark:border-purple-800">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="font-medium text-purple-700 dark:text-purple-300">
                        {finalTranscriptText.split(" ").length}
                      </div>
                      <div className="text-xs text-purple-600 dark:text-purple-400">Total Words</div>
                    </div>
                    <div>
                      <div className="font-medium text-purple-700 dark:text-purple-300">{formatTime(duration)}</div>
                      <div className="text-xs text-purple-600 dark:text-purple-400">Duration</div>
                    </div>
                    <div>
                      <div className="font-medium text-purple-700 dark:text-purple-300">
                        {totalChunks > 1 ? `${totalChunks} chunks` : "1 file"}
                      </div>
                      <div className="text-xs text-purple-600 dark:text-purple-400">Processed</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Waiting state */}
            {!isTranscribing && !isComplete && !finalTranscriptText && hasStartedRef.current && (
              <div className="text-center text-slate-400 dark:text-slate-500 py-8">
                <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-purple-500" />
                <p>Preparing Gemini 2.5 Flash transcription...</p>
                <p className="text-xs mt-2">This will start automatically</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
