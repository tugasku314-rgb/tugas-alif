export class DoctorSchedule {
  #id;
  #doctorId;
  #poliId;
  #dayOfWeek;
  #startTime;
  #endTime;
  #active;

  constructor({ id, doctorId, poliId, dayOfWeek, startTime, endTime, active = true }) {
    if (!id || !doctorId || !poliId || !Number.isInteger(Number(dayOfWeek)) ||
      Number(dayOfWeek) < 0 || Number(dayOfWeek) > 6 ||
      !DoctorSchedule.isTime(startTime) || !DoctorSchedule.isTime(endTime) ||
      startTime >= endTime) {
      throw new Error("Data jadwal dokter tidak valid.");
    }
    this.#id = id;
    this.#doctorId = doctorId;
    this.#poliId = poliId;
    this.#dayOfWeek = Number(dayOfWeek);
    this.#startTime = startTime;
    this.#endTime = endTime;
    this.#active = Boolean(active);
  }

  static isTime(value) {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  get id() { return this.#id; }
  get doctorId() { return this.#doctorId; }
  get poliId() { return this.#poliId; }
  get dayOfWeek() { return this.#dayOfWeek; }
  get startTime() { return this.#startTime; }
  get endTime() { return this.#endTime; }
  get active() { return this.#active; }
}
