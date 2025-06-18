"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Trash2, Download, History, Play, Pause, AlertCircle, FileText, Monitor, Mic } from "lucide-react"
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface RecordingEntry {
  id: string
  timestamp: string
  duration: number
  transcriptLength: number
  audioSize: number
  audioUrl: string | null
  transcript: string
  captureMode: "microphone" | "desktop" | "both"
}

export function RecordingHistory() {
  const [recordings, setRecordings] = useState<RecordingEntry[]>([])
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [_, setForceRender] = useState(0); // to re-render on storage change
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const loadRecordings = () => {
       const saved = localStorage.getItem("sesame-recordings")
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as RecordingEntry[];
                setRecordings(parsed.map(rec => ({ ...rec, audioUrl: rec.audioUrl || null })));
            } catch (error) {
                console.error("Failed to load recordings:", error)
                localStorage.removeItem("sesame-recordings"); 
            }
        } else {
          setRecordings([]);
        }
    }
    
    loadRecordings();
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "sesame-recordings") {
        loadRecordings();
        setForceRender(c => c + 1);
      }
    }

    window.addEventListener('storage', handleStorageChange)

    return () => {
        window.removeEventListener('storage', handleStorageChange);
        if(audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
    }
  }, [])

  useEffect(() => {
    if (playingId) {
      const recording = recordings.find(r => r.id === playingId);
      if (recording?.audioUrl) {
        if (!audioRef.current) {
          audioRef.current = new Audio();
          audioRef.current.addEventListener('ended', () => setPlayingId(null));
          audioRef.current.addEventListener('pause', () => {
            // Only nullify if it wasn't an explicit pause from the user
            if(audioRef.current?.paused && !audioRef.current.ended) {
               // setPlayingId(null);
            }
          });
        }
        if(audioRef.current.src !== recording.audioUrl) {
            audioRef.current.src = recording.audioUrl;
        }
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
     window.dispatchEvent(new StorageEvent('storage', {key: 'sesame-recordings'}));
  }

  const deleteRecording = (id: string) => {
    const recordingToDelete = recordings.find(r => r.id === id);
    if(recordingToDelete?.audioUrl) {
        URL.revokeObjectURL(recordingToDelete.audioUrl);
    }
    const updated = recordings.filter((r) => r.id !== id)
    saveRecordings(updated)
    toast.success("Recording deleted")
  }

  const deleteAllRecordings = () => {
      recordings.forEach(rec => {
          if (rec.audioUrl) URL.revokeObjectURL(rec.audioUrl);
      })
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
    toast.success("Audio download started")
  }
  
  const downloadTranscript = (recording: RecordingEntry) => {
      try {
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
      } catch {
          toast.error("Failed to parse transcript data.");
      }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, "0")}`
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
        <div>
            <CardTitle className="flex items-center space-x-2">
            <History className="h-5 w-5" />
            <span>Recording History</span>
            </CardTitle>
            <CardDescription>Review and manage your past {recordings.length} recordings.</CardDescription>
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
                        <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={deleteAllRecordings}>Yes, delete all</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        )}
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[40rem]">
          {recordings.length === 0 ? (
            <div className="text-center text-slate-400 dark:text-slate-500 py-16 flex flex-col items-center justify-center h-full">
              <History className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <h3 className="font-semibold text-lg">No recordings yet</h3>
              <p className="text-sm">Your saved recordings will appear here when you're done.</p>
            </div>
          ) : (
            <div className="space-y-2 pr-4">
              <TooltipProvider>
              {recordings.map((recording) => (
                <div key={recording.id} className="flex items-center justify-between p-3 bg-background/50 rounded-lg hover:bg-accent/50 transition-colors group">
                  <div className="flex-1 min-w-0 flex items-center gap-4">
                    <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setPlayingId(playingId === recording.id ? null : recording.id)} disabled={!recording.audioUrl}>
                        {!recording.audioUrl ? <AlertCircle className="h-5 w-5 text-muted-foreground" /> : playingId === recording.id ? <Pause className="h-5 w-5 animate-pulse"/> : <Play className="h-5 w-5"/>}
                    </Button>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{new Date(recording.timestamp).toLocaleString()}</p>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap mt-1">
                            <Badge variant="outline">{formatDuration(recording.duration)}</Badge>
                            <Badge variant="outline">{formatFileSize(recording.audioSize)}</Badge>
                            <Badge variant="secondary" className="capitalize flex items-center gap-1">
                                {recording.captureMode === 'microphone' && <Mic className="h-3 w-3" />}
                                {recording.captureMode === 'desktop' && <Monitor className="h-3 w-3" />}
                                {recording.captureMode === 'both' && <><Mic className="h-3 w-3" />+<Monitor className="h-3 w-3" /></>}
                                {recording.captureMode}
                            </Badge>
                        </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Tooltip>
                        <TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => downloadTranscript(recording)}><FileText className="h-4 w-4" /></Button></TooltipTrigger>
                        <TooltipContent><p>Download Transcript (.txt)</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => downloadAudio(recording)} disabled={!recording.audioUrl}><Download className="h-4 w-4" /></Button></TooltipTrigger>
                        <TooltipContent><p>Download Audio (.webm)</p></TooltipContent>
                    </Tooltip>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                             <Tooltip>
                                <TooltipTrigger asChild><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button></TooltipTrigger>
                                <TooltipContent><p>Delete Recording</p></TooltipContent>
                            </Tooltip>
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
              </TooltipProvider>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}