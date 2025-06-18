"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Mic,
  MicOff,
  Download,
  FileAudio,
  FileText,
  Waves,
  Clock,
  AlertTriangle,
  Monitor,
  Info,
  Headphones,
  Bot,
  User,
  Settings,
  History,
  LineChart,
  BrainCircuit,
  Volume2
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"
import { AudioSettings, type AudioSettings as AudioSettingsType } from "@/components/audio-settings"
import { RecordingHistory } from "@/components/recording-history"
import { AnalyticsDashboard } from "@/components/analytics-dashboard"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

interface TranscriptEntry {
  id: string
  timestamp: string
  speaker: "user" | "ai"
  text: string
  source?: "microphone" | "system" | "manual"
  confidence?: number
}

// Check for SpeechRecognition API
const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)

// Check MediaRecorder support
const getSupportedMimeType = () => {
  if (typeof MediaRecorder === "undefined") return null
  const types = [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/webm",
    "audio/ogg",
  ]
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return null
}

export default function RecorderUI() {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [currentTranscript, setCurrentTranscript] = useState("")
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  
  const [captureMode, setCaptureMode] = useState<"microphone" | "desktop" | "both">("both")
  const [isListeningForAI, setIsListeningForAI] = useState(false)
  const [isBrowserSupported, setIsBrowserSupported] = useState(true);

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<NodeJS.Timeout>()
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const animationFrameRef = useRef<number>()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const aiRecognitionRef = useRef<SpeechRecognition | null>(null)
  
  const userMicStreamRef = useRef<MediaStream | null>(null);
  const desktopStreamRef = useRef<MediaStream | null>(null);

  const [audioSettings, setAudioSettings] = useState<AudioSettingsType>({
    sampleRate: 48000,
    bitRate: 128000,
    autoGain: true,
    noiseSuppression: true,
    echoCancellation: true,
    language: "en-US",
    sensitivity: 50,
  })

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const cleanupAudioProcessing = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(console.error);
    }
    analyserRef.current = null
    audioContextRef.current = null
    dataArrayRef.current = null
    setAudioLevel(0)
  }, [])
  
  const stopAllStreams = useCallback(() => {
    userMicStreamRef.current?.getTracks().forEach(track => track.stop());
    desktopStreamRef.current?.getTracks().forEach(track => track.stop());
    userMicStreamRef.current = null;
    desktopStreamRef.current = null;
  }, []);

  const visualizeAudio = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return

    analyserRef.current.getByteFrequencyData(dataArrayRef.current)
    const sum = dataArrayRef.current.reduce((acc, val) => acc + val, 0)
    const avg = sum / dataArrayRef.current.length
    setAudioLevel(avg)

    animationFrameRef.current = requestAnimationFrame(visualizeAudio)
  }, [])

  const setupAudioVisualizer = useCallback(
    (stream: MediaStream) => {
      if (audioContextRef.current?.state === 'running') return;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256;
      
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      const bufferLength = analyser.frequencyBinCount
      dataArrayRef.current = new Uint8Array(bufferLength)
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      visualizeAudio()
    },
    [visualizeAudio],
  )
  
  const startDesktopCapture = async (): Promise<MediaStream> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: audioSettings.echoCancellation,
          noiseSuppression: audioSettings.noiseSuppression,
          autoGainControl: audioSettings.autoGain,
        },
      });

      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach(track => track.stop()); // Stop video track if no audio
        toast.error("No audio track captured.", { description: "Please ensure you check 'Share tab audio' or 'Share system audio' when prompted." });
        throw new Error("No audio track available. User did not grant audio permission.");
      }

      toast.success("Desktop audio capture started.");
      desktopStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error("Desktop audio capture error:", err)
      const message = err.name === 'NotAllowedError' ? 'Permission denied for screen capture.' : 'Failed to capture desktop audio.'
      setError(message);
      toast.error(message);
      throw new Error(message);
    }
  };

  const setupAiSpeechRecognition = useCallback((stream: MediaStream) => {
    if (!SpeechRecognition) return;

    // Create a new audio context to process the stream for recognition
    const recognitionAudioContext = new AudioContext();
    const source = recognitionAudioContext.createMediaStreamSource(stream);
    
    // Gain to boost volume for better recognition
    const gainNode = recognitionAudioContext.createGain();
    gainNode.gain.value = 2.0;

    // Filter to remove low-frequency noise
    const highpass = recognitionAudioContext.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 200;

    const destination = recognitionAudioContext.createMediaStreamDestination();
    
    source.connect(highpass);
    highpass.connect(gainNode);
    gainNode.connect(destination);
    
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false; // We only want final results for AI
    recognition.lang = audioSettings.language;
    aiRecognitionRef.current = recognition;

    recognition.onstart = () => {
      console.log("AI speech recognition started.");
      setIsListeningForAI(true);
    };

    recognition.onend = () => {
      console.log("AI speech recognition ended.");
      setIsListeningForAI(false);
      // Automatically restart if we are still in a recording session
      if (mediaRecorderRef.current?.state === "recording") {
        setTimeout(() => aiRecognitionRef.current?.start(), 100);
      } else {
        recognitionAudioContext.close().catch(console.error);
      }
    };

    recognition.onerror = (event) => {
      console.error("AI recognition error:", event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        toast.error("AI recognition error", { description: event.error });
      }
    };

    recognition.onresult = (event) => {
      let aiTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          aiTranscript += event.results[i][0].transcript;
        }
      }

      if (aiTranscript.trim()) {
        console.log(`AI said: ${aiTranscript}`);
        const newEntry: TranscriptEntry = {
          id: `ai-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          speaker: "ai",
          text: aiTranscript.trim(),
          source: "system",
          confidence: event.results[event.resultIndex]?.[0]?.confidence || 0.8,
        };
        setTranscript(prev => [...prev, newEntry]);
        toast.info("AI response transcribed!");
      }
    };

    // Use the processed stream for recognition
    const processedStreamForRecognition = destination.stream;
    
    try {
        // Some browsers require the stream to be assigned this way
        // This is a non-standard property
        (recognition as any).mediaStream = processedStreamForRecognition;
        recognition.start();
    } catch(e) {
        console.error("Could not start AI recognition with processed stream, trying direct stream.", e);
        // Fallback to direct stream if the above fails
        const originalAudioTrack = stream.getAudioTracks()[0];
        if (originalAudioTrack) {
            const streamForRecognition = new MediaStream([originalAudioTrack]);
             (recognition as any).mediaStream = streamForRecognition;
            recognition.start();
        } else {
            console.error("No audio track on AI stream to fall back to.");
        }
    }
  }, [audioSettings.language]);

  const startRecording = async () => {
    setError(null);
    if (!getSupportedMimeType()) {
        setError("Your browser doesn't support the required audio recording formats.");
        toast.error("Browser not supported", { description: "MediaRecorder API or supported codecs are not available." });
        return;
    }

    try {
      // 1. Get streams
      if (captureMode === "microphone" || captureMode === "both") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: audioSettings.echoCancellation,
                noiseSuppression: audioSettings.noiseSuppression,
                autoGainControl: audioSettings.autoGain,
            },
          });
          userMicStreamRef.current = stream;
          toast.success("Microphone connected.");
        } catch (err) {
          console.error("Microphone access error:", err);
          setError("Microphone permission was denied. Please grant access to record your voice.");
          toast.error("Microphone access denied.");
          return;
        }
      }
      
      if (captureMode === "desktop" || captureMode === "both") {
          try {
              await startDesktopCapture();
          } catch(e) {
              if (captureMode === "desktop") {
                  // If only desktop was requested and failed, stop the process.
                  return;
              }
              // If 'both' was requested, we can continue with just the mic.
              toast.warning("Desktop audio capture failed. Recording microphone only.");
          }
      }

      // 2. Combine streams for recording
      const audioTracks: MediaStreamTrack[] = [];
      if (userMicStreamRef.current) audioTracks.push(...userMicStreamRef.current.getAudioTracks());
      if (desktopStreamRef.current) audioTracks.push(...desktopStreamRef.current.getAudioTracks());

      if(audioTracks.length === 0) {
        setError("No audio sources available to record.");
        toast.error("No audio source", { description: "Could not find a microphone or desktop audio to record." });
        return;
      }
      
      const combinedStream = new MediaStream(audioTracks);

      // 3. Setup MediaRecorder
      audioChunksRef.current = [];
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(combinedStream, { mimeType: mimeType!, audioBitsPerSecond: audioSettings.bitRate });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stopAllStreams();
        cleanupAudioProcessing();
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        setError(`Recording error: ${(event as any).error?.message || "Unknown error"}`);
        toast.error("Recording Error", { description: (event as any).error?.message });
      };

      // 4. Setup Speech Recognitions
      if (userMicStreamRef.current) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = audioSettings.language;
        recognitionRef.current = recognition;

        recognition.onresult = (event) => {
          let interimTranscript = "";
          let finalTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          if (finalTranscript.trim()) {
            const newEntry: TranscriptEntry = {
              id: `user-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
              speaker: "user",
              text: finalTranscript.trim(),
              source: "microphone",
              confidence: event.results[event.resultIndex]?.[0]?.confidence || 0.9,
            };
            setTranscript((prev) => [...prev, newEntry]);
            setCurrentTranscript("");
          }
          if (interimTranscript.trim()) {
            setCurrentTranscript(interimTranscript);
          }
        };

        recognition.onerror = (event) => {
          console.error("User speech recognition error", event.error);
          if (event.error !== "no-speech" && event.error !== "aborted") {
            setError(`Speech recognition error: ${event.error}`);
            toast.error("Speech recognition error", { description: event.error });
          }
        };
        
        recognition.onend = () => {
          if (mediaRecorderRef.current?.state === "recording") {
            setTimeout(() => recognitionRef.current?.start(), 100);
          }
        }

        recognition.start();
      }

      if (desktopStreamRef.current && desktopStreamRef.current.getAudioTracks().length > 0) {
        setupAiSpeechRecognition(desktopStreamRef.current);
      }

      // 5. Start everything
      recorder.start(1000);
      setIsRecording(true);
      setDuration(0);
      setTranscript([]);
      setCurrentTranscript("");
      setupAudioVisualizer(combinedStream);
      toast.success("Recording has started!", {
        description: `Mode: ${captureMode}. AI speech recognition is ${desktopStreamRef.current ? 'active' : 'inactive'}.`
      });

    } catch (err) {
      console.error("Error starting recording:", err);
      const typedError = err as Error;
      setError(`Failed to start recording: ${typedError.message}.`);
      toast.error("Failed to start recording", { description: typedError.message });
      stopAllStreams();
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
    if (aiRecognitionRef.current) {
      aiRecognitionRef.current.stop();
    }

    setIsRecording(false);
    setIsListeningForAI(false);
    setCurrentTranscript("");

    if (audioChunksRef.current.length > 0) {
      const audioBlob = new Blob(audioChunksRef.current, { type: getSupportedMimeType() || "audio/webm" });
      const newRecording = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        duration,
        transcriptLength: transcript.length,
        audioSize: audioBlob.size,
        transcript: JSON.stringify(transcript),
        captureMode,
        audioUrl: URL.createObjectURL(audioBlob),
      };

      try {
        const savedRecordings = JSON.parse(localStorage.getItem("sesame-recordings") || "[]");
        savedRecordings.unshift(newRecording);
        localStorage.setItem("sesame-recordings", JSON.stringify(savedRecordings.slice(0, 50))); // Keep last 50
        toast.success("Recording stopped and saved to History tab.");
      } catch (e) {
        toast.error("Failed to save recording", { description: "Your browser storage might be full."});
      }
    } else {
        toast.info("Recording stopped. No audio data was captured to save.");
    }
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
        setDuration((prev) => prev + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRecording]);

  useEffect(() => {
    // Auto-scroll transcript
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [transcript, currentTranscript]);

  useEffect(() => {
    // Check for browser support on mount
    if (!SpeechRecognition || !getSupportedMimeType() || !navigator.mediaDevices) {
        setIsBrowserSupported(false);
        setError("Your browser is not fully supported. Some features may not work.");
        toast.warning("Browser not fully supported", { description: "Please use a modern browser like Chrome or Firefox for the best experience." });
    }

    // Cleanup on unmount
    return () => {
      stopAllStreams();
      if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
      }
      recognitionRef.current?.stop();
      aiRecognitionRef.current?.stop();
      cleanupAudioProcessing();
    };
  }, [cleanupAudioProcessing, stopAllStreams]);

  const handleDownloadAudio = () => {
    if (audioChunksRef.current.length === 0) {
      toast.error("No audio recorded to download.");
      return;
    }
    const audioBlob = new Blob(audioChunksRef.current, { type: getSupportedMimeType() || 'audio/webm' });
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sesame-recording-${new Date().toISOString()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Audio download started!");
  };

  const handleDownloadTranscript = () => {
    if (transcript.length === 0) {
      toast.error("No transcript to download.");
      return;
    }
    const transcriptText = transcript.map(
      (entry) => `[${entry.timestamp}] ${entry.speaker.toUpperCase()}: ${entry.text}`
    ).join("\n\n");

    const blob = new Blob([transcriptText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = `sesame-transcript-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Transcript download started.");
  };

  const isReady = !isRecording && duration === 0;

  return (
    <>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 dark:from-gray-900 dark:to-slate-900 p-4 sm:p-6 lg:p-8 transition-colors duration-300">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-800 dark:text-slate-100 flex items-center justify-center gap-3">
            <BrainCircuit className="text-emerald-500 w-8 h-8"/> Sesame Recorder
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-balance max-w-2xl mx-auto">
            The intelligent recording tool that captures, transcribes, and analyzes your conversations with AI, seamlessly.
          </p>
        </header>

        {!isBrowserSupported && (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Browser Not Supported</AlertTitle>
                <AlertDescription>Your browser lacks full support for the technologies this app relies on (SpeechRecognition, MediaRecorder). Please switch to a recent version of Google Chrome or Firefox on a desktop computer for full functionality.</AlertDescription>
            </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="animate-in fade-in-25">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>An Error Occurred</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {(captureMode === "desktop" || captureMode === "both") && !isRecording && (
          <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-800 dark:text-blue-300">Heads up for Desktop Capture!</AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-400">
              When starting the recording, your browser will ask for screen sharing permission.
              To capture AI audio, <strong>you must check the "Share tab audio" or "Share system audio" box</strong>.
              Using headphones is recommended to prevent echo.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="recorder" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-6">
            <TabsTrigger value="recorder"><Mic className="w-4 h-4 mr-2" />Recorder</TabsTrigger>
            <TabsTrigger value="history"><History className="w-4 h-4 mr-2" />History</TabsTrigger>
            <TabsTrigger value="analytics"><LineChart className="w-4 h-4 mr-2" />Analytics</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="w-4 h-4 mr-2" />Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="recorder" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Recording Controls Column */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
                        <CardHeader>
                            <CardTitle>Recording Controls</CardTitle>
                            <CardDescription>Select mode and start recording</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center space-y-6">
                            {/* Capture Mode Selection */}
                            <div className="w-full space-y-2">
                                <Label className="text-sm font-medium">Capture Mode</Label>
                                <div className="grid grid-cols-3 gap-2">
                                    <Button variant={captureMode === "microphone" ? "default" : "outline"} size="sm" onClick={() => setCaptureMode("microphone")} className="flex-1">
                                        <Mic className="h-4 w-4 mr-2" /> Mic Only
                                    </Button>
                                    <Button variant={captureMode === "desktop" ? "default" : "outline"} size="sm" onClick={() => setCaptureMode("desktop")} className="flex-1">
                                        <Headphones className="h-4 w-4 mr-2" /> Desktop
                                    </Button>
                                    <Button variant={captureMode === "both" ? "default" : "outline"} size="sm" onClick={() => setCaptureMode("both")} className="flex-1">
                                        <Monitor className="h-4 w-4 mr-2" /> Both
                                    </Button>
                                </div>
                            </div>

                            {/* Main Recording Button */}
                            <Button onClick={handleToggleRecording} size="lg" disabled={!isBrowserSupported}
                                className={cn("h-24 w-24 rounded-full text-white shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 focus-visible:ring-4 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                    isRecording ? "bg-red-500 hover:bg-red-600 animate-pulse ring-red-300 dark:ring-red-500/50" : "bg-emerald-500 hover:bg-emerald-600 ring-emerald-300 dark:ring-emerald-500/50"
                                )}>
                                {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                            </Button>

                             {/* Status and Duration */}
                            <div className="text-center space-y-2">
                                <div className="flex items-center gap-2">
                                <Badge variant={isRecording ? "destructive" : "secondary"} className="text-sm px-3 py-1 transition-colors">
                                    {isRecording ? "Recording" : isReady ? "Ready" : "Finished"}
                                </Badge>
                                {isRecording && isListeningForAI && (
                                    <Badge variant="outline" className="text-xs border-blue-500 text-blue-500 animate-pulse">
                                        <Bot className="h-3 w-3 mr-1" /> Listening for AI
                                    </Badge>
                                )}
                                </div>
                                <div className="flex items-center justify-center space-x-2 text-slate-600 dark:text-slate-300">
                                <Clock className="h-4 w-4" />
                                <span className="font-mono text-lg">{formatDuration(duration)}</span>
                                </div>
                            </div>
                            
                            {/* Audio Waveform */}
                            <div className="w-full max-w-md">
                                <div className="flex items-center justify-center space-x-1 h-16 bg-slate-100 dark:bg-slate-800/50 rounded-lg p-2 overflow-hidden">
                                {Array.from({ length: 50 }).map((_, i) => (
                                    <div key={i} className="w-1 bg-emerald-400 rounded-full transition-all duration-100"
                                    style={{ height: `${Math.min(100, isRecording ? (audioLevel/255)*150 * (1 + Math.sin(i/2)) : 0)}%` }}
                                    />
                                ))}
                                </div>
                                <div className="flex items-center justify-center mt-2 text-sm text-slate-500 dark:text-slate-400">
                                <Waves className="h-4 w-4 mr-1" />
                                <span>{isRecording ? "Live audio level" : "Audio visualizer"}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
                        <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                            <Download className="h-5 w-5" />
                            <span>Export</span>
                        </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                        <Button onClick={handleDownloadAudio} disabled={isReady || isRecording} className="w-full justify-start">
                            <FileAudio className="h-4 w-4 mr-2" /> Download Audio (.webm)
                        </Button>
                        <Button onClick={handleDownloadTranscript} disabled={transcript.length === 0} className="w-full justify-start" variant="outline">
                            <FileText className="h-4 w-4 mr-2" /> Download Transcript (.txt)
                        </Button>
                        </CardContent>
                    </Card>
                </div>
                {/* Live Transcript Column */}
                <Card className="lg:col-span-3 border-0 shadow-lg bg-card/80 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                            <FileText className="h-5 w-5" />
                            <span>Live Transcript</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[40rem]" ref={scrollAreaRef}>
                            <div className="space-y-6 pr-4">
                            {transcript.map((entry) => (
                                <div key={entry.id} className={cn("flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300", entry.speaker === 'user' ? 'justify-end' : 'justify-start')}>
                                    {entry.speaker === 'ai' && <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0"><Bot className="w-5 h-5 text-slate-500" /></div>}
                                    <div className={cn("max-w-md space-y-1", entry.speaker === 'user' ? 'items-end' : 'items-start', 'flex flex-col')}>
                                        <div className="flex items-center gap-2" >
                                            <span className="font-bold text-sm">{entry.speaker === 'user' ? 'You' : 'AI Assistant'}</span>
                                            <span className="text-xs text-slate-500 dark:text-slate-400">{entry.timestamp}</span>
                                        </div>
                                        <div className={cn("p-3 rounded-lg text-sm", entry.speaker === 'user' ? 'bg-blue-500 text-white rounded-br-none' : 'bg-slate-100 dark:bg-slate-800 rounded-bl-none')}>
                                            <p className="leading-relaxed">{entry.text}</p>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-400">
                                            <span>{entry.source === 'microphone' ? 'Mic' : 'Desktop'}</span>
                                            {entry.confidence && (
                                                <>
                                                    <Separator orientation="vertical" className="h-3" />
                                                    <span>{Math.round(entry.confidence * 100)}% conf.</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {entry.speaker === 'user' && <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0"><User className="w-5 h-5 text-slate-500" /></div>}
                                </div>
                            ))}

                            {currentTranscript && (
                                <div className="flex items-start gap-3 justify-end opacity-60">
                                    <div className="max-w-md flex flex-col items-end space-y-1">
                                        <div className="flex items-center gap-2 justify-end">
                                            <span className="font-bold text-sm">You</span>
                                        </div>
                                        <div className="p-3 rounded-lg bg-blue-500/80 text-white rounded-br-none">
                                            <p className="leading-relaxed italic">{currentTranscript}</p>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0"><User className="w-5 h-5 text-slate-500" /></div>
                                </div>
                            )}

                            {transcript.length === 0 && !currentTranscript && (
                                <div className="text-center text-slate-400 dark:text-slate-500 py-12 flex flex-col items-center justify-center h-full">
                                <Volume2 className="h-16 w-16 mx-auto mb-4 opacity-30" />
                                <h3 className="font-semibold text-lg">Your transcript is empty</h3>
                                <p className="text-sm">Start a recording to see the live transcription.</p>
                                </div>
                            )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <RecordingHistory />
          </TabsContent>
          <TabsContent value="analytics">
            <AnalyticsDashboard />
          </TabsContent>
          <TabsContent value="settings">
            <AudioSettings initialSettings={audioSettings} onSettingsChange={setAudioSettings} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
    </>
  )
}