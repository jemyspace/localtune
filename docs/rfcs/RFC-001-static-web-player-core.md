# RFC-001: Inti Pemutar Web Statis (File Lokal)

| Field | Value |
| --- | --- |
| Status | Accepted |
| Tanggal | 2026-08-01 |
| Penulis | Agent |
| PRD terkait | [docs/PRD-music-player.md](../PRD-music-player.md) (§6.1 F-01–F-07, UC-01–UC-03, §5, §8) |
| Dependensi RFC | none |

## 1. Ringkasan

MVP LocalTune membutuhkan fondasi pemutar yang berjalan sebagai **web app statis**: pengguna memilih file audio dari perangkat, melihat playlist, lalu memutar dengan kontrol minimal (play/pause, seek, volume, next/previous) plus tampilan metadata dasar.

RFC ini menetapkan arsitektur client-side untuk pemilihan file, model playlist, playback HTML5 Audio, dan batasan UI inti. Tracking selera dan rekomendasi **bukan** bagian RFC ini (lihat RFC-002 / RFC-003).

## 2. Motivasi

Tanpa inti pemutar yang stabil dan privat (tanpa upload), fitur profil/rekomendasi tidak punya permukaan produk. PRD mensyaratkan:

- **F-01** Pilih file/folder lokal  
- **F-02** Playlist dari pilihan  
- **F-03** Play / Pause  
- **F-04** Seek  
- **F-05** Volume  
- **F-06** Next / Previous  
- **F-07** Metadata dasar  

Serta non-fungsional: client-side only, static hosting, fallback browser untuk folder picker.

## 3. Usulan

### 3.1 Bentuk aplikasi

- Single-page static frontend (HTML/CSS/JS atau Vite + vanilla/React ringan—pilihan stack tidak mengikat selama output **static**).
- Tidak ada backend, auth, atau upload endpoint.
- Deploy target: GitHub Pages / Netlify / Vercel (static) — **hanya app shell**; file musik user tidak ikut di-host.

### 3.2 Modul permukaan (logical)

| Modul | Tanggung jawab |
| --- | --- |
| `filePicker` | Buka dialog file/folder; normalisasi hasil jadi daftar `File` |
| `metadata` | Baca tag bila memungkinkan; fallback nama file |
| `library` | Simpan daftar trek sesi (id, name, objectURL, metadata, duration bila diketahui) |
| `player` | Wrapper HTML5 Audio: play/pause, seek, volume, ended → next |
| `ui` | Playlist, now playing, kontrol, empty state |

### 3.3 Model trek (sesi)

```text
Track {
  id: string          // stabil dalam sesi (uuid atau hash name+size+lastModified)
  fileName: string
  objectUrl: string
  title: string
  artist: string      // "Unknown" jika kosong
  album?: string
  genre?: string      // "Unknown" jika kosong
  durationSec?: number
  error?: string      // format tidak didukung / gagal load
}
```

Persistensi library antar-refresh **tidak wajib** di RFC-001 (handle folder persist = later). Object URL dibuat saat file dipilih.

## 4. Detail desain

### 4.1 Pemilihan file

