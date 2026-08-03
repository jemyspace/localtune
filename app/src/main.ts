import { AudioIntelTrigger } from './audio/audioIntelTrigger'
import type { AudioMood } from './audio/types'
import { DiscoveryStore } from './discovery/discoveryStore'
import { ResearchClient } from './discovery/researchClient'
import { ResearchTrigger } from './discovery/researchTrigger'
import type { ResearchStatus } from './discovery/types'
import { matchesLocalLibrary } from './discovery/localMatch'
import { buildSeed, isSeedUsable } from './discovery/seed'
import { pickAudioFiles } from './filePicker'
import { Library } from './library'
import { Player } from './player'
import { COLD_START_N } from './profile/types'
import { UpNextEngine } from './profile/upNextEngine'
import { isResearchEnabled, setResearchOptOut } from './settings'
import { ListenTracker } from './taste/listenTracker'
import { TasteApi } from './taste/tasteApi'
import { ThemeController } from './theme/themeController'
import { THEME_LABELS } from './theme/types'
import { trackKeyFor } from './trackKey'
import type { Track } from './types'
import './style.css'

const library = new Library()
const player = new Player(library)
const tasteApi = new TasteApi()
const upNextEngine = new UpNextEngine()
const discoveryStore = new DiscoveryStore()
const researchClient = new ResearchClient()
const researchTrigger = new ResearchTrigger(researchClient, discoveryStore, tasteApi, library)
const audioIntel = new AudioIntelTrigger(discoveryStore, tasteApi, library)
const themeController = new ThemeController(player, discoveryStore, audioIntel.getFeaturesStore())
const listenTracker = new ListenTracker(player, library, tasteApi)
listenTracker.bindTimeupdate()
listenTracker.setMeaningfulPlayHandler((track) => {
  researchTrigger.onMeaningfulPlay(track)
})
function kickDiscovery(track: Track | undefined): void {
  if (!track || track.error) return
  researchTrigger.onTrackUpdated(track)
  audioIntel.onTrackActivity(track)
}

function shouldKickEnriched(track: Track): boolean {
  const current = player.current()
  if (current?.id === track.id) return true
  return !current && library.getAll()[0]?.id === track.id
}

library.onTrackEnriched = (track) => {
  if (!shouldKickEnriched(track)) return
  kickDiscovery(track)
  if (player.current()?.id === track.id) {
    themeController.onDiscoveryUpdate()
  }
}
const trackHandlers = listenTracker.handlers()

