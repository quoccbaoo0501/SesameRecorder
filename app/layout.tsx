import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import Script from "next/script"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Sesame Recorder - AI Conversation Recorder",
  description: "Record, transcribe, and analyze your AI conversations with Web Speech API",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>

        {/* Load lamejs for MP3 conversion */}
        <Script src="https://cdn.jsdelivr.net/npm/lamejs@1.2.0/lame.min.js" strategy="beforeInteractive" />
      </body>
    </html>
  )
}
