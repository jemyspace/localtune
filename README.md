# Cursorworkshop — LocalTune

Pemutar musik web **lokal** dengan profil selera, Up Next, discovery metadata, dan UI adaptif — tanpa unggah audio ke server.

| Dokumen | Lokasi |
| --- | --- |
| PRD | [`docs/PRD-music-player.md`](docs/PRD-music-player.md) |
| RFC (Accepted) | [`docs/rfcs/`](docs/rfcs/) |
| Aplikasi | [`app/`](app/) |

## Fitur MVP (RFC-001–005)

- Pemutar lokal (File API, playlist, HTML5 audio)
- Tracking dengar + profil selera (`sessionStorage`)
- Up Next dari library lokal (cold start 5 plays)
- Discovery via MusicBrainz (play-triggered, opt-out)
- UI Default vs Adaptif (CSS themes, tanpa LLM)

## Jalankan lokal

```bash
cd app
npm install
npm run dev
```

Buka URL Vite (biasanya `http://127.0.0.1:5173`) → **Pilih musik** → pilih file audio dari komputer.

## Build & deploy

```bash
cd app
npm run build
```

Output: `app/dist/` (hanya app shell — **bukan** file musik user).

### Netlify (disarankan)

Repo sudah menyertakan [`netlify.toml`](netlify.toml) dan function research di `netlify/functions/`.

1. Push repo ke GitHub/GitLab.
2. [Netlify](https://app.netlify.com/) → **Add new site** → import repo.
3. Build settings terisi otomatis dari `netlify.toml`.
4. Deploy — discovery memakai `/.netlify/functions/research`.

### Hosting statis lain (GitHub Pages, dll.)

Deploy folder `app/dist`. Discovery **tidak** akan berfungsi tanpa proxy `/api/research` setara; pemutar + Up Next lokal tetap jalan.

## Privasi

- Musik tetap di perangkat user.
- Profil, discovery, dan preferensi UI hidup di **session tab** (`sessionStorage`).
- Refresh tab = data tetap; tutup tab/browser = session baru.
