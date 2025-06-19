"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Trash2, Download, Clock, FileText } from "lucide-react"
import { toast } from "sonner"

interface RecordingEntry {
  id: string
  timestamp: string
  duration: number
  transcriptLength: number
  audioSize: number
  audioBlob?: Blob
  transcript: string
}

export function RecordingHistory() {
  const [recordings, setRecordings] = useState<RecordingEntry[]>([])
  const [playingId, setPlayingId] = useState<string | null>(null)

  useEffect(() => {
    // Load recordings from localStorage
    const saved = localStorage.getItem("sesame-recordings")
    if (saved) {
      try {
        setRecordings(JSON.parse(saved))
      } catch (error) {
        console.error("Failed to load recordings:", error)
      }
    }
  }, [])

  const saveRecordings = (newRecordings: RecordingEntry[]) => {
    setRecordings(newRecordings)
    localStorage.setItem("sesame-recordings", JSON.stringify(newRecordings))
  }

  const deleteRecording = (id: string) => {
    const updated = recordings.filter((r) => r.id !== id)
    saveRecordings(updated)
    toast.success("Recording deleted")
  }

  const downloadRecording = (recording: RecordingEntry) => {
    if (!recording.audioBlob) {
      toast.error("Audio data not available")
      return
    }

    const url = URL.createObjectURL(recording.audioBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = `recording-${recording.timestamp.replace(/[:/]/g, "-")}.webm`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Download started")
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const formatFileSize = (bytes: number) => {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return (
    <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Clock className="h-5 w-5" />
          <span>Recording History</span>
          <Badge variant="secondary" className="ml-auto">
            {recordings.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          {recordings.length === 0 ? (
            <div className="text-center text-slate-400 dark:text-slate-500 py-8">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recordings yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recordings.map((recording) => (
                <div
                  key={recording.id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {recording.timestamp}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {formatDuration(recording.duration)}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {recording.transcriptLength} chars • {formatFileSize(recording.audioSize)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadRecording(recording)}
                      className="h-8 w-8 p-0"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteRecording(recording.id)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
