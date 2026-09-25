export type AudioMood = 'energetic' | 'calm' | 'bright' | 'warm' | 'balanced'

export const MOOD_LABELS: Record<AudioMood, string> = {
  energetic: 'Energik',
  calm: 'Tenang',
  bright: 'Cerah',
  warm: 'Hangat',
  balanced: 'Seimbang',
}

export interface AudioFeatures {
  trackKey: string
  energy: number
  brightness: number
  tempoBpm: number | null
  mood: AudioMood
  analyzedAt: number
  /** Kontur energi seluruh lagu (WAVEFORM_BINS nilai 0–1), untuk seek bar & intensitas. */
  waveform?: number[]
  /** Detik awal bagian paling bertenaga (mis. reff/drop). */
  peakSec?: number
  durationSec?: number
}

export const WAVEFORM_BINS = 160

export interface AudioFeaturesBlob {
  schemaVersion: 1
  features: Record<string, AudioFeatures>
  updatedAt: number
}
