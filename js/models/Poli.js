export class Poli {
  #id;
  #name;
  #code;
  #active;
  #doctorId;
  #doctorName;
  #averageServiceMinutes;
  #autoCallEnabled;
  #autoCallIntervalMinutes;

  constructor({ id, name, code = "", active = true, doctorId = "", doctorName = "", averageServiceMinutes = 15,
    autoCallEnabled = false, autoCallIntervalMinutes = 15 }) {
    if (!id || !name) throw new Error("Data poli tidak lengkap.");
    this.#id = id;
    this.#name = name;
    this.#code = code;
    this.#active = Boolean(active);
    this.#doctorId = String(doctorId || "");
    this.#doctorName = String(doctorName || "").trim();
    const duration = Number(averageServiceMinutes);
    this.#averageServiceMinutes = Number.isInteger(duration) && duration >= 1 && duration <= 120
      ? duration
      : 15;
    this.#autoCallEnabled = Boolean(autoCallEnabled);
    const interval = Number(autoCallIntervalMinutes);
    this.#autoCallIntervalMinutes = Number.isInteger(interval) && interval >= 1 && interval <= 120
      ? interval
      : 15;
  }

  get id() { return this.#id; }
  get name() { return this.#name; }
  get code() { return this.#code; }
  get active() { return this.#active; }
  get doctorId() { return this.#doctorId; }
  get doctorName() { return this.#doctorName; }
  get averageServiceMinutes() { return this.#averageServiceMinutes; }
  get autoCallEnabled() { return this.#autoCallEnabled; }
  get autoCallIntervalMinutes() { return this.#autoCallIntervalMinutes; }
}
