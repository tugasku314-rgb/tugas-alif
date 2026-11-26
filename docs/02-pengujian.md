# Pengujian Black Box

## Matriks kasus uji

| ID | Skenario | Hasil yang diharapkan | Status verifikasi |
|---|---|---|---|
| BB-01 | Registrasi dengan nama/email/telepon/kata sandi valid | Auth membuat akun dan profil pasien tersimpan | Belum dijalankan: perlu Firebase |
| BB-02 | Registrasi dengan telepon atau kata sandi tidak valid | Form/browser menolak input; tidak ada profil dibuat | Validasi unit lokal; integrasi belum dijalankan |
| BB-03 | Login dengan kredensial valid/tidak valid | Sesi dibuka atau pesan kesalahan tampil | Belum dijalankan: perlu Firebase |
| BB-04 | Pasien memilih poli aktif dan mendaftar | Transaksi mengembalikan nomor dan antrean muncul di riwayat | Tes unit layanan lulus. Uji langsung pengguna: antrean yang didaftarkan pasien muncul di dashboard admin tanpa refresh (26 November 2026); pengujian independen belum dilakukan |
| BB-05 | Dua pendaftaran serentak untuk poli/tanggal sama | Transaksi counter menghasilkan nomor berbeda untuk alur aplikasi normal | Mekanisme transaction diimplementasikan; belum diuji paralel pada Firebase |
| BB-06 | Admin memanggil pasien | Status CALLLED tersinkron di dashboard dan pasien | Belum dijalankan: perlu dua sesi Firebase |
| BB-07 | Petugas menyelesaikan/melewati antrean | Status dan ringkasan berubah; aksi terminal hilang | Aturan transisi diuji pada model; integrasi belum dijalankan |
| BB-08 | Pasien membatalkan antrean WAITING | Status CANCELLED tersinkron; riwayat dipertahankan | Belum dijalankan: perlu Firebase |
| BB-09 | Pasien mencoba membatalkan antrean yang telah dipanggil | Perubahan ditolak oleh alur UI dan Security Rules | Validasi model lokal; rules emulator belum dijalankan |
| BB-10 | Pengguna tanpa UID admin membuka data antrean/admin | Akses seluruh antrean dan operasi poli ditolak | Rules berhasil dipublikasikan; skenario akses belum diuji di Emulator |
| BB-11 | Ubah ukuran layar desktop dan ponsel | Layout beradaptasi tanpa framework | Smoke test browser pasien pada lebar 375 px: tanpa overflow horizontal; autentikasi tetap perlu Firebase |
| BB-12 | Pasien memantau posisi saat status antrean lain berubah | Posisi dihitung dari ringkasan nomor/status dan berubah real-time | Belum dijalankan: perlu Firebase |
| BB-13 | Petugas menambah/mengubah nama dokter dan durasi poli | Data poli tampil di pilihan pasien dan digunakan pada tiket antrean | Tes layanan lokal untuk snapshot poli; integrasi Firebase belum dijalankan |
| BB-14 | Pasien menunggu di antrean | Perkiraan menit dan jam panggilan dihitung dari posisi di depan x rata-rata durasi poli | Tes estimasi lokal lulus; waktu tunggu nyata dapat berbeda |
| BB-15 | Petugas membuat jadwal dokter | Jadwal tersimpan bila poli ditetapkan pada dokter aktif, waktu valid, dan tidak bertabrakan | Validasi model dan konflik jadwal lokal diuji; rules Firebase belum dijalankan di Emulator |
| BB-16 | Petugas membuka direktori pasien | Daftar pasien dapat dibaca admin; akun pasien lain tetap tidak dapat dibaca pasien | Implementasi rules; skenario akses perlu diuji di Emulator |
| BB-17 | Petugas menekan Selanjutnya pada kartu poli | Antrean WAITING dengan urutan terkecil menjadi CALLED dan status tersinkron ke riwayat pasien | Tes transaksi layanan lokal lulus; dua sesi Firebase belum diuji |
| BB-18 | Petugas memilih satu poli dan mengunduh antrean CSV | Satu file berisi data poli dan tanggal terpilih; export semua poli dalam satu file tidak diizinkan | Pembentukan CSV dan penetralan formula diuji lokal; unduhan browser belum diuji pada perangkat pasien |
| BB-19 | Petugas mengaktifkan panggilan otomatis dengan interval valid pada satu poli | Pengaturan tersimpan dan antrean WAITING terawal dipanggil berulang sesuai interval selama dashboard terbuka | Pengaturan interval dan model Poli diuji lokal; timer browser serta sinkronisasi dua perangkat belum dijalankan |

## Pemeriksaan lokal

Jalankan `npm test` di root untuk model OOP, transaksi layanan antrean tiruan, dan transisi status. Uji rules, auth, race condition, serta pembaruan dua sesi menggunakan Firebase Emulator Suite sebelum demonstrasi. Pada paket Spark, client transaction/rules tidak memberi perlindungan anti-penyalahgunaan server-side. Catat versi emulator, tanggal, akun uji non-produksi, dan hasil tiap kasus di tabel.

Uji langsung pengguna pada 26 November 2026 mengonfirmasi antrean pasien muncul di dashboard admin tanpa refresh (BB-04). Pengujian integrasi lainnya belum diklaim selesai.
