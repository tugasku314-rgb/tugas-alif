export class Doctor {
  #id;
  #name;
  #specialty;
  #active;
  #createdAt;

  constructor({ id, name, specialty, active = true, createdAt = 0 }) {
    if (!id || !name || !specialty) throw new Error("Data dokter tidak lengkap.");
    this.#id = id;
    this.#name = String(name).trim();
    this.#specialty = String(specialty).trim();
    this.#active = Boolean(active);
    this.#createdAt = Number(createdAt) || 0;
  }

  get id() { return this.#id; }
  get name() { return this.#name; }
  get specialty() { return this.#specialty; }
  get active() { return this.#active; }
  get createdAt() { return this.#createdAt; }
}
