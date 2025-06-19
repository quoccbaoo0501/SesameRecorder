"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Trash2, Download, Clock, FileText, User, Mic, Calendar, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

interface TranscriptEntry {
  id: string
  timestamp: string
  speaker: "user" | "ai"
  text: string
  source?: "microphone" | "system" | "manual"
  confidence?: number
}

interface AudioChunk {
  blob?: Blob
  timestamp: string
  duration: number
  chunkNumber: number
}

interface SessionEntry {
  id: string
  sessionDate: string
  sessionTime: string
  userName: string
  captureMode: string
  totalDuration: number
  totalChunks: number
  liveTranscript: TranscriptEntry[]
  finalTranscripts: string[]
  audioChunks: AudioChunk[]
  totalWords: number
}

export function RecordingHistory() {
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = () => {
    try {
      const saved = localStorage.getItem("sesame-session-history")
      if (saved) {
        const parsedSessions = JSON.parse(saved)
        setSessions(parsedSessions)
      }
    } catch (error) {
      console.error("Failed to load session history:", error)
    }
  }

  const saveSessions = (newSessions: SessionEntry[]) => {
    try {
      localStorage.setItem("sesame-session-history", JSON.stringify(newSessions))
      setSessions(newSessions)
    } catch (error) {
      console.error("Failed to save session history:", error)
    }
  }

  const deleteSession = (sessionId: string) => {
    const updated = sessions.filter((s) => s.id !== sessionId)
    saveSessions(updated)
    toast.success("Session deleted")
  }

  const clearAllSessions = () => {
    if (confirm("Are you sure you want to delete all session history? This cannot be undone.")) {
      saveSessions([])
      toast.success("All sessions cleared")
    }
  }

  const downloadSessionTranscript = (session: SessionEntry) => {
    const liveTranscriptText = session.liveTranscript
      .map((entry) => `${entry.speaker === "user" ? session.userName || "User" : "AI Assistant"}: ${entry.text}`)
      .join("\n")

    const finalTranscriptText = session.finalTranscripts
      .filter((t) => t && t.trim().length > 0)
      .join("\n\n--- Next Segment ---\n\n")

    const fullTranscript = `Session Recording Transcript
Date: ${session.sessionDate}
Time: ${session.sessionTime}
User: ${session.userName || "Unknown"}
Capture Mode: ${session.captureMode}
Duration: ${formatDuration(session.totalDuration)}
Chunks: ${session.totalChunks}
Total Words: ${session.totalWords}

=== LIVE TRANSCRIPT ===

${liveTranscriptText}

=== FINAL AI TRANSCRIPT ===

${finalTranscriptText}`

    const blob = new Blob([fullTranscript], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `session-${session.sessionDate.replace(/[:/]/g, "-")}-${session.sessionTime.replace(/[:/]/g, "-")}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Session transcript downloaded")
  }

  const toggleSessionExpansion = (sessionId: string) => {
    setExpandedSessions((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId)
      } else {
        newSet.add(sessionId)
      }
      return newSet
    })
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 KB"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  const formatTranscriptForDisplay = (text: string, userName: string) => {
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
            <div key={index} className="mb-2 p-2 rounded bg-slate-50 dark:bg-slate-800/30">
              <div className="flex items-center space-x-2 mb-1">
                <Badge variant={isUser ? "default" : "secondary"} className="text-xs">
                  {speakerName}
                </Badge>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{speakerContent}</p>
            </div>
          )
        }

        return (
          <p key={index} className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed mb-1">
            {trimmedLine}
          </p>
        )
      })
      .filter(Boolean)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm transition-colors duration-300">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Recording History</span>
              <Badge variant="secondary" className="ml-2">
                {sessions.length} sessions
              </Badge>
            </div>
            {sessions.length > 0 && (
              <Button
                onClick={clearAllSessions}
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Sessions List */}
      {sessions.length === 0 ? (
        <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm transition-colors duration-300">
          <CardContent className="py-12">
            <div className="text-center text-slate-400 dark:text-slate-500">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50 transition-colors duration-300" />
              <p className="text-lg font-medium mb-2">No recording sessions yet</p>
              <p className="text-sm">Start recording to see your session history here</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => {
            const isExpanded = expandedSessions.has(session.id)

            return (
              <Card
                key={session.id}
                className="border-0 shadow-lg bg-card/80 backdrop-blur-sm transition-colors duration-300"
              >
                <CardContent className="p-4">
                  {/* Session Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-slate-500" />
                        <span className="font-medium text-slate-700 dark:text-slate-300">{session.sessionDate}</span>
                        <span className="text-sm text-slate-500">{session.sessionTime}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={() => toggleSessionExpansion(session.id)}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                      >
                        {isExpanded ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                      <Button
                        onClick={() => downloadSessionTranscript(session)}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                      <Button
                        onClick={() => deleteSession(session.id)}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Session Info */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                    <div className="flex items-center space-x-2">
                      <User className="h-3 w-3 text-slate-500" />
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {session.userName || "Unknown"}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Mic className="h-3 w-3 text-slate-500" />
                      <span className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                        {session.captureMode}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-3 w-3 text-slate-500" />
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {formatDuration(session.totalDuration)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <FileText className="h-3 w-3 text-slate-500" />
                      <span className="text-sm text-slate-600 dark:text-slate-400">{session.totalWords} words</span>
                    </div>
                  </div>

                  {/* Session Stats */}
                  <div className="flex items-center space-x-4 mb-3">
                    <Badge variant="outline" className="text-xs">
                      {session.totalChunks} chunks
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {session.liveTranscript.length} live entries
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {session.finalTranscripts.filter((t) => t).length} AI transcripts
                    </Badge>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <>
                      <Separator className="my-4" />

                      {/* Live Transcript Preview */}
                      {session.liveTranscript.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-medium mb-2">Live Transcript</h4>
                          <ScrollArea className="h-32 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                            <div className="space-y-2">
                              {session.liveTranscript.slice(0, 5).map((entry) => (
                                <div key={entry.id} className="text-xs">
                                  <span className="font-medium">
                                    {entry.speaker === "user" ? session.userName || "User" : "AI Assistant"}:
                                  </span>{" "}
                                  <span className="text-slate-600 dark:text-slate-400">{entry.text}</span>
                                </div>
                              ))}
                              {session.liveTranscript.length > 5 && (
                                <div className="text-xs text-slate-500 italic">
                                  ... and {session.liveTranscript.length - 5} more entries
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      )}

                      {/* Final Transcript Preview */}
                      {session.finalTranscripts.some((t) => t) && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">AI Final Transcript</h4>
                          <ScrollArea className="h-40 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                            <div className="space-y-2">
                              {session.finalTranscripts
                                .filter((t) => t)
                                .slice(0, 2)
                                .map((transcript, index) => (
                                  <div key={index} className="space-y-1">
                                    {formatTranscriptForDisplay(transcript, session.userName)}
                                  </div>
                                ))}
                              {session.finalTranscripts.filter((t) => t).length > 2 && (
                                <div className="text-xs text-slate-500 italic">
                                  ... and {session.finalTranscripts.filter((t) => t).length - 2} more segments
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
