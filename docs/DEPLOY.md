# Panduan Deploy LocalTune

## Opsi A — Netlify + GitHub (disarankan)

Discovery internet membutuhkan function `/api/research` (sudah ada di `netlify.toml`).

Fingerprint AcoustID (opsional, untuk file tanpa tag) membutuhkan `/api/acoustid` dan variabel lingkungan `ACOUSTID_API_KEY`.

### 1. Push ke GitHub

```powershell
cd "C:\Users\Jeremiah\Documents\JE\Cursor Workshop\Cursorworkshop"

# Cek status
git status

# Commit pertama (jika belum)
git add .
git commit -m "LocalTune MVP: player, taste profile, Up Next, discovery, adaptive UI"
```

Buat repo kosong di [github.com/new](https://github.com/new) (nama misalnya `localtune`), **tanpa** README/license.

```powershell
git remote add origin https://github.com/USERNAME/localtune.git
git branch -M main
git push -u origin main
```

(Ganti `USERNAME` dengan username GitHub Anda. Browser akan minta login.)

### 2. Hubungkan Netlify

1. Buka [app.netlify.com](https://app.netlify.com) → login (bisa pakai akun GitHub).
2. **Add new site** → **Import an existing project** → **GitHub**.
3. Pilih repo `localtune`.
4. Netlify membaca `netlify.toml` otomatis:
   - Build: `cd app && npm run build`
   - Publish: `app/dist`
   - Functions: `netlify/functions`
5. Klik **Deploy site**.

Setelah deploy, URL seperti `https://random-name.netlify.app` — buka di browser, **Pilih musik**, putar file lokal.

### 3. AcoustID (opsional — identifikasi dari sidik jari)

Untuk lagu tanpa tag ID3, LocalTune bisa mengidentifikasi trek lewat AcoustID (hanya hash + durasi yang dikirim, **bukan** file audio).

1. Daftar aplikasi gratis di [acoustid.org/new-application](https://acoustid.org/new-application).
2. Di Netlify: **Site configuration** → **Environment variables** → tambah `ACOUSTID_API_KEY` dengan API key Anda.
3. Redeploy site.

Tanpa key ini, analisis audio lokal (mood/energi) tetap jalan; hanya lookup fingerprint yang dilewati.

### 4. Verifikasi discovery

Putar lagu dengan tag artis → panel **Discovery** harus terisi (status "Memperbarui…" lalu item muncul).

Untuk file tanpa tag: aktifkan research, pastikan `ACOUSTID_API_KEY` terpasang, putar trek → item dengan alasan "Diidentifikasi dari sidik jari audio" dapat muncul.

Mode **Adaptif** menampilkan suasana dari analisis lokal (energi, tempo) setelah trek diputar beberapa detik.

---

## Opsi B — Netlify tanpa Git (drag & drop)

Hanya untuk uji cepat **tanpa** discovery internet:

1. `cd app && npm run build`
2. [app.netlify.com/drop](https://app.netlify.com/drop) → seret folder `app/dist`

> Tanpa Git + function, discovery tidak jalan. Pemutar & Up Next lokal tetap OK.

---

## Opsi C — Jalankan lokal saja

```powershell
cd app
npm install
npm run dev
```

Buka `http://127.0.0.1:5173` — research API lewat Vite middleware (sama seperti production Netlify).

---

## Troubleshooting

| Masalah | Solusi |
|--------|--------|
| `git` tidak dikenali | Install: `winget install Git.Git` lalu buka terminal baru |
| Discovery kosong | Pastikan deploy Netlify (bukan drag-drop dist saja); cek artis bukan `Unknown` |
| AcoustID tidak jalan | Set `ACOUSTID_API_KEY` di Netlify env lalu redeploy |
| Research error | Netlify function log di dashboard → Functions |
| Audio tidak play | Klik **Pilih musik** dulu (gesture browser) |
