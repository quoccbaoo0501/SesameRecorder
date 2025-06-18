"use client"

import { useState, useEffect, useMemo } from "react"
import { Bar, BarChart, ResponsiveContainer, XAxis, Tooltip } from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { TrendingUp, Clock, Mic, Zap, User, Bot, Sun, Moon } from "lucide-react"

interface AnalyticsData {
  totalRecordings: number
  totalDuration: number
  userTurns: number
  aiTurns: number
  averageConfidence: number
  mostActiveHour: number
  weeklyTrend: { day: string, recordings: number }[]
}

export function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // This function can be extracted to a separate analytics service
    const calculateAnalytics = () => {
      setIsLoading(true);
      try {
        const recordings = JSON.parse(localStorage.getItem("sesame-recordings") || "[]");
        if (recordings.length === 0) {
            setAnalytics(null);
            return;
        }

        let totalDuration = 0;
        let userTurns = 0;
        let aiTurns = 0;
        let totalConfidence = 0;
        let confidenceCount = 0;
        const recordingHours: number[] = [];

        recordings.forEach((rec: any) => {
          totalDuration += rec.duration || 0;
          recordingHours.push(new Date(rec.timestamp).getHours());
          try {
            const transcript = JSON.parse(rec.transcript || "[]");
            transcript.forEach((entry: any) => {
              if (entry.speaker === 'user') userTurns++;
              if (entry.speaker === 'ai') aiTurns++;
              if (entry.confidence) {
                totalConfidence += entry.confidence;
                confidenceCount++;
              }
            });
          } catch { /* ignore transcript parsing errors */ }
        });

        const hourCounts = recordingHours.reduce((acc, hour) => {
            acc[hour] = (acc[hour] || 0) + 1;
            return acc;
        }, {} as Record<number, number>);
        
        const mostActiveHour = Object.keys(hourCounts).length > 0
            ? Number(Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b))
            : -1;
            
        // Mock weekly trend data
        const weeklyTrend = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => ({
            day,
            recordings: Math.floor(Math.random() * (recordings.length/2) + i),
        }));
        weeklyTrend[new Date().getDay()] = recordings.length;


        setAnalytics({
          totalRecordings: recordings.length,
          totalDuration,
          userTurns,
          aiTurns,
          averageConfidence: confidenceCount > 0 ? (totalConfidence / confidenceCount) * 100 : 0,
          mostActiveHour,
          weeklyTrend,
        });
      } catch (error) {
        console.error("Failed to load analytics:", error);
        setAnalytics(null);
      } finally {
        setIsLoading(false);
      }
    };

    calculateAnalytics();
    // Re-calculate when storage changes (e.g., from another tab)
    window.addEventListener('storage', calculateAnalytics);
    return () => window.removeEventListener('storage', calculateAnalytics);
  }, []);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };
  
  const MostActiveTime = useMemo(() => {
    if (!analytics || analytics.mostActiveHour === -1) return null;
    const hour = analytics.mostActiveHour;
    const isDay = hour > 6 && hour < 19;
    const formattedHour = hour % 12 === 0 ? 12 : hour % 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    
    return (
      <div className="flex items-center gap-2">
        {isDay ? <Sun className="h-6 w-6 text-orange-400" /> : <Moon className="h-6 w-6 text-indigo-400" />}
        <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{formattedHour} {ampm}</span>
      </div>
    );
  }, [analytics]);

  if (isLoading) {
      return <div className="text-center p-8">Loading analytics...</div>;
  }

  if (!analytics) {
    return (
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm text-center p-8 col-span-full">
        <CardHeader>
          <CardTitle>No Analytics Data</CardTitle>
          <CardDescription>Start a recording to see your usage statistics here.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card className="lg:col-span-2 border-0 shadow-lg bg-card/80 backdrop-blur-sm">
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><Mic className="h-5 w-5 text-primary" /> Total Recordings</CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-4xl font-bold text-slate-800 dark:text-slate-100">{analytics.totalRecordings}</p>
            <p className="text-sm text-muted-foreground">Total sessions saved</p>
        </CardContent>
      </Card>
      
      <Card className="lg:col-span-2 border-0 shadow-lg bg-card/80 backdrop-blur-sm">
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> Total Duration</CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-4xl font-bold text-slate-800 dark:text-slate-100">{formatDuration(analytics.totalDuration)}</p>
            <p className="text-sm text-muted-foreground">Total time spent recording</p>
        </CardContent>
      </Card>
      
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-blue-500" /> Your Turns</CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-3xl font-bold">{analytics.userTurns}</p>
        </CardContent>
      </Card>
      
      <Card className="border-0 shadow-lg bg-card/80 backdrop-blur-sm">
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-emerald-500" /> AI Turns</CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-3xl font-bold">{analytics.aiTurns}</p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 border-0 shadow-lg bg-card/80 backdrop-blur-sm">
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-purple-500" /> Average Confidence</CardTitle>
             <CardDescription>Transcription accuracy confidence score.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <p className="text-3xl font-bold">{analytics.averageConfidence.toFixed(1)}%</p>
            <Progress value={analytics.averageConfidence} className="w-full" />
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 lg:col-span-4 border-0 shadow-lg bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <span>Weekly Activity</span>
          </CardTitle>
           <CardDescription>Number of recordings this week. Peak time: {MostActiveTime}</CardDescription>
        </CardHeader>
        <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={200}>
                <BarChart data={analytics.weeklyTrend}>
                    <XAxis dataKey="day" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                        contentStyle={{
                            background: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "var(--radius)",
                        }}
                        cursor={{ fill: "hsl(var(--accent))", radius: "var(--radius)" }}
                     />
                    <Bar dataKey="recordings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
