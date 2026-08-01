export type AudioMood = 'energetic' | 'calm' | 'bright' | 'warm' | 'balanced'

export interface AudioFeatures {
  trackKey: string
  energy: number
  brightness: number
  tempoBpm: number | null
  mood: AudioMood
  analyzedAt: number
}

export interface AudioFeaturesBlob {
  schemaVersion: 1
  features: Record<string, AudioFeatures>
  updatedAt: number
}
