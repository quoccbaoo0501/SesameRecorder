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
  RotateCcw,
  Info,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { AudioSettings as AudioSettingsType } from "@/components/audio-settings"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FinalTranscript } from "@/components/final-transcript"
import { AudioSettings } from "@/components/audio-settings"
import { GeminiSettings } from "@/components/gemini-settings"
import { RecordingHistory } from "@/components/recording-history"
import { ThemeToggle } from "@/components/theme-toggle"

// Add this import after other imports
declare global {
  interface Window {
    lamejs: any
    webkitSpeechRecognition: any
    SpeechRecognition: any
    webkitAudioContext: any
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

interface AudioChunk {
  blob: Blob
  timestamp: string
  duration: number
  chunkNumber: number
}

interface SessionData {
  liveTranscript: TranscriptEntry[]
  finalTranscripts: string[]
  audioChunks: AudioChunk[]
  totalDuration: number
  captureMode: string
  userName: string
  timestamp: string
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

// Browser compatibility detection
const getBrowserInfo = () => {
  const userAgent = navigator.userAgent
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent)
  const isChrome = /chrome/i.test(userAgent)
  const isFirefox = /firefox/i.test(userAgent)
  const isMac = /mac/i.test(navigator.platform)

  return { isSafari, isChrome, isFirefox, isMac }
}

// Web Speech API Configuration with Safari support
const getSpeechRecognition = () => {
  if (typeof window === "undefined") return null
  return window.SpeechRecognition || window.webkitSpeechRecognition
}

// Audio Context with Safari support
const getAudioContext = () => {
  if (typeof window === "undefined") return null
  return window.AudioContext || window.webkitAudioContext
}

const showToast = (message: string, type: "success" | "error" | "loading" = "success") => {
  const notification = document.createElement("div")
  notification.className = `fixed top-4 left-1/2 transform -translate-x-1/2 z-50 p-4 rounded-lg shadow-lg text-white transition-all duration-300 ${
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

const CHUNK_DURATION = 30 // 30 seconds per chunk

// Helper functions for localStorage
const saveSessionData = (data: SessionData) => {
  try {
    // Don't save audio blobs to localStorage - too large
    const dataToSave = {
      ...data,
      audioChunks: data.audioChunks.map((chunk) => ({
        timestamp: chunk.timestamp,
        duration: chunk.duration,
        chunkNumber: chunk.chunkNumber,
        // Don't save blob
      })),
    }

    localStorage.setItem("current-session", JSON.stringify(dataToSave))
    console.log("💾 Session data saved to localStorage")
  } catch (error) {
    console.error("Failed to save session data:", error)
  }
}

const loadSessionData = (): Partial<SessionData> | null => {
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

// Save current session to history
const saveSessionToHistory = (sessionData: SessionData) => {
  try {
    // Only save if there's meaningful data
    if (
      sessionData.liveTranscript.length === 0 &&
      sessionData.finalTranscripts.length === 0 &&
      sessionData.totalDuration === 0
    ) {
      return
    }

    const existingHistory = localStorage.getItem("sesame-session-history")
    const history: SessionEntry[] = existingHistory ? JSON.parse(existingHistory) : []

    const now = new Date()
    const sessionEntry: SessionEntry = {
      id: `session-${now.getTime()}`,
      sessionDate: now.toLocaleDateString(),
      sessionTime: now.toLocaleTimeString(),
      userName: sessionData.userName,
      captureMode: sessionData.captureMode,
      totalDuration: sessionData.totalDuration,
      totalChunks: sessionData.audioChunks.length,
      liveTranscript: sessionData.liveTranscript,
      finalTranscripts: sessionData.finalTranscripts,
      audioChunks: sessionData.audioChunks.map((chunk) => ({
        timestamp: chunk.timestamp,
        duration: chunk.duration,
        chunkNumber: chunk.chunkNumber,
        // Don't save blob to history
      })),
      totalWords: sessionData.finalTranscripts
        .filter((t) => t)
        .reduce((acc, transcript) => acc + transcript.split(" ").length, 0),
    }

    // Add to beginning of history (most recent first)
    history.unshift(sessionEntry)

    // Keep only last 50 sessions to prevent localStorage bloat
    const trimmedHistory = history.slice(0, 50)

    localStorage.setItem("sesame-session-history", JSON.stringify(trimmedHistory))
    console.log("📚 Session saved to history")
  } catch (error) {
    console.error("Failed to save session to history:", error)
  }
}

// Convert WebM to MP3 for download with Safari compatibility
const convertToMp3 = async (audioBlob: Blob): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer
        const AudioContextClass = getAudioContext()
        if (!AudioContextClass) {
          throw new Error("AudioContext not supported")
        }

        const audioContext = new AudioContextClass({
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
          256, // High quality for download
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

// Merge multiple audio blobs into one with Safari compatibility
const mergeAudioBlobs = async (audioChunks: AudioChunk[]): Promise<Blob> => {
  if (audioChunks.length === 0) {
    throw new Error("No audio chunks to merge")
  }

  if (audioChunks.length === 1) {
    return audioChunks[0].blob
  }

  // Create audio context for merging
  const AudioContextClass = getAudioContext()
  if (!AudioContextClass) {
    throw new Error("AudioContext not supported")
  }

  const audioContext = new AudioContextClass({
    sampleRate: 48000,
  })

  const audioBuffers: AudioBuffer[] = []

  // Decode all audio chunks
  for (const chunk of audioChunks) {
    const arrayBuffer = await chunk.blob.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    audioBuffers.push(audioBuffer)
  }

  // Calculate total length
  const totalLength = audioBuffers.reduce((acc, buffer) => acc + buffer.length, 0)
  const numberOfChannels = audioBuffers[0].numberOfChannels
  const sampleRate = audioBuffers[0].sampleRate

  // Create merged buffer
  const mergedBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate)

  let offset = 0
  for (const buffer of audioBuffers) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = mergedBuffer.getChannelData(channel)
      const sourceData = buffer.getChannelData(channel)
      channelData.set(sourceData, offset)
    }
    offset += buffer.length
  }

  // Convert to MP3
  const leftChannel = mergedBuffer.getChannelData(0)
  const rightChannel = numberOfChannels > 1 ? mergedBuffer.getChannelData(1) : leftChannel

  const leftPCM = new Int16Array(leftChannel.length)
  const rightPCM = new Int16Array(rightChannel.length)

  for (let i = 0; i < leftChannel.length; i++) {
    leftPCM[i] = Math.max(-32768, Math.min(32767, leftChannel[i] * 32767))
    rightPCM[i] = Math.max(-32768, Math.min(32767, rightChannel[i] * 32767))
  }

  const mp3encoder = new (window as any).lamejs.Mp3Encoder(numberOfChannels, sampleRate, 256)
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

  await audioContext.close()
  return new Blob(mp3Data, { type: "audio/mpeg" })
}

// Format live transcript for context
const formatLiveTranscriptForContext = (transcript: TranscriptEntry[], userName: string): string => {
  if (transcript.length === 0) return ""

  return transcript
    .map((entry) => `${entry.speaker === "user" ? userName || "User" : "AI Assistant"}: ${entry.text}`)
    .join("\n")
}

export default function RecorderUI() {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [chunkDuration, setChunkDuration] = useState(0) // Duration of current chunk
  const [currentChunkNumber, setCurrentChunkNumber] = useState(1)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [currentTranscript, setCurrentTranscript] = useState("")
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [finalTranscripts, setFinalTranscripts] = useState<string[]>([])
  const [audioChunks, setAudioChunks] = useState<AudioChunk[]>([])
  const [userName, setUserName] = useState("")
  const [geminiApiKeys, setGeminiApiKeys] = useState<string[]>([])
  const [browserInfo, setBrowserInfo] = useState({ isSafari: false, isChrome: false, isFirefox: false, isMac: false })

  const [captureMode, setCaptureMode] = useState<"microphone" | "desktop" | "both">("microphone")
  const [isListeningForAI, setIsListeningForAI] = useState(false)
  const [speechRecognitionActive, setSpeechRecognitionActive] = useState(false)

  // Refs
  const intervalRef = useRef<NodeJS.Timeout>()
  const chunkIntervalRef = useRef<NodeJS.Timeout>()
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>()
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const animationFrameRef = useRef<number>()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const currentChunkDataRef = useRef<Blob[]>([])
  const recognitionRef = useRef<any | null>(null)
  const isRecordingRef = useRef(false) // Add this to track recording state

  // Stream refs
  const micStreamRef = useRef<MediaStream | null>(null)
  const desktopStreamRef = useRef<MediaStream | null>(null)

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
    // Detect browser
    setBrowserInfo(getBrowserInfo())

    const savedUserName = localStorage.getItem("user-name")
    if (savedUserName) {
      setUserName(savedUserName)
    }

    // Load API keys from localStorage
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

    // Load previous session data
    const sessionData = loadSessionData()
    if (sessionData) {
      setTranscript(sessionData.liveTranscript || [])
      setFinalTranscripts(sessionData.finalTranscripts || [])
      setDuration(sessionData.totalDuration || 0)
      setCaptureMode((sessionData.captureMode as any) || "microphone")

      showToast("📂 Previous session restored!", "success")
    }
  }, [])

  // Save user name to localStorage
  const handleUserNameChange = (value: string) => {
    setUserName(value)
    localStorage.setItem("user-name", value)
  }

  // Save session data whenever important state changes
  useEffect(() => {
    if (transcript.length > 0 || finalTranscripts.length > 0 || audioChunks.length > 0) {
      const sessionData: SessionData = {
        liveTranscript: transcript,
        finalTranscripts,
        audioChunks,
        totalDuration: duration,
        captureMode,
        userName,
        timestamp: new Date().toISOString(),
      }

      saveSessionData(sessionData)
    }
  }, [transcript, finalTranscripts, audioChunks, duration, captureMode, userName])

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
      const AudioContextClass = getAudioContext()
      if (!AudioContextClass) {
        console.error("AudioContext not supported")
        return
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass()
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

  // Setup speech recognition with Safari support
  const setupSpeechRecognition = useCallback((onResult: (text: string, isFinal: boolean) => void, language: string) => {
    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) {
      throw new Error("Speech Recognition is not supported in this browser")
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = language
    recognition.maxAlternatives = 1

    let lastFinalIndex = 0

    recognition.onresult = (event) => {
      let interimTranscript = ""
      let finalTranscript = ""

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

      if (finalTranscript) {
        onResult(finalTranscript.trim(), true)
      }

      if (interimTranscript) {
        onResult(interimTranscript.trim(), false)
      }
    }

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error)
      if (event.error === "no-speech") {
        setTimeout(() => {
          if (recognitionRef.current === recognition && isRecordingRef.current) {
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
      if (recognitionRef.current === recognition && isRecordingRef.current) {
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

  // Setup microphone recognition
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
            setCurrentTranscript("")
          } else if (!isFinal && text.length > 0) {
            setCurrentTranscript(text)
          }
        }

        const recognition = setupSpeechRecognition(handleSpeechResult, audioSettings.language)
        recognitionRef.current = recognition
        recognition.start()

        setSpeechRecognitionActive(true)
        setupAudioProcessing(micStream)
      } catch (error) {
        console.error("Failed to setup speech recognition for microphone:", error)
      }
    },
    [setupSpeechRecognition, audioSettings.language, setupAudioProcessing],
  )

  // Setup desktop recognition
  const setupDesktopRecognition = useCallback(
    async (desktopStream: MediaStream) => {
      try {
        desktopStreamRef.current = desktopStream

        const handleSpeechResult = (partialText: string, isFinal: boolean) => {
          const text = partialText.trim()
          if (isFinal && text.length > 10) {
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
                  second: "second",
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
      } catch (error) {
        console.error("Failed to setup speech recognition for desktop:", error)
      }
    },
    [setupSpeechRecognition, audioSettings.language],
  )

  const startDesktopCapture = async () => {
    try {
      // Safari doesn't support getDisplayMedia with audio
      if (browserInfo.isSafari) {
        throw new Error(
          "🍎 Safari doesn't support desktop audio capture. Please use Chrome, Firefox, or Edge for desktop recording.",
        )
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 2,
        },
        video: {
          mediaSource: "screen",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })

      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        throw new Error("❌ No audio track. Make sure to select 'Share audio' when prompted!")
      }

      return stream
    } catch (error) {
      if (error.name === "NotAllowedError") {
        throw new Error("🚫 Permission denied! Please reload and select 'Share audio'")
      } else if (error.name === "NotFoundError") {
        throw new Error("❌ No audio source found. Select a tab with audio.")
      } else {
        throw new Error(`❌ Desktop audio capture error: ${error.message}`)
      }
    }
  }

  // Save current chunk and start new one
  const saveCurrentChunk = useCallback(() => {
    if (currentChunkDataRef.current.length > 0 && mediaRecorderRef.current) {
      const chunkBlob = new Blob(currentChunkDataRef.current, {
        type: mediaRecorderRef.current.mimeType || "audio/webm",
      })

      const newChunk: AudioChunk = {
        blob: chunkBlob,
        timestamp: new Date().toLocaleTimeString(),
        duration: CHUNK_DURATION,
        chunkNumber: currentChunkNumber,
      }

      setAudioChunks((prev) => [...prev, newChunk])
      currentChunkDataRef.current = []
      setChunkDuration(0)
      setCurrentChunkNumber((prev) => prev + 1)

      showToast(`📦 Chunk ${currentChunkNumber} saved (${CHUNK_DURATION}s)`, "success")
    }
  }, [currentChunkNumber])

  // Restart recording for next chunk
  const restartRecordingForNextChunk = useCallback(() => {
    if (isRecordingRef.current && mediaRecorderRef.current) {
      console.log(`🔄 Restarting recording for chunk ${currentChunkNumber + 1}`)

      // Start new recording immediately
      try {
        mediaRecorderRef.current.start(1000)
        console.log(`✅ Started recording chunk ${currentChunkNumber + 1}`)
      } catch (error) {
        console.error("Failed to restart recording:", error)
        showToast("❌ Failed to restart recording", "error")
      }
    }
  }, [currentChunkNumber])

  const startRecording = async () => {
    setError(null)

    // Check browser compatibility
    if (browserInfo.isSafari && captureMode === "desktop") {
      setError(
        "🍎 Safari doesn't support desktop audio capture. Please switch to microphone mode or use Chrome/Firefox for desktop recording.",
      )
      return
    }

    // Save current session to history before starting new one
    const currentSessionData = loadSessionData()
    if (currentSessionData) {
      const sessionData: SessionData = {
        liveTranscript: transcript,
        finalTranscripts,
        audioChunks,
        totalDuration: duration,
        captureMode,
        userName,
        timestamp: new Date().toISOString(),
      }
      saveSessionToHistory(sessionData)
      showToast("📚 Previous session saved to history", "success")
    }

    // Clear current session
    clearSessionData()

    try {
      let micStream: MediaStream | null = null
      let desktopStream: MediaStream | null = null

      // Get microphone stream
      if (captureMode === "microphone" || captureMode === "both") {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: browserInfo.isSafari ? 44100 : 48000, // Safari prefers 44.1kHz
              channelCount: 2,
              echoCancellation: audioSettings.echoCancellation,
              noiseSuppression: audioSettings.noiseSuppression,
              autoGainControl: audioSettings.autoGain,
            },
          })
          await setupMicRecognition(micStream)
          showToast("✅ Microphone access granted", "success")
        } catch (err) {
          console.error("Microphone access error:", err)
          showToast("❌ Cannot access microphone", "error")
          if (captureMode === "both") {
            setCaptureMode("desktop")
          } else {
            throw err
          }
        }
      }

      // Get desktop audio stream (not supported in Safari)
      if ((captureMode === "desktop" || captureMode === "both") && !browserInfo.isSafari) {
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
                sampleRate: browserInfo.isSafari ? 44100 : 48000,
                channelCount: 2,
                echoCancellation: audioSettings.echoCancellation,
                noiseSuppression: audioSettings.noiseSuppression,
                autoGainControl: audioSettings.autoGain,
              },
            })
            await setupMicRecognition(micStream)
          }
        }
      }

      // Set up mixed audio recording
      if (micStream || desktopStream) {
        const AudioContextClass = getAudioContext()
        if (!AudioContextClass) {
          throw new Error("AudioContext not supported in this browser")
        }

        const audioContext = new AudioContextClass({
          sampleRate: browserInfo.isSafari ? 44100 : 48000,
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

        // Set up MediaRecorder with Safari-compatible formats
        const supportedFormats = browserInfo.isSafari
          ? ["audio/mp4", "audio/webm", "audio/wav"]
          : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]

        let selectedFormat = "audio/webm"
        for (const format of supportedFormats) {
          if (MediaRecorder.isTypeSupported(format)) {
            selectedFormat = format
            break
          }
        }

        mediaRecorderRef.current = new MediaRecorder(mixedStream, {
          mimeType: selectedFormat,
          audioBitsPerSecond: browserInfo.isSafari ? 128000 : 192000, // Lower bitrate for Safari
        })

        currentChunkDataRef.current = []

        mediaRecorderRef.current.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0) {
            currentChunkDataRef.current.push(event.data)
          }
        })

        mediaRecorderRef.current.addEventListener("stop", () => {
          console.log(`🛑 MediaRecorder stopped for chunk ${currentChunkNumber}`)
          // Save the current chunk
          saveCurrentChunk()

          // If still recording, restart for next chunk
          if (isRecordingRef.current) {
            setTimeout(() => {
              restartRecordingForNextChunk()
            }, 100)
          } else {
            // Final stop - close audio context
            audioContext.close()
          }
        })

        mediaRecorderRef.current.addEventListener("error", (event) => {
          console.error("MediaRecorder error:", event)
          setError(`Recording error: ${event.error?.message || "Unknown error"}`)
        })

        mediaRecorderRef.current.start(1000) // Record in 1-second chunks
        console.log(`🎵 Started recording chunk ${currentChunkNumber}`)
      }

      setIsRecording(true)
      isRecordingRef.current = true
      setDuration(0)
      setChunkDuration(0)
      setCurrentChunkNumber(1)

      // Reset current session state
      setTranscript([])
      setFinalTranscripts([])
      setAudioChunks([])
      setCurrentTranscript("")

      // Start chunk timer - automatically save chunks every 30 seconds
      chunkIntervalRef.current = setInterval(() => {
        if (isRecordingRef.current && mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          console.log(`⏰ 30 seconds reached, stopping chunk ${currentChunkNumber}`)
          // Stop current recording to trigger the save and restart cycle
          mediaRecorderRef.current.stop()
        }
      }, CHUNK_DURATION * 1000)

      showToast(`🚀 Recording started with ${captureMode} capture! Auto-chunking every ${CHUNK_DURATION}s`, "success")
    } catch (err) {
      console.error("Error starting recording:", err)
      setError(`❌ Failed to start recording: ${err.message}`)
      setIsRecording(false)
      isRecordingRef.current = false
    }
  }

  const stopRecording = () => {
    console.log("🛑 Stopping recording...")
    isRecordingRef.current = false

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }

    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current)
    }

    cleanupAudioProcessing()

    setIsRecording(false)
    setIsListeningForAI(false)
    setSpeechRecognitionActive(false)
    setCurrentTranscript("")
    setChunkDuration(0)

    showToast("🛑 Recording stopped", "success")
  }

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Reset session function
  const handleResetSession = () => {
    // Save current session to history before resetting
    if (transcript.length > 0 || finalTranscripts.length > 0 || audioChunks.length > 0) {
      const sessionData: SessionData = {
        liveTranscript: transcript,
        finalTranscripts,
        audioChunks,
        totalDuration: duration,
        captureMode,
        userName,
        timestamp: new Date().toISOString(),
      }
      saveSessionToHistory(sessionData)
      showToast("📚 Session saved to history before reset", "success")
    }

    setAudioChunks([])
    setFinalTranscripts([])
    setTranscript([])
    setCurrentTranscript("")
    setDuration(0)
    setChunkDuration(0)
    setCurrentChunkNumber(1)
    clearSessionData()
    showToast("🗑️ Session reset!", "success")
  }

  // Handle transcript completion from FinalTranscript component
  const handleTranscriptComplete = (transcript: string, chunkIndex: number) => {
    setFinalTranscripts((prev) => {
      const newTranscripts = [...prev]
      newTranscripts[chunkIndex] = transcript
      return newTranscripts
    })
  }

  // Download merged audio
  const handleDownloadAudio = async () => {
    if (audioChunks.length === 0) {
      showToast("No audio recorded to download.", "error")
      return
    }

    try {
      showToast("Merging audio chunks...", "loading")
      const mergedBlob = await mergeAudioBlobs(audioChunks)

      const url = URL.createObjectURL(mergedBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `complete-recording-${new Date().toISOString().replace(/[:.]/g, "-")}.mp3`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showToast("Complete audio download started!", "success")
    } catch (error) {
      console.error("Failed to merge audio:", error)
      showToast("Failed to merge audio chunks", "error")
    }
  }

  const handleDownloadTranscript = () => {
    const transcriptText = formatLiveTranscriptForContext(transcript, userName)
    const blob = new Blob([transcriptText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `live-transcript-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Timer effects
  useEffect(() => {
    if (isRecording) {
      intervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1)
        setChunkDuration((prev) => prev + 1)
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop()
      }
      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current)
      }
      cleanupAudioProcessing()
    }
  }, [cleanupAudioProcessing])

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
        {/* Header with Theme Toggle */}
        <div className="relative">
          <div className="text-center space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-slate-100">Sesame Recorder</h1>
            <p className="text-slate-600 dark:text-slate-400">
              Record, transcribe, and analyze your AI conversations with automatic 30-second chunking.
            </p>
            {browserInfo.isSafari && (
              <div className="flex items-center justify-center space-x-2 text-sm text-orange-600 dark:text-orange-400">
                <Info className="h-4 w-4" />
                <span>Safari detected - Desktop audio capture not supported, microphone recording available</span>
              </div>
            )}
          </div>

          {/* Theme Toggle - Positioned absolutely in top right */}
          <div className="absolute top-0 right-0">
            <ThemeToggle />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
          </Alert>
        )}

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
                        disabled={browserInfo.isSafari}
                        title={browserInfo.isSafari ? "Desktop capture not supported in Safari" : ""}
                      >
                        <Headphones className="h-3 w-3 mr-1" />
                        Desktop
                      </Button>
                      <Button
                        variant={captureMode === "both" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCaptureMode("both")}
                        className="text-xs"
                        disabled={browserInfo.isSafari}
                        title={browserInfo.isSafari ? "Desktop capture not supported in Safari" : ""}
                      >
                        Both
                      </Button>
                    </div>
                  </div>

                  {/* Safari Desktop Warning */}
                  {browserInfo.isSafari && (captureMode === "desktop" || captureMode === "both") && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        🍎 Safari doesn't support desktop audio capture. Please use microphone mode or switch to
                        Chrome/Firefox for desktop recording.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Reset Session Button */}
                  {(audioChunks.length > 0 || transcript.length > 0 || finalTranscripts.length > 0) && !isRecording && (
                    <Button
                      onClick={handleResetSession}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset Session
                    </Button>
                  )}

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
                    <div className="flex items-center justify-center space-x-4 text-slate-600 dark:text-slate-300">
                      <div className="flex items-center space-x-1">
                        <Clock className="h-4 w-4" />
                        <span className="font-mono text-lg">{formatDuration(duration)}</span>
                      </div>
                      {isRecording && (
                        <div className="flex items-center space-x-1">
                          <span className="text-sm">Chunk {currentChunkNumber}:</span>
                          <span className="font-mono text-sm">
                            {formatDuration(chunkDuration)}/{CHUNK_DURATION}s
                          </span>
                        </div>
                      )}
                    </div>
                    {audioChunks.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        📦 {audioChunks.length} chunks saved
                      </Badge>
                    )}
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
                    <span>Live Transcript</span>
                    {transcript.length > 0 && (
                      <Badge variant="secondary" className="ml-auto">
                        {transcript.length} entries
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
                          <p>Start recording to see live transcription here.</p>
                          <p className="text-xs mt-2">
                            Audio will be automatically processed in {CHUNK_DURATION}-second chunks
                          </p>
                          {browserInfo.isSafari && (
                            <p className="text-xs mt-2 text-orange-600 dark:text-orange-400">
                              🍎 Safari: Microphone recording supported, desktop capture requires Chrome/Firefox
                            </p>
                          )}
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
                    disabled={audioChunks.length === 0}
                    className="w-full justify-start transition-opacity hover:bg-slate-100 dark:hover:bg-slate-800"
                    variant="outline"
                  >
                    <FileAudio className="h-4 w-4 mr-2" />
                    Download Complete Audio
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
                      <span>Browser:</span>
                      <span className="font-mono text-xs">
                        {browserInfo.isSafari
                          ? "🍎 Safari"
                          : browserInfo.isChrome
                            ? "🌐 Chrome"
                            : browserInfo.isFirefox
                              ? "🦊 Firefox"
                              : "Other"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Duration:</span>
                      <span className="font-mono">{formatDuration(duration)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Audio Chunks:</span>
                      <span className="font-mono">{audioChunks.length}</span>
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
                      <span>API Keys:</span>
                      <span className="font-mono">{geminiApiKeys.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Final Transcript Section - Auto-processes chunks */}
            <div className="mt-6">
              <FinalTranscript
                audioChunks={audioChunks}
                onTranscriptComplete={handleTranscriptComplete}
                autoStart={true}
                userName={userName}
                liveTranscriptContext={formatLiveTranscriptForContext(transcript, userName)}
                onResetSession={handleResetSession}
                geminiApiKeys={geminiApiKeys}
              />
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <RecordingHistory />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Audio Settings */}
              <AudioSettings onSettingsChange={setAudioSettings} />

              {/* Gemini Settings */}
              <GeminiSettings onApiKeysChange={setGeminiApiKeys} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
