# RFC-003: Taste Profile & Up Next Lokal

| Field | Value |
| --- | --- |
| Status | Accepted |
| Tanggal | 2026-08-01 |
| Penulis | Agent |
| PRD terkait | [docs/PRD-music-player.md](../PRD-music-player.md) (§6.3–6.4, F-08–F-12, UC-05–UC-06, cold start N=5) |
| Dependensi RFC | [RFC-002](RFC-002-listen-events-taste-storage.md) (`tasteApi`); [RFC-001](RFC-001-static-web-player-core.md) (library sesi) |

## 1. Ringkasan

RFC ini mengubah agregat mendengar (RFC-002, **sessionStorage**) menjadi **Taste Profile** (skor artis/genre/trek) dan menghasilkan antrean **Up Next playable** hanya dari library lokal yang sedang dimuat di sesi.

Cold start: jika `meaningfulPlayCount < 5` **dalam session browser saat ini**, Up Next mengikuti urutan playlist sequential. Discovery internet **bukan** scope (RFC-004). Tutup tab/browser mereset hitungan (session baru).

## 2. Motivasi

| PRD | Keputusan RFC |
| --- | --- |
| F-08 Up Next berbasis profil | Ranking lokal dari skor |
| F-09 Kandidat playable hanya lokal | ∩ library sesi RFC-001 |
| F-10 Fallback cold start | Sequential jika &lt; 5 plays |
| F-11 Anti-ulang berlebih | Hindari trek yang baru diputar |
| F-12 Transparansi ringan | Alasan singkat opsional |
| §6.3 Profil | Skor artis, genre, sinyal per lagu |

## 3. Usulan

### 3.1 Modul

| Modul | Tanggung jawab |
| --- | --- |
| `profileEngine` | Hitung skor dari `tasteApi` aggregates |
| `upNextEngine` | Susun daftar kandidat playable dari library sesi |
| `upNextUi` | Tampilkan Up Next + copy cold start |

### 3.2 Cold start

```text
COLD_START_N = 5
isColdStart = tasteApi.getMeta().meaningfulPlayCount < COLD_START_N
// meaningfulPlayCount dihitung per browser session (sessionStorage), bukan lintas hari
```

Jika cold start: `upNext = sequential playlist after current index` (wrap sesuai RFC-001). UI: “Masih belajar selera Anda…”.

## 4. Detail desain

### 4.1 Skor (default MVP)

Bobot default (boleh di-tune tanpa mengubah kontrak API):

```text
trackScore =
  2.0 * completionCount
  + 1.0 * playCount
  + 0.01 * totalHeardSec
  - 1.5 * earlySkipCount

artistScore = sum trackScore signals for artist
            // atau mirror ArtistStats:
            2.0 * completionCount + 1.0 * playCount + 0.01 * totalHeardSec

genreScore  = sama pola dari GenreStats
```

Skor negatif di-clamp ke 0 untuk ranking. Artist/genre `Unknown` mendapat bobot rendah (faktor **0.25**) agar tidak mendominasi.

### 4.2 Skor kandidat Up Next

Untuk setiap `Track` di library sesi kecuali current:

```text
candidateScore =
  0.50 * normalize(artistScore)
  + 0.25 * normalize(genreScore)
  + 0.25 * normalize(trackScore)
  + smallNoise   // 0..0.01 agar tidak deterministik kaku
```

`normalize` = min-max dalam set kandidat saat ini (hindari div/0 → semua 0 → fallback sequential).

### 4.3 Aturan anti-ulang

- Keluarkan trek yang sama dengan current.
- Turunkan skor drastis (−∞ / filter) untuk trek yang `lastPlayedAt` &lt; **10 menit** kecuali `library.length <= 3`.
- Setelah `ended`/next otomatis: ambil **#1** dari ranking terbaru sebagai next (atau hormati urutan Up Next list yang sudah ditampilkan).

### 4.4 Integrasi player

- `upNextEngine.refresh(library, currentTrackId)` dipanggil setelah `tasteApi` update dan saat library berubah.
- Player “next” saat tidak cold start: prefer `upNext[0]` jika masih ada di library; else sequential.
- Prev tetap histori/index playlist sederhana (tidak wajib reverse-recommend).

### 4.5 Output profil (untuk UI & RFC-004)

```text
TasteProfile {
  coldStart: boolean,
  meaningfulPlayCount: number,
  topArtists: { name, score }[],  // top 5
  topGenres: { name, score }[],   // top 5
  updatedAt: number
}
```

Persist skor turunan **tidak wajib**—dihitung on-read dari agregat RFC-002 di sessionStorage. Cache in-memory OK; ikut hilang saat session berakhir.

### 4.6 Alasan (F-12)

Opsional satu string, contoh: `Karena Anda sering menyelesaikan lagu artis {topArtist}`.

## 5. Alternatif yang dipertimbangkan

| Alternatif | Alasan ditolak / ditunda |
| --- | --- |
| ML / collaborative filtering cloud | Butuh server & data user lain; out of scope |
| Up Next dari katalog internet | Melanggar F-09; discovery = RFC-004 non-playable |
| Shuffle murni sebagai default pasca cold start | Kurang selaras tujuan “profil selera” |
| Persist skor di server | Dilarang; client-only |

## 6. Dampak

| Area | Dampak |
| --- | --- |
| Privasi | Hanya komputasi lokal; profil session-scoped |
| Performa | O(n) atas library sesi; n kecil–sedang OK |
| UX | Cold start jujur per session; Up Next tidak mengalahkan kontrol utama |
| Hosting | Tidak berubah |

## 7. Rencana implementasi (tinggi)

1. `profileEngine` dari `tasteApi`  
2. Cold start gate N=5  
3. `upNextEngine` ranking + anti-ulang  
4. Hook next player ke Up Next  
5. UI Up Next + copy cold start + alasan opsional  
6. Tes manual: &lt;5 plays = sequential; ≥5 = artis favorit naik  

## 8. Risiko & mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Library 1–3 lagu | Longgarkan anti-ulang |
| Semua Unknown | Skor rata → praktis sequential |
| Stats untuk trackKey tidak match sesi baru | Match artist/title normalize; else trackScore=0, andalkan artist/genre |

## 9. Open questions

Tidak ada yang memblokir. Fine-tune bobot boleh tanpa RFC baru selama perilaku F-08–F-12 tetap.

## 10. Acceptance criteria

- [ ] `meaningfulPlayCount < 5` **per session** → Up Next / next = sequential + copy cold start  
- [ ] Setelah ≥ 5 plays bermakna dalam session yang sama, ranking mengutamakan artis/genre/trek ber-completion tinggi  
- [ ] Tutup tab/browser lalu buka lagi → cold start lagi (profil kosong)  
- [ ] Tidak ada item Up Next di luar library sesi saat ini  
- [ ] Trek baru diputar tidak langsung disarankan lagi (kecuali library sangat kecil)  
- [ ] Prev/next & playback tetap stabil  
- [ ] Tidak ada upload audio / ketergantungan server untuk Up Next  
