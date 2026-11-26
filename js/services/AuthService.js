import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { adminUid } from "../config.js";

export class AuthService {
  #firebase;

  constructor(firebaseService) {
    this.#firebase = firebaseService;
  }

  async register({ name, phone, email, password }) {
    const cleanName = String(name || "").trim();
    const cleanPhone = String(phone || "").trim();
    if (cleanName.length < 2 || cleanName.length > 80) throw new Error("Nama harus terdiri dari 2–80 karakter.");
    if (!/^[0-9+() -]{8,20}$/.test(cleanPhone)) throw new Error("Format nomor telepon tidak valid.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Format email tidak valid.");
    if (String(password).length < 8) throw new Error("Kata sandi minimal 8 karakter.");
    const credential = await createUserWithEmailAndPassword(this.#firebase.auth, email.trim(), password);
    try {
      await this.#firebase.set(`users/${credential.user.uid}`, {
        name: cleanName, phone: cleanPhone, email: email.trim().toLowerCase(),
        role: "patient", createdAt: this.#firebase.serverTimestamp()
      });
    } catch (error) {
      await credential.user.delete();
      throw error;
    }
    return credential.user;
  }

  async signIn(email, password) {
    if (!email || !password) throw new Error("Email dan kata sandi wajib diisi.");
    return signInWithEmailAndPassword(this.#firebase.auth, email.trim(), password);
  }

  async signOut() { return signOut(this.#firebase.auth); }
  onChange(callback, onError) { return onAuthStateChanged(this.#firebase.auth, callback, onError); }

  async isAdmin(user) {
    return user?.uid === adminUid;
  }
}
