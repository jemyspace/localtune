import type { AudioFeatures, AudioFeaturesBlob, AudioMood } from './types'

const STORAGE_KEY = 'localtune:audioFeatures:v1'

function empty(): AudioFeaturesBlob {
  return { schemaVersion: 1, features: {}, updatedAt: Date.now() }
}

export class AudioFeaturesStore {
  private blob: AudioFeaturesBlob
  private persistEnabled = true

  constructor() {
    this.blob = this.load()
  }

  get(trackKey: string): AudioFeatures | null {
    const f = this.blob.features[trackKey]
    return f ? { ...f } : null
  }

  set(features: AudioFeatures): void {
    this.blob.features[features.trackKey] = features
    this.blob.updatedAt = Date.now()
    this.save()
  }

  private load(): AudioFeaturesBlob {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return empty()
      const parsed = JSON.parse(raw) as AudioFeaturesBlob
      if (parsed.schemaVersion !== 1) return empty()
      return { schemaVersion: 1, features: parsed.features ?? {}, updatedAt: parsed.updatedAt ?? Date.now() }
    } catch {
      return empty()
    }
  }

  private save(): void {
    if (!this.persistEnabled) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.blob))
    } catch {
      this.persistEnabled = false
    }
  }
}

export function deriveMood(energy: number, brightness: number, tempoBpm: number | null): AudioMood {
  const tempo = tempoBpm ?? 120
  if (energy > 0.12 && tempo >= 110) return 'energetic'
  if (energy < 0.05 && tempo < 100) return 'calm'
  if (brightness > 0.35) return 'bright'
  if (brightness < 0.18 && energy >= 0.06) return 'warm'
  return 'balanced'
}
