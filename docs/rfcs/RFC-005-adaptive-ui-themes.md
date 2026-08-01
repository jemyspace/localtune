# RFC-005: UI Default vs Adaptif (CSS Simple, Tanpa LLM)

| Field | Value |
| --- | --- |
| Status | Accepted |
| Tanggal | 2026-08-01 |
| Penulis | Agent |
| PRD terkait | [docs/PRD-music-player.md](../PRD-music-player.md) (§6.6 F-21–F-26, UC-09–UC-10, §3.2 no-LLM / no UI storage) |
| Dependensi RFC | [RFC-001](RFC-001-static-web-player-core.md); [RFC-004](RFC-004-internet-research-discovery.md) (sinyal metadata internet) |

## 1. Ringkasan

LocalTune menyediakan dua mode tampilan:

- **Default** — skin netral tetap; tidak berubah per lagu.
- **Adaptif** — setiap trek yang diputar, UI menerapkan **theme CSS sederhana** dari sinyal genre (tag lokal + metadata rekomendasi internet), agar tampilan tidak monoton.

Theme **tidak** dihasilkan LLM, **tidak** diunduh sebagai gambar/font/video per play, dan **tidak** disimpan sebagai paket di web server. Preferensi mode & state theme hidup di **`sessionStorage`**: tutup browser → hilang; session baru mulai dari **Default**.

## 2. Motivasi

| PRD | Keputusan |
| --- | --- |
| F-21 Toggle Default \| Adaptif | `uiMode` di sessionStorage |
| F-22 Adaptif mengikuti lagu | Resolve theme per play |
| F-23 Hemat bandwidth | CSS tokens di bundle only |
| F-24 No LLM / no server UI storage | Deterministic map; app shell only |
| F-25 Session reset | Close browser → Default |
| F-26 Reduced motion | Hormati `prefers-reduced-motion` |
| UC-09 / UC-10 | Pilih mode; play mengubah skin |

## 3. Usulan

### 3.1 Modul

| Modul | Tanggung jawab |
| --- | --- |
| `uiModeStore` | Baca/tulis `uiMode`: `default` \| `adaptive` di sessionStorage |
| `themeResolver` | Gabungkan genre lokal + hint research → `themeId` |
| `themeMap` | Tabel deterministik `themeId` → CSS variables |
| `themeApplier` | Set `data-theme` / CSS vars pada `document.documentElement` |
| `ambienceOptional` | AnalyserNode pulse (lokal); off pada Default / reduced-motion |

### 3.2 Preferensi session

```text
sessionStorage["localtune:uiMode"] = "default" | "adaptive"
// absen atau session baru → "default"
```

Refresh tab: mode tetap. Tutup tab/browser: hilang → Default.

### 3.3 Resolve order (mode adaptive)

1. Genre hint dari hasil research terkini untuk seed trek (jika ada & research tidak di-opt-out).
2. Else genre tag lokal trek.
3. Else `unknown` → `themeId = "neutral"`.

Tidak memanggil LLM. Tidak fetch URL gambar. Reuse payload research RFC-004; **jangan** network call kedua hanya untuk theme jika research sudah menyediakan genre labels.

Jika research opt-out: langkah 1 dilewati; lokal → unknown.

## 4. Detail desain

### 4.1 Theme table (MVP, di kode)

Normalisasi: lowercase, trim, map sinonim (`hip hop`/`rap` → `hiphop`, `edm`/`dance` → `electronic`, dll.).

| themeId | Contoh sinyal genre | Arah visual (CSS only) |
| --- | --- | --- |
| `neutral` | Unknown / default mode | Netral brand |
| `rock` | rock, alternative | Kontras tinggi, accent hangat gelap |
| `pop` | pop | Cerah, accent vibrant |
| `jazz` | jazz, blues | Hangat lembut |
| `electronic` | electronic, edm, dance | Dingin, accent neon soft (tanpa glow berlebih) |
| `classical` | classical, opera | Soft, kontras rendah elegan |
| `hiphop` | hip-hop, rap, r&b | Dalam, accent bold |
| `metal` | metal, punk | Gelap, accent tajam |
| `folk` | folk, country, acoustic | Earthy |
| `soul` | soul, funk | Hangat kaya |

