# Arsitektur dan UML

## Arsitektur

Frontend berupa ES modules Vanilla JavaScript; modul Firebase JS SDK v11 digunakan melalui CDN. Firebase Authentication mengelola kredensial. Realtime Database menyimpan profil, poli, dokter, jadwal dokter, antrean kanonis, indeks riwayat pasien, ringkasan status tanpa PII, dan counter. Pada konfigurasi Spark gratis, `QueueService` memakai transaksi dan multi-location update dari klien; Security Rules membatasi akses pasien dan satu UID admin tetap yang disetel di konfigurasi proyek. Listener `onValue` dilepas saat sesi berubah.

Tiket menyimpan salinan nama dokter serta rata-rata durasi poli saat pasien mendaftar, agar riwayat tidak berubah saat pengaturan master diperbarui. Beranda menampilkan antrean terakhir yang dipanggil per poli; `QueueService.callNext` memakai transaksi pada antrean poli untuk memanggil urutan WAITING terawal dan memperbarui riwayat serta ringkasan. Jadwal dokter disimpan sebagai entitas terpisah dan tidak membatasi pendaftaran antrean berdasarkan jam. Estimasi panggilan pasien dihitung dari jumlah antrean aktif di depan dikalikan rata-rata menit per pasien, dan ditampilkan sebagai durasi serta perkiraan jam. Nilainya indikatif, bukan janji waktu layanan.

**Batasan demo gratis:** alokasi nomor yang menggunakan aplikasi normal diserialisasi dengan transaksi Realtime Database. Karena tidak ada backend tepercaya/rate limiting pada Spark, pengguna yang memodifikasi klien dapat menaikkan counter berulang kali atau mengganggu ringkasan. Jangan gunakan data pasien nyata atau operasi klinis produksi.

## Use case

```mermaid
flowchart LR
  Patient([Pasien]) --> Register[Registrasi / masuk]
  Patient --> Book[Daftar antrean dan pilih poli]
  Patient --> Track[Pantau nomor, posisi, status]
  Patient --> History[Lihat riwayat]
  Patient --> Cancel[Batalkan antrean menunggu]
  Staff([Petugas admin]) --> SignIn[Masuk dengan hak admin]
  Staff --> Monitor[Lihat seluruh antrean]
  Staff --> Call[Panggil pasien dari beranda]
  Staff --> Update[Ubah status: selesai / lewati]
  Staff --> Poli[Kelola data poli]
  Staff --> Doctor[Kelola data dokter]
  Staff --> Schedule[Kelola jadwal dokter]
  Staff --> Patients[Lihat data pasien]
  Book --> Auth[(Firebase Auth)]
  Book --> DB[(Realtime Database)]
  Monitor --> DB
  Update --> DB
```

## Activity — pendaftaran antrean

```mermaid
flowchart TD
  A([Mulai]) --> B{Sudah masuk?}
  B -- Tidak --> C[Registrasi atau masuk]
  C --> B
  B -- Ya --> D[Pilih poli aktif]
  D --> E{Input valid?}
  E -- Tidak --> D
  E -- Ya --> F[QueueService validasi profil dan poli]
  F --> G[Realtime Database transaction pada counter]
  G --> H[Tulis antrean, riwayat, dan ringkasan]
  H --> I[onValue memperbarui antrean, riwayat, dan posisi]
  I --> J([Selesai])
```

## Sequence — sinkronisasi pemanggilan

![Sequence diagram sinkronisasi status dari petugas ke pasien](./images/sequence-realtime.svg)

```mermaid
sequenceDiagram
  actor Petugas
  participant AdminUI
  participant RTDB
  participant ListenerPasien
  participant PasienUI
  Petugas->>AdminUI: Panggil nomor antrean
  AdminUI->>RTDB: transaction status + multi-location update
  RTDB-->>ListenerPasien: onValue event
  ListenerPasien->>PasienUI: render status terbaru
  RTDB-->>AdminUI: onValue event
  AdminUI->>AdminUI: render daftar dan ringkasan
```

## Sequence — daftar antrean dan nomor unik

![Sequence diagram registrasi dan alokasi nomor antrean](./images/sequence-pendaftaran.svg)

```mermaid
sequenceDiagram
  actor Pasien
  participant UI as PatientApp
  participant Auth as Firebase Auth
  participant QS as QueueService
  participant FS as FirebaseService
  participant DB as Realtime Database
  participant AdminUI
  Pasien->>UI: Isi registrasi dan submit
  UI->>Auth: Buat akun email/kata sandi
  Auth-->>UI: UID pengguna
  UI->>DB: Simpan profil pasien tanpa kata sandi
  Pasien->>UI: Pilih poli dan ambil antrean
  UI->>QS: register(poliId)
  QS->>DB: Baca profil dan poli aktif
  QS->>FS: transaction(counter, increment)
  FS->>DB: Transaction counter tanggal + poli
  DB-->>FS: Nomor urut
  FS-->>QS: Nomor urut
  QS->>DB: Simpan antrean + riwayat + ringkasan
  QS-->>UI: Tampilkan tiket antrean
  DB-->>UI: onValue pada riwayat/ringkasan
  DB-->>AdminUI: onValue pada antrean hari terpilih
```

## Class diagram (sesuai implementasi)

![Class diagram sistem antrean berbasis OOP](./images/class-diagram.svg)

