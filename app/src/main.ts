import { AudioIntelTrigger } from './audio/audioIntelTrigger'
import { MOOD_LABELS } from './audio/types'
import { DiscoveryStore } from './discovery/discoveryStore'
import { ResearchClient } from './discovery/researchClient'
import { ResearchTrigger } from './discovery/researchTrigger'
import type { ResearchStatus } from './discovery/types'
import { matchesLocalLibrary } from './discovery/localMatch'
import { buildSeed, isSeedUsable } from './discovery/seed'
import { isAudioFile, pickAudioFiles } from './filePicker'
import { Library } from './library'
import { Player } from './player'
import { COLD_START_N } from './profile/types'
import { UpNextEngine } from './profile/upNextEngine'
import { isResearchEnabled, setResearchOptOut } from './settings'
import { ListenTracker } from './taste/listenTracker'
import { TasteApi } from './taste/tasteApi'
import { prefersReducedMotion } from './theme/ambience'
import { SCENE_LABELS } from './theme/rhythmScene'
import { ThemeController } from './theme/themeController'
import { THEME_LABELS } from './theme/types'
import { trackKeyFor } from './trackKey'
import type { Track } from './types'
import { coverArtHtml } from './ui/coverArt'
import { ICONS } from './ui/icons'
import './style.css'

const sceneCanvas = document.createElement('canvas')
sceneCanvas.className = 'rhythm-scene'
sceneCanvas.setAttribute('aria-hidden', 'true')
document.body.prepend(sceneCanvas)

const library = new Library()
const player = new Player(library)
const tasteApi = new TasteApi()
const upNextEngine = new UpNextEngine()
const discoveryStore = new DiscoveryStore()
const researchClient = new ResearchClient()
const researchTrigger = new ResearchTrigger(researchClient, discoveryStore, tasteApi, library)
const audioIntel = new AudioIntelTrigger(discoveryStore, tasteApi, library)
const themeController = new ThemeController(
  player,
  discoveryStore,
  audioIntel.getFeaturesStore(),
  sceneCanvas,
)
const listenTracker = new ListenTracker(player, library, tasteApi)
listenTracker.bindTimeupdate()
listenTracker.setMeaningfulPlayHandler((track) => {
  researchTrigger.onMeaningfulPlay(track)
  audioIntel.onTrackActivity(track)
})
function kickDiscovery(track: Track | undefined): void {
  if (!track || track.error) return
  researchTrigger.onTrackUpdated(track)
  audioIntel.onTrackActivity(track)
}

let renderQueued = false
function scheduleRender(): void {
  if (renderQueued) return
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    renderNow()
  })
}

