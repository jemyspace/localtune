const STORAGE_KEY = 'localtune:likes:v1'

type Listener = () => void

/**
 * Lagu yang ditandai "Suka" (per trackKey). Seperti profil selera, hanya
 * hidup di sessionStorage tab ini — tidak ada yang dikirim ke server.
 */
export class LikesStore {
  private readonly keys: Set<string>
  private readonly listeners = new Set<Listener>()

  constructor() {
    this.keys = new Set(this.load())
  }

  has(trackKey: string): boolean {
    return this.keys.has(trackKey)
  }

  count(): number {
    return this.keys.size
  }

  /** Balik status suka; mengembalikan status baru. */
  toggle(trackKey: string): boolean {
    const liked = !this.keys.has(trackKey)
    if (liked) this.keys.add(trackKey)
    else this.keys.delete(trackKey)
    this.save()
    for (const l of this.listeners) l()
    return liked
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private load(): string[] {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      const parsed = raw ? (JSON.parse(raw) as unknown) : []
      return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
    } catch {
      return []
    }
  }

  private save(): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...this.keys]))
    } catch {
      /* penyimpanan penuh/diblokir: tetap jalan di memori */
    }
  }
}