```mermaid
classDiagram
  class User {
    -uid
    -name
    -email
    +uid
    +name
    +email
  }
  class Patient {
    -phone
    +phone
  }
  class Admin {
    +canManageQueues()
  }
  class Antrean {
    +id
    +uid
    +date
    +poliId
    +number
    +status
    +canTransitionTo(status)
    +transitionTo(status)
  }
  class Poli {
    +id
    +name
    +code
    +active
  }
  class Doctor {
    +id
    +name
    +specialty
    +active
  }
  class DoctorSchedule {
    +id
    +doctorId
    +poliId
    +dayOfWeek
    +startTime
    +endTime
    +active
  }
  class AdminDataService {
    +subscribeDoctors(callback,onError)
    +subscribeSchedules(callback,onError)
    +subscribePatients(callback,onError)
    +saveDoctor(data,id)
    +saveSchedule(data,id)
  }
  class FirebaseService {
    +get(path)
    +set(path,value)
    +update(path,value)
    +updateRoot(value)
    +newKey(path)
    +transaction(path,updater)
    +subscribe(path,callback)
  }
  class AuthService {
    +register(data)
    +signIn(email,password)
    +signOut()
    +isAdmin(user)
  }
  class QueueService {
    +register(data)
    +callNext(date,poliId)
    +subscribePatient(uid,callback)
    +subscribeDate(date,callback)
    +subscribePosition(date,poliId,callback)
    +changeStatus(queue,status)
  }
  class FirebaseAuthSDK
  class RealtimeDatabaseSDK
  class PatientApp
  class AdminApp
  User <|-- Patient
  User <|-- Admin
  Patient "1" --> "*" Antrean
  Poli "1" --> "*" Antrean
  Doctor "1" --> "*" DoctorSchedule
  Poli "1" --> "*" DoctorSchedule
  AdminDataService --> Doctor
  AdminDataService --> DoctorSchedule
  AdminDataService --> Patient
  AdminApp --> AdminDataService
  AuthService --> FirebaseService
  QueueService --> FirebaseService
  AuthService ..> FirebaseAuthSDK
  FirebaseService ..> RealtimeDatabaseSDK
  PatientApp --> AuthService
  PatientApp --> QueueService
  AdminApp --> AuthService
  AdminApp --> QueueService
```

## ERD / model Realtime Database

![ERD dan struktur Firebase Realtime Database](./images/erd-database.svg)

```mermaid
erDiagram
  USERS ||--o{ RIWAYAT_ANTREAN : memiliki
  POLI ||--o{ ANTREAN : melayani
  DOKTER ||--o{ JADWAL_DOKTER : memiliki
  POLI ||--o{ JADWAL_DOKTER : melayani
  USERS {
    string uid PK
    string name
    string email
    string phone
    string role
  }
  POLI {
    string poliId PK
    string name
    string code
    string doctorId FK
    number averageServiceMinutes
    boolean active
  }
  DOKTER {
    string doctorId PK
    string name
    string specialty
    boolean active
  }
  JADWAL_DOKTER {
    string scheduleId PK
    string doctorId FK
    string poliId FK
    number dayOfWeek
    string startTime
    string endTime
    boolean active
  }
  ANTREAN {
    string date PK
    string poliId PK
    string queueId PK
    string uid FK
    string number
    string doctorName
    number averageServiceMinutes
    string status
    number createdAt
  }
  RINGKASAN_ANTREAN {
    string date PK
    string poliId PK,FK
    string queueId PK
    number sequence
    string status
  }
  RIWAYAT_ANTREAN {
    string uid PK,FK
    string queueId PK
    string number
    string status
    string date
  }
  PENGATURAN {
    string date PK
    string poliId PK
    number nextNumber
  }
```

## Flowchart status antrean

```mermaid
stateDiagram-v2
  [*] --> WAITING
  WAITING --> CALLED: Petugas memanggil
  WAITING --> SKIPPED: Petugas melewati
  WAITING --> CANCELLED: Pasien membatalkan
  CALLED --> DONE: Pelayanan selesai
  CALLED --> SKIPPED: Petugas melewati
  DONE --> [*]
  SKIPPED --> [*]
  CANCELLED --> [*]
```

`ringkasan_antrean/{tanggal}/{poliId}/{queueId}` berisi hanya `sequence` dan `status`. Pasien terautentikasi membacanya untuk menghitung posisi tanpa akses ke identitas, kontak, atau catatan pasien lain.

## Flowchart sistem

![Flowchart sistem dari autentikasi sampai sinkronisasi](./images/alur-sistem.svg)

```mermaid
flowchart TD
  A([Buka aplikasi]) --> B{Sudah terautentikasi?}
  B -- Tidak --> C[Registrasi / masuk]
  C --> D{Login berhasil?}
  D -- Tidak --> C
  D -- Ya --> E{UID admin terdaftar?}
  B -- Ya --> E
  E -- Tidak --> P[Dashboard pasien]
  P --> P1[Pilih poli aktif]
  P1 --> P2[Klien + transaksi counter]
  P2 --> DB[(Realtime Database)]
  E -- Ya --> A1[Dashboard petugas]
  A1 --> A2[Pantau antrean real-time]
  A2 --> A3[Panggil / selesai / lewati / kelola poli]
  A3 --> DB
  DB --> L[Listener onValue]
  L --> P
  L --> A1
  P --> X[Riwayat / batalkan antrean menunggu]
  X --> DB
```
