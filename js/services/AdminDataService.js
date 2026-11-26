import { Doctor } from "../models/Doctor.js";
import { DoctorSchedule } from "../models/DoctorSchedule.js";
import { Patient } from "../models/Patient.js";

export class AdminDataService {
  #firebase;

  constructor(firebaseService) {
    this.#firebase = firebaseService;
  }

  subscribeDoctors(callback, onError) {
    return this.#firebase.subscribe("dokter", snapshot => {
      const doctors = snapshot.val() || {};
      callback(Object.entries(doctors)
        .map(([id, data]) => new Doctor({ id, ...data }))
        .sort((a, b) => a.name.localeCompare(b.name, "id")));
    }, onError);
  }

  subscribeSchedules(callback, onError) {
    return this.#firebase.subscribe("jadwal_dokter", snapshot => {
      const schedules = snapshot.val() || {};
      callback(Object.entries(schedules)
        .map(([id, data]) => new DoctorSchedule({ id, ...data }))
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)));
    }, onError);
  }

  subscribePatients(callback, onError) {
    return this.#firebase.subscribe("users", snapshot => {
      const users = snapshot.val() || {};
      callback(Object.entries(users)
        .filter(([, data]) => data?.role === "patient")
        .map(([uid, data]) => new Patient({ uid, ...data }))
        .sort((a, b) => a.name.localeCompare(b.name, "id")));
    }, onError);
  }

  async saveDoctor({ name, specialty }, id = null) {
    name = String(name || "").trim().replace(/\s+/g, " ");
    specialty = String(specialty || "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 80) throw new Error("Nama dokter harus terdiri dari 2–80 karakter.");
    if (specialty.length < 2 || specialty.length > 80) throw new Error("Spesialisasi harus terdiri dari 2–80 karakter.");
    const doctorId = id || this.#firebase.newKey("dokter");
    const existing = id ? (await this.#firebase.get(`dokter/${id}`)).val() : null;
    await this.#firebase.set(`dokter/${doctorId}`, {
      name, specialty, active: existing?.active !== false,
      createdAt: existing?.createdAt || this.#firebase.serverTimestamp()
    });
    return doctorId;
  }

  async setDoctorActive(id, active) {
    await this.#firebase.update(`dokter/${id}`, { active: Boolean(active) });
  }

  async saveSchedule({ doctorId, poliId, dayOfWeek, startTime, endTime }, id = null) {
    const candidateId = id || this.#firebase.newKey("jadwal_dokter");
    const candidate = new DoctorSchedule({
      id: candidateId, doctorId, poliId, dayOfWeek, startTime, endTime
    });
    const [doctorSnapshot, poliSnapshot] = await Promise.all([
      this.#firebase.get(`dokter/${candidate.doctorId}`),
      this.#firebase.get(`poli/${candidate.poliId}`)
    ]);
    const doctor = doctorSnapshot.val();
    const poli = poliSnapshot.val();
    if (!doctor || doctor.active !== true) throw new Error("Pilih dokter yang aktif.");
    if (!poli || poli.active !== true || poli.doctorId !== candidate.doctorId) {
      throw new Error("Dokter harus ditetapkan pada poli aktif sebelum membuat jadwal.");
    }
    let overlaps = false;
    const transaction = await this.#firebase.transaction("jadwal_dokter", current => {
      const schedules = current || {};
      const existing = id ? schedules[id] : null;
      if (id && !existing) return undefined;
      const active = existing?.active !== false;
      overlaps = active && Object.entries(schedules).some(([scheduleId, schedule]) =>
        scheduleId !== id && schedule.active !== false &&
        schedule.doctorId === candidate.doctorId &&
        Number(schedule.dayOfWeek) === candidate.dayOfWeek &&
        schedule.startTime < candidate.endTime && candidate.startTime < schedule.endTime
      );
      if (overlaps) return undefined;
      return {
        ...schedules,
        [candidateId]: {
          doctorId: candidate.doctorId,
          poliId: candidate.poliId,
          dayOfWeek: candidate.dayOfWeek,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          active,
          createdAt: existing?.createdAt || this.#firebase.serverTimestamp()
        }
      };
    });
    if (!transaction.committed) {
      if (overlaps) throw new Error("Jadwal dokter bertabrakan dengan jadwal lain pada hari tersebut.");
      throw new Error("Jadwal gagal disimpan atau telah berubah. Coba kembali.");
    }
  }

  async setScheduleActive(id, active) {
    let overlaps = false;
    let invalidAssignment = false;
    let scheduleSnapshotDoctorId = null;
    let scheduleSnapshotPoliId = null;
    if (active) {
      const scheduleSnapshot = await this.#firebase.get(`jadwal_dokter/${id}`);
      const schedule = scheduleSnapshot.val();
      if (!schedule) throw new Error("Jadwal dokter tidak ditemukan.");
      scheduleSnapshotDoctorId = schedule.doctorId;
      scheduleSnapshotPoliId = schedule.poliId;
      const [doctorSnapshot, poliSnapshot] = await Promise.all([
        this.#firebase.get(`dokter/${schedule.doctorId}`),
        this.#firebase.get(`poli/${schedule.poliId}`)
      ]);
      const doctor = doctorSnapshot.val();
      const poli = poliSnapshot.val();
      if (!doctor || doctor.active !== true || !poli || poli.active !== true ||
        poli.doctorId !== schedule.doctorId) {
        throw new Error("Aktifkan dokter dan poli yang sesuai sebelum mengaktifkan jadwal.");
      }
    }
    const transaction = await this.#firebase.transaction("jadwal_dokter", current => {
      const schedules = current || {};
      const schedule = schedules[id];
      if (!schedule) return undefined;
      if (active) {
        invalidAssignment = schedule.doctorId !== scheduleSnapshotDoctorId ||
          schedule.poliId !== scheduleSnapshotPoliId;
        overlaps = Object.entries(schedules).some(([scheduleId, other]) =>
          scheduleId !== id && other.active !== false &&
          other.doctorId === schedule.doctorId &&
          Number(other.dayOfWeek) === Number(schedule.dayOfWeek) &&
          other.startTime < schedule.endTime && schedule.startTime < other.endTime
        );
        if (invalidAssignment || overlaps) return undefined;
      }
      return { ...schedules, [id]: { ...schedule, active: Boolean(active) } };
    });
    if (!transaction.committed) {
      if (overlaps) throw new Error("Jadwal dokter bertabrakan dengan jadwal lain pada hari tersebut.");
      if (invalidAssignment) throw new Error("Jadwal berubah. Muat ulang sebelum mengaktifkannya.");
      throw new Error("Status jadwal tidak dapat diperbarui.");
    }
  }
}
