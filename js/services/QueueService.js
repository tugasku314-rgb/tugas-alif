import { Antrean, QueueStatus } from "../models/Antrean.js";
import { Poli } from "../models/Poli.js";
import { adminUid } from "../config.js";
import { todayKey } from "../utils.js";

export class QueueService {
  #firebase;

  constructor(firebaseService) {
    this.#firebase = firebaseService;
  }

  subscribePoli(callback, onError) {
    return this.#firebase.subscribe("poli", snapshot => {
      const value = snapshot.val() || {};
      callback(Object.entries(value).map(([id, data]) => new Poli({ id, ...data }))
        .sort((a, b) => a.name.localeCompare(b.name, "id")));
    }, onError);
  }

  async register({ poliId }) {
    if (!poliId) throw new Error("Pilih poli tujuan.");
    const user = this.#firebase.auth.currentUser;
    if (!user) throw new Error("Silakan masuk terlebih dahulu.");

    const [profileSnapshot, poliSnapshot] = await Promise.all([
      this.#firebase.get(`users/${user.uid}`),
      this.#firebase.get(`poli/${poliId}`)
    ]);
    const profile = profileSnapshot.val();
    const poli = poliSnapshot.val();
    if (!profile || profile.role !== "patient") throw new Error("Profil pasien tidak valid.");
    if (!poli || poli.active !== true) throw new Error("Poli tidak ditemukan atau sedang tidak aktif.");
    if (typeof poli.code !== "string" || !/^[A-Z0-9]{1,5}$/.test(poli.code)) {
      throw new Error("Kode poli belum dikonfigurasi dengan benar.");
    }
    let doctorName = String(poli.doctorName || "").trim();
    if (poli.doctorId) {
      const doctor = (await this.#firebase.get(`dokter/${poli.doctorId}`)).val();
      if (!doctor || doctor.active !== true) throw new Error("Dokter poli sedang tidak aktif. Hubungi petugas.");
      doctorName = String(doctor.name || "").trim();
    }

    const date = todayKey();
    const allocation = await this.#firebase.transaction(`pengaturan/nomor/${date}/${poliId}`, current => {
      const previous = current === null ? 0 : current;
      return Number.isSafeInteger(previous) && previous >= 0 && previous < 999999
        ? previous + 1
        : undefined;
    });
    if (!allocation.committed) throw new Error("Nomor antrean gagal dialokasikan.");

    const sequence = allocation.snapshot.val();
    const id = this.#firebase.newKey(`antrean/${date}/${poliId}`);
    const number = `${poli.code}-${String(sequence).padStart(3, "0")}`;
    const queue = {
      uid: user.uid,
      patientName: String(profile.name).slice(0, 80),
      phone: String(profile.phone || "").slice(0, 20),
      poliName: String(poli.name).slice(0, 50),
      doctorName: doctorName.slice(0, 80),
      averageServiceMinutes: Number.isInteger(Number(poli.averageServiceMinutes)) &&
        Number(poli.averageServiceMinutes) >= 1 && Number(poli.averageServiceMinutes) <= 120
        ? Number(poli.averageServiceMinutes)
        : 15,
      number,
      sequence,
      date,
      poliId,
      status: QueueStatus.WAITING,
      createdAt: this.#firebase.serverTimestamp()
    };
    const writes = {};
    writes[`antrean/${date}/${poliId}/${id}`] = queue;
    writes[`riwayat_antrean/${user.uid}/${id}`] = queue;
    writes[`ringkasan_antrean/${date}/${poliId}/${id}`] = {
      sequence, status: QueueStatus.WAITING
    };
    await this.#firebase.updateRoot(writes);
    return { id, number, date, poliName: queue.poliName, status: queue.status };
  }

  subscribePatient(uid, callback, onError) {
    return this.#firebase.subscribe(`riwayat_antrean/${uid}`, snapshot => {
      const value = snapshot.val() || {};
      callback(Object.entries(value).map(([id, data]) => new Antrean({ id, ...data }))
        .sort((a, b) => b.createdAt - a.createdAt));
    }, onError);
  }

  subscribePosition(date, poliId, callback, onError) {
    return this.#firebase.subscribe(`ringkasan_antrean/${date}/${poliId}`, snapshot => {
      callback(snapshot.val() || {});
    }, onError);
  }

  subscribeDate(date, callback, onError) {
    return this.#firebase.subscribe(`antrean/${date}`, snapshot => {
      const result = [];
      const clinics = snapshot.val() || {};
      for (const [poliId, queues] of Object.entries(clinics)) {
        for (const [id, data] of Object.entries(queues || {})) {
          if (data && typeof data === "object" && data.number) {
            result.push(new Antrean({ id, date, poliId, ...data }));
          }
        }
      }
      callback(result.sort((a, b) => a.createdAt - b.createdAt));
    }, onError);
  }

  async callNext(date, poliId) {
    const user = this.#firebase.auth.currentUser;
    if (!user) throw new Error("Silakan masuk terlebih dahulu.");
    if (user.uid !== adminUid) throw new Error("Hanya petugas yang dapat memanggil antrean.");

    let selectedId = null;
    let noWaitingQueues = false;
    const transaction = await this.#firebase.transaction(`antrean/${date}/${poliId}`, current => {
      const queues = current || {};
      const next = Object.entries(queues)
        .filter(([, queue]) => queue?.status === QueueStatus.WAITING)
        .sort(([, a], [, b]) => Number(a.sequence) - Number(b.sequence))[0];
      if (!next) {
        noWaitingQueues = true;
        return undefined;
      }

      const [id, queue] = next;
      try {
        new Antrean({ id, date, poliId, ...queue }).transitionTo(QueueStatus.CALLED);
      } catch {
        return undefined;
      }
      selectedId = id;
      return {
        ...queues,
        [id]: { ...queue, status: QueueStatus.CALLED, updatedAt: Date.now() }
      };
    });
    if (!transaction.committed) {
      if (noWaitingQueues) return null;
      throw new Error("Antrean berikutnya gagal dipanggil. Muat ulang dan coba kembali.");
    }

    const updated = transaction.snapshot.val()?.[selectedId];
    if (!updated) throw new Error("Data antrean yang dipanggil tidak ditemukan.");
    const writes = {};
    writes[`riwayat_antrean/${updated.uid}/${selectedId}/status`] = QueueStatus.CALLED;
    writes[`riwayat_antrean/${updated.uid}/${selectedId}/updatedAt`] = updated.updatedAt;
    writes[`ringkasan_antrean/${date}/${poliId}/${selectedId}/status`] = QueueStatus.CALLED;
    await this.#firebase.updateRoot(writes);
    return new Antrean({ id: selectedId, date, poliId, ...updated });
  }

  async changeStatus(queue, nextStatus) {
    if (!Object.values(QueueStatus).includes(nextStatus)) throw new Error("Status antrean tidak dikenal.");
    const user = this.#firebase.auth.currentUser;
    if (!user) throw new Error("Silakan masuk terlebih dahulu.");
    const isAdmin = user.uid === adminUid;
    if (isAdmin && ![QueueStatus.CALLED, QueueStatus.DONE, QueueStatus.SKIPPED].includes(nextStatus)) {
      throw new Error("Status tersebut tidak dapat ditetapkan oleh petugas.");
    }

    const queuePath = `antrean/${queue.date}/${queue.poliId}/${queue.id}`;
    const transition = await this.#firebase.transaction(queuePath, current => {
      if (!current) return undefined;
      if (!isAdmin && (user.uid !== current.uid || nextStatus !== QueueStatus.CANCELLED)) {
        return undefined;
      }
      try {
        new Antrean({ id: queue.id, date: queue.date, poliId: queue.poliId, ...current })
          .transitionTo(nextStatus);
      } catch {
        return undefined;
      }
      return { ...current, status: nextStatus, updatedAt: Date.now() };
    });
    if (!transition.committed) {
      throw new Error("Perubahan status ditolak atau antrean sudah berubah.");
    }

    const updated = transition.snapshot.val();
    const writes = {};
    writes[`riwayat_antrean/${updated.uid}/${queue.id}/status`] = nextStatus;
    writes[`riwayat_antrean/${updated.uid}/${queue.id}/updatedAt`] = updated.updatedAt;
    writes[`ringkasan_antrean/${queue.date}/${queue.poliId}/${queue.id}/status`] = nextStatus;
    await this.#firebase.updateRoot(writes);
    return new Antrean({ id: queue.id, date: queue.date, poliId: queue.poliId, ...updated });
  }

}
