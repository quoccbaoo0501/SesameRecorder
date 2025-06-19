"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
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
  Headphones,
  User,
  Settings,
  HelpCircle,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { AudioSettings as AudioSettingsType } from "@/components/audio-settings"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FinalTranscript } from "@/components/final-transcript"
import { AudioSettings } from "@/components/audio-settings"
import { GeminiSettings } from "@/components/gemini-settings"

// Add this import after other imports
declare global {
  interface Window {
    lamejs: any
  }
}

interface TranscriptEntry {
  id: string
  timestamp: string
  speaker: "user" | "ai"
  text: string
  source?: "microphone" | "system" | "manual"
  confidence?: number
}

interface SessionData {
  liveTranscript: TranscriptEntry[]
  finalTranscript: string
  duration: number
  captureMode: string
  userName: string
  timestamp: string
  // Remove finalAudioBlob from localStorage to save space
}

// Web Speech API Configuration
const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)
const SpeechGrammarList = typeof window !== "undefined" && (window.SpeechGrammarList || window.webkitSpeechGrammarList)

// Add this function after the imports and before the main component
const showToast = (message: string, type: "success" | "error" | "loading" = "success") => {
  // Simple notification system
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

// Add this function after the interface definitions and before the main component
const checkMediaRecorderSupport = () => {
  if (!MediaRecorder) {
    throw new Error("MediaRecorder is not supported in this browser")
  }

  const supportedTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/wav"]

  const supported = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type))
  if (!supported) {
    throw new Error("No supported audio formats found for MediaRecorder")
  }

  return supported
}

// Helper functions for localStorage with size optimization
const saveSessionData = (data: SessionData) => {
  try {
    // Calculate size before saving
    const dataString = JSON.stringify(data)
    const sizeKB = new Blob([dataString]).size / 1024

    console.log(`💾 Saving session data: ${sizeKB.toFixed(1)}KB`)

    // Check if data is too large for localStorage (5MB limit)
    if (sizeKB > 4000) {
      console.warn("⚠️ Session data too large, truncating...")
      // Keep only essential data
      const truncatedData = {
        liveTranscript: data.liveTranscript.slice(-50), // Keep last 50 entries
        finalTranscript: data.finalTranscript.slice(0, 10000), // Keep first 10k chars
        duration: data.duration,
        captureMode: data.captureMode,
        userName: data.userName,
        timestamp: data.timestamp,
      }
      localStorage.setItem("current-session", JSON.stringify(truncatedData))
      showToast("⚠️ Session data truncated due to size limit", "loading")
    } else {
      localStorage.setItem("current-session", JSON.stringify(data))
    }

    console.log("💾 Session data saved to localStorage")
  } catch (error) {
    console.error("Failed to save session data:", error)
    if (error.name === "QuotaExceededError") {
      // Clear old data and try again with minimal data
      try {
        localStorage.removeItem("current-session")
        const minimalData = {
          liveTranscript: data.liveTranscript.slice(-20),
          finalTranscript: data.finalTranscript.slice(0, 5000),
          duration: data.duration,
          captureMode: data.captureMode,
          userName: data.userName,
          timestamp: data.timestamp,
        }
        localStorage.setItem("current-session", JSON.stringify(minimalData))
        showToast("💾 Session saved with reduced data", "success")
      } catch (retryError) {
        console.error("Failed to save even minimal session data:", retryError)
        showToast("❌ Failed to save session - storage full", "error")
      }
    }
  }
}

const loadSessionData = (): SessionData | null => {
  try {
    const saved = localStorage.getItem("current-session")
    if (saved) {
      const data = JSON.parse(saved)
      console.log("📂 Session data loaded from localStorage")
      return data
    }
  } catch (error) {
    console.error("Failed to load session data:", error)
  }
  return null
}

const clearSessionData = () => {
  try {
    localStorage.removeItem("current-session")
    console.log("🗑️ Session data cleared from localStorage")
  } catch (error) {
    console.error("Failed to clear session data:", error)
  }
}