const MOOD_LABELS: Record<AudioMood, string> = {
  energetic: 'Energik',
  calm: 'Tenang',
  bright: 'Cerah',
  warm: 'Hangat',
  balanced: 'Seimbang',
}

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="shell">
    <header class="hero">
      <p class="eyebrow">Pemutar lokal privat</p>
      <h1 class="brand">LocalTune</h1>
      <p class="tagline">Putar file musik dari perangkat Anda — tanpa unggah ke server.</p>
      <div class="hero-actions">
        <button type="button" class="btn primary" id="btn-pick">Pilih musik</button>
        <button type="button" class="btn ghost" id="btn-clear" hidden>Kosongkan daftar</button>
      </div>
      <div class="appearance">
        <span class="appearance-label">Tampilan</span>
        <div class="mode-toggle" role="radiogroup" aria-label="Mode tampilan">
          <label class="mode-option">
            <input type="radio" name="ui-mode" value="default" checked />
            Default
          </label>
          <label class="mode-option">
            <input type="radio" name="ui-mode" value="adaptive" />
            Adaptif
          </label>
        </div>
        <p class="appearance-hint" id="appearance-hint">Adaptif mengikuti genre dari tag lokal & metadata research (bukan AI). Hemat data; reset ke Default saat tab ditutup.</p>
        <p class="theme-active" id="theme-active" hidden></p>
      </div>
    </header>

    <section class="empty" id="empty">
      <p>Pilih file musik dari perangkat Anda untuk mulai.</p>
    </section>

    <section class="stage" id="stage" hidden>
      <div class="now">
        <p class="now-label">Sedang diputar</p>
        <h2 class="now-title" id="now-title">—</h2>
        <p class="now-artist" id="now-artist">—</p>
        <p class="now-time"><span id="pos">0:00</span> / <span id="dur">0:00</span></p>
        <input type="range" id="seek" min="0" max="0" value="0" step="0.1" aria-label="Seek" />
        <div class="controls">
          <button type="button" class="btn icon" id="btn-prev" aria-label="Previous">⏮</button>
          <button type="button" class="btn primary icon play" id="btn-play" aria-label="Play">▶</button>
          <button type="button" class="btn icon" id="btn-next" aria-label="Next">⏭</button>
          <label class="vol">
            <span>Volume</span>
            <input type="range" id="volume" min="0" max="1" step="0.01" value="1" />
          </label>
        </div>
      </div>

      <aside class="taste" id="taste" hidden>
        <h3>Profil selera (sesi ini)</h3>
        <p class="taste-note">Data tersimpan di tab ini dan hilang saat tab/browser ditutup.</p>
        <p class="taste-stat"><strong id="taste-plays">0</strong> putar bermakna</p>
        <div class="taste-top" id="taste-top" hidden>
          <p class="taste-label">Artis teratas</p>
          <ul class="taste-list" id="taste-artists"></ul>
        </div>
        <div class="taste-top" id="taste-genres-wrap" hidden>
          <p class="taste-label">Genre teratas</p>
          <ul class="taste-list" id="taste-genres"></ul>
        </div>
      </aside>

      <aside class="up-next" id="up-next" hidden>
        <h3>Up Next</h3>
        <p class="up-next-note" id="up-next-note"></p>
        <ul class="up-next-list" id="up-next-list"></ul>
      </aside>

      <aside class="discovery" id="discovery" hidden>
        <div class="discovery-head">
          <h3>Discovery</h3>
          <span class="discovery-status" id="discovery-status" aria-live="polite"></span>
        </div>
        <p class="discovery-note">Saran dari internet — tidak bisa diputar kecuali ada di library Anda. Hilang saat tab ditutup.</p>
        <label class="settings-toggle">
          <input type="checkbox" id="research-enabled" checked />
          Perbarui saran dari internet saat memutar
        </label>
        <button type="button" class="btn ghost small" id="btn-refresh-discovery">Perbarui sekarang</button>
        <ul class="discovery-list" id="discovery-list"></ul>
        <p class="discovery-empty" id="discovery-empty" hidden>Belum ada saran. Putar musik untuk memulai riset metadata.</p>
      </aside>

      <div class="playlist-wrap">
        <h3>Playlist</h3>
        <ul class="playlist" id="playlist"></ul>
      </div>
    </section>

    <footer class="foot">
      <p>File musik tetap di perangkat Anda. Hosting hanya menampilkan aplikasi.</p>
    </footer>
  </div>