Setiap theme mendefinisikan variabel minimal: `--bg`, `--surface`, `--text`, `--muted`, `--accent`, `--accent-contrast`. Transisi `300–500ms` pada properti warna.

### 4.2 Bandwidth rules (wajib)

**Dilarang untuk theme:**

- Fetch image/CDN wallpaper per play atau per genre  
- Load font file tambahan per theme  
- Video, Lottie, atau sprite sheet berat  
- Menyimpan theme pack di server/user storage hosting  

**Diizinkan:** CSS/JS sudah di bundle deploy; metadata JSON research yang sudah ada.

### 4.3 Ambience opsional

- Hanya mode `adaptive`.
- `AnalyserNode` dari elemen audio yang sama (RFC-001); modulate opacity subtle pada layer background CSS.
- Off jika `prefers-reduced-motion: reduce` atau mode `default`.
- Tidak memakai jaringan.

### 4.4 Integrasi play

Pada meaningful play / track change:

```text
if uiMode == default → applyTheme("neutral") // atau biarkan default skin tanpa ganti per trek
if uiMode == adaptive → themeId = resolve(...); applyTheme(themeId)
```

Apply theme **tidak** menunda `audio.play()`.

### 4.5 UI kontrol

- Toggle di area pengaturan sekunder: “Tampilan: Default | Adaptif”.
- Copy: Adaptif memakai metadata lagu & saran internet (bukan AI); hemat data; reset saat browser ditutup.

## 5. Alternatif yang dipertimbangkan

| Alternatif | Alasan ditolak |
| --- | --- |
| LLM generate palette/copy | Melanggar no-token AI |
| Download theme JSON/images dari server | Butuh storage hosting; bandwidth |
| Selalu adaptif tanpa toggle | User minta pilihan Default |
| Persist mode di localStorage | Bertentangan session-reset |
| Visualizer spektrum penuh | Out of scope PRD |

## 6. Dampak

| Area | Dampak |
| --- | --- |
| Bandwidth | Netral vs Default; Adaptif ≈ 0 bytes ekstra theme |
| Hosting | Hanya app shell (+ CSS themes in bundle) |
| Research | Theme konsumen metadata; tidak menambah provider |
| A11y | Reduced-motion + kontras token |

## 7. Rencana implementasi (tinggi)

1. CSS tokens + `data-theme` untuk themeId di atas  
2. `uiModeStore` + toggle UI  
3. `themeResolver` (lokal dulu)  
4. Hook play events → apply  
5. Wire genre hints dari RFC-004 discovery/research result  
6. Optional analyser ambience  
7. Uji: Default static; Adaptif berubah; close session reset; no image fetch; no LLM  

## 8. Risiko & mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Genre string liar | Normalisasi + fallback neutral |
| Research lambat | Apply lokal dulu; update theme saat hint datang |
| Kontras buruk | Checklist contrast per theme |
| Double fetch | Share research promise/cache dengan RFC-004 |

## 9. Open questions

Tidak ada yang memblokir.

## 10. Acceptance criteria

- [ ] User dapat memilih Default vs Adaptif; session baru = Default  
- [ ] Default: ganti lagu tidak mengubah theme  
- [ ] Adaptif: ganti lagu/genre mengubah CSS theme (atau neutral jika Unknown)  
- [ ] Tidak ada request jaringan khusus theme (image/font/video); tidak ada LLM  
- [ ] Tidak ada penyimpanan paket UI di server  
- [ ] Tutup browser menghapus mode Adaptif  
- [ ] Refresh tab mempertahankan mode dalam session  
- [ ] `prefers-reduced-motion` menonaktifkan ambience  
- [ ] Brand & kontrol utama tetap terbaca di semua theme  
