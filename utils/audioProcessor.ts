"use client"

// Convert audio to the format expected by Whisper (16kHz, mono, float32)
export function convertAudioForWhisper(audioBuffer: AudioBuffer): Float32Array {
  const targetSampleRate = 16000
  const sourceRate = audioBuffer.sampleRate
  const sourceData = audioBuffer.getChannelData(0) // Get mono channel

  if (sourceRate === targetSampleRate) {
    return sourceData
  }

  // Simple resampling using linear interpolation
  const ratio = sourceRate / targetSampleRate
  const targetLength = Math.floor(sourceData.length / ratio)
  const result = new Float32Array(targetLength)

  for (let i = 0; i < targetLength; i++) {
    const sourceIndex = i * ratio
    const index = Math.floor(sourceIndex)
    const fraction = sourceIndex - index

    if (index + 1 < sourceData.length) {
      result[i] = sourceData[index] * (1 - fraction) + sourceData[index + 1] * fraction
    } else {
      result[i] = sourceData[index]
    }
  }

  return result
}

// Convert MediaRecorder blob to AudioBuffer
export async function blobToAudioBuffer(blob: Blob, audioContext: AudioContext): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer()
  return await audioContext.decodeAudioData(arrayBuffer)
}

// Process audio in chunks for real-time transcription
export class AudioChunkProcessor {
  private audioContext: AudioContext
  private chunks: Float32Array[] = []
  private chunkDuration: number // in seconds
  private sampleRate = 16000

  constructor(chunkDuration = 3) {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
    this.chunkDuration = chunkDuration
  }

  addAudioData(audioBuffer: AudioBuffer) {
    const processedData = convertAudioForWhisper(audioBuffer)
    this.chunks.push(processedData)
  }

  getNextChunk(): Float32Array | null {
    if (this.chunks.length === 0) return null

    const chunkSamples = this.sampleRate * this.chunkDuration
    let totalSamples = 0

    // Calculate total samples available
    for (const chunk of this.chunks) {
      totalSamples += chunk.length
    }

    if (totalSamples < chunkSamples) return null

    // Combine chunks into a single buffer
    const result = new Float32Array(chunkSamples)
    let offset = 0
    let chunkIndex = 0

    while (offset < chunkSamples && chunkIndex < this.chunks.length) {
      const chunk = this.chunks[chunkIndex]
      const remainingSpace = chunkSamples - offset
      const copyLength = Math.min(chunk.length, remainingSpace)

      result.set(chunk.subarray(0, copyLength), offset)
      offset += copyLength

      if (copyLength === chunk.length) {
        // Consumed entire chunk
        chunkIndex++
      } else {
        // Partial chunk consumed, update the chunk
        this.chunks[chunkIndex] = chunk.subarray(copyLength)
        break
      }
    }

    // Remove consumed chunks
    this.chunks = this.chunks.slice(chunkIndex)

    return result
  }

  clear() {
    this.chunks = []
  }

  cleanup() {
    this.clear()
    if (this.audioContext.state !== "closed") {
      this.audioContext.close()
    }
  }
}
