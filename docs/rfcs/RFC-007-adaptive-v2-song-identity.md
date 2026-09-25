# RFC-007: Adaptif v2 — Identitas Visual per Lagu

| Field | Value |
| --- | --- |
| Status | Draft |
| Tanggal | 2026-09-25 |
| Penulis | Agent |
| PRD terkait | [docs/PRD-music-player.md](../PRD-music-player.md) (§6.6 UI adaptif) |
| Dependensi RFC | [RFC-005](RFC-005-adaptive-ui-themes.md), [RFC-006](RFC-006-audio-analysis-fingerprint.md), [RFC-003](RFC-003-taste-profile-up-next.md) |

## 1. Ringkasan

Mode Adaptif sebelumnya memilih warna per **genre**, menganalisis suasana dari **45 detik pertama**, dan animasinya tertutup panel solid. Hasilnya terasa tidak nyambung dengan lagu. RFC ini membuat setiap lagu punya identitas visual sendiri dan menambah fitur yang membuat pengguna betah — tetap 100% lokal, tanpa LLM.

## 2. Perubahan

| Area | Sebelum | Sesudah |
| --- | --- | --- |
| Warna | Tetap per genre | Per lagu: sampul album (ekstraksi warna dominan via canvas, OKLCH) → suasana & energi lagu → genre |
| Analisis | 45 dtk pertama (sering intro) | Potongan dari 25% durasi; decode penuh 22.05 kHz; kontur energi 160 titik + posisi puncak |
| Cakupan analisis | Hanya lagu yang diputar | Seluruh koleksi di latar belakang (`requestIdleCallback`, satu per satu) |
| Visual berirama | Kanvas fixed di belakang panel | Di dalam kartu "Sedang diputar"; adaptive gain per lagu |
| Seek bar | Slider polos | Gelombang energi lagu + penanda puncak |
| Up Next (cold start) | Urutan playlist | Mengalir berdasarkan kecocokan nuansa; lagu disukai didahulukan |

## 3. Fitur keterlibatan

- **Suka (♥)** — `LikesStore` (sessionStorage), menaikkan skor Up Next dan tampil di Koleksi. Pintasan `L`.
- **Loncat ke puncak** — lompat ke awal jendela ±12 dtk berenergi tertinggi.
- **Kalimat suasana** — teks tulisan tangan per suasana × waktu (pagi/siang/sore/malam/larut).
- **Kartu "Selanjutnya"** — muncul ±15 dtk sebelum lagu habis dengan % kecocokan.
- **Mode panggung** — kartu "Sedang diputar" layar penuh (Fullscreen API). Pintasan `F`.

## 4. Privasi

Tidak ada data baru yang keluar dari perangkat. Ekstraksi warna sampul dan analisis audio berjalan di browser. Data suka mengikuti kebijakan profil selera: sessionStorage, hilang saat tab ditutup.

## 5. Aksesibilitas

- Lightness aksen tetap (OKLCH L 0.52) agar kontras teks putih memenuhi AA.
- Slider seek asli tetap ada di atas gelombang untuk keyboard & pembaca layar.
- Semua animasi baru dimatikan saat `prefers-reduced-motion: reduce`.

## 6. Catatan terbuka

- Mood dari energi/zero-crossing masih heuristik; lagu dengan dinamika ekstrem bisa salah label.
- Tempo di atas ±170 BPM dapat terbaca setengahnya (ambiguitas half-time).
- Fullscreen dapat diblokir oleh WebView tertentu; di browser standar berfungsi.
