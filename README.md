# FLOWCRAFT · SOPConnect

Aplikasi web untuk process owner: **input aktivitas → flowchart SOP tersusun otomatis → unduh**, dengan **database flowchart** terpusat serta **kepemilikan & akses dokumen**. Dibangun dari rancangan *SOPCONNECT by DigiGovern* (Faith Steward 2026).

| Fitur | Keterangan |
|---|---|
| Auto generate flowchart | Isi langkah (aktivitas, pelaksana, simbol, tujuan, output, waktu) → flowchart swimlane otomatis. **Horizontal** (bawaan): kegiatan berjajar di header atas, pelaksana sebagai baris dengan label vertikal di kiri, Output & Waktu di baris bawah. **Vertikal**: format tabel SOP klasik. Cabang Ya/Tidak dan alur kembali tergambar otomatis. |
| Pemeriksaan alur | Menandai alur tanpa Selesai, keputusan tanpa cabang "Tidak", langkah yang tidak terhubung, dll. |
| Susun otomatis | *Daftar cepat* (`Pelaksana: aktivitas` per baris) atau *dari narasi* dengan AI (opsional). |
| Unduh | PNG, SVG, Cetak / PDF, dan JSON (cadangan & impor), sesuai orientasi yang dipilih. |
| Database flowchart | Repositori bersama: pencarian, filter status Draft/Review/Final, kepemilikan. |
| Kepemilikan & akses | Pemilik, Editor, Pembaca; visibilitas "semua pengguna" atau "hanya yang diberi akses"; alih kepemilikan. **Dijaga di server** (Row Level Security). |
| Versi & riwayat | Simpan versi (snapshot), lihat & pulihkan versi lama, log aktivitas otomatis. |
| Edit bersamaan | Deteksi bentrok bila dua orang mengubah flowchart yang sama. |
| Admin | Kelola peran pengguna, batasi pendaftaran ke domain email kantor. |

**Tampilan:** antarmuka kaca (glassmorphism) dengan mode terang/gelap otomatis, panduan singkat untuk pengguna baru, dan pemilih simbol berbentuk ikon.

**Teknologi (semua bisa gratis):** React + TypeScript + Vite (frontend) · Supabase (PostgreSQL, Auth, Row Level Security) · hosting statis Vercel / Netlify / Cloudflare Pages.

---

## Deploy gratis (± 20 menit)

Yang dibutuhkan: akun **GitHub**, **Supabase**, dan **Vercel** (ketiganya bisa daftar gratis pakai akun GitHub).

### 1. Siapkan database di Supabase

1. Buka <https://supabase.com> → **New project**. Isi nama (mis. `flowcraft`), buat password database, pilih region **Southeast Asia (Singapore)**, plan **Free**.
2. Setelah project siap: menu **SQL Editor** → **New query** → salin seluruh isi `supabase/migrations/20261015000000_init.sql` → **Run**. Harus muncul *Success. No rows returned*.
3. Menu **Authentication → Sign In / Providers → Email**:
   - Untuk uji coba bersama rekan, **matikan "Confirm email"**. Server email bawaan Supabase hanya mengirim beberapa email per jam, jadi konfirmasi email mudah tertahan. Batasi pendaftaran lewat domain email kantor di halaman Admin aplikasi (langkah 4).
   - Bila ingin konfirmasi email tetap aktif, pasang SMTP sendiri di **Authentication → Emails → SMTP Settings**.
4. Menu **Project Settings → API Keys** (atau **Connect**): catat **Project URL** dan **Publishable key** (`sb_publishable_...`). Pada project lama namanya **anon public key**; keduanya bisa dipakai.

### 2. Unggah kode ke GitHub

```bash
cd flowcraft-app
git init && git add . && git commit -m "FLOWCRAFT SOPConnect"
git branch -M main
git remote add origin https://github.com/<akun-anda>/flowcraft-sopconnect.git
git push -u origin main
```

(Atau buat repo baru di github.com lalu unggah folder ini lewat **Add file → Upload files**.)

### 3. Deploy frontend di Vercel

1. <https://vercel.com> → **Add New → Project** → pilih repo `flowcraft-sopconnect`. Framework terdeteksi **Vite** otomatis.
2. Buka **Environment Variables**, isi:
   - `VITE_SUPABASE_URL` = Project URL dari langkah 1.4
   - `VITE_SUPABASE_ANON_KEY` = Publishable key (atau anon key) dari langkah 1.4
3. **Deploy**. Anda akan mendapat alamat seperti `https://flowcraft-sopconnect.vercel.app`.
4. Kembali ke Supabase → **Authentication → URL Configuration**:
   - **Site URL** = alamat Vercel Anda
   - **Redirect URLs** = tambahkan `https://flowcraft-sopconnect.vercel.app/**`

   Ini diperlukan agar tautan konfirmasi email dan reset kata sandi kembali ke aplikasi.

