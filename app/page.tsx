"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Mic, MicOff, Download, FileAudio, FileText, Waves, Clock } from "lucide-react"

interface TranscriptEntry {
  id: string
  timestamp: string
  speaker: "user" | "ai"
  text: string
}

export default function AIRecorderUI() {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [currentTranscript, setCurrentTranscript] = useState("")
  const [audioLevel, setAudioLevel] = useState(0)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<NodeJS.Timeout>()

  // Simulate recording duration
  useEffect(() => {
    if (isRecording) {
      intervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1)
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isRecording])

  // Simulate audio level for waveform
  useEffect(() => {
    if (isRecording) {
      const audioInterval = setInterval(() => {
        setAudioLevel(Math.random() * 100)
      }, 100)
      return () => clearInterval(audioInterval)
    } else {
      setAudioLevel(0)
    }
  }, [isRecording])

  // Simulate live transcription
  useEffect(() => {
    if (isRecording) {
      const transcriptInterval = setInterval(() => {
        const sampleTexts = [
          "Hello, how can I help you today?",
          "I'm looking for information about...",
          "That's a great question. Let me explain...",
          "Could you clarify what you mean by...?",
          "Based on what you've told me...",
          "I understand your concern about...",
        ]

        const randomText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)]
        const speaker = Math.random() > 0.5 ? "user" : "ai"

        setCurrentTranscript(randomText)

        // Add to transcript after a delay
        setTimeout(() => {
          const newEntry: TranscriptEntry = {
            id: Date.now().toString(),
            timestamp: new Date().toLocaleTimeString(),
            speaker,
            text: randomText,
          }
          setTranscript((prev) => [...prev, newEntry])
          setCurrentTranscript("")
        }, 2000)
      }, 4000)

      return () => clearInterval(transcriptInterval)
    }
  }, [isRecording])

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]")
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [transcript, currentTranscript])

  const handleToggleRecording = () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false)
      setCurrentTranscript("")
    } else {
      // Start recording
      setIsRecording(true)
      setDuration(0)
      setTranscript([])
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleDownloadAudio = () => {
    // Simulate audio download
    const blob = new Blob([""], { type: "audio/webm" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `recording-${new Date().toISOString().slice(0, 19)}.webm`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadTranscript = () => {
    const transcriptText = transcript
      .map((entry) => `[${entry.timestamp}] ${entry.speaker.toUpperCase()}: ${entry.text}`)
      .join("\n")

    const blob = new Blob([transcriptText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `transcript-${new Date().toISOString().slice(0, 19)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-slate-800">AI Conversation Recorder</h1>
          <p className="text-slate-600">Record and transcribe your AI conversations in real-time</p>
        </div>

        {/* Recording Controls */}
        <Card className="border-0 shadow-lg">
          <CardContent className="p-8">
            <div className="flex flex-col items-center space-y-6">
              {/* Main Recording Button */}
              <Button
                onClick={handleToggleRecording}
                size="lg"
                className={`h-24 w-24 rounded-full text-white shadow-lg transition-all duration-300 ${
                  isRecording ? "bg-red-500 hover:bg-red-600 animate-pulse" : "bg-emerald-500 hover:bg-emerald-600"
                }`}
              >
                {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
              </Button>

              {/* Status and Duration */}
              <div className="text-center space-y-2">
                <Badge variant={isRecording ? "destructive" : "secondary"} className="text-sm px-3 py-1">
                  {isRecording ? "Recording" : "Ready"}
                </Badge>
                <div className="flex items-center justify-center space-x-2 text-slate-600">
                  <Clock className="h-4 w-4" />
                  <span className="font-mono text-lg">{formatDuration(duration)}</span>
                </div>
              </div>

              {/* Audio Waveform */}
              <div className="w-full max-w-md">
                <div className="flex items-center justify-center space-x-1 h-16 bg-slate-100 rounded-lg p-4">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-1 bg-emerald-400 rounded-full transition-all duration-150 ${
                        isRecording ? "animate-pulse" : ""
                      }`}
                      style={{
                        height: isRecording ? `${Math.max(4, (audioLevel + Math.random() * 20) % 40)}px` : "4px",
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-center mt-2 text-sm text-slate-500">
                  <Waves className="h-4 w-4 mr-1" />
                  {isRecording ? "Listening..." : "Audio visualization"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transcript Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Transcript */}
          <Card className="lg:col-span-2 border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>Live Transcript</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96" ref={scrollAreaRef}>
                <div className="space-y-4 pr-4">
                  {transcript.map((entry) => (
                    <div key={entry.id} className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <Badge variant={entry.speaker === "user" ? "default" : "secondary"} className="text-xs">
                          {entry.speaker === "user" ? "USER" : "AI"}
                        </Badge>
                        <span className="text-xs text-slate-500">{entry.timestamp}</span>
                      </div>
                      <p className="text-slate-700 leading-relaxed">{entry.text}</p>
                      <Separator className="my-2" />
                    </div>
                  ))}

                  {/* Current transcription */}
                  {currentTranscript && (
                    <div className="space-y-1 opacity-70">
                      <Badge variant="outline" className="text-xs">
                        Transcribing...
                      </Badge>
                      <p className="text-slate-600 italic">{currentTranscript}</p>
                    </div>
                  )}

                  {transcript.length === 0 && !currentTranscript && (
                    <div className="text-center text-slate-400 py-12">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Start recording to see live transcription</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Download Section */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Download className="h-5 w-5" />
                <span>Export</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={handleDownloadAudio}
                disabled={!transcript.length && !isRecording}
                className="w-full justify-start"
                variant="outline"
              >
                <FileAudio className="h-4 w-4 mr-2" />
                Download Audio
                <span className="ml-auto text-xs text-slate-500">WEBM</span>
              </Button>

              <Button
                onClick={handleDownloadTranscript}
                disabled={!transcript.length}
                className="w-full justify-start"
                variant="outline"
              >
                <FileText className="h-4 w-4 mr-2" />
                Download Transcript
                <span className="ml-auto text-xs text-slate-500">TXT</span>
              </Button>

              <div className="pt-4 space-y-2 text-sm text-slate-600">
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span className="font-mono">{formatDuration(duration)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Entries:</span>
                  <span>{transcript.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
