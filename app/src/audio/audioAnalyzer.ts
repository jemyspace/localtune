import { deriveMood } from './audioFeaturesStore'
import type { AudioFeatures } from './types'
import { trackKeyFor } from '../trackKey'
import type { Track } from '../types'

const MAX_ANALYZE_SEC = 45

async function decodeSample(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer()
  const ctx = new AudioContext()
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
    const sampleRate = decoded.sampleRate
    const maxSamples = Math.min(decoded.length, Math.floor(sampleRate * MAX_ANALYZE_SEC))
    if (maxSamples === decoded.length) return decoded

    const trimmed = ctx.createBuffer(decoded.numberOfChannels, maxSamples, sampleRate)
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      trimmed.copyToChannel(decoded.getChannelData(ch).subarray(0, maxSamples), ch)
    }
    return trimmed
  } finally {
    await ctx.close()
  }
}

function estimateTempo(samples: Float32Array, sampleRate: number): number | null {
  // Jendela 10 ms: resolusi lag cukup halus agar 128 BPM tidak terbaca 133.
  const windowSize = Math.floor(sampleRate * 0.01)
  if (samples.length < windowSize * 20) return null

  const envelopes: number[] = []
  for (let i = 0; i < samples.length - windowSize; i += windowSize) {
    let sum = 0
    for (let j = 0; j < windowSize; j++) {
      const v = samples[i + j] ?? 0
      sum += v * v
    }
    envelopes.push(Math.sqrt(sum / windowSize))
  }

  // Onset envelope (hanya kenaikan energi) → ketukan lebih jelas daripada RMS mentah.
  const onsets = envelopes.map((v, i) => Math.max(0, v - (envelopes[i - 1] ?? v)))

  const framesPerSec = sampleRate / windowSize
  const minLag = Math.max(1, Math.floor((60 / 190) * framesPerSec))
  const maxLag = Math.floor((60 / 55) * framesPerSec)
  const corrAt = (lag: number): number => {
    let corr = 0
    for (let i = 0; i < onsets.length - lag; i++) {
      corr += (onsets[i] ?? 0) * (onsets[i + lag] ?? 0)
    }
    return corr / Math.max(1, onsets.length - lag)
  }

  let bestLag = 0
  let bestCorr = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    const corr = corrAt(lag)
    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }

  if (bestLag <= 0) return null
  // Koreksi oktaf: autokorelasi juga memuncak di 2× periode ketukan (setengah tempo).
  const half = Math.round(bestLag / 2)
  if (half >= minLag) {
    const halfCorr = Math.max(corrAt(half - 1), corrAt(half), corrAt(half + 1))
    if (halfCorr >= bestCorr * 0.75) bestLag = half
  }
  const bpm = (60 * sampleRate) / (windowSize * bestLag)
  if (!Number.isFinite(bpm) || bpm < 50 || bpm > 200) return null
  return Math.round(bpm)
}

function analyzeBuffer(buffer: AudioBuffer, trackKey: string): AudioFeatures {
  const data = buffer.getChannelData(0)
  let sumSq = 0
  let zc = 0
  for (let i = 0; i < data.length; i++) {
    const v = data[i] ?? 0
    sumSq += v * v
    if (i > 0 && Math.sign(v) !== Math.sign(data[i - 1] ?? 0)) zc++
  }

  const energy = Math.min(1, Math.sqrt(sumSq / Math.max(1, data.length)) * 4)
  const brightness = Math.min(1, (zc / Math.max(1, data.length)) * 80)
  const tempoBpm = estimateTempo(data, buffer.sampleRate)
  const mood = deriveMood(energy, brightness, tempoBpm)

  return {
    trackKey,
    energy,
    brightness,
    tempoBpm,
    mood,
    analyzedAt: Date.now(),
  }
}

export async function analyzeTrack(track: Track): Promise<AudioFeatures> {
  const buffer = await decodeSample(track.file)
  return analyzeBuffer(buffer, trackKeyFor(track))
}
