import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getDatabase, ref, get, set, update, remove, push, runTransaction,
  onValue, query, orderByChild, equalTo, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { firebaseConfig, isFirebaseConfigured } from "../config.js";

export class FirebaseService {
  #database;
  #auth;

  constructor(config = firebaseConfig) {
    if (!isFirebaseConfigured(config)) {
      throw new Error("Firebase belum dikonfigurasi. Isi kredensial proyek di js/config.js.");
    }
    const app = initializeApp(config);
    this.#database = getDatabase(app);
    this.#auth = getAuth(app);
  }

  get auth() { return this.#auth; }
  ref(path) { return ref(this.#database, path); }
  async get(path) { return get(this.ref(path)); }
  async set(path, value) { return set(this.ref(path), value); }
  async update(path, value) { return update(this.ref(path), value); }
  async remove(path) { return remove(this.ref(path)); }
  async push(path, value) {
    const item = push(this.ref(path));
    await set(item, value);
    return item.key;
  }
  newKey(path) { return push(this.ref(path)).key; }
  async updateRoot(value) { return update(ref(this.#database), value); }
  async transaction(path, updater, applyLocally = false) {
    return runTransaction(this.ref(path), updater, { applyLocally });
  }
  subscribe(path, callback, onError) {
    return onValue(this.ref(path), callback, onError);
  }
  subscribeQuery(path, field, value, callback, onError) {
    return onValue(query(this.ref(path), orderByChild(field), equalTo(value)), callback, onError);
  }
  serverTimestamp() { return serverTimestamp(); }
}
