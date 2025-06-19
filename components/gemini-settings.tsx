"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Sparkles, ExternalLink, Eye, EyeOff, CheckCircle, AlertTriangle } from "lucide-react"

interface GeminiSettingsProps {
  onApiKeyChange: (apiKey: string) => void
}

export function GeminiSettings({ onApiKeyChange }: GeminiSettingsProps) {
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [validationStatus, setValidationStatus] = useState<"idle" | "valid" | "invalid">("idle")
  const [validationMessage, setValidationMessage] = useState("")

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem("gemini-api-key")
    if (savedApiKey) {
      setApiKey(savedApiKey)
      onApiKeyChange(savedApiKey)
    }
  }, [onApiKeyChange])

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    setValidationStatus("idle")

    // Save to localStorage
    if (value.trim()) {
      localStorage.setItem("gemini-api-key", value.trim())
    } else {
      localStorage.removeItem("gemini-api-key")
    }

    onApiKeyChange(value.trim())
  }

  const validateApiKey = async () => {
    if (!apiKey.trim()) {
      setValidationMessage("Please enter an API key")
      setValidationStatus("invalid")
      return
    }

    setIsValidating(true)
    setValidationStatus("idle")

    try {
      // Simple validation - check if key format looks correct
      if (!apiKey.startsWith("AIza") || apiKey.length < 30) {
        throw new Error("Invalid API key format. Gemini API keys should start with 'AIza'")
      }

      // Test API key with a simple request
      const response = await fetch("/api/validate-gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })

      if (response.ok) {
        const result = await response.json()
        setValidationStatus("valid")
        setValidationMessage(`API key is valid! Model: ${result.model}`)
      } else {
        const error = await response.text()
        throw new Error(error || "API key validation failed")
      }
    } catch (error) {
      console.error("API key validation error:", error)
      setValidationStatus("invalid")
      setValidationMessage(error.message || "Failed to validate API key")
    } finally {
      setIsValidating(false)
    }
  }

  const clearApiKey = () => {
    setApiKey("")
    setValidationStatus("idle")
    setValidationMessage("")
    localStorage.removeItem("gemini-api-key")
    onApiKeyChange("")
  }

  return (
    <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <span>Gemini 2.5 Pro Configuration</span>
          {validationStatus === "valid" && (
            <Badge variant="default" className="ml-auto bg-green-600">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* API Key Input */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Gemini 2.5 Pro API Key</Label>

          <div className="relative">
            <Input
              type={showApiKey ? "text" : "password"}
              placeholder="Enter your Gemini API key (AIza...)"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              className="pr-20"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
              {apiKey && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                  onClick={clearApiKey}
                >
                  ×
                </Button>
              )}
            </div>
          </div>

          {/* Validation */}
          <div className="flex items-center space-x-2">
            <Button
              onClick={validateApiKey}
              disabled={!apiKey.trim() || isValidating}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              {isValidating ? "Validating..." : "Test API Key"}
            </Button>

            {validationStatus === "valid" && (
              <div className="flex items-center text-green-600 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                Valid
              </div>
            )}

            {validationStatus === "invalid" && (
              <div className="flex items-center text-red-600 text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Invalid
              </div>
            )}
          </div>

          {validationMessage && (
            <Alert variant={validationStatus === "valid" ? "default" : "destructive"}>
              <AlertDescription className="text-xs">{validationMessage}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Get API Key Instructions */}
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                How to get your Gemini 2.5 Pro API Key
              </span>
            </div>

            <ol className="text-xs text-purple-600 dark:text-purple-400 space-y-1 ml-4">
              <li>1. Visit Google AI Studio</li>
              <li>2. Sign in with your Google account</li>
              <li>3. Click "Get API Key" → "Create API Key"</li>
              <li>4. Copy the key and paste it above</li>
              <li>5. Test the connection with Gemini 2.5 Pro</li>
            </ol>

            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs border-purple-300 text-purple-600 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-400"
              onClick={() => window.open("https://aistudio.google.com/app/apikey", "_blank")}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Open Google AI Studio
            </Button>
          </div>
        </div>

        {/* Features Overview */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
          <div className="space-y-3">
            <h4 className="text-sm font-medium">✨ Gemini 2.5 Pro Features</h4>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <div className="font-medium text-slate-700 dark:text-slate-300">Audio Processing</div>
                <ul className="text-slate-600 dark:text-slate-400 space-y-0.5">
                  <li>• Superior transcription accuracy</li>
                  <li>• Advanced audio understanding</li>
                  <li>• Multi-format support</li>
                  <li>• Noise reduction</li>
                </ul>
              </div>

              <div className="space-y-1">
                <div className="font-medium text-slate-700 dark:text-slate-300">AI Features</div>
                <ul className="text-slate-600 dark:text-slate-400 space-y-0.5">
                  <li>• Context-aware processing</li>
                  <li>• Speaker identification</li>
                  <li>• Technical term recognition</li>
                  <li>• Multi-language support</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Usage Stats */}
        {validationStatus === "valid" && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
            <div className="text-xs text-green-700 dark:text-green-300">
              <div className="font-medium mb-1">🚀 Ready for Advanced Transcription</div>
              <p>
                Your Gemini 2.5 Pro API is configured and ready to transcribe audio files with the most advanced AI
                processing available.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
