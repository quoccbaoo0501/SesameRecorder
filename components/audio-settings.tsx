"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Settings, Mic, Volume2, Languages } from "lucide-react"

interface AudioSettingsProps {
  onSettingsChange: (settings: AudioSettings) => void
}

export interface AudioSettings {
  sampleRate: number
  bitRate: number
  autoGain: boolean
  noiseSuppression: boolean
  echoCancellation: boolean
  language: string
  sensitivity: number
}

export function AudioSettings({ onSettingsChange }: AudioSettingsProps) {
  const [settings, setSettings] = useState<AudioSettings>({
    sampleRate: 44100,
    bitRate: 128,
    autoGain: true,
    noiseSuppression: true,
    echoCancellation: true,
    language: "en-US",
    sensitivity: 50,
  })

  const updateSetting = <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    onSettingsChange(newSettings)
  }

  return (
    <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm transition-colors duration-300">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Settings className="h-5 w-5" />
          <span>Audio Settings</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quality Settings */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Volume2 className="h-4 w-4" />
            <Label className="text-sm font-medium">Quality</Label>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-600 dark:text-slate-400">Sample Rate</Label>
              <Select
                value={settings.sampleRate.toString()}
                onValueChange={(value) => updateSetting("sampleRate", Number.parseInt(value))}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="22050">22.05 kHz</SelectItem>
                  <SelectItem value="44100">44.1 kHz</SelectItem>
                  <SelectItem value="48000">48 kHz</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-slate-600 dark:text-slate-400">Bit Rate</Label>
              <Select
                value={settings.bitRate.toString()}
                onValueChange={(value) => updateSetting("bitRate", Number.parseInt(value))}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="64">64 kbps</SelectItem>
                  <SelectItem value="128">128 kbps</SelectItem>
                  <SelectItem value="192">192 kbps</SelectItem>
                  <SelectItem value="320">320 kbps</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Audio Processing */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Mic className="h-4 w-4" />
            <Label className="text-sm font-medium">Processing</Label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-slate-600 dark:text-slate-400">Auto Gain Control</Label>
              <Switch checked={settings.autoGain} onCheckedChange={(checked) => updateSetting("autoGain", checked)} />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs text-slate-600 dark:text-slate-400">Noise Suppression</Label>
              <Switch
                checked={settings.noiseSuppression}
                onCheckedChange={(checked) => updateSetting("noiseSuppression", checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs text-slate-600 dark:text-slate-400">Echo Cancellation</Label>
              <Switch
                checked={settings.echoCancellation}
                onCheckedChange={(checked) => updateSetting("echoCancellation", checked)}
              />
            </div>
          </div>
        </div>

        {/* Transcription Settings */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Languages className="h-4 w-4" />
            <Label className="text-sm font-medium">Transcription</Label>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-600 dark:text-slate-400">Language</Label>
              <Select value={settings.language} onValueChange={(value) => updateSetting("language", value)}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="en-GB">English (UK)</SelectItem>
                  <SelectItem value="es-ES">Spanish</SelectItem>
                  <SelectItem value="fr-FR">French</SelectItem>
                  <SelectItem value="de-DE">German</SelectItem>
                  <SelectItem value="ja-JP">Japanese</SelectItem>
                  <SelectItem value="zh-CN">Chinese (Simplified)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-slate-600 dark:text-slate-400 mb-2 block">
                Sensitivity: {settings.sensitivity}%
              </Label>
              <Slider
                value={[settings.sensitivity]}
                onValueChange={([value]) => updateSetting("sensitivity", value)}
                max={100}
                min={0}
                step={5}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