> Alternatif Netlify: **Add new site → Import from Git**, pengaturan build sudah ada di `netlify.toml`, isi environment variable yang sama.

### 4. Mulai pakai

1. Buka alamat aplikasi → **Daftar**. **Akun pertama yang mendaftar otomatis menjadi Admin.**
2. Menu **Admin** → isi domain email kantor (mis. `perusahaan.co.id`) agar hanya email kantor yang bisa mendaftar.
3. Bagikan alamat aplikasi ke rekan. Mereka mendaftar sendiri, lalu Anda bisa memberi mereka akses ke flowchart lewat tab **Info & Akses**.

### 5. (Opsional) Susun langkah dari narasi dengan AI

Butuh API key Claude dari <https://console.anthropic.com> (berbayar per pemakaian) dan [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
supabase login
supabase link --project-ref <project-ref>          # dari URL project Supabase
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5-5   # opsional
supabase functions deploy generate-steps --no-verify-jwt
```

Lalu di Vercel tambahkan `VITE_ENABLE_AI=true` dan **Redeploy**. Tombol **Susun otomatis → Dari narasi (AI)** akan muncul. Fungsi ini memeriksa sendiri bahwa pemanggil sudah masuk, sehingga `--no-verify-jwt` aman dipakai (sesuai anjuran Supabase untuk kunci API model baru).

---

## Menjalankan di komputer sendiri

Butuh Node.js 20+.

```bash
npm install
cp .env.example .env      # isi URL & anon key Supabase
npm run dev               # http://localhost:5173
```

Tanpa `.env`, aplikasi berjalan dalam **mode demo**: data disimpan di browser dan ada beberapa pengguna contoh (masuk dengan email apa pun, mis. `budi@contoh.co.id`) untuk mencoba peran Pemilik/Editor/Pembaca.

Perintah lain:

| Perintah | Fungsi |
|---|---|
| `npm test` | Unit test renderer flowchart, validasi alur, parser |
| `npm run build` | Build produksi ke `dist/` |
| `npm run typecheck` | Pemeriksaan TypeScript |

Uji kebijakan akses database di PostgreSQL lokal (tanpa Supabase):

```bash
createdb fc_test
psql -d fc_test -f supabase/tests/_stub_supabase.sql -f supabase/migrations/20261015000000_init.sql -f supabase/tests/rls_test.sql
```

Semua baris `NOTICE` harus diawali `OK`. Uji yang sama berjalan otomatis di GitHub Actions (`.github/workflows/ci.yml`).

---

## Hak akses

Semua aturan di bawah dijaga oleh database (Row Level Security + trigger), bukan hanya disembunyikan di tampilan.

| Tindakan | Pemilik | Editor | Pembaca | Pengguna lain | Admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Melihat flowchart visibilitas "semua pengguna" | ✓ | ✓ | ✓ | ✓ | ✓ |
| Melihat flowchart "hanya yang diberi akses" | ✓ | ✓ | ✓ | – | ✓ |
| Mengubah isi, status, simpan & pulihkan versi | ✓ | ✓ | – | – | ✓ |
| Mengatur akses & visibilitas, alih kepemilikan, hapus | ✓ | – | – | – | ✓ |
| Mengubah peran pengguna aplikasi, batas domain | – | – | – | – | ✓ |

Pengguna tidak bisa menjadikan dirinya admin, mengganti pemilik secara langsung, atau mengubah nomor versi tanpa melalui fungsi resmi.

## Struktur proyek

```
src/
  lib/flow.ts          renderer flowchart (SVG) + validasi alur
  lib/steps.ts         parser daftar cepat, hasil AI, contoh
  data/api.ts          kontrak akses data
  data/supabaseApi.ts  implementasi Supabase
  data/demoApi.ts      mode demo (localStorage)
  pages/               Login, Repositori, Editor, Profil, Admin
  components/          daftar langkah, pratinjau, akses, versi & riwayat
supabase/
  migrations/          skema, RLS, trigger, fungsi RPC
  functions/generate-steps/   Edge Function AI (opsional)
  tests/               uji RLS di PostgreSQL biasa
```

## Batasan paket gratis

- **Supabase Free:** database 500 MB (cukup untuk ribuan flowchart). Project **dijeda otomatis bila 7 hari tidak dipakai**; aktifkan lagi dari dashboard dengan satu klik, data tetap ada. Email bawaan dibatasi beberapa email per jam.
- **Vercel Hobby:** untuk penggunaan non-komersial. Untuk pemakaian resmi perusahaan setelah uji coba, pertimbangkan paket berbayar atau server perusahaan sendiri.
- Untuk *go-live*, aktifkan backup (paket berbayar Supabase) atau ekspor berkala, dan gunakan SMTP perusahaan.
