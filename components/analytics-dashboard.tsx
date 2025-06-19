"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { TrendingUp, Clock, Mic, Zap } from "lucide-react"

interface AnalyticsData {
  totalRecordings: number
  totalDuration: number
  totalTranscripts: number
  averageAccuracy: number
  mostActiveHour: number
  weeklyTrend: number[]
}

export function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalRecordings: 0,
    totalDuration: 0,
    totalTranscripts: 0,
    averageAccuracy: 0,
    mostActiveHour: 14,
    weeklyTrend: [12, 19, 8, 15, 22, 18, 25],
  })

  useEffect(() => {
    // Load analytics from localStorage or API
    const loadAnalytics = () => {
      const recordings = localStorage.getItem("sesame-recordings")
      if (recordings) {
        try {
          const data = JSON.parse(recordings)
          setAnalytics({
            totalRecordings: data.length,
            totalDuration: data.reduce((sum: number, r: any) => sum + r.duration, 0),
            totalTranscripts: data.filter((r: any) => r.transcript).length,
            averageAccuracy: 94.5, // Mock accuracy
            mostActiveHour: 14,
            weeklyTrend: [12, 19, 8, 15, 22, 18, 25],
          })
        } catch (error) {
          console.error("Failed to load analytics:", error)
        }
      }
    }

    loadAnalytics()
    const interval = setInterval(loadAnalytics, 30000) // Update every 30 seconds
    return () => clearInterval(interval)
  }, [])

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, "0")}:00`
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Total Recordings */}
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Recordings</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{analytics.totalRecordings}</p>
            </div>
            <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <Mic className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total Duration */}
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Duration</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                {formatDuration(analytics.totalDuration)}
              </p>
            </div>
            <div className="h-12 w-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
              <Clock className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transcription Accuracy */}
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Avg. Accuracy</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{analytics.averageAccuracy}%</p>
            </div>
            <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
              <Zap className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <Progress value={analytics.averageAccuracy} className="mt-2" />
        </CardContent>
      </Card>

      {/* Most Active Hour */}
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm md:col-span-2 lg:col-span-1">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Most Active Hour</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                {formatHour(analytics.mostActiveHour)}
              </p>
            </div>
            <Badge
              variant="secondary"
              className="bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400"
            >
              Peak Time
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Weekly Trend */}
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center space-x-2 text-base">
            <TrendingUp className="h-4 w-4" />
            <span>Weekly Activity</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex items-end justify-between h-20 space-x-2">
            {analytics.weeklyTrend.map((value, index) => (
              <div key={index} className="flex flex-col items-center flex-1">
                <div
                  className="w-full bg-blue-200 dark:bg-blue-800 rounded-t transition-all duration-300 hover:bg-blue-300 dark:hover:bg-blue-700"
                  style={{ height: `${(value / Math.max(...analytics.weeklyTrend)) * 100}%` }}
                />
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