library.onTrackEnriched = (track) => {
  // Tag/sampul baru → perbarui kartu (debounce agar impor banyak file tetap ringan).
  scheduleRender()
  const current = player.current()
  const isCurrent = current?.id === track.id
  const isFirstPending = !current && library.getAll()[0]?.id === track.id
  if (!isCurrent && !isFirstPending) return
  // Prefer enriched tags for research; force refresh when artist becomes known.
  researchTrigger.onTrackUpdated(track)
  audioIntel.onTrackActivity(track)
  if (isCurrent) {
    themeController.onDiscoveryUpdate()
    renderDiscovery()
  }
}
const trackHandlers = listenTracker.handlers()

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="logo" href="#" aria-label="LocalTune">
        <span class="logo-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span class="logo-word">Local<em>Tune</em></span>
      </a>
      <div class="topbar-actions">
        <div class="segmented" role="radiogroup" aria-label="Mode tampilan">
          <label><input type="radio" name="ui-mode" value="default" checked /><span>Klasik</span></label>
          <label><input type="radio" name="ui-mode" value="adaptive" /><span>Adaptif</span></label>
        </div>
        <button type="button" class="btn primary js-pick" id="btn-pick">＋ Tambah musik</button>
      </div>
    </header>

    <section class="landing" id="empty">
      <div class="landing-copy">
      <p class="kicker reveal">Pemutar lokal · privat · tanpa akun</p>
      <h1 class="landing-title reveal">
        Koleksimu,<br />
        <em>diputar dengan rasa.</em>
      </h1>
      <p class="landing-sub reveal">
        Pilih folder musik dari perangkatmu. LocalTune membaca iramanya, belajar seleramu,
        dan mengubah suasana layar mengikuti setiap lagu — tanpa satu file pun meninggalkan perangkatmu.
      </p>
      <div class="landing-cta reveal">
        <button type="button" class="btn primary big js-pick">Pilih folder musik</button>
        <span class="drop-hint">atau seret file audio ke halaman ini</span>
      </div>
      </div>
      <div class="landing-art" aria-hidden="true">
        <div class="record"><span class="record-label"></span></div>
        <div class="sleeve">
          <span class="sleeve-side">Sisi A</span>
          <span class="sleeve-title">Lagu-lagu<br />favoritmu</span>
          <span class="sleeve-lines"><i></i><i></i><i></i><i></i></span>
        </div>
      </div>
      <ul class="features reveal">
        <li><b>1</b><strong>100% di perangkatmu</strong><span>File tidak pernah diunggah. Hosting hanya menyajikan aplikasinya.</span></li>
        <li><b>2</b><strong>Bergerak ikut irama</strong><span>Latar, piringan, dan cahaya berdenyut mengikuti ketukan lagu.</span></li>
        <li><b>3</b><strong>Belajar seleramu</strong><span>Antrean berikutnya disusun dari lagu yang benar-benar kamu dengar.</span></li>
      </ul>
    </section>

    <main class="stage" id="stage" hidden>
      <section class="now">
        <div class="disc-wrap">
          <div class="disc" id="now-disc"></div>
          <span class="tonearm" aria-hidden="true"></span>
        </div>
        <div class="now-info">
          <p class="now-label"><span class="live-dot" aria-hidden="true"></span>Sedang diputar</p>
          <h2 class="now-title" id="now-title">—</h2>
          <p class="now-artist" id="now-artist">—</p>
          <div class="vibe-chips" id="now-vibe"></div>
          <p class="theme-active" id="theme-active" hidden></p>
        </div>
      </section>

      <div class="columns">
        <div class="col">
          <section class="panel up-next" id="up-next" hidden>
            <header class="panel-head">
              <h3>Berikutnya</h3>
              <p class="panel-sub" id="up-next-note"></p>
            </header>
            <ul class="up-next-list" id="up-next-list"></ul>
          </section>

          <section class="panel playlist-wrap">
            <header class="panel-head">
              <h3>Koleksi</h3>
              <p class="panel-sub" id="playlist-count"></p>
              <button type="button" class="btn ghost small" id="btn-clear" hidden>Kosongkan</button>
            </header>
            <ul class="playlist" id="playlist"></ul>
          </section>
        </div>

        <div class="col">
          <section class="panel taste" id="taste" hidden>
            <header class="panel-head">
              <h3>Seleramu</h3>
              <p class="panel-sub">Hanya untuk sesi ini — hilang saat tab ditutup.</p>
            </header>
            <p class="taste-stat"><strong id="taste-plays">0</strong><span>putaran tercatat</span></p>
            <div class="taste-top" id="taste-top" hidden>
              <p class="taste-label">Artis teratas</p>
              <ul class="taste-list" id="taste-artists"></ul>
            </div>
            <div class="taste-top" id="taste-genres-wrap" hidden>
              <p class="taste-label">Genre teratas</p>
              <ul class="taste-list" id="taste-genres"></ul>
            </div>
          </section>

          <section class="panel discovery" id="discovery" hidden>
            <header class="panel-head">
              <h3>Jelajahi</h3>
              <span class="discovery-status" id="discovery-status" aria-live="polite"></span>
            </header>
            <p class="panel-sub">Musik serupa dari internet. Dengarkan di platform resminya, atau putar kalau sudah ada di koleksimu.</p>
            <div class="discovery-tools">
              <label class="switch">
                <input type="checkbox" id="research-enabled" checked />
                <span class="switch-ui" aria-hidden="true"></span>
                Cari saran otomatis
              </label>
              <button type="button" class="btn ghost small" id="btn-refresh-discovery">↻ Perbarui</button>
            </div>
            <ul class="discovery-list" id="discovery-list"></ul>
            <p class="discovery-empty" id="discovery-empty" hidden>Belum ada saran. Putar lagu untuk mulai menjelajah.</p>
          </section>

          <section class="panel appearance">
            <header class="panel-head">
              <h3>Suasana</h3>
            </header>
            <label class="switch" id="scene-toggle-wrap" hidden>
              <input type="checkbox" id="scene-enabled" checked />
              <span class="switch-ui" aria-hidden="true"></span>
              Latar bergerak mengikuti irama
            </label>
            <p class="panel-sub" id="appearance-hint"></p>
          </section>
        </div>
      </div>

      <div class="dock" role="region" aria-label="Kontrol pemutar">
        <div class="dock-track">
          <span class="dock-cover" id="dock-cover"></span>
          <span class="dock-meta">
            <span class="dock-title" id="dock-title">—</span>
            <span class="dock-artist" id="dock-artist">—</span>
          </span>
        </div>
        <div class="dock-center">
          <div class="controls">
            <button type="button" class="ctrl" id="btn-prev" aria-label="Sebelumnya">${ICONS.prev}</button>
            <button type="button" class="ctrl play" id="btn-play" aria-label="Putar">${ICONS.play}</button>
            <button type="button" class="ctrl" id="btn-next" aria-label="Berikutnya">${ICONS.next}</button>
          </div>
          <div class="progress">
            <span class="time" id="pos">0:00</span>
            <input type="range" id="seek" min="0" max="0" value="0" step="0.1" aria-label="Posisi lagu" />
            <span class="time" id="dur">0:00</span>
          </div>
        </div>
        <label class="vol">
          <span class="vol-icon" aria-hidden="true">${ICONS.volume}</span>
          <input type="range" id="volume" min="0" max="1" step="0.01" value="1" aria-label="Volume" />
        </label>
      </div>
    </main>

    <footer class="foot">
      <p>Musik tetap di perangkatmu. Hosting hanya menyajikan aplikasinya. <span class="kbd">Spasi</span> putar/jeda · <span class="kbd">← →</span> geser 5 detik</p>
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
const sceneToggleWrapEl = $('#scene-toggle-wrap')
const sceneEnabledEl = $('#scene-enabled') as HTMLInputElement
const nowDiscEl = $('#now-disc')
const nowVibeEl = $('#now-vibe')
const nowEl = app.querySelector('.now') as HTMLElement
const dockCoverEl = $('#dock-cover')
const dockTitleEl = $('#dock-title')
const dockArtistEl = $('#dock-artist')
const playlistCountEl = $('#playlist-count')

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
  playlistCountEl.textContent = `${tracks.length} lagu`
  playlistEl.innerHTML = tracks
    .map(
      (t, i) => `
    <li class="track ${current?.id === t.id ? 'active' : ''} ${t.error ? 'err' : ''}" data-index="${i}">
      <button type="button" class="track-btn">
        <span class="track-no" aria-hidden="true">
          <span class="num">${String(i + 1).padStart(2, '0')}</span>
          <span class="eq"><i></i><i></i><i></i></span>
        </span>
        ${coverArtHtml(t.artist, t.title, t.coverUrl, 'cover xs')}
        <span class="track-meta">
          <span class="t-title">${escapeHtml(t.title)}</span>
          <span class="t-artist">${escapeHtml(t.artist)}</span>
          ${t.error ? `<span class="t-err">${escapeHtml(t.error)}</span>` : ''}
        </span>
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
      const libTrack = libIdx != null ? library.getAll()[libIdx] : undefined
      const title = item.title ? escapeHtml(item.title) : 'Jelajahi artis ini'
      const meta = item.reason ? `<span class="discovery-reason">${escapeHtml(item.reason)}</span>` : ''
      const genre = item.genre ? `<span class="chip">${escapeHtml(item.genre)}</span>` : ''
      const inLibChip = inLib ? '<span class="chip accent">Ada di library</span>' : ''
      // Tautan ke platform resmi: pengguna mendengarkan di layanan berlisensi,
      // LocalTune tidak memutar/menyimpan audio pihak ketiga.
      const query = encodeURIComponent(`${item.artist} ${item.title ?? ''}`.trim())
      const actions =
        libIdx != null
          ? `<button type="button" class="btn primary small discovery-play" data-index="${libIdx}">Putar di sini</button>`
          : `<a class="btn ghost small" href="https://www.youtube.com/results?search_query=${query}" target="_blank" rel="noopener noreferrer">YouTube ↗</a>
             <a class="btn ghost small" href="https://open.spotify.com/search/${query}" target="_blank" rel="noopener noreferrer">Spotify ↗</a>`
      return `
    <li class="discovery-card">
      ${coverArtHtml(item.artist, item.title, libTrack?.coverUrl, 'cover sm')}
      <div class="discovery-main">
        <span class="t-title">${title}</span>
        <span class="t-artist">${escapeHtml(item.artist)}</span>
        ${meta}
        <span class="chip-row">${inLibChip}${genre}</span>
        <span class="discovery-actions">${actions}</span>
      </div>
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
        ? `Sedang mengenal seleramu — ${remaining} lagu lagi sampai antrean jadi personal.`
        : 'Sedang mengenal seleramu…'
  } else if (profile.reason) {
    upNextNoteEl.textContent = profile.reason
  } else {
    upNextNoteEl.textContent = 'Disusun dari koleksimu sendiri.'
  }

  if (items.length === 0) {
    upNextListEl.innerHTML = '<li class="up-next-empty">Tidak ada trek berikutnya</li>'
    return
  }

  const tracks = library.getAll()
  const chips = (reasons: string[]): string =>
    reasons.map((r) => `<span class="chip">${escapeHtml(r)}</span>`).join('')
  const matchBadge = (match?: number): string =>
    match != null ? `<span class="match" title="Kecocokan nuansa dengan lagu sekarang">${match}%</span>` : ''

  upNextListEl.innerHTML = items
    .slice(0, 8)
    .map((item, i) => {
      const cover = tracks[item.index]?.coverUrl
      if (i === 0) {
        return `
    <li class="up-next-hero">
      <button type="button" class="up-next-btn hero" data-index="${item.index}">
        ${coverArtHtml(item.artist, item.title, cover, 'cover md')}
        <span class="up-next-meta">
          <span class="up-next-kicker">Diputar selanjutnya ${matchBadge(item.match)}</span>
          <span class="t-title">${escapeHtml(item.title)}</span>
          <span class="t-artist">${escapeHtml(item.artist)}</span>
          <span class="chip-row">${chips(item.reasons)}</span>
        </span>
        <span class="up-next-play" aria-hidden="true">${ICONS.play}</span>
      </button>
    </li>`
      }
      return `
    <li>
      <button type="button" class="up-next-btn" data-index="${item.index}">
        ${coverArtHtml(item.artist, item.title, cover, 'cover xs')}
        <span class="up-next-meta">
          <span class="t-title">${escapeHtml(item.title)}</span>
          <span class="t-artist">${escapeHtml(item.artist)}</span>
          <span class="chip-row">${chips(item.reasons.slice(0, 1))}</span>
        </span>
        ${matchBadge(item.match)}
      </button>
    </li>`
    })
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
  sceneToggleWrapEl.hidden = !adaptive
  sceneEnabledEl.checked = themeController.isSceneEnabled()
  sceneEnabledEl.disabled = prefersReducedMotion()
  if (adaptive) {
    const moodPart = features ? ` · suasana ${MOOD_LABELS[features.mood]}` : ''
    const sceneKind = themeController.getSceneKind()
    const scenePart =
      sceneKind && themeController.isSceneEnabled() ? ` · latar ${SCENE_LABELS[sceneKind]}` : ''
    themeActiveEl.textContent = `Tema aktif: ${THEME_LABELS[themeId]}${moodPart}${scenePart}`
  }

  appearanceHintEl.textContent = adaptive
    ? 'Warna dan latar dipilih dari genre serta analisis irama lagu — semuanya dihitung di perangkatmu.'
    : 'Pilih mode Adaptif di atas agar tampilan ikut berubah mengikuti genre dan irama setiap lagu.'
}

