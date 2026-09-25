import { deriveMood } from './audioFeaturesStore'
import { WAVEFORM_BINS, type AudioFeatures } from './types'
import { trackKeyFor } from '../trackKey'
import type { Track } from '../types'

/** Panjang potongan yang dipakai untuk mood/tempo. */
const MOOD_WINDOW_SEC = 45
/** Sample rate analisis: cukup untuk bass/tempo, hemat memori untuk lagu panjang. */
const ANALYSIS_RATE = 22050
/** Lebar jendela pencarian "bagian puncak". */
const PEAK_WINDOW_SEC = 12

async function decodeMono(file: File): Promise<{ data: Float32Array; sampleRate: number }> {
  const arrayBuffer = await file.arrayBuffer()
  let decoded: AudioBuffer
  if (typeof OfflineAudioContext === 'function') {
    // decodeAudioData pada OfflineAudioContext me-resample ke ANALYSIS_RATE.
    const offline = new OfflineAudioContext(1, 1, ANALYSIS_RATE)
    decoded = await offline.decodeAudioData(arrayBuffer)
  } else {
    const ctx = new AudioContext()
    try {
      decoded = await ctx.decodeAudioData(arrayBuffer)
    } finally {
      await ctx.close()
    }
  }

  const channels = decoded.numberOfChannels
  const first = decoded.getChannelData(0)
  if (channels === 1) return { data: first, sampleRate: decoded.sampleRate }

  const mono = new Float32Array(decoded.length)
  for (let ch = 0; ch < channels; ch++) {
    const src = decoded.getChannelData(ch)
    for (let i = 0; i < src.length; i++) mono[i] = (mono[i] ?? 0) + (src[i] ?? 0) / channels
  }
  return { data: mono, sampleRate: decoded.sampleRate }
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

/** RMS per segmen di seluruh lagu, dinormalisasi ke puncak = 1. */
function computeWaveform(data: Float32Array, bins: number): number[] {
  const size = Math.max(1, Math.floor(data.length / bins))
  const out: number[] = []
  let max = 0
  for (let b = 0; b < bins; b++) {
    let sum = 0
    const start = b * size
    const end = Math.min(data.length, start + size)
    for (let i = start; i < end; i++) {
      const v = data[i] ?? 0
      sum += v * v
    }
    const rms = Math.sqrt(sum / Math.max(1, end - start))
    out.push(rms)
    if (rms > max) max = rms
  }
  return out.map((v) => (max > 0 ? Math.round((v / max) * 100) / 100 : 0))
}

/** Awal jendela ~12 detik dengan energi rata-rata tertinggi (reff/drop). */
function findPeakSec(waveform: number[], durationSec: number): number {
  const secPerBin = durationSec / Math.max(1, waveform.length)
  const k = Math.max(1, Math.round(PEAK_WINDOW_SEC / Math.max(0.001, secPerBin)))
  if (k >= waveform.length) return 0
  let sum = 0
  for (let i = 0; i < k; i++) sum += waveform[i] ?? 0
  let best = sum
  let bestStart = 0
  for (let i = k; i < waveform.length; i++) {
    sum += (waveform[i] ?? 0) - (waveform[i - k] ?? 0)
    if (sum > best) {
      best = sum
      bestStart = i - k + 1
    }
  }
  return Math.round(bestStart * secPerBin)
}

function analyzeSamples(data: Float32Array, sampleRate: number, trackKey: string): AudioFeatures {
  const durationSec = data.length / sampleRate

  // Mood & tempo dari bagian tengah lagu, bukan intro yang sering pelan.
  const windowLen = Math.min(data.length, Math.floor(MOOD_WINDOW_SEC * sampleRate))
  const startAt = Math.max(0, Math.min(Math.floor(data.length * 0.25), data.length - windowLen))
  const segment = data.subarray(startAt, startAt + windowLen)

  let sumSq = 0
  let zc = 0
  for (let i = 0; i < segment.length; i++) {
    const v = segment[i] ?? 0
    sumSq += v * v
    if (i > 0 && Math.sign(v) !== Math.sign(segment[i - 1] ?? 0)) zc++
  }

  const energy = Math.min(1, Math.sqrt(sumSq / Math.max(1, segment.length)) * 4)
  // Zero-crossing per detik, independen dari sample rate (551 ≈ skala lama di 44.1 kHz).
  const zcPerSec = zc / Math.max(0.001, segment.length / sampleRate)
  const brightness = Math.min(1, zcPerSec / 551)
  const tempoBpm = estimateTempo(segment, sampleRate)
  const mood = deriveMood(energy, brightness, tempoBpm)
  const waveform = computeWaveform(data, WAVEFORM_BINS)

  return {
    trackKey,
    energy,
    brightness,
    tempoBpm,
    mood,
    analyzedAt: Date.now(),
    waveform,
    peakSec: findPeakSec(waveform, durationSec),
    durationSec: Math.round(durationSec),
  }
}

export async function analyzeTrack(track: Track): Promise<AudioFeatures> {
  const { data, sampleRate } = await decodeMono(track.file)
  return analyzeSamples(data, sampleRate, trackKeyFor(track))
}
