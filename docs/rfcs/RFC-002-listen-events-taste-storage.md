# RFC-002: Listen Events & Penyimpanan Taste Data

| Field | Value |
| --- | --- |
| Status | Accepted |
| Tanggal | 2026-08-01 |
| Penulis | Agent |
| PRD terkait | [docs/PRD-music-player.md](../PRD-music-player.md) (§6.2 Tracking P0, UC-04, §5.5 profil session-scoped, §5.1 Batas hosting) |
| Dependensi RFC | [RFC-001](RFC-001-static-web-player-core.md) (player events hooks) |

## 1. Ringkasan

LocalTune membutuhkan lapisan **pencatatan perilaku mendengar** dan **penyimpanan data selera scoped ke browser session**, sebagai fondasi profil (RFC-003) dan research discovery (RFC-004).

RFC ini menetapkan model event mendengar, aturan “play bermakna”, agregat statistik per trek/artis/genre, serta penyimpanan di **`sessionStorage`**—tanpa mengirim file audio ke hosting dan tanpa akun.

- **Refresh tab** → data tetap.  
- **Tutup tab/browser** → data hilang; session baru mulai dari nol.

## 2. Motivasi

| PRD | Kebutuhan teknis |
| --- | --- |
| §6.2 Play start, listen duration, early skip, completion, play count | Event model + debounce |
| UC-04 | Sesi mendengar menghasilkan data terakumulasi |
| §5.5 Penyimpanan profil | `sessionStorage`; refresh keep; close reset |
| §5.1 / multi-user | Isolasi per browser/device; tidak ada profil server |

RFC-001 sudah mengekspos hook player. RFC-002 mengonsumsi hook tersebut.

## 3. Usulan

### 3.1 Modul

| Modul | Tanggung jawab |
| --- | --- |
| `listenTracker` | Subscribe player events; terapkan debounce & klasifikasi early skip / completion |
| `tasteStore` | Baca/tulis agregat ke `sessionStorage` (JSON) |
| `tasteApi` | API permukaan untuk RFC-003/004: `getStats()`, `getMeaningfulPlayCount()`, `record…` |

### 3.2 Keputusan storage

- **Primer: `sessionStorage`** key namespace `localtune:taste:v1` berisi JSON aggregates + meta.
- **Bukan** IndexedDB / localStorage untuk taste stats.
- In-memory mirror di-hydrate dari `sessionStorage` saat load; write-through setelah `applyAttempt`.
- Tidak sync ke server. Tidak menyimpan `objectUrl`, path disk, atau byte audio.

### 3.3 Identitas trek dalam session

Object URL hilang setelah refresh (library harus dipilih ulang). Stats diikat ke **`trackKey`** agar tetap cocok jika user memilih file yang sama lagi dalam session yang sama:

```text
trackKey = normalize(artist) + "|" + normalize(title)
// fallback jika artist Unknown: "file|" + fileName + "|" + size + "|" + lastModified
```

## 4. Detail desain

### 4.1 Definisi event (kanonik PRD)

| Event | Definisi operasional |
| --- | --- |
| Meaningful play start | `play` setelah idle ≥ **2s** sejak pause terakhir pada trek yang sama, atau ganti trek; abaikan play/pause spam |
| Listen duration | Detik aktual terdengar dalam attempt |
| Early skip | Pindah trek sebelum **30%** durasi, atau sebelum **20s** jika durasi pendek |
| Completion | Posisi ≥ **80%** durasi atau event `ended` |
| Play count | +1 per meaningful play start |

### 4.2 State attempt (in-memory)

```text
PlayAttempt {
  trackId: string
  trackKey: string
  artist: string
  genre: string
  title: string
  startedAt: number
  heardSec: number
  durationSec?: number
  completed: boolean
  earlySkipped: boolean
}
```

Pada `onPause` / `onEnded` / `onSkipToOther`: finalisasi attempt → `tasteStore.applyAttempt(attempt)`.

### 4.3 Agregat tersimpan (sessionStorage JSON)

```text
TrackStats { trackKey, title, artist, genre, playCount, completionCount, earlySkipCount, totalHeardSec, lastPlayedAt }
ArtistStats { artistKey, playCount, completionCount, totalHeardSec, lastPlayedAt }
GenreStats  { genreKey, playCount, completionCount, totalHeardSec, lastPlayedAt }
TasteMeta { schemaVersion: 1, meaningfulPlayCount: number, updatedAt: number }
TasteBlob { meta, tracks: Record<trackKey, TrackStats>, artists: ..., genres: ... }
```

### 4.4 Schema

- `schemaVersion = 1`. Jika parse gagal / version mismatch → reset blob kosong (session tetap jalan).

### 4.5 Privasi & hosting

- Hanya labels + angka agregat di `sessionStorage` origin ini.
- Tidak ada endpoint upload.
- UI: profil berlaku untuk session browser; hilang setelah tab/browser ditutup.

### 4.6 API untuk RFC berikutnya

```text
tasteApi.getMeta() -> TasteMeta
tasteApi.getTrackStats(trackKey) -> TrackStats | null
tasteApi.getTopArtists(limit) -> ArtistStats[]
tasteApi.getTopGenres(limit) -> GenreStats[]
tasteApi.getAllTrackStats() -> TrackStats[]
tasteApi.subscribe(listener)
```

## 5. Alternatif yang dipertimbangkan

| Alternatif | Alasan ditolak / ditunda |
| --- | --- |
| IndexedDB lintas hari | Bertentangan PRD v1.4 (session-scoped) |
| localStorage persist | Bertahan setelah tutup browser; ditolak |
| In-memory only (tanpa sessionStorage) | Refresh tab menghapus profil; ditolak |
| Analytics server | Melanggar privasi / no server profile |

## 6. Dampak

| Area | Dampak |
| --- | --- |
| Privasi | Data selera hanya di session tab/browser user |
| Multi-user | Device/browser berbeda = storage terpisah otomatis |
| Performa | Write JSON ke sessionStorage setelah attempt; jangan block audio |
| Hosting | Tidak berubah |

## 7. Rencana implementasi (tinggi)

1. Wire `listenTracker` ke hooks RFC-001  
2. Debounce meaningful play + early skip / completion  
3. `tasteStore` sessionStorage read/write + hydrate  
4. Ekspos `tasteApi` + `subscribe`  
5. Smoke: stats bertahan setelah **refresh**; hilang setelah session baru  
6. Copy UI tentang masa hidup profil  

## 8. Risiko & mitigasi

| Risiko | Mitigasi |
| --- | --- |
| trackKey bentrok | Fallback fileName+size+lastModified bila artist Unknown |
| Durasi belum diketahui | Tunda % sampai duration ada; fallback early skip 20s |
| sessionStorage quota / mode ketat | Gagal soft; mirror in-memory tetap untuk sisa session |
| Double-count play/pause | Debounce 2s |

## 9. Open questions

Tidak ada.

## 10. Acceptance criteria

- [ ] Meaningful play start, early skip, completion, listen duration tercatat sesuai PRD  
- [ ] Agregat bertahan setelah **refresh tab** (`sessionStorage`)  
- [ ] Agregat **tidak** bertahan setelah tutup tab/browser (session baru = kosong)  
- [ ] `meaningfulPlayCount` akurat per session untuk cold-start  
- [ ] Tidak menyimpan audio bytes, object URL, atau path disk  
- [ ] Tidak ada upload audio ke hosting  
- [ ] Pemutar tetap berfungsi jika sessionStorage gagal (fallback memori saja untuk sisa tab)  
- [ ] `tasteApi` siap dikonsumsi RFC-003/004  