let lastDiscKey = ''

function renderNowVibe(t: Track | undefined): void {
  const discKey = t ? `${t.id}|${t.artist}|${t.title}|${t.coverUrl ?? ''}` : ''
  if (discKey !== lastDiscKey) {
    lastDiscKey = discKey
    nowDiscEl.innerHTML = t ? coverArtHtml(t.artist, t.title, t.coverUrl, 'cover lg') : ''
    dockCoverEl.innerHTML = t ? coverArtHtml(t.artist, t.title, t.coverUrl, 'cover xs') : ''
    // Mainkan ulang animasi masuk judul saat lagu berganti.
    nowEl.classList.remove('swap')
    void nowEl.offsetWidth
    nowEl.classList.add('swap')
  }
  document.body.classList.toggle('is-playing', player.isPlaying())
  nowEl.classList.toggle('is-playing', player.isPlaying())

  const features = t ? audioIntel.getFeaturesStore().get(trackKeyFor(t)) : null
  // Piringan berputar satu kali tiap 8 ketukan → terasa mengikuti tempo.
  const bpm = features?.tempoBpm ?? 100
  nowEl.style.setProperty('--spin-dur', `${((60 / bpm) * 8).toFixed(2)}s`)

  const chips: string[] = []
  if (features) {
    chips.push(`<span class="chip accent">${MOOD_LABELS[features.mood]}</span>`)
    if (features.tempoBpm) chips.push(`<span class="chip">${features.tempoBpm} BPM</span>`)
    chips.push(`<span class="chip">Energi ${Math.round(Math.min(1, features.energy * 5) * 100)}%</span>`)
  } else if (t && !t.error) {
    chips.push('<span class="chip muted">Menganalisis nuansa…</span>')
  }
  if (t?.genre && t.genre !== 'Unknown') chips.push(`<span class="chip">${escapeHtml(t.genre)}</span>`)
  nowVibeEl.innerHTML = chips.join('')
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
  dockTitleEl.textContent = t?.title ?? '—'
  dockArtistEl.textContent = t?.artist ?? '—'
  renderNowVibe(t)
  btnPlay.innerHTML = player.isPlaying() ? ICONS.pause : ICONS.play
  btnPlay.setAttribute('aria-label', player.isPlaying() ? 'Jeda' : 'Putar')

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
  const max = Number(seekEl.max) || 0
  seekEl.style.setProperty('--fill', `${max > 0 ? (Number(seekEl.value) / max) * 100 : 0}%`)
  volumeEl.style.setProperty('--fill', `${Number(volumeEl.value) * 100}%`)
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
  renderNowVibe(player.current())
  renderAppearance()
})

