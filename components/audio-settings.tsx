"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Settings, Mic, Volume2, Languages, Wand2 } from "lucide-react"
import { toast } from "sonner"

interface AudioSettingsProps {
  onSettingsChange: (settings: AudioSettings) => void
  initialSettings: AudioSettings;
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

export function AudioSettings({ onSettingsChange, initialSettings }: AudioSettingsProps) {
  const [settings, setSettings] = useState<AudioSettings>(initialSettings)

  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  const updateSetting = <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    onSettingsChange(newSettings)
    toast.success("Settings updated", { description: `Set ${key.replace(/([A-Z])/g, ' $1')} to ${value}` });
  }

  return (
    <Card className="max-w-2xl mx-auto border-0 shadow-lg bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Settings className="h-5 w-5" />
          <span>Audio & Transcription Settings</span>
        </CardTitle>
        <CardDescription>Fine-tune audio quality and recognition parameters for optimal performance.</CardDescription>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-8 pt-2">
        {/* Audio Processing */}
        <div className="space-y-6">
          <div className="space-y-1">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Wand2 className="h-5 w-5 text-primary" /> Audio Enhancement</h3>
              <p className="text-sm text-muted-foreground">Browser-based audio processing for clearer recordings.</p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
              <Label htmlFor="autoGain" className="text-sm font-medium flex-1 cursor-pointer">Auto Gain Control</Label>
              <Switch id="autoGain" checked={settings.autoGain} onCheckedChange={(checked) => updateSetting("autoGain", checked)} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
              <Label htmlFor="noiseSuppression" className="text-sm font-medium flex-1 cursor-pointer">Noise Suppression</Label>
              <Switch
                id="noiseSuppression"
                checked={settings.noiseSuppression}
                onCheckedChange={(checked) => updateSetting("noiseSuppression", checked)}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
              <Label htmlFor="echoCancellation" className="text-sm font-medium flex-1 cursor-pointer">Echo Cancellation</Label>
              <Switch
                id="echoCancellation"
                checked={settings.echoCancellation}
                onCheckedChange={(checked) => updateSetting("echoCancellation", checked)}
              />
            </div>
          </div>
        </div>
        <div className="space-y-6">
          {/* Quality Settings */}
          <div className="space-y-1">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Volume2 className="h-5 w-5 text-primary" /> Recording Quality</h3>
             <p className="text-sm text-muted-foreground">Balance file size and audio fidelity.</p>
          </div>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-background/50">
              <Label className="text-sm font-medium">Sample Rate</Label>
              <Select
                value={String(settings.sampleRate)}
                onValueChange={(value) => updateSetting("sampleRate", Number.parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="22050">22.05 kHz (Low)</SelectItem>
                  <SelectItem value="44100">44.1 kHz (Standard)</SelectItem>
                  <SelectItem value="48000">48 kHz (High)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 rounded-lg bg-background/50">
              <Label className="text-sm font-medium">Bit Rate</Label>
              <Select
                value={String(settings.bitRate)}
                onValueChange={(value) => updateSetting("bitRate", Number.parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="64000">64 kbps (Low)</SelectItem>
                  <SelectItem value="128000">128 kbps (Standard)</SelectItem>
                  <SelectItem value="192000">192 kbps (High)</SelectItem>
                  <SelectItem value="320000">320 kbps (Studio)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Transcription Settings */}
           <div className="space-y-1">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Languages className="h-5 w-5 text-primary" /> Transcription</h3>
             <p className="text-sm text-muted-foreground">Configure speech recognition language.</p>
          </div>
           <div className="p-3 rounded-lg bg-background/50">
              <Label className="text-sm font-medium">Language</Label>
              <Select value={settings.language} onValueChange={(value) => updateSetting("language", value)}>
                <SelectTrigger>
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
        </div>
      </CardContent>
    </Card>
  )
}
