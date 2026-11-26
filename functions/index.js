import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase, ServerValue } from "firebase-admin/database";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();
const database = getDatabase();

class QueueFunctionService {
  #database;

  constructor(databaseInstance) {
    this.#database = databaseInstance;
  }

  #localDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date);
    const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${fields.year}-${fields.month}-${fields.day}`;
  }

  async register(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Silakan masuk terlebih dahulu.");
    const uid = request.auth.uid;
    const poliId = typeof request.data?.poliId === "string" ? request.data.poliId : "";
    if (!/^[a-z0-9-]{1,60}$/.test(poliId)) {
      throw new HttpsError("invalid-argument", "Data pendaftaran tidak valid.");
    }

    const [profileSnapshot, poliSnapshot] = await Promise.all([
      this.#database.ref(`users/${uid}`).get(),
      this.#database.ref(`poli/${poliId}`).get()
    ]);
    const profile = profileSnapshot.val();
    const poli = poliSnapshot.val();
    if (!profile || profile.role !== "patient") {
      throw new HttpsError("permission-denied", "Profil pasien tidak valid.");
    }
    if (!poli || poli.active !== true) {
      throw new HttpsError("not-found", "Poli tidak ditemukan atau sedang tidak aktif.");
    }
    const poliCode = typeof poli.code === "string" ? poli.code.toUpperCase() : "";
    if (!/^[A-Z0-9]{1,5}$/.test(poliCode)) {
      throw new HttpsError("failed-precondition", "Kode poli belum dikonfigurasi dengan benar.");
    }

    const date = this.#localDateKey();
    const counterRef = this.#database.ref(`pengaturan/nomor/${date}/${poliId}`);
    const allocation = await counterRef.transaction(current => {
      const previous = current === null ? 0 : current;
      return Number.isSafeInteger(previous) && previous >= 0 && previous < 999999
        ? previous + 1
        : undefined;
    });
    if (!allocation.committed) throw new HttpsError("aborted", "Nomor antrean gagal dialokasikan.");

    const sequence = allocation.snapshot.val();
    const number = `${poliCode}-${String(sequence).padStart(3, "0")}`;
    const queueRef = this.#database.ref(`antrean/${date}/${poliId}`).push();
    const queue = {
      uid, patientName: String(profile.name).slice(0, 80),
      phone: String(profile.phone || "").slice(0, 20),
      poliName: String(poli.name).slice(0, 50), number, sequence, date, poliId,
      status: "WAITING", createdAt: ServerValue.TIMESTAMP
    };
    const writes = {};
    writes[`antrean/${date}/${poliId}/${queueRef.key}`] = queue;
    writes[`riwayat_antrean/${uid}/${queueRef.key}`] = queue;
    writes[`ringkasan_antrean/${date}/${poliId}/${queueRef.key}`] = { sequence, status: "WAITING" };
    try {
      await this.#database.ref().update(writes);
    } catch (error) {
      console.error("Queue record write failed after number allocation", { uid, date, poliId, error });
      throw new HttpsError("internal", "Antrean gagal disimpan. Silakan coba kembali.");
    }
    return { id: queueRef.key, number, date, poliName: queue.poliName, status: queue.status };
  }

  async changeStatus(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Silakan masuk terlebih dahulu.");
    const { date, poliId, queueId, status } = request.data || {};
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        typeof poliId !== "string" || !/^[a-z0-9-]{1,60}$/.test(poliId) ||
        typeof queueId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(queueId) ||
        !["CALLED", "DONE", "SKIPPED", "CANCELLED"].includes(status)) {
      throw new HttpsError("invalid-argument", "Perubahan antrean tidak valid.");
    }

    const queuePath = `antrean/${date}/${poliId}/${queueId}`;
    const isAdmin = request.auth.token.admin === true;
    const transition = await this.#database.ref(queuePath).transaction(current => {
      if (!current) return;
      const allowed = isAdmin
        ? ({ WAITING: ["CALLED", "SKIPPED"], CALLED: ["DONE", "SKIPPED"] }[current.status] || []).includes(status)
        : current.uid === request.auth.uid && current.status === "WAITING" && status === "CANCELLED";
      return allowed ? { ...current, status, updatedAt: Date.now() } : undefined;
    });
    if (!transition.committed) {
      if (!transition.snapshot.val()) throw new HttpsError("not-found", "Antrean tidak ditemukan.");
      throw new HttpsError("permission-denied", "Perubahan status tidak diizinkan atau antrean sudah berubah.");
    }
    const queue = transition.snapshot.val();

    const writes = {};
    writes[`${queuePath}/updatedAt`] = queue.updatedAt;
    writes[`riwayat_antrean/${queue.uid}/${queueId}/status`] = status;
    writes[`riwayat_antrean/${queue.uid}/${queueId}/updatedAt`] = queue.updatedAt;
    writes[`ringkasan_antrean/${date}/${poliId}/${queueId}/status`] = status;
    await this.#database.ref().update(writes);
    return { queueId, status };
  }
}

class StaffAccessService {
  #auth;

  constructor(authInstance) {
    this.#auth = authInstance;
  }

  async setRole(request) {
    if (request.auth?.token?.admin !== true) {
      throw new HttpsError("permission-denied", "Hanya petugas admin yang dapat mengelola hak akses.");
    }
    const uid = typeof request.data?.uid === "string" ? request.data.uid : "";
    const enabled = request.data?.enabled !== false;
    if (!uid) throw new HttpsError("invalid-argument", "UID wajib diisi.");
    const user = await this.#auth.getUser(uid);
    await this.#auth.setCustomUserClaims(uid, { ...user.customClaims, admin: enabled });
    return { uid, admin: enabled };
  }
}

const queueService = new QueueFunctionService(database);
const staffAccessService = new StaffAccessService(getAuth());

export const registerQueue = onCall(
  { region: "asia-southeast1", enforceAppCheck: false },
  request => queueService.register(request)
);

export const changeQueueStatus = onCall(
  { region: "asia-southeast1", enforceAppCheck: false },
  request => queueService.changeStatus(request)
);

export const setStaffRole = onCall(
  { region: "asia-southeast1" },
  request => staffAccessService.setRole(request)
);
