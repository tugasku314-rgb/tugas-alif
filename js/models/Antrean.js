export const QueueStatus = Object.freeze({
  WAITING: "WAITING",
  CALLED: "CALLED",
  DONE: "DONE",
  SKIPPED: "SKIPPED",
  CANCELLED: "CANCELLED"
});

const transitions = Object.freeze({
  WAITING: new Set(["CALLED", "SKIPPED", "CANCELLED"]),
  CALLED: new Set(["DONE", "SKIPPED"]),
  DONE: new Set(),
  SKIPPED: new Set(),
  CANCELLED: new Set()
});

export class Antrean {
  #id;
  #uid;
  #date;
  #poliId;
  #poliName;
  #number;
  #sequence;
  #patientName;
  #doctorName;
  #averageServiceMinutes;
  #status;
  #createdAt;

  constructor(data) {
    if (!data?.id || !data?.uid || !data?.date || !data?.poliId || !data?.number) {
      throw new Error("Data antrean tidak lengkap.");
    }
    this.#id = data.id;
    this.#uid = data.uid;
    this.#date = data.date;
    this.#poliId = data.poliId;
    this.#poliName = data.poliName || "Poli";
    this.#number = data.number;
    this.#sequence = Number(data.sequence) || 0;
    this.#patientName = data.patientName || "Pasien";
    this.#doctorName = String(data.doctorName || "").trim();
    const rawDuration = data.averageServiceMinutes;
    const duration = Number(rawDuration);
    this.#averageServiceMinutes = rawDuration === undefined || rawDuration === null || rawDuration === ""
      ? null
      : Number.isInteger(duration) && duration >= 1 && duration <= 120 ? duration : 15;
    this.#status = data.status || QueueStatus.WAITING;
    this.#createdAt = Number(data.createdAt) || 0;
  }

  get id() { return this.#id; }
  get uid() { return this.#uid; }
  get date() { return this.#date; }
  get poliId() { return this.#poliId; }
  get poliName() { return this.#poliName; }
  get number() { return this.#number; }
  get sequence() { return this.#sequence; }
  get patientName() { return this.#patientName; }
  get doctorName() { return this.#doctorName; }
  get averageServiceMinutes() { return this.#averageServiceMinutes; }
  get status() { return this.#status; }
  get createdAt() { return this.#createdAt; }

  canTransitionTo(nextStatus) {
    return Boolean(transitions[this.#status]?.has(nextStatus));
  }

  transitionTo(nextStatus) {
    if (!this.canTransitionTo(nextStatus)) {
      throw new Error(`Perubahan status ${this.#status} ke ${nextStatus} tidak diizinkan.`);
    }
    this.#status = nextStatus;
    return this;
  }
}
