# LocalTune

Web music player (RFC-001): plays **local device files** only. No music is uploaded to hosting.

## Develop

```bash
cd app
npm install
npm run dev
```

Open the URL Vite prints, then click **Pilih musik** and choose audio files from your computer.

## Build (static)

```bash
cd app
npm run build
```

Output is in `app/dist` — deploy that folder to any static host (Netlify / GitHub Pages / Vercel). The deploy package must not include user music files.

## Internet research (RFC-004)

Discovery uses the MusicBrainz API via `/api/research` (metadata only — no audio upload).

- **Dev / preview:** `npm run dev` or `npm run preview` — Vite middleware proxies research.
- **Netlify:** root `netlify.toml` redirects `/api/research` to a serverless function.
- **Other static hosts:** provide an equivalent proxy endpoint or discovery will fail soft (player still works).

Toggle **Perbarui saran dari internet saat memutar** to opt out (stored in `sessionStorage` for the tab session).

## Adaptive UI (RFC-005)

- **Default** — static brand skin; does not change per track.
- **Adaptif** — CSS theme follows genre from local ID3 tags and discovery metadata (no AI, no extra downloads).
- Mode is stored in `sessionStorage` (`localtune:uiMode`); closing the tab resets to Default.
