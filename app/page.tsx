"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Mic, MicOff, Download, FileAudio, FileText, Waves, Clock, AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"

interface TranscriptEntry {
  id: string
  timestamp: string
  speaker: "user" | "ai" // Keeping this for future speaker diarization
  text: string
}

// Check for SpeechRecognition API
const SpeechRecognition =
  (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition))

export default function RecorderUI() {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [currentTranscript, setCurrentTranscript] = useState("")
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<NodeJS.Timeout>()
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const animationFrameRef = useRef<number>()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const cleanupAudioProcessing = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    analyserRef.current = null;
    audioContextRef.current = null;
    dataArrayRef.current = null;
    setAudioLevel(0);
  }, []);

  const visualizeAudio = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return;

    analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
    const sum = dataArrayRef.current.reduce((acc, val) => acc + Math.abs(val - 128), 0);
    const avg = sum / dataArrayRef.current.length;
    setAudioLevel(avg * 5); // Scale for better visualization

    animationFrameRef.current = requestAnimationFrame(visualizeAudio);
  }, []);

  const setupAudioProcessing = useCallback((stream: MediaStream) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 2048;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    dataArrayRef.current = new Uint8Array(bufferLength);

    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);
    
    visualizeAudio();
  }, [visualizeAudio]);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setupAudioProcessing(stream);
      
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      mediaRecorderRef.current.addEventListener("dataavailable", (event) => {
        audioChunksRef.current.push(event.data);
      });
      
      mediaRecorderRef.current.addEventListener("stop", () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // In a real app, we might upload this blob or process it further.
        console.log("Recording stopped, blob created:", audioBlob);
        stream.getTracks().forEach(track => track.stop());
        cleanupAudioProcessing();
      });

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setDuration(0);
      setTranscript([]);
      
      // Speech Recognition
      if(SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        
        recognitionRef.current.onresult = (event) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          
          if(finalTranscript.trim()){
            const newEntry: TranscriptEntry = {
              id: Date.now().toString(),
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              speaker: "user",
              text: finalTranscript.trim(),
            }
            setTranscript(prev => [...prev, newEntry]);
            setCurrentTranscript("");
          }
          if(interimTranscript.trim()){
            setCurrentTranscript(interimTranscript);
          }
        };

        recognitionRef.current.onerror = (event) => {
            console.error("Speech recognition error", event.error);
            setError(`Speech recognition error: ${event.error}`);
        };
        
        recognitionRef.current.start();
      } else {
        setError("Speech recognition not supported by your browser. You can still record audio.");
      }

    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Microphone access denied. Please allow microphone access in your browser settings.");
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
        recognitionRef.current.stop();
    }
    setIsRecording(false);
    setCurrentTranscript("");
    toast.success("Recording stopped and saved.");
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

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

  useEffect(() => {
    // Auto-scroll transcript
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]")
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [transcript, currentTranscript])
  
    useEffect(() => {
    return () => {
      // Cleanup on component unmount
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      cleanupAudioProcessing();
    };
  }, [cleanupAudioProcessing]);

  const handleDownloadAudio = () => {
    if (audioChunksRef.current.length === 0) {
      toast.error("No audio recorded to download.");
      return;
    }
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = `recording-${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.webm`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success("Audio download started.");
  };

  const handleDownloadTranscript = () => {
    if (transcript.length === 0) {
        toast.error("No transcript to download.");
        return;
    }
    const transcriptText = transcript
      .map((entry) => `[${entry.timestamp}] ${entry.speaker.toUpperCase()}: ${entry.text}`)
      .join("\n\n")

    const blob = new Blob([transcriptText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.style.display = "none";
    a.href = url
    a.download = `transcript-${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click()
    URL.revokeObjectURL(url)
    a.remove();
    toast.success("Transcript download started.");
  }
  
  const isReady = !isRecording && duration === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8 transition-colors duration-300">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-slate-100">Sesame Recorder</h1>
          <p className="text-slate-600 dark:text-slate-400">Record, transcribe, and analyze your audio with ease.</p>
        </div>
        
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Recording Controls */}
        <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col items-center space-y-6">
              {/* Main Recording Button */}
              <Button
                onClick={handleToggleRecording}
                size="lg"
                className={`h-24 w-24 rounded-full text-white shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-100 focus-visible:ring-4 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  isRecording ? "bg-red-500 hover:bg-red-600 animate-pulse ring-red-300" : "bg-emerald-500 hover:bg-emerald-600 ring-emerald-300"
                }`}
              >
                {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
              </Button>

              {/* Status and Duration */}
              <div className="text-center space-y-2">
                <Badge variant={isRecording ? "destructive" : "secondary"} className="text-sm px-3 py-1 transition-colors">
                  {isRecording ? "Recording" : (isReady ? "Ready to Record" : "Finished")}
                </Badge>
                <div className="flex items-center justify-center space-x-2 text-slate-600 dark:text-slate-300">
                  <Clock className="h-4 w-4" />
                  <span className="font-mono text-lg">{formatDuration(duration)}</span>
                </div>
              </div>

              {/* Audio Waveform */}
              <div className="w-full max-w-md">
                <div className="flex items-center justify-center space-x-1 h-16 bg-slate-100 dark:bg-slate-800/50 rounded-lg p-2 overflow-hidden">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-emerald-400 rounded-full transition-all duration-100"
                      style={{
                        height: `${Math.max(2, Math.min(100, isRecording ? audioLevel * (1 + i/40) : 0))}%`,
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-center mt-2 text-sm text-slate-500 dark:text-slate-400">
                  <Waves className="h-4 w-4 mr-1" />
                  <span className="transition-opacity duration-300">{isRecording ? "Listening..." : "Audio visualization"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transcript Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Transcript */}
          <Card className="lg:col-span-2 border-0 shadow-lg bg-card/80 backdrop-blur-sm">
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
                    <div key={entry.id} className="space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex items-center space-x-2">
                        <Badge variant={entry.speaker === "user" ? "default" : "secondary"} className="text-xs uppercase">
                          {entry.speaker}
                        </Badge>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{entry.timestamp}</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{entry.text}</p>
                      <Separator className="my-2" />
                    </div>
                  ))}

                  {/* Current transcription */}
                  {currentTranscript && (
                    <div className="space-y-1 opacity-70">
                       <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          Transcribing...
                        </Badge>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 italic">{currentTranscript}</p>
                    </div>
                  )}

                  {transcript.length === 0 && !currentTranscript && (
                    <div className="text-center text-slate-400 dark:text-slate-500 py-12 flex flex-col items-center justify-center">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Start recording to see live transcription here.</p>
                      {!SpeechRecognition && <p className="text-xs mt-2">(Transcription API not available in your browser)</p>}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Download Section */}
          <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Download className="h-5 w-5" />
                <span>Export</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={handleDownloadAudio}
                disabled={isReady || isRecording}
                className="w-full justify-start transition-opacity hover:bg-slate-100 dark:hover:bg-slate-800"
                variant="outline"
              >
                <FileAudio className="h-4 w-4 mr-2" />
                Download Audio
                <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">WEBM</span>
              </Button>

              <Button
                onClick={handleDownloadTranscript}
                disabled={transcript.length === 0}
                className="w-full justify-start transition-opacity hover:bg-slate-100 dark:hover:bg-slate-800"
                variant="outline"
              >
                <FileText className="h-4 w-4 mr-2" />
                Download Transcript
                <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">TXT</span>
              </Button>

              <div className="pt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span className="font-mono">{formatDuration(duration)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Transcript Entries:</span>
                  <span className="font-mono">{transcript.length}</span>
                </div>
                 <div className="flex justify-between">
                  <span>Audio Size:</span>
                  <span className="font-mono">{audioChunksRef.current.length > 0 ? `${(new Blob(audioChunksRef.current).size / 1024).toFixed(1)} KB` : '0 KB'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
>>>>>>> REPLACE