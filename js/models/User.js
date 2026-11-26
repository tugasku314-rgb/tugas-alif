export class User {
  #uid;
  #name;
  #email;

  constructor({ uid, name, email }) {
    if (!uid || !name || !email) throw new Error("Informasi akun tidak lengkap.");
    this.#uid = uid;
    this.#name = name;
    this.#email = email;
  }

  get uid() { return this.#uid; }
  get name() { return this.#name; }
  get email() { return this.#email; }
}
