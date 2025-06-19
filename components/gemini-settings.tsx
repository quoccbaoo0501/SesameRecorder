"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sparkles, ExternalLink, Eye, EyeOff, Plus, Trash2 } from "lucide-react"

interface ApiKeyEntry {
  id: string
  key: string
}

interface GeminiSettingsProps {
  onApiKeysChange: (apiKeys: string[]) => void
}

export function GeminiSettings({ onApiKeysChange }: GeminiSettingsProps) {
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([{ id: "1", key: "" }])
  const [showApiKeys, setShowApiKeys] = useState<{ [key: string]: boolean }>({})

  // Load API keys from localStorage on mount
  useEffect(() => {
    const savedApiKeys = localStorage.getItem("gemini-api-keys")
    if (savedApiKeys) {
      try {
        const parsed = JSON.parse(savedApiKeys)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setApiKeys(
            parsed.map((key, index) => ({
              id: (index + 1).toString(),
              key,
            })),
          )
        }
      } catch (error) {
        console.error("Failed to load API keys:", error)
      }
    }
  }, [])

  // Save API keys to localStorage and notify parent whenever keys change
  useEffect(() => {
    const validKeys = apiKeys.filter((entry) => entry.key.trim().length > 0).map((entry) => entry.key.trim())

    if (validKeys.length > 0) {
      localStorage.setItem("gemini-api-keys", JSON.stringify(validKeys))
    } else {
      localStorage.removeItem("gemini-api-keys")
    }

    onApiKeysChange(validKeys)
  }, [apiKeys, onApiKeysChange])

  const handleApiKeyChange = (id: string, value: string) => {
    setApiKeys((prev) => prev.map((entry) => (entry.id === id ? { ...entry, key: value } : entry)))
  }

  const addApiKey = () => {
    if (apiKeys.length < 5) {
      const newId = (apiKeys.length + 1).toString()
      setApiKeys((prev) => [
        ...prev,
        {
          id: newId,
          key: "",
        },
      ])
    }
  }

  const removeApiKey = (id: string) => {
    if (apiKeys.length > 1) {
      setApiKeys((prev) => prev.filter((entry) => entry.id !== id))
    }
  }

  const clearApiKey = (id: string) => {
    setApiKeys((prev) => prev.map((entry) => (entry.id === id ? { ...entry, key: "" } : entry)))
  }

  const validApiKeysCount = apiKeys.filter((entry) => entry.key.trim().length > 0).length

  return (
    <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm transition-colors duration-300">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <span>Gemini 2.5 Pro Configuration</span>
          {validApiKeysCount > 0 && (
            <Badge variant="default" className="ml-auto bg-green-600">
              {validApiKeysCount} Key{validApiKeysCount > 1 ? "s" : ""} Ready
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* API Keys Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Gemini 2.5 Pro API Keys (Max 5)</Label>
            {apiKeys.length < 5 && (
              <Button onClick={addApiKey} size="sm" variant="outline" className="text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Add Key
              </Button>
            )}
          </div>

          {/* API Key Inputs */}
          <div className="space-y-3">
            {apiKeys.map((entry, index) => (
              <div key={entry.id} className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Label className="text-xs text-slate-600 dark:text-slate-400 min-w-[60px]">Key #{entry.id}</Label>
                  {entry.key.trim().length > 0 && (
                    <Badge variant="default" className="text-xs bg-green-600">
                      Active
                    </Badge>
                  )}
                </div>

                <div className="relative">
                  <Input
                    type={showApiKeys[entry.id] ? "text" : "password"}
                    placeholder={`Enter Gemini API key ${entry.id} (AIza...)`}
                    value={entry.key}
                    onChange={(e) => handleApiKeyChange(entry.id, e.target.value)}
                    className="pr-24"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setShowApiKeys((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                    >
                      {showApiKeys[entry.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    {entry.key && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                        onClick={() => clearApiKey(entry.id)}
                      >
                        ×
                      </Button>
                    )}
                    {apiKeys.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                        onClick={() => removeApiKey(entry.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* API Key Rotation Info */}
        {validApiKeysCount > 1 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">API Key Rotation</span>
              </div>

              <div className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                <p>• Chunk 1 → API Key #1</p>
                <p>• Chunk 2 → API Key #2</p>
                <p>• Chunk 3 → API Key #3 (if available)</p>
                <p>• Continues rotating through all valid keys</p>
                <p>• Helps distribute API usage and avoid rate limits</p>
              </div>
            </div>
          </div>
        )}

        {/* Get API Key Instructions */}
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                How to get your Gemini 2.5 Pro API Keys
              </span>
            </div>

            <ol className="text-xs text-purple-600 dark:text-purple-400 space-y-1 ml-4">
              <li>1. Visit Google AI Studio</li>
              <li>2. Sign in with your Google account</li>
              <li>3. Click "Get API Key" → "Create API Key"</li>
              <li>4. Copy the key and paste it above</li>
              <li>5. Repeat for multiple keys (recommended for heavy usage)</li>
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

        {/* Ready Status */}
        {validApiKeysCount > 0 && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
            <div className="text-xs text-green-700 dark:text-green-300">
              <div className="font-medium mb-1">🚀 Ready for Advanced Transcription</div>
              <p>
                {validApiKeysCount} Gemini 2.5 Pro API key{validApiKeysCount > 1 ? "s are" : " is"} configured and ready
                to transcribe audio files with automatic rotation for optimal performance.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
