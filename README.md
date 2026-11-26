# SehatQ — Sistem Informasi Antrean Puskesmas

Aplikasi web Vanilla JavaScript berorientasi objek dengan Firebase Authentication, Realtime Database, dan Hosting. Konfigurasi ini ditujukan untuk demonstrasi dengan paket Firebase Spark gratis; aplikasi tidak memakai atau men-deploy Cloud Functions.

Dashboard petugas memiliki halaman tersendiri untuk beranda, data antrean, data dokter, jadwal dokter, data poli, dan data pasien. Beranda menampilkan kartu nomor terakhir yang dipanggil pada tiap poli serta tombol **Selanjutnya** untuk memanggil antrean menunggu terawal; nomor dan riwayat tidak di-reset. Petugas dapat mengaktifkan panggilan otomatis dan mengatur interval 1–120 menit untuk setiap poli. Pada paket Spark, timer berjalan di browser dashboard petugas yang terbuka dan berhenti saat halaman ditutup. Data antrean dapat diunduh sebagai CSV bertitik koma yang dibuka Excel sebagai kolom tabel, untuk satu poli dan satu tanggal per file. Data dokter dan jadwal disimpan terpisah dari poli. Jadwal saat ini merupakan data operasional untuk dikelola petugas; pendaftaran antrean belum dibatasi oleh hari atau jam jadwal.

## Struktur

- `index.html`, `admin.html`, `css/`, `js/` — antarmuka pasien dan petugas.
- `js/models/` — model OOP User, Patient, Admin, Antrean, Poli, Doctor, dan DoctorSchedule.
- `js/services/` — autentikasi, transaksi antrean, pengelolaan data admin, dan akses Firebase.
- `database.rules.json` — aturan akses database.
- `functions/` — kode backend lama untuk opsi Blaze; tidak digunakan oleh versi Spark.
- `docs/` — wireframe, arsitektur, UML, dan laporan pengujian.
- `tests/` — tes model dan layanan antrean lokal.

## Fitur paket gratis

1. Buat proyek Firebase, daftarkan aplikasi web, dan buat Realtime Database di lokasi yang sesuai dengan URL database.
2. Aktifkan **Authentication → Email/Password**.
3. Isi `js/config.js` dengan konfigurasi Web App dan URL Realtime Database.
4. Di folder proyek jalankan:

   ```powershell
   firebase login
   firebase use default
   firebase deploy --only database,hosting
   ```

5. Buat satu akun petugas di **Authentication → Users → Add user**. Salin UID akun dan pastikan nilainya sama dengan `adminUid` di `js/config.js` serta UID admin pada aturan `database.rules.json`.
6. Deploy ulang rules dengan `firebase deploy --project sehatq-e13c1 --only database`.
7. Masuk ke `admin.html` menggunakan akun tersebut; tambahkan poli dan dokter, tetapkan dokter pada poli, lalu atur jadwal mingguan. Direktori pasien dapat dilihat petugas yang berwenang.

Jangan deploy seluruh target Firebase tanpa `--only database,hosting`; direktori `functions/` hanya untuk opsi backend berbayar dan tidak termasuk konfigurasi deploy gratis.

## Hak admin demo Spark

Versi gratis ini menggunakan satu UID admin tetap: `adminUid` di `js/config.js` dan pemeriksaan UID pada `database.rules.json`. UI saja tidak memberikan hak; Realtime Database Rules juga membatasi data dan operasi admin pada UID tersebut. Akun admin boleh dibuat melalui Firebase Console karena halaman petugas tidak memerlukan profil pasien. Setelah UID admin diubah, samakan nilainya di kedua file lalu deploy ulang database rules.

Jangan menyediakan pendaftaran admin publik. Untuk beberapa admin atau produksi, ganti daftar UID tetap dengan custom claims yang diterbitkan backend tepercaya.

## Struktur data

- `users/{uid}` — profil minimal tanpa kata sandi.
- `poli/{poliId}` — nama, kode, referensi dokter, rata-rata waktu pelayanan per pasien, dan status aktif.
- `dokter/{doctorId}` — nama, spesialisasi, dan status aktif.
- `jadwal_dokter/{scheduleId}` — dokter, poli, hari mingguan, jam mulai/selesai, dan status aktif.
- `antrean/{YYYY-MM-DD}/{poliId}/{queueId}` — data antrean kanonis.
- `riwayat_antrean/{uid}/{queueId}` — indeks riwayat pasien.
- `ringkasan_antrean/{tanggal}/{poliId}/{queueId}` — nomor urut dan status tanpa identitas untuk menghitung posisi.
- `pengaturan/nomor/{tanggal}/{poliId}` — counter nomor antrean.

`QueueService` menaikkan counter dengan Realtime Database transaction dan menulis antrean, riwayat, serta ringkasan. Dokter aktif yang ditetapkan pada poli serta durasi rata-rata disalin ke tiket saat pasien mendaftar agar informasi riwayat tidak berubah jika data master diperbarui. Jadwal mingguan dicek agar jam dokter yang sama tidak bertabrakan; jadwal tidak menutup atau membuka pendaftaran antrean secara otomatis. Perkiraan waktu tunggu dihitung sebagai jumlah antrean aktif di depan dikalikan rata-rata menit per pasien, lalu ditampilkan sebagai durasi dan perkiraan jam dipanggil. Ini hanya estimasi dan bukan janji waktu pelayanan. Listener `onValue` memperbarui tampilan tanpa refresh.

## Batasan keamanan paket gratis

Tanpa backend tepercaya, browser pasien menjalankan transaksi. Aturan mencegah penulisan lintas UID dan membatasi kenaikan counter per transaksi, tetapi Firebase Spark tanpa Cloud Functions tidak dapat memberikan validasi/rate limiting server-side yang setara. Pengguna yang memodifikasi klien dapat menaikkan counter berulang kali atau mengganggu ringkasan posisi. Nomor unik dijamin untuk pendaftaran yang menggunakan alur aplikasi normal dan transaksi Firebase; jangan gunakan sistem ini untuk layanan klinis sebenarnya atau data pasien nyata.

Untuk produksi, gunakan backend tepercaya (misalnya Cloud Functions pada paket yang mendukungnya), App Check, pembatasan laju, kebijakan retensi, serta tinjauan keamanan dan privasi data kesehatan.

## Pengembangan dan pengujian

```powershell
npm test
```

Tes lokal tidak membuktikan koneksi proyek Firebase atau keamanan aturan di emulator. Uji registrasi, aturan, nomor serentak, dua sesi real-time, perubahan status, dan hak akses dengan akun demo non-produksi sebelum presentasi. Lihat [laporan uji](docs/02-pengujian.md).
