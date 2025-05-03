# gmaps-review

Scraper Google Maps Review berbasis Playwright + Bun

## Fitur
- Mengambil data profil Google Maps (foto, nama, subheading, poin)
- Mengambil semua review beserta:
  - Judul, alamat, rating, waktu, isi review
  - Gambar-gambar di review
  - Tanggapan dari pemilik (jika ada)
  - Link share Google Maps review (otomatis klik tombol Bagikan & Salin Link)
- Output dalam format JSON, siap untuk pipeline ke proses lain

## Instalasi

1. Pastikan sudah terinstall [Bun](https://bun.sh) 
2. Clone repo ini, lalu install dependensi:

```bash
bun install
```

## Cara Menjalankan

Jalankan dengan perintah berikut, ganti `GAIA_ID` dengan ID Google Maps user yang ingin di-scrape.
GAIA ID bisa didapatkan menggunakan tools seperti [ghunt](https://github.com/mxrch/GHunt):

```bash
bun run index.ts GAIA_ID
```

Contoh:
```bash
bun run index.ts 10198960xxx
```

## Output

Output hanya satu baris JSON, misal:

```json
{"success":true,"data":{"profile":"https://...jpg","name":"Nama User","subheading":"Local Guide","poin":"1.234 poin","reviews":[{"reviewId":"...","title":"...","address":"...","rating":"5 bintang","time":"sebulan lalu","reviewText":"...","images":["https://...jpg"],"ownerResponse":{"time":"9 bulan lalu","text":"Terima kasih..."},"reviewLink":"https://goo.gl/maps/..."}]}}
```

Jika gagal, output:
```json
{"success":false,"error":"Pesan error"}
```

## Catatan
- Script ini menggunakan browser Chromium headful (bisa diubah ke headless jika perlu)
- Untuk scraping dalam jumlah besar, gunakan jeda/penyesuaian agar tidak terblokir Google
- Hasil output bisa langsung diproses ke pipeline lain (misal: simpan ke database, kirim ke API, dsb)

---

Created with ❤️ by [Playwright](https://playwright.dev/) & [Bun](https://bun.sh)