export default function RecorderUI() {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [currentTranscript, setCurrentTranscript] = useState("")
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [finalTranscript, setFinalTranscript] = useState("")
  const [finalAudioBlob, setFinalAudioBlob] = useState<Blob | null>(null)
  const [userName, setUserName] = useState("")

  const [captureMode, setCaptureMode] = useState<"microphone" | "desktop" | "both">("microphone")
  const [isListeningForAI, setIsListeningForAI] = useState(false)
  const [speechRecognitionActive, setSpeechRecognitionActive] = useState(false)
  const [geminiApiKey, setGeminiApiKey] = useState("")

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<NodeJS.Timeout>()
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>()
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const animationFrameRef = useRef<number>()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<any | null>(null)

  // Stream refs
  const micStreamRef = useRef<MediaStream | null>(null)
  const desktopStreamRef = useRef<MediaStream | null>(null)
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const desktopProcessorRef = useRef<ScriptProcessorNode | null>(null)

  const [audioSettings, setAudioSettings] = useState<AudioSettingsType>({
    sampleRate: 44100,
    bitRate: 128,
    autoGain: true,
    noiseSuppression: true,
    echoCancellation: true,
    language: "en-US",
    sensitivity: 50,
  })

  // Load user name and session data from localStorage
  useEffect(() => {
    const savedUserName = localStorage.getItem("user-name")
    if (savedUserName) {
      setUserName(savedUserName)
    }

    // Load previous session data
    const sessionData = loadSessionData()
    if (sessionData) {
      setTranscript(sessionData.liveTranscript || [])
      setFinalTranscript(sessionData.finalTranscript || "")
      setDuration(sessionData.duration || 0)
      setCaptureMode((sessionData.captureMode as any) || "microphone")

      showToast("📂 Previous session restored!", "success")
    }
  }, [])

  // Save user name to localStorage
  const handleUserNameChange = (value: string) => {
    setUserName(value)
    localStorage.setItem("user-name", value)
  }

  // Save session data whenever important state changes (without audio blob)
  useEffect(() => {
    if (transcript.length > 0 || finalTranscript) {
      const sessionData: SessionData = {
        liveTranscript: transcript,
        finalTranscript,
        duration,
        captureMode,
        userName,
        timestamp: new Date().toISOString(),
      }

      saveSessionData(sessionData)
    }
  }, [transcript, finalTranscript, duration, captureMode, userName])

  // Fix hydration mismatch
  useEffect(() => {
    setIsClient(true)
  }, [])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const cleanupAudioProcessing = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    // Cleanup processors
    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect()
      micProcessorRef.current = null
    }
    if (desktopProcessorRef.current) {
      desktopProcessorRef.current.disconnect()
      desktopProcessorRef.current = null
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close()
    }

    // Cleanup streams
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }

    if (desktopStreamRef.current) {
      desktopStreamRef.current.getTracks().forEach((track) => track.stop())
      desktopStreamRef.current = null
    }

    analyserRef.current = null
    audioContextRef.current = null
    dataArrayRef.current = null
    setAudioLevel(0)
    setSpeechRecognitionActive(false)

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (error) {
        console.error("Error stopping speech recognition:", error)
      }
      recognitionRef.current = null
    }
  }, [])

  const visualizeAudio = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return

    analyserRef.current.getByteTimeDomainData(dataArrayRef.current)
    const sum = dataArrayRef.current.reduce((acc, val) => acc + Math.abs(val - 128), 0)
    const avg = sum / dataArrayRef.current.length
    setAudioLevel(avg * 5)

    animationFrameRef.current = requestAnimationFrame(visualizeAudio)
  }, [])

  const setupAudioProcessing = useCallback(
    (stream: MediaStream) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 2048

      const bufferLength = analyserRef.current.frequencyBinCount
      dataArrayRef.current = new Uint8Array(bufferLength)

      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      visualizeAudio()
    },
    [visualizeAudio],
  )

  // Improved speech recognition setup for persistent transcript
  const setupSpeechRecognition = useCallback((onResult: (text: string, isFinal: boolean) => void, language: string) => {
    if (!SpeechRecognition) {
      throw new Error("Speech Recognition is not supported in this browser")
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true // Keep interim results for live feedback
    recognition.lang = language
    recognition.maxAlternatives = 1

    let finalTranscriptSoFar = ""
    let lastFinalIndex = 0

    recognition.onresult = (event) => {
      let interimTranscript = ""
      let finalTranscript = ""

      // Process all results
      for (let i = lastFinalIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript

        if (result.isFinal) {
          finalTranscript += transcript
          lastFinalIndex = i + 1
        } else {
          interimTranscript += transcript
        }
      }

      // If we have final transcript, add it permanently
      if (finalTranscript) {
        finalTranscriptSoFar += finalTranscript
        onResult(finalTranscript.trim(), true)
      }

      // Show interim results
      if (interimTranscript) {
        onResult(interimTranscript.trim(), false)
      }
    }

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error)
      if (event.error === "no-speech") {
        // Restart recognition on no-speech
        setTimeout(() => {
          if (recognitionRef.current === recognition) {
            try {
              recognition.start()
            } catch (e) {
              console.log("Recognition restart failed:", e)
            }
          }
        }, 1000)
      }
    }

    recognition.onend = () => {
      console.log("Speech recognition ended, attempting restart...")
      // Auto-restart recognition if still recording
      if (recognitionRef.current === recognition) {
        setTimeout(() => {
          try {
            recognition.start()
          } catch (e) {
            console.log("Recognition restart failed:", e)
          }
        }, 500)
      }
    }

    return recognition
  }, [])

  // Setup microphone recognition with persistent transcript
  const setupMicRecognition = useCallback(
    async (micStream: MediaStream) => {
      try {
        micStreamRef.current = micStream

        const handleSpeechResult = (text: string, isFinal: boolean) => {
          if (isFinal && text.length > 0) {
            const newEntry: TranscriptEntry = {
              id: `user-${Date.now()}-${Math.random()}`,
              timestamp: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
              speaker: "user",
              text: text,
              source: "microphone",
              confidence: 0.9,
            }
            setTranscript((prev) => [...prev, newEntry])
            setCurrentTranscript("") // Clear interim
          } else if (!isFinal && text.length > 0) {
            setCurrentTranscript(text) // Show interim
          }
        }

        const recognition = setupSpeechRecognition(handleSpeechResult, audioSettings.language)
        recognitionRef.current = recognition
        recognition.start()

        setSpeechRecognitionActive(true)
        showToast("Speech recognition started for microphone", "success")

        // Setup audio visualization
        setupAudioProcessing(micStream)
      } catch (error) {
        console.error("Failed to setup speech recognition for microphone:", error)
        showToast("Failed to setup speech recognition for microphone", "error")
      }
    },
    [setupSpeechRecognition, audioSettings.language, setupAudioProcessing],
  )

  // Setup desktop recognition with AI detection
  const setupDesktopRecognition = useCallback(
    async (desktopStream: MediaStream) => {
      try {
        desktopStreamRef.current = desktopStream

        const handleSpeechResult = (partialText: string, isFinal: boolean) => {
          const text = partialText.trim()
          if (isFinal && text.length > 10) {
            // AI pattern detection
            const aiPatterns = [
              /^(I|Here|Let me|Based on|According to|The answer is|Sure|Of course|Certainly)/i,
              /\b(help|assist|explain|understand|provide|suggest|recommend)\b/i,
              /\b(AI|assistant|model|system)\b/i,
            ]

            const isLikelyAI = aiPatterns.some((pattern) => pattern.test(text)) || text.length > 30

            if (isLikelyAI) {
              const newEntry: TranscriptEntry = {
                id: `ai-${Date.now()}-${Math.random()}`,
                timestamp: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }),
                speaker: "ai",
                text: text,
                source: "system",
                confidence: 0.8,
              }
              setTranscript((prev) => [...prev, newEntry])
              showToast("AI response detected!", "success")
            }
          }
        }

        const desktopRecognition = setupSpeechRecognition(handleSpeechResult, audioSettings.language)

        desktopRecognition.start()
        setIsListeningForAI(true)
        showToast("Speech recognition started for desktop audio", "success")
      } catch (error) {
        console.error("Failed to setup speech recognition for desktop:", error)
        showToast("Failed to setup speech recognition for desktop audio", "error")
      }
    },
    [setupSpeechRecognition, audioSettings.language],
  )

  const startDesktopCapture = async () => {
    try {
      // Improved desktop capture with better error handling
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000, // Higher sample rate for better quality
          channelCount: 2, // Stereo
        },
        video: {
          mediaSource: "screen",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })

      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        throw new Error("❌ Không có audio track. Hãy chắc chắn bạn đã chọn 'Share audio' khi được hỏi!")
      }

      console.log(
        "✅ Desktop audio tracks:",
        audioTracks.map((t) => t.label),
      )
      showToast("✅ Desktop audio capture thành công!", "success")
      return stream
    } catch (error) {
      console.error("Desktop audio capture error:", error)

      if (error.name === "NotAllowedError") {
        throw new Error(
          "🚫 Quyền truy cập bị từ chối! Vui lòng:\n1. Reload trang\n2. Chọn tab có AI (ChatGPT, Claude...)\n3. ✅ Tick vào 'Share audio'\n4. Click 'Share'",
        )
      } else if (error.name === "NotFoundError") {
        throw new Error("❌ Không tìm thấy audio source. Hãy chọn tab có âm thanh.")
      } else {
        throw new Error(`❌ Lỗi capture desktop audio: ${error.message}`)
      }
    }
  }

  const startRecording = async () => {
    setError(null)
    // Clear previous session when starting new recording
    clearSessionData()
    setFinalAudioBlob(null)
    setFinalTranscript("")

    try {
      let micStream: MediaStream | null = null
      let desktopStream: MediaStream | null = null

      // Get microphone stream
      if (captureMode === "microphone" || captureMode === "both") {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: 48000, // Higher sample rate
              channelCount: 2, // Stereo
              echoCancellation: audioSettings.echoCancellation,
              noiseSuppression: audioSettings.noiseSuppression,
              autoGainControl: audioSettings.autoGain,
            },
          })
          setupAudioProcessing(micStream)
          await setupMicRecognition(micStream)
          showToast("✅ Microphone access granted", "success")
        } catch (err) {
          console.error("Microphone access error:", err)
          showToast("❌ Không thể truy cập microphone. Kiểm tra quyền.", "error")
          if (captureMode === "both") {
            setCaptureMode("desktop")
          } else {
            throw err
          }
        }
      }

      // Get desktop audio stream
      if (captureMode === "desktop" || captureMode === "both") {
        try {
          desktopStream = await startDesktopCapture()
          await setupDesktopRecognition(desktopStream)
        } catch (error) {
          console.error("Desktop audio capture failed:", error)
          showToast(error.message, "error")
          if (captureMode === "both") {
            setCaptureMode("microphone")
          } else if (captureMode === "desktop") {
            setCaptureMode("microphone")
            micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                sampleRate: 48000,
                channelCount: 2,
                echoCancellation: audioSettings.echoCancellation,
                noiseSuppression: audioSettings.noiseSuppression,
                autoGainControl: audioSettings.autoGain,
              },
            })
            setupAudioProcessing(micStream)
            await setupMicRecognition(micStream)
          }
        }
      }

      // Set up mixed audio recording for download - IMPROVED FORMAT
      if (micStream || desktopStream) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 48000, // Higher sample rate
        })
        const destination = audioContext.createMediaStreamDestination()

        if (micStream) {
          const micSource = audioContext.createMediaStreamSource(micStream)
          const micGain = audioContext.createGain()
          micGain.gain.value = 1.0
          micSource.connect(micGain)
          micGain.connect(destination)
        }

        if (desktopStream) {
          const desktopSource = audioContext.createMediaStreamSource(desktopStream)
          const desktopGain = audioContext.createGain()
          desktopGain.gain.value = 0.8
          desktopSource.connect(desktopGain)
          desktopGain.connect(destination)
        }

        const mixedStream = destination.stream

        // Try different formats for better compatibility with AssemblyAI
        const supportedFormats = [
          "audio/webm;codecs=pcm", // PCM is best for AssemblyAI
          "audio/wav", // WAV is also good
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
        ]

        let selectedFormat = "audio/webm"
        for (const format of supportedFormats) {
          if (MediaRecorder.isTypeSupported(format)) {
            selectedFormat = format
            break
          }
        }

        console.log(`🎵 Selected audio format: ${selectedFormat}`)

        mediaRecorderRef.current = new MediaRecorder(mixedStream, {
          mimeType: selectedFormat,
          audioBitsPerSecond: 128000, // 128kbps
        })

        audioChunksRef.current = []

        mediaRecorderRef.current.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0) {
            console.log(`📦 Audio chunk: ${event.data.size} bytes, type: ${event.data.type}`)
            audioChunksRef.current.push(event.data)
          }
        })

        mediaRecorderRef.current.addEventListener("stop", () => {
          console.log("🛑 MediaRecorder stopped")
          audioContext.close()
        })

        mediaRecorderRef.current.addEventListener("error", (event) => {
          console.error("MediaRecorder error:", event)
          setError(`Recording error: ${event.error?.message || "Unknown error"}`)
        })

        mediaRecorderRef.current.start(1000) // Record in 1-second chunks
        showToast(`🎵 ${selectedFormat} audio recording started!`, "success")
      }

      setIsRecording(true)
      setDuration(0)
      setTranscript([])
      setCurrentTranscript("")

      showToast(`🚀 Live transcription started with ${captureMode} capture!`, "success")
    } catch (err) {
      console.error("Error starting recording:", err)
      setError(
        `❌ Failed to start recording: ${err.message}. Please try a different browser or check your audio settings.`,
      )
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }

    cleanupAudioProcessing()

    setIsRecording(false)
    setIsListeningForAI(false)
    setSpeechRecognitionActive(false)
    setCurrentTranscript("")
    showToast("🛑 Recording stopped. Starting audio analysis...", "success")

    // Create final audio blob and trigger analysis
    if (audioChunksRef.current.length > 0) {
      // Create blob with proper MIME type
      const firstChunk = audioChunksRef.current[0]
      const mimeType = firstChunk.type || "audio/webm"

      const mixedBlob = new Blob(audioChunksRef.current, { type: mimeType })
      console.log(`🎵 Created final audio blob: ${mixedBlob.size} bytes, type: ${mixedBlob.type}`)

      setFinalAudioBlob(mixedBlob) // This will trigger the FinalTranscript component

      try {
        const recordingEntry = {
          id: Date.now().toString(),
          timestamp: new Date().toLocaleString(),
          duration: duration,
          transcriptLength: transcript.reduce((acc, entry) => acc + entry.text.length, 0),
          audioSize: mixedBlob.size,
          transcript: JSON.stringify(transcript),
          captureMode: captureMode,
          audioType: mimeType,
        }

        const savedRecordings = localStorage.getItem("sesame-recordings")
        const recordings = savedRecordings ? JSON.parse(savedRecordings) : []
        recordings.push(recordingEntry)
        localStorage.setItem("sesame-recordings", JSON.stringify(recordings))
      } catch (error) {
        console.error("Failed to save recording to history:", error)
      }
    }
  }

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Clear session function for new recording
  const handleNewRecording = () => {
    clearSessionData()
    setTranscript([])
    setFinalTranscript("")
    setFinalAudioBlob(null)
    setDuration(0)
    setCurrentTranscript("")
    showToast("🗑️ Session cleared. Ready for new recording!", "success")
  }

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
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]")
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [transcript, currentTranscript])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop()
      }
      cleanupAudioProcessing()
    }
  }, [cleanupAudioProcessing])

  useEffect(() => {
    if (isClient) {
      try {
        checkMediaRecorderSupport()
      } catch (error) {
        setError(`Browser compatibility issue: ${error.message}`)
        showToast("Your browser may not fully support audio recording", "error")
      }
    }
  }, [isClient])

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

          const mp3Blob = new Blob(mp3Data, { type: "audio/mp3" })
          resolve(mp3Blob)
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(audioBlob)
    })
  }

  const handleDownloadAudio = async () => {
    if (audioChunksRef.current.length === 0) {
      showToast("No audio recorded to download.", "error")
      return
    }

    try {
      showToast("Converting to MP3...", "loading")

      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
      const mp3Blob = await convertToMp3(audioBlob)

      const url = URL.createObjectURL(mp3Blob)
      const a = document.createElement("a")
      a.style.display = "none"
      a.href = url
      a.download = `recording-mixed-${new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-")}.mp3`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()

      showToast("MP3 audio download started!", "success")
    } catch (error) {
      console.error("MP3 conversion failed:", error)
      showToast("Failed to convert to MP3. Downloading as WebM instead.", "error")

      // Fallback to WebM
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
      const url = URL.createObjectURL(audioBlob)
      const a = document.createElement("a")
      a.style.display = "none"
      a.href = url
      a.download = `recording-mixed-${new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-")}.webm`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()

      showToast("WebM audio download started!", "success")
    }
  }

  const handleDownloadTranscript = () => {
    if (transcript.length === 0) {
      showToast("No transcript to download.", "error")
      return
    }
    const transcriptText = transcript
      .map(
        (entry) =>
          `[${entry.timestamp}] ${entry.speaker === "user" ? userName || "User" : "AI Assistant"} (${entry.source || "unknown"}${
            entry.confidence ? ` - ${Math.round(entry.confidence * 100)}%` : ""
          }): ${entry.text}`,
      )
      .join("\n\n")

    const blob = new Blob([transcriptText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.style.display = "none"
    a.href = url
    a.download = `live-transcript-${new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-")}.txt`
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    a.remove()
    showToast("Live transcript download started.", "success")
  }

  const isReady = !isRecording && duration === 0

  // Prevent hydration mismatch
  if (!isClient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8 transition-colors duration-300">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-slate-100">Sesame Recorder</h1>
            <p className="text-slate-600 dark:text-slate-400">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8 transition-colors duration-300">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-slate-100">Sesame Recorder</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Record, transcribe, and analyze your AI conversations with Gemini 2.5 Pro.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
          </Alert>
        )}

        {/* Clean Instructions Card */}
        <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <Headphones className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    🎧 Desktop Audio Setup
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium text-blue-800 dark:text-blue-200 flex items-center">
                        <Settings className="h-4 w-4 mr-2" />
                        Setup Steps
                      </h4>
                      <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
                        <li>Click "Desktop" or "Both" mode</li>
                        <li>Select tab with AI (ChatGPT, Claude, etc.)</li>
                        <li className="font-semibold">✅ IMPORTANT: Check "Share audio"</li>
                        <li>Click "Share" to enable AI response recording</li>
                        <li>🎧 Use headphones to avoid echo</li>
                      </ol>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium text-blue-800 dark:text-blue-200 flex items-center">
                        <HelpCircle className="h-4 w-4 mr-2" />
                        Troubleshooting
                      </h4>
                      <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        <li>• If permission denied: Reload page and try again</li>
                        <li>• Make sure to select the correct tab/window</li>
                        <li>• Check browser audio permissions</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="recorder" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="recorder">Recorder</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="recorder" className="space-y-6">
            {/* User Name Input */}
            <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center space-x-4">
                  <User className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  <div className="flex-1">
                    <Label htmlFor="userName" className="text-sm font-medium">
                      What can I call you?
                    </Label>
                    <Input
                      id="userName"
                      placeholder="Enter your name (will appear in transcripts)"
                      value={userName}
                      onChange={(e) => handleUserNameChange(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  {/* Clear Session Button */}
                  {(transcript.length > 0 || finalTranscript || finalAudioBlob) && !isRecording && (
                    <Button
                      onClick={handleNewRecording}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
                    >
                      🗑️ Clear Session
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recording Controls */}
            <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
              <CardContent className="p-6 sm:p-8">
                <div className="flex flex-col items-center space-y-6">
                  {/* Capture Mode Selection */}
                  <div className="flex items-center space-x-6 bg-slate-100 dark:bg-slate-800/50 rounded-lg p-4 w-full max-w-md">
                    <div className="flex items-center space-x-2">
                      <Monitor className="h-4 w-4" />
                      <Label className="text-sm font-medium">Mode:</Label>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant={captureMode === "microphone" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCaptureMode("microphone")}
                        className="text-xs"
                      >
                        <Mic className="h-3 w-3 mr-1" />
                        Mic
                      </Button>
                      <Button
                        variant={captureMode === "desktop" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCaptureMode("desktop")}
                        className="text-xs"
                      >
                        <Headphones className="h-3 w-3 mr-1" />
                        Desktop
                      </Button>
                      <Button
                        variant={captureMode === "both" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCaptureMode("both")}
                        className="text-xs"
                      >
                        Both
                      </Button>
                    </div>
                  </div>

                  {/* Main Recording Button */}
                  <Button
                    onClick={handleToggleRecording}
                    size="lg"
                    className={`h-24 w-24 rounded-full text-white shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-100 focus-visible:ring-4 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                      isRecording
                        ? "bg-red-500 hover:bg-red-600 animate-pulse ring-red-300"
                        : "bg-emerald-500 hover:bg-emerald-600 ring-emerald-300"
                    }`}
                  >
                    {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                  </Button>

                  {/* Status and Duration */}
                  <div className="text-center space-y-2">
                    <Badge
                      variant={isRecording ? "destructive" : "secondary"}
                      className="text-sm px-3 py-1 transition-colors"
                    >
                      {isRecording ? `Recording (${captureMode})` : isReady ? "Ready to Record" : "Finished"}
                    </Badge>
                    {speechRecognitionActive && (
                      <Badge variant="outline" className="text-xs ml-2">
                        🤖 Live Transcript Active
                      </Badge>
                    )}
                    {isListeningForAI && (
                      <Badge variant="outline" className="text-xs ml-2">
                        🎧 Listening for AI
                      </Badge>
                    )}
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
                            height: `${Math.max(2, Math.min(100, isRecording ? audioLevel * (1 + i / 40) : 0))}%`,
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-center mt-2 text-sm text-slate-500 dark:text-slate-400">
                      <Waves className="h-4 w-4 mr-1" />
                      <span className="transition-opacity duration-300">
                        {isRecording ? "Live Audio Processing..." : "Audio visualization"}
                      </span>
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
                    <span>Live Transcript (Persistent)</span>
                    {transcript.length > 0 && (
                      <Badge variant="secondary" className="ml-auto">
                        💾 Saved
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-96 overflow-y-auto">
                    <div className="space-y-4 pr-4">
                      {/* Current partial transcript */}
                      {currentTranscript && (
                        <div className="space-y-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="text-xs uppercase animate-pulse">
                              SPEAKING...
                            </Badge>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {new Date().toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300 leading-relaxed italic">
                            {currentTranscript}
                          </p>
                        </div>
                      )}

                      {transcript.map((entry) => (
                        <div
                          key={entry.id}
                          className="space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-300"
                        >
                          <div className="flex items-center space-x-2">
                            <Badge
                              variant={entry.speaker === "user" ? "default" : "secondary"}
                              className="text-xs uppercase"
                            >
                              {entry.speaker === "user" ? userName || "USER" : "AI ASSISTANT"}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {entry.source === "microphone" ? "mic" : entry.source === "system" ? "desktop" : "manual"}
                            </Badge>
                            {entry.confidence && (
                              <Badge variant="outline" className="text-xs">
                                {Math.round(entry.confidence * 100)}%
                              </Badge>
                            )}
                            <span className="text-xs text-slate-500 dark:text-slate-400">{entry.timestamp}</span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{entry.text}</p>
                          <Separator className="my-2" />
                        </div>
                      ))}

                      {transcript.length === 0 && !currentTranscript && (
                        <div className="text-center text-slate-400 dark:text-slate-500 py-12 flex flex-col items-center justify-center">
                          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>Start recording to see persistent live transcription here.</p>
                          <p className="text-xs mt-2">
                            {captureMode === "desktop" || captureMode === "both"
                              ? "Make sure to select 'Share audio' when prompted. AI responses will be auto-detected!"
                              : "Switch to Desktop or Both mode to capture AI responses"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
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
                    <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">MP3</span>
                  </Button>

                  <Button
                    onClick={handleDownloadTranscript}
                    disabled={transcript.length === 0}
                    className="w-full justify-start transition-opacity hover:bg-slate-100 dark:hover:bg-slate-800"
                    variant="outline"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Download Live Transcript
                    <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">TXT</span>
                  </Button>

                  <div className="pt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span>Duration:</span>
                      <span className="font-mono">{formatDuration(duration)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Live Entries:</span>
                      <span className="font-mono">{transcript.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Capture Mode:</span>
                      <span className="font-mono capitalize">{captureMode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Speech Recognition:</span>
                      <span className="font-mono">{speechRecognitionActive ? "Active" : "Inactive"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Final Transcript Section - Auto-starts when recording stops */}
            <div className="mt-6">
              <FinalTranscript
                audioBlob={finalAudioBlob}
                onTranscriptComplete={(transcript) => setFinalTranscript(transcript)}
                autoStart={true}
                userName={userName}
              />
            </div>
          </TabsContent>
          <TabsContent value="settings" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Audio Settings */}
              <AudioSettings onSettingsChange={setAudioSettings} />

              {/* Gemini Settings */}
              <GeminiSettings onApiKeyChange={setGeminiApiKey} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