1. **Primary (jika tersedia):** File System Access API (`showDirectoryPicker` / file picker) untuk pengalaman folder.
2. **Fallback wajib:** `<input type="file" multiple accept="audio/*">`. Directory attribute boleh ditambahkan jika didukung, tanpa menggantikan fallback multi-file.
3. Filter klien: pertahankan file dengan `type` audio atau ekstensi umum (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.flac`—flac hanya jika browser decode).
4. Empty state copy: “Pilih file musik dari perangkat Anda untuk mulai.”

### 4.2 Metadata

- Coba parse tag (ID3/dll.) secara async setelah import; UI boleh tampilkan filename dulu lalu update title/artist.
- Gagal parse ≠ gagal putar.
- Duration: dari `audio` `loadedmetadata` saat trek pertama kali diload atau di-preload ringan (jangan wajib decode semua file sekaligus pada library besar—lazy per trek yang ditampilkan/dipilih).

### 4.3 Playback & kontrol

- Satu instance `HTMLAudioElement` (atau `<audio>` tersembunyi) untuk trek aktif.
- **Play/Pause:** toggle `audio.play()` / `audio.pause()`.
- **Seek:** `audio.currentTime` diikat ke progress control; update UI via `timeupdate`.
- **Volume:** `audio.volume` 0–1; sediakan mute.
- **Next/Prev:** index playlist; wrap behavior = stop di ujung **atau** wrap (default usulan: **wrap** ke awal/akhir agar loop playlist sederhana tanpa mode repeat terpisah).
- **ended:** otomatis next (mengikuti wrap di atas).
- Ganti trek: `audio.src = track.objectUrl`, lalu play jika sebelumnya playing.

### 4.4 Error per item

- Jika `error` event pada audio (format tidak didukung): set `track.error`, tampilkan status di baris playlist, lanjut ke next kandidat yang valid.

### 4.5 UI (minimal)

Satu komposisi layar:

- Nama produk (brand) jelas di viewport awal  
- Tombol/area pilih file  
- Daftar playlist  
- Now playing (title, artist, duration/position)  
- Kontrol: prev, play/pause, next, seek, volume  

Area Up Next / insight profil **placeholder opsional kosong** atau disembunyikan sampai RFC-003—jangan fake data.

### 4.6 Hook untuk RFC berikutnya (tanpa implementasi penuh)

Player harus dapat memanggil callback/event bus tipis, misalnya:

- `onPlayStart(trackId)`
- `onPause(trackId, positionSec)`
- `onSeek(trackId, fromSec, toSec)`
- `onEnded(trackId)`
- `onSkipToOther(trackId, positionSec, nextTrackId)`  

Implementasi penyimpanan event = RFC-002.

## 5. Alternatif yang dipertimbangkan

| Alternatif | Alasan ditolak / ditunda |
| --- | --- |
| Upload file ke server lalu stream URL | Melanggar privasi & static-only; out of scope PRD |
| Web Audio API graph sebagai default playback | Lebih kompleks; HTML5 Audio cukup untuk MVP kontrol |
| Wajib File System Access API saja | Tidak universal; butuh fallback input |
| PWA offline + persist folder handle di v1 | PRD “later”; jangan blokir inti pemutar |
| Library musik cloud / streaming SDK | Non-tujuan PRD |

## 6. Dampak

| Area | Dampak |
| --- | --- |
| Privasi | File tetap di perangkat; object URL lokal |
| Performa | Lazy metadata/duration; library besar tidak di-decode massal di main thread tanpa perlu |
| Browser | Modern browsers; degradasi via multi-file input |
| Hosting | Pure static assets |
| Data lokal | Belum ada profil persist di RFC ini |

## 7. Rencana implementasi (tinggi)

1. Scaffold static app + layout empty state + brand  
2. Implement `filePicker` + fallback input  
3. Bangun `library` + render playlist  
4. Wire `player` HTML5 Audio + kontrol UI  
5. Metadata async + update baris  
6. Error handling per trek + auto-skip  
7. Expose player events (no-op listeners OK) untuk RFC-002  
8. Deploy smoke test ke static host gratis  

## 8. Risiko & mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Folder picker tidak ada | Fallback multi-file wajib |
| Metadata lambat/kosong | Tampilkan filename dulu; fallback Unknown |
| Memory object URL | Revoke URL saat trek dihapus / library diganti |
| Autoplay policy browser | Play hanya setelah gesture user (klik Play / pilih+play) |
| Format tidak didukung | Flag error + skip |

## 9. Open questions

Tidak ada yang memblokir. Stack UI exact (vanilla vs Vite+React) boleh dipilih saat implementasi selama output static.

## 10. Acceptance criteria

- [ ] User dapat memilih banyak file audio lokal tanpa akun  
- [ ] Jika folder picker tidak tersedia, multi-file input tetap berfungsi  
- [ ] Playlist menampilkan trek dengan title/artist (fallback filename / Unknown)  
- [ ] Play, pause, seek, volume, next, previous berfungsi pada trek valid  
- [ ] Trek tidak didukung menampilkan error dan tidak menghentikan app  
- [ ] Tidak ada request jaringan yang mengunggah file audio untuk fitur inti  
- [ ] Paket deploy / artefak hosting **tidak** mengandung file musik pengguna; tidak ada API upload audio  
- [ ] Build dapat di-deploy sebagai static site  
- [ ] Ada titik ekstensi event player siap dipakai RFC-002  

## Lampiran: RFC lanjutan (tidak dicakup di sini)

| RFC | Fokus |
| --- | --- |
| RFC-002 | Listen events + penyimpanan statistik/profil di browser |
| RFC-003 | Taste profile scoring + Up Next lokal / cold start |
| RFC-004 | Research rekomendasi otomatis tiap play → merge discovery list di profil (PRD F-13–F-20) |
| RFC-005 | UI Default vs Adaptif (CSS simple dari genre lokal + metadata research; no LLM; session reset) |