sceneEnabledEl.addEventListener('change', () => {
  themeController.setSceneEnabled(sceneEnabledEl.checked)
})

themeController.subscribe(() => renderAppearance())
renderAppearance()

app.querySelectorAll<HTMLButtonElement>('.js-pick').forEach((btn) => {
  btn.addEventListener('click', async () => addAndPlay(await pickAudioFiles()))
})

// Seret & lepas file audio ke mana saja di halaman.
let dragDepth = 0
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return
  dragDepth++
  document.body.classList.add('dragging')
})
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) document.body.classList.remove('dragging')
})
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => {
  e.preventDefault()
  dragDepth = 0
  document.body.classList.remove('dragging')
  const files = Array.from(e.dataTransfer?.files ?? []).filter(isAudioFile)
  void addAndPlay(files)
})

// Pintasan keyboard: Spasi putar/jeda, ←/→ geser 5 detik.
window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, select, button, [contenteditable]')) return
  if (library.getAll().length === 0) return
  if (e.code === 'Space') {
    e.preventDefault()
    void player.togglePlay()
  } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
    e.preventDefault()
    const delta = e.code === 'ArrowRight' ? 5 : -5
    player.seek(player.getAudio().currentTime + delta)
  }
})

async function addAndPlay(files: File[]): Promise<void> {
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
}

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
