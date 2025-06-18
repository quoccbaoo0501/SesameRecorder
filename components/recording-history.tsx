"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Trash2, Download, Clock, FileText, Play, Pause, AlertCircle, History } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface RecordingEntry {
  id: string
  timestamp: string
  duration: number
  transcriptLength: number
  audioSize: number
  audioUrl: string
  transcript: string
  captureMode: string
}

export function RecordingHistory() {
  const [recordings, setRecordings] = useState<RecordingEntry[]>([])
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem("sesame-recordings")
    if (saved) {
      try {
        const parsedRecordings = JSON.parse(saved);
        // Ensure audioUrl is present, older recordings might not have it
        const sanitized = parsedRecordings.map(rec => ({ ...rec, audioUrl: rec.audioUrl || null }));
        setRecordings(sanitized)
      } catch (error) {
        console.error("Failed to load recordings:", error)
        localStorage.removeItem("sesame-recordings"); // Clear corrupted data
      }
    }

    // Audio player cleanup
    return () => {
        if(audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
    }
  }, [])

  useEffect(() => {
    // This effect handles playing/pausing audio
    if (playingId && recordings.length > 0) {
      const recording = recordings.find(r => r.id === playingId);
      if (recording?.audioUrl) {
        if (!audioRef.current) {
          audioRef.current = new Audio(recording.audioUrl);
          audioRef.current.addEventListener('ended', () => setPlayingId(null));
          audioRef.current.addEventListener('pause', () => setPlayingId(null));
        }
        audioRef.current.src = recording.audioUrl;
        audioRef.current.play().catch(e => {
            toast.error("Could not play audio", { description: e.message });
            setPlayingId(null);
        });
      } else {
          toast.warning("No audio available for this entry.");
          setPlayingId(null);
      }
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [playingId, recordings]);


  const saveRecordings = (newRecordings: RecordingEntry[]) => {
    setRecordings(newRecordings)
    localStorage.setItem("sesame-recordings", JSON.stringify(newRecordings))
  }

  const deleteRecording = (id: string) => {
    const updated = recordings.filter((r) => r.id !== id)
    saveRecordings(updated)
    toast.success("Recording deleted")
  }

  const deleteAllRecordings = () => {
      saveRecordings([]);
      toast.success("All recordings have been deleted.");
  }

  const downloadAudio = (recording: RecordingEntry) => {
    if (!recording.audioUrl) {
      toast.error("Audio data not available for download.")
      return
    }
    const a = document.createElement("a")
    a.href = recording.audioUrl
    a.download = `recording-${new Date(recording.timestamp).toISOString()}.webm`
    document.body.appendChild(a)
    a.click()
    a.remove()
    toast.success("Download started")
  }
  
  const downloadTranscript = (recording: RecordingEntry) => {
      const transcriptData = JSON.parse(recording.transcript);
      if(transcriptData.length === 0) {
          toast.error("No transcript to download.");
          return;
      }
      const transcriptText = transcriptData.map(
        (entry: any) => `[${entry.timestamp}] ${entry.speaker.toUpperCase()}: ${entry.text}`
      ).join("\n\n");

      const blob = new Blob([transcriptText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transcript-${new Date(recording.timestamp).toISOString()}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Transcript download started.");
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 KB";
    const kb = bytes / 1024;
    if(kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb/1024).toFixed(1)} MB`;
  }

  return (
    <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
            <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5" />
            <span>Recording History</span>
            <Badge variant="secondary" className="ml-auto">
                {recordings.length}
            </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">Review and manage your past recordings.</p>
        </div>
        {recordings.length > 0 && (
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Clear All
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete all {recordings.length} recordings from your browser's storage.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={deleteAllRecordings}>Yes, delete all</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        )}
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[40rem]">
          {recordings.length === 0 ? (
            <div className="text-center text-slate-400 dark:text-slate-500 py-16 flex flex-col items-center justify-center">
              <History className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <h3 className="font-semibold text-lg">No recordings yet</h3>
              <p className="text-sm">Your saved recordings will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {recordings.map((recording) => (
                <div key={recording.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group">
                  <div className="flex-1 min-w-0 flex items-center gap-4">
                    <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setPlayingId(playingId === recording.id ? null : recording.id)} disabled={!recording.audioUrl}>
                        {!recording.audioUrl ? <AlertCircle className="h-5 w-5 text-muted-foreground" /> : playingId === recording.id ? <Pause className="h-5 w-5"/> : <Play className="h-5 w-5"/>}
                    </Button>
                    <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{new Date(recording.timestamp).toLocaleString()}</p>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                            <span><Badge variant="outline">{formatDuration(recording.duration)}</Badge></span>
                            <span>{formatFileSize(recording.audioSize)}</span>
                            <span className="capitalize"><Badge variant="secondary">{recording.captureMode}</Badge></span>
                        </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" onClick={() => downloadTranscript(recording)} title="Download Transcript">
                        <FileText className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => downloadAudio(recording)} title="Download Audio" disabled={!recording.audioUrl}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Delete Recording">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete this recording?</AlertDialogTitle>
                                <AlertDialogDescription>
                                This will permanently delete the recording from {new Date(recording.timestamp).toLocaleString()}. This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteRecording(recording.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
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