import { User } from "./User.js";

export class Patient extends User {
  #phone;

  constructor({ uid, name, email, phone = "" }) {
    super({ uid, name, email });
    this.#phone = phone;
  }

  get phone() { return this.#phone; }
}
