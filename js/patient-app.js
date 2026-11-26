import { FirebaseService } from "./services/FirebaseService.js";
import { AuthService } from "./services/AuthService.js";
import { QueueService } from "./services/QueueService.js";
import { Patient } from "./models/Patient.js";
import { QueueStatus } from "./models/Antrean.js";
import { escapeHtml, formatDate, showNotice, hideNotice, setBusy, errorMessage, todayKey, estimateWait, bindPasswordToggles } from "./utils.js";

class PatientApp {
  #firebase;
  #auth;
  #queues;
  #user = null;
  #profile = null;
  #unsubscribeHistory = null;
  #unsubscribePoli = null;
  #positionUnsubscribers = [];
  #positionSummaries = new Map();
  #history = [];
  #poli = [];

  constructor() {
    bindPasswordToggles();
    const notice = document.querySelector("#notice");
    try {
      this.#firebase = new FirebaseService();
      this.#auth = new AuthService(this.#firebase);
      this.#queues = new QueueService(this.#firebase);
    } catch (error) {
      showNotice(notice, error.message, "info");
      this.#bindForms(false);
      return;
    }
    this.#bindForms(true);
    this.#auth.onChange(user => this.#onAuth(user), error => showNotice(notice, errorMessage(error), "error"));
  }

  #bindForms(ready) {
    const login = document.querySelector("#login-form");
    const register = document.querySelector("#register-form");
    login.addEventListener("submit", event => this.#submit(event, login, async form => {
      await this.#auth.signIn(form.get("email"), form.get("password"));
    }));
    register.addEventListener("submit", event => this.#submit(event, register, async form => {
      await this.#auth.register({
        name: form.get("name"), phone: form.get("phone"),
        email: form.get("email"), password: form.get("password")
      });
      showNotice(document.querySelector("#notice"), "Akun berhasil dibuat. Selamat datang!", "success");
    }));
    document.querySelector("#queue-form").addEventListener("submit", event => this.#registerQueue(event));
    document.querySelector("#patient-logout").addEventListener("click", () => this.#auth.signOut());
    if (!ready) {
      login.querySelector("button").disabled = true;
      register.querySelector("button").disabled = true;
    }
  }

  async #submit(event, form, action) {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    const notice = document.querySelector("#notice");
    hideNotice(notice);
    setBusy(button, true);
    try {
      await action(new FormData(form));
      form.reset();
    } catch (error) {
      showNotice(notice, errorMessage(error), "error");
    } finally {
      setBusy(button, false);
    }
  }

  async #onAuth(user) {
    this.#releaseListeners();
    this.#user = user;
    const account = document.querySelector(".account-section");
    const app = document.querySelector("#patient-app");
    const landingSections = [
      document.querySelector("#landing-hero"),
      document.querySelector("#landing-features")
    ];
    if (!user) {
      this.#profile = null;
      this.#history = [];
      account.hidden = false;
      app.hidden = true;
      landingSections.forEach(section => { section.hidden = false; });
      this.#renderHistory();
      return;
    }
    try {
      if (await this.#auth.isAdmin(user)) {
        window.location.assign("admin.html");
        return;
      }
      const snapshot = await this.#firebase.get(`users/${user.uid}`);
      const data = snapshot.val();
      if (!data || data.role !== "patient") throw new Error("Profil pasien tidak ditemukan. Silakan hubungi petugas.");
      this.#profile = new Patient({ uid: user.uid, ...data });
      account.hidden = true;
      app.hidden = false;
      landingSections.forEach(section => { section.hidden = true; });
      document.querySelector("#patient-name").textContent = this.#profile.name;
      this.#unsubscribeHistory = this.#queues.subscribePatient(
        user.uid, entries => this.#onHistory(entries),
        error => showNotice(document.querySelector("#notice"), errorMessage(error), "error")
      );
      this.#unsubscribePoli = this.#queues.subscribePoli(poli => this.#renderPoli(poli),
        error => showNotice(document.querySelector("#notice"), errorMessage(error), "error"));
    } catch (error) {
      showNotice(document.querySelector("#notice"), errorMessage(error), "error");
      account.hidden = false;
      app.hidden = true;
      await this.#auth.signOut();
    }
  }

  #releaseListeners() {
    this.#unsubscribeHistory?.();
    this.#unsubscribePoli?.();
    this.#positionUnsubscribers.forEach(unsubscribe => unsubscribe());
    this.#positionUnsubscribers = [];
    this.#positionSummaries.clear();
    this.#unsubscribeHistory = null;
    this.#unsubscribePoli = null;
  }

  #renderPoli(poliList) {
    this.#poli = poliList;
    const select = document.querySelector("#queue-poli");
    const previous = select.value;
    const activePoli = poliList.filter(poli => poli.active);
    select.innerHTML = `<option value="">Pilih poli tujuan</option>${activePoli.map(poli =>
      `<option value="${escapeHtml(poli.id)}">${escapeHtml(poli.name)}</option>`).join("")}`;
    if (activePoli.some(poli => poli.id === previous)) select.value = previous;
    select.disabled = activePoli.length === 0;
    if (!activePoli.length) select.innerHTML = '<option value="">Belum ada poli aktif</option>';
    this.#renderTickets();
  }

  #onHistory(entries) {
    this.#history = entries;
    this.#positionUnsubscribers.forEach(unsubscribe => unsubscribe());
    this.#positionUnsubscribers = [];
    this.#positionSummaries.clear();
    const today = todayKey();
    const todayPoliIds = new Set(entries
      .filter(queue => queue.date === today &&
        [QueueStatus.WAITING, QueueStatus.CALLED].includes(queue.status))
      .map(queue => queue.poliId));
    for (const poliId of todayPoliIds) {
      const unsubscribe = this.#queues.subscribePosition(today, poliId, summary => {
        this.#positionSummaries.set(poliId, summary);
        this.#renderTickets();
      }, error => showNotice(document.querySelector("#notice"), errorMessage(error), "error"));
      this.#positionUnsubscribers.push(unsubscribe);
    }
    this.#renderHistory();
    this.#renderTickets();
  }

  #renderHistory() {
    const tbody = document.querySelector("#history-rows");
    if (!this.#history.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Belum ada riwayat.</td></tr>';
      return;
    }
    tbody.innerHTML = this.#history.slice(0, 20).map(queue =>
      `<tr><td><strong>${escapeHtml(queue.number)}</strong></td><td>${escapeHtml(queue.poliName)}</td><td>${escapeHtml(queue.doctorName || this.#poli.find(poli => poli.id === queue.poliId)?.doctorName || "Belum ditentukan")}</td><td>${escapeHtml(formatDate(queue.date))}</td><td><span class="status-pill status-${queue.status}">${this.#statusLabel(queue.status)}</span></td></tr>`
    ).join("");
  }

  #renderTickets() {
    const container = document.querySelector("#my-queues");
    const today = todayKey();
    const active = this.#history.filter(queue =>
      queue.date === today && ![QueueStatus.DONE, QueueStatus.SKIPPED, QueueStatus.CANCELLED].includes(queue.status));
    if (!active.length) {
      container.innerHTML = '<p class="empty-state">Belum ada antrean aktif hari ini. Anda dapat mendaftar di formulir.</p>';
      return;
    }
    container.innerHTML = active.map(queue => {
      const summary = this.#positionSummaries.get(queue.poliId) || {};
      const position = Object.values(summary).filter(other =>
        Number(other.sequence) < queue.sequence &&
        [QueueStatus.WAITING, QueueStatus.CALLED].includes(other.status)).length;
      const poli = this.#poli.find(item => item.id === queue.poliId);
      const doctorName = queue.doctorName || poli?.doctorName || "Belum ditentukan";
      const averageServiceMinutes = queue.averageServiceMinutes || poli?.averageServiceMinutes || 15;
      const estimate = estimateWait(position, averageServiceMinutes);
      const canCancel = queue.status === QueueStatus.WAITING;
      const waitInfo = queue.status === QueueStatus.CALLED
        ? `<div class="ticket-position ticket-called">Nomor Anda dipanggil. Silakan menuju poli.</div>`
        : `<div class="ticket-position">Posisi antrean: <strong>${position + 1}</strong><span>Perkiraan tunggu ${estimate.minutes} menit · dipanggil sekitar ${estimate.time}</span></div>`;
      return `<article class="queue-ticket"><div class="ticket-top"><div><div class="ticket-number">${escapeHtml(queue.number)}</div><div class="ticket-poli">${escapeHtml(queue.poliName)}</div></div><span class="status-pill status-${queue.status}">${this.#statusLabel(queue.status)}</span></div><div class="ticket-meta">Tanggal daftar: ${escapeHtml(formatDate(queue.date))}</div><div class="ticket-doctor">Dokter: <strong>${escapeHtml(doctorName)}</strong></div>${waitInfo}${canCancel ? `<div class="ticket-actions"><button class="text-button" data-cancel="${escapeHtml(queue.id)}">Batalkan antrean</button></div>` : ""}</article>`;
    }).join("");
    container.querySelectorAll("[data-cancel]").forEach(button =>
      button.addEventListener("click", () => this.#cancelQueue(button.dataset.cancel)));
  }

  async #registerQueue(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const notice = document.querySelector("#notice");
    setBusy(button, true);
    try {
      const result = await this.#queues.register({
        poliId: form.elements.poliId.value
      });
      showNotice(notice, `Antrean berhasil didaftarkan. Nomor Anda ${result.number}.`, "success");
    } catch (error) {
      showNotice(notice, errorMessage(error), "error");
    } finally {
      setBusy(button, false);
    }
  }

  async #cancelQueue(id) {
    const queue = this.#history.find(item => item.id === id);
    if (!queue || queue.status !== QueueStatus.WAITING) return;
    if (!window.confirm(`Batalkan antrean ${queue.number}? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      await this.#queues.changeStatus(queue, QueueStatus.CANCELLED);
      showNotice(document.querySelector("#notice"), "Antrean berhasil dibatalkan.", "success");
    } catch (error) {
      showNotice(document.querySelector("#notice"), errorMessage(error), "error");
    }
  }

  #statusLabel(status) {
    return ({ WAITING: "Menunggu", CALLED: "Dipanggil", DONE: "Selesai", SKIPPED: "Dilewati", CANCELLED: "Dibatalkan" })[status] || status;
  }
}

new PatientApp();