`

const emptyEl = $('#empty')
const stageEl = $('#stage')
const playlistEl = $('#playlist')
const nowTitle = $('#now-title')
const nowArtist = $('#now-artist')
const posEl = $('#pos')
const durEl = $('#dur')
const seekEl = $('#seek') as HTMLInputElement
const volumeEl = $('#volume') as HTMLInputElement
const btnPlay = $('#btn-play')
const btnClear = $('#btn-clear')
const tasteEl = $('#taste')
const tastePlaysEl = $('#taste-plays')
const tasteTopEl = $('#taste-top')
const tasteArtistsEl = $('#taste-artists')
const tasteGenresWrapEl = $('#taste-genres-wrap')
const tasteGenresEl = $('#taste-genres')
const upNextEl = $('#up-next')
const upNextNoteEl = $('#up-next-note')
const upNextListEl = $('#up-next-list')
const discoveryEl = $('#discovery')
const discoveryStatusEl = $('#discovery-status')
const discoveryListEl = $('#discovery-list')
const discoveryEmptyEl = $('#discovery-empty')
const researchEnabledEl = $('#research-enabled') as HTMLInputElement
const btnRefreshDiscovery = $('#btn-refresh-discovery')
const uiModeInputs = app.querySelectorAll<HTMLInputElement>('input[name="ui-mode"]')
const appearanceHintEl = $('#appearance-hint')
const themeActiveEl = $('#theme-active')

function $(sel: string): HTMLElement {
  return app.querySelector(sel) as HTMLElement
}

function formatTime(sec?: number): string {
  if (sec == null || !Number.isFinite(sec)) return '0:00'
  const s = Math.floor(sec)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function renderPlaylist(): void {
  const tracks = library.getAll()
  const current = player.current()
  playlistEl.innerHTML = tracks
    .map(
      (t, i) => `
    <li class="track ${current?.id === t.id ? 'active' : ''} ${t.error ? 'err' : ''}" data-index="${i}">
      <button type="button" class="track-btn">
        <span class="t-title">${escapeHtml(t.title)}</span>
        <span class="t-artist">${escapeHtml(t.artist)}</span>
        ${t.error ? `<span class="t-err">${escapeHtml(t.error)}</span>` : ''}
      </button>
    </li>`,
    )
    .join('')

  playlistEl.querySelectorAll<HTMLElement>('.track').forEach((li) => {
    li.addEventListener('click', () => {
      const i = Number(li.dataset.index)
      void player.playIndex(i, true)
    })
  })
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function findLibraryIndex(artist: string, title?: string): number | undefined {
  const na = artist.trim().toLowerCase()
  const nt = title?.trim().toLowerCase()
  const tracks = library.getAll()
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]!
    if (t.error) continue
    if (t.artist.trim().toLowerCase() !== na) continue
    if (!nt || t.title.trim().toLowerCase() === nt) return i
  }
  return undefined
}

function statusLabel(status: ResearchStatus): string {
  if (status === 'updating') return 'Memperbarui…'
  if (status === 'error') return 'Gagal memperbarui'
  return ''
}

function discoveryEmptyMessage(): string {
  if (!isResearchEnabled()) {
    return 'Research dimatikan. Aktifkan toggle di atas untuk saran dari internet.'
  }
  const status = researchTrigger.getStatus()
  if (status === 'updating') return 'Memperbarui saran dari internet…'
  if (status === 'error') return 'Gagal memperbarui. Coba klik Perbarui sekarang.'
  const current = player.current()
  if (!current) {
    return 'Pilih musik lalu putar lagu untuk memulai riset metadata.'
  }
  const seed = buildSeed(current, upNextEngine.getProfile())
  if (!isSeedUsable(seed)) {
    return 'Tag artis/judul belum cukup. Tunggu metadata ID3 dimuat atau gunakan file dengan nama yang jelas.'
  }
  return 'Belum ada hasil untuk lagu ini. Coba putar lagu lain atau klik Perbarui sekarang.'
}

function renderDiscovery(): void {
  const hasLibrary = library.getAll().length > 0
  discoveryEl.hidden = !hasLibrary
  btnRefreshDiscovery.hidden = !hasLibrary || !isResearchEnabled()

  const items = discoveryStore.getItems()
  discoveryEmptyEl.hidden = items.length > 0
  discoveryListEl.hidden = items.length === 0

  if (items.length === 0) {
    discoveryListEl.innerHTML = ''
    discoveryEmptyEl.textContent = discoveryEmptyMessage()
    return
  }

  discoveryListEl.innerHTML = items
    .slice(0, 20)
    .map((item) => {
      const inLib = matchesLocalLibrary(library, item.artist, item.title)
      const libIdx = inLib ? findLibraryIndex(item.artist, item.title) : undefined
      const badge = inLib
        ? '<span class="discovery-badge">Ada di library</span>'
        : '<span class="discovery-badge muted">Tidak diputar</span>'
      const title = item.title ? escapeHtml(item.title) : '—'
      const meta = item.reason ? `<span class="discovery-reason">${escapeHtml(item.reason)}</span>` : ''
      const playBtn =
        libIdx != null
          ? `<button type="button" class="btn ghost small discovery-play" data-index="${libIdx}">Putar</button>`
          : ''
      return `
    <li class="discovery-item">
      <div class="discovery-main">
        <span class="t-title">${title}</span>
        <span class="t-artist">${escapeHtml(item.artist)}</span>
        ${meta}
        ${badge}
      </div>
      ${playBtn}
    </li>`
    })
    .join('')

  discoveryListEl.querySelectorAll<HTMLButtonElement>('.discovery-play').forEach((btn) => {
    btn.addEventListener('click', () => {
      void player.playIndex(Number(btn.dataset.index), true)
    })
  })
}

function refreshUpNext(): void {
  const currentId = player.current()?.id ?? null
  upNextEngine.refresh(library, currentId, tasteApi, audioIntel.getFeaturesStore())
  player.setNextResolver(() => upNextEngine.getNextIndex())
  renderTaste()
  renderUpNext()
  renderDiscovery()
}

function renderUpNext(): void {
  const profile = upNextEngine.getProfile()
  const items = upNextEngine.getItems()
  const hasLibrary = library.getAll().length > 0
  upNextEl.hidden = !hasLibrary

  if (profile.coldStart) {
    const remaining = COLD_START_N - profile.meaningfulPlayCount
    upNextNoteEl.textContent =
      remaining > 0
        ? `Masih belajar selera Anda… (${remaining} putar lagi untuk rekomendasi personal)`
        : 'Masih belajar selera Anda…'
  } else if (profile.reason) {
    upNextNoteEl.textContent = profile.reason
  } else {
    upNextNoteEl.textContent = 'Rekomendasi dari library lokal Anda'
  }

  if (items.length === 0) {
    upNextListEl.innerHTML = '<li class="up-next-empty">Tidak ada trek berikutnya</li>'
    return
  }

  upNextListEl.innerHTML = items
    .slice(0, 8)
    .map(
      (item, i) => `
    <li>
      <button type="button" class="up-next-btn" data-index="${item.index}">
        <span class="up-next-rank">${i + 1}</span>
        <span class="up-next-meta">
          <span class="t-title">${escapeHtml(item.title)}</span>
          <span class="t-artist">${escapeHtml(item.artist)}</span>
        </span>
      </button>
    </li>`,
    )
    .join('')

  upNextListEl.querySelectorAll<HTMLButtonElement>('.up-next-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      void player.playIndex(Number(btn.dataset.index), true)
    })
  })
}

function renderTaste(): void {
  const profile = upNextEngine.getProfile()
  const plays = profile.meaningfulPlayCount
  tastePlaysEl.textContent = String(plays)
  const hasLibrary = library.getAll().length > 0
  tasteEl.hidden = !hasLibrary

  if (profile.topArtists.length === 0) {
    tasteTopEl.hidden = true
    tasteArtistsEl.innerHTML = ''
  } else {
    tasteTopEl.hidden = false
    tasteArtistsEl.innerHTML = profile.topArtists
      .map(
        (a) =>
          `<li><span>${escapeHtml(a.name)}</span><span class="taste-count">${a.score.toFixed(1)}</span></li>`,
      )
      .join('')
  }

  if (profile.topGenres.length === 0) {
    tasteGenresWrapEl.hidden = true
    tasteGenresEl.innerHTML = ''
  } else {
    tasteGenresWrapEl.hidden = false
    tasteGenresEl.innerHTML = profile.topGenres
      .map(
        (g) =>
          `<li><span>${escapeHtml(g.name)}</span><span class="taste-count">${g.score.toFixed(1)}</span></li>`,
      )
      .join('')
  }
}

function renderAppearance(): void {
  const mode = themeController.getMode()
  const themeId = themeController.getActiveThemeId()
  const adaptive = mode === 'adaptive'
  const current = player.current()
  const features = current ? audioIntel.getFeaturesStore().get(trackKeyFor(current)) : null

  themeActiveEl.hidden = !adaptive
  if (adaptive) {
    const moodPart = features ? ` · suasana ${MOOD_LABELS[features.mood]}` : ''
    themeActiveEl.textContent = `Tema aktif: ${THEME_LABELS[themeId]}${moodPart}`
  }

  appearanceHintEl.textContent = adaptive
    ? 'Warna UI dari tag, metadata research, atau analisis nada lokal (tanpa unggah audio).'
    : 'Adaptif: tag lokal, research internet, dan analisis nada. Reset ke Default saat tab ditutup.'
}

function applyThemeForCurrentTrack(): void {
  themeController.onTrackChange(player.current())
}

function renderNow(): void {
  const tracks = library.getAll()
  const has = tracks.length > 0
  emptyEl.hidden = has
  stageEl.hidden = !has
  btnClear.hidden = !has
  refreshUpNext()

  const t = player.current()
  nowTitle.textContent = t?.title ?? '—'
  nowArtist.textContent = t?.artist ?? '—'
  btnPlay.textContent = player.isPlaying() ? '⏸' : '▶'
  btnPlay.setAttribute('aria-label', player.isPlaying() ? 'Pause' : 'Play')

  const audio = player.getAudio()
  const dur = t?.durationSec ?? (Number.isFinite(audio.duration) ? audio.duration : 0)
  durEl.textContent = formatTime(dur)
  seekEl.max = String(dur || 0)
  renderPlaylist()
  applyThemeForCurrentTrack()
  renderAppearance()
}

function tick(): void {
  const audio = player.getAudio()
  if (!seekEl.matches(':active')) {
    seekEl.value = String(audio.currentTime || 0)
  }
  posEl.textContent = formatTime(audio.currentTime)
  requestAnimationFrame(tick)
}

player.onChange = () => renderNow()
player.onTrackMeta = (_t: Track) => {
  renderNow()
  applyThemeForCurrentTrack()
}
player.setListeners({
  onTrackSelected: (id) => {
    kickDiscovery(library.getById(id))
  },
  onPlayStart: (id) => {
    trackHandlers.onPlayStart(id)
    themeController.onPlayStart()
    applyThemeForCurrentTrack()
    renderNow()
  },
  onPause: (id, pos) => {
    trackHandlers.onPause(id, pos)
    renderNow()
  },
  onEnded: (id) => {
    trackHandlers.onEnded(id)
    renderNow()
  },
  onSkipToOther: (id, pos, nextId) => {
    trackHandlers.onSkipToOther(id, pos, nextId)
    renderNow()
  },
})

tasteApi.subscribe(() => refreshUpNext())

discoveryStore.subscribe(() => {
  renderDiscovery()
  themeController.onDiscoveryUpdate()
})

researchTrigger.onStatusChange((status) => {
  discoveryStatusEl.textContent = statusLabel(status)
  discoveryStatusEl.dataset.state = status
  renderDiscovery()
})

researchEnabledEl.checked = isResearchEnabled()
researchEnabledEl.addEventListener('change', () => {
  setResearchOptOut(!researchEnabledEl.checked)
  btnRefreshDiscovery.hidden = !isResearchEnabled()
})

btnRefreshDiscovery.addEventListener('click', () => {
  researchTrigger.forceRefreshCurrent(player.current())
})

renderDiscovery()

const currentMode = themeController.getMode()
uiModeInputs.forEach((input) => {
  input.checked = input.value === currentMode
  input.addEventListener('change', () => {
    if (!input.checked) return
    themeController.setMode(input.value === 'adaptive' ? 'adaptive' : 'default')
    applyThemeForCurrentTrack()
    renderAppearance()
  })
})

audioIntel.subscribe(() => {
  themeController.onTrackChange(player.current())
  refreshUpNext()
  renderAppearance()
})

themeController.subscribe(() => renderAppearance())
renderAppearance()

$('#btn-pick').addEventListener('click', async () => {
  const files = await pickAudioFiles()
  if (files.length === 0) return
  await library.addFiles(files)
  discoveryStore.refreshLocalMatches(library)
  renderNow()
  if (!player.current()) {
    await player.playIndex(0, true)
  } else {
    kickDiscovery(player.current())
  }
  renderNow()
  // re-render when tags arrive
  setTimeout(() => renderNow(), 400)
  setTimeout(() => renderNow(), 1200)
})

btnClear.addEventListener('click', () => {
  library.clear()
  discoveryStore.refreshLocalMatches(library)
  player.getAudio().removeAttribute('src')
  renderNow()
})

$('#btn-play').addEventListener('click', () => void player.togglePlay())
$('#btn-next').addEventListener('click', () => void player.next())
$('#btn-prev').addEventListener('click', () => void player.prev())

seekEl.addEventListener('input', () => {
  player.seek(Number(seekEl.value))
})

volumeEl.addEventListener('input', () => {
  player.setVolume(Number(volumeEl.value))
})

player.getAudio().addEventListener('timeupdate', () => {
  posEl.textContent = formatTime(player.getAudio().currentTime)
  if (!seekEl.matches(':active')) {
    seekEl.value = String(player.getAudio().currentTime || 0)
  }
})

renderNow()
requestAnimationFrame(tick)
