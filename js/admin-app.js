import { FirebaseService } from "./services/FirebaseService.js";
import { AuthService } from "./services/AuthService.js";
import { QueueService } from "./services/QueueService.js";
import { AdminDataService } from "./services/AdminDataService.js";
import { QueueStatus } from "./models/Antrean.js";
import { escapeHtml, formatDate, formatTime, showNotice, setBusy, errorMessage, todayKey, bindPasswordToggles, queuesToCsv, queuesToExcelHtml, downloadTextFile } from "./utils.js";

class AdminApp {
  #firebase;
  #auth;
  #queues;
  #adminData;
  #user = null;
  #allQueues = [];
  #todayQueues = [];
  #poli = [];
  #doctors = [];
  #schedules = [];
  #patients = [];
  #editingPoliId = null;
  #editingDoctorId = null;
  #editingScheduleId = null;
  #unsubscribers = [];
  #queueUnsubscribe = null;
  #homeQueueUnsubscribe = null;
  #autoCallTimers = new Map();

  constructor() {
    bindPasswordToggles();
    const notice = document.querySelector("#admin-notice");
    try {
      this.#firebase = new FirebaseService();
      this.#auth = new AuthService(this.#firebase);
      this.#queues = new QueueService(this.#firebase);
      this.#adminData = new AdminDataService(this.#firebase);
    } catch (error) {
      showNotice(notice, error.message, "info");
      document.querySelector("#admin-login-form button").disabled = true;
      return;
    }
    document.querySelector("#admin-login-form").addEventListener("submit", event => this.#login(event));
    document.querySelector("#admin-logout").addEventListener("click", () => this.#auth.signOut());
    document.querySelector("#queue-filter").addEventListener("change", () => this.#renderQueues());
    document.querySelector("#queue-date").addEventListener("change", () => this.#subscribeDateQueues());
    document.querySelector("#download-queues-csv").addEventListener("click", () => this.#downloadQueuesCsv());
    document.querySelector("#download-queues-excel").addEventListener("click", () => this.#downloadQueuesExcel());
    document.querySelector("#poli-form").addEventListener("submit", event => this.#createPoli(event));
    document.querySelector("#poli-cancel-edit").addEventListener("click", () => this.#cancelPoliEdit());
    window.addEventListener("hashchange", () => this.#activatePage(window.location.hash));
    this.#activatePage(window.location.hash);
    document.querySelector("#doctor-form").addEventListener("submit", event => this.#saveDoctor(event));
    document.querySelector("#doctor-cancel-edit").addEventListener("click", () => this.#cancelDoctorEdit());
    document.querySelector("#schedule-form").addEventListener("submit", event => this.#saveSchedule(event));
    document.querySelector("#schedule-cancel-edit").addEventListener("click", () => this.#cancelScheduleEdit());
    document.querySelector("#schedule-doctor").addEventListener("change", () => this.#renderSchedulePoliOptions());
    document.querySelector("#patient-search").addEventListener("input", () => this.#renderPatients());
    document.querySelector("#queue-date").value = todayKey();
    this.#auth.onChange(user => this.#onAuth(user), error => showNotice(notice, errorMessage(error), "error"));
  }

  async #login(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    setBusy(button, true);
    try {
      await this.#auth.signIn(form.elements.email.value, form.elements.password.value);
    } catch (error) {
      showNotice(document.querySelector("#admin-notice"), errorMessage(error), "error");
    } finally {
      setBusy(button, false);
    }
  }

  async #onAuth(user) {
    this.#releaseListeners();
    this.#user = user;
    const login = document.querySelector("#admin-login");
    const dashboard = document.querySelector("#admin-dashboard");
    if (!user) {
      login.hidden = false;
      dashboard.hidden = true;
      return;
    }
    try {
      if (!(await this.#auth.isAdmin(user))) throw new Error("Akun ini bukan petugas yang berwenang.");
      login.hidden = true;
      dashboard.hidden = false;
      this.#subscribeDateQueues();
      this.#homeQueueUnsubscribe = this.#queues.subscribeDate(todayKey(), queues => {
        this.#todayQueues = queues;
        this.#renderHomeCards();
      }, error => this.#notice(error));
      this.#unsubscribers.push(this.#queues.subscribePoli(poli => {
        this.#poli = poli;
        this.#renderPoli();
        this.#renderHomeCards();
        this.#renderDoctors();
        this.#renderSchedules();
        this.#renderQueues();
      }, error => this.#notice(error)));
      this.#unsubscribers.push(this.#adminData.subscribeDoctors(doctors => {
        this.#doctors = doctors;
        this.#renderPoli();
        this.#renderDoctors();
        this.#renderSchedules();
      }, error => this.#notice(error)));
      this.#unsubscribers.push(this.#adminData.subscribeSchedules(schedules => {
        this.#schedules = schedules;
        this.#renderSchedules();
      }, error => this.#notice(error)));
      this.#unsubscribers.push(this.#adminData.subscribePatients(patients => {
        this.#patients = patients;
        this.#renderPatients();
      }, error => this.#notice(error)));
    } catch (error) {
      showNotice(document.querySelector("#admin-notice"), errorMessage(error), "error");
      await this.#auth.signOut();
    }
  }

  #releaseListeners() {
    this.#queueUnsubscribe?.();
    this.#queueUnsubscribe = null;
    this.#homeQueueUnsubscribe?.();
    this.#homeQueueUnsubscribe = null;
    this.#clearAutoCallTimers();
    this.#unsubscribers.forEach(unsubscribe => unsubscribe());
    this.#unsubscribers = [];
    this.#todayQueues = [];
  }

  #subscribeDateQueues() {
    this.#queueUnsubscribe?.();
    const dateInput = document.querySelector("#queue-date");
    const date = dateInput.value || todayKey();
    dateInput.value = date;
    this.#allQueues = [];
    this.#renderStats();
    this.#renderQueues();
    this.#queueUnsubscribe = this.#queues.subscribeDate(date, queues => {
      this.#allQueues = queues;
      this.#renderStats();
      this.#renderQueues();
    }, error => this.#notice(error));
    const period = date === todayKey() ? "Hari ini" : "Tanggal dipilih";
    document.querySelectorAll("[data-stat-period]").forEach(element => { element.textContent = period; });
  }

  #renderStats() {
    const queues = this.#allQueues;
    document.querySelector("#stat-waiting").textContent = queues.filter(q => q.status === QueueStatus.WAITING).length;
    document.querySelector("#stat-called").textContent = queues.filter(q => q.status === QueueStatus.CALLED).length;
    document.querySelector("#stat-done").textContent = queues.filter(q => q.status === QueueStatus.DONE).length;
    document.querySelector("#stat-other").textContent = queues.filter(q =>
      [QueueStatus.SKIPPED, QueueStatus.CANCELLED].includes(q.status)).length;
  }

  #renderHomeCards() {
    const container = document.querySelector("#home-queue-cards");
    const poliList = this.#poli.filter(poli => poli.active);
    const activeIds = new Set(poliList.map(poli => poli.id));
    this.#autoCallTimers.forEach((timer, poliId) => {
      if (!activeIds.has(poliId)) {
        clearTimeout(timer);
        this.#autoCallTimers.delete(poliId);
      }
    });
    if (!poliList.length) {
      container.innerHTML = '<p class="home-queue-empty">Belum ada poli aktif. Tambahkan atau aktifkan data poli terlebih dahulu.</p>';
      return;
    }
    const colors = ["green", "cyan", "orange", "blue"];
    container.innerHTML = poliList.map((poli, index) => {
      const queues = this.#todayQueues.filter(queue => queue.poliId === poli.id);
      const current = queues.filter(queue => queue.status === QueueStatus.CALLED)
        .sort((a, b) => b.sequence - a.sequence)[0];
      const waiting = queues.filter(queue => queue.status === QueueStatus.WAITING).length;
      return `<article class="home-queue-card home-queue-card-${colors[index % colors.length]}">
        <div class="home-queue-card-main"><span class="home-queue-icon" aria-hidden="true">▣</span>
          <span class="home-queue-caption">No. Antrean Sekarang</span>
          <strong class="home-queue-number">${escapeHtml(current?.number || "0")}</strong>
          <span class="home-queue-poli">${escapeHtml(poli.name)}</span>
        </div>
        <div class="home-queue-waiting">${waiting} antrean menunggu</div>
        <div class="home-queue-auto">
          <label><input type="checkbox" data-auto-enabled="${escapeHtml(poli.id)}" ${poli.autoCallEnabled ? "checked" : ""}> Otomatis</label>
          <small><input type="number" min="1" max="120" step="1" value="${poli.autoCallIntervalMinutes}" data-auto-minutes="${escapeHtml(poli.id)}" aria-label="Interval panggilan ${escapeHtml(poli.name)} dalam menit"> menit</small>
        </div>
        <button class="home-queue-next" type="button" data-call-next-poli="${escapeHtml(poli.id)}" aria-label="Panggil antrean selanjutnya untuk ${escapeHtml(poli.name)}">Selanjutnya <span aria-hidden="true">→</span></button>
      </article>`;
    }).join("");
    container.querySelectorAll("[data-call-next-poli]").forEach(button =>
      button.addEventListener("click", () => this.#callNext(button.dataset.callNextPoli, button)));
    container.querySelectorAll("[data-auto-enabled]").forEach(input =>
      input.addEventListener("change", () => this.#saveAutoCallSetting(input.dataset.autoEnabled)));
    container.querySelectorAll("[data-auto-minutes]").forEach(input =>
      input.addEventListener("change", () => this.#saveAutoCallSetting(input.dataset.autoMinutes)));
    poliList.forEach(poli => this.#ensureAutoCallTimer(poli));
  }

  #clearAutoCallTimers() {
    this.#autoCallTimers.forEach(timer => clearTimeout(timer));
    this.#autoCallTimers.clear();
  }

  #ensureAutoCallTimer(poli) {
    if (!poli.autoCallEnabled) {
      const timer = this.#autoCallTimers.get(poli.id);
      if (timer) clearTimeout(timer);
      this.#autoCallTimers.delete(poli.id);
      return;
    }
    if (this.#autoCallTimers.has(poli.id)) return;
    this.#scheduleAutoCall(poli);
  }

  #scheduleAutoCall(poli) {
    if (!poli.autoCallEnabled) return;
    const timer = setTimeout(async () => {
      this.#autoCallTimers.delete(poli.id);
      try {
        await this.#queues.callNext(todayKey(), poli.id);
      } catch (error) {
        this.#notice(error);
      }
      const latest = this.#poli.find(item => item.id === poli.id);
      if (latest?.autoCallEnabled) this.#scheduleAutoCall(latest);
    }, poli.autoCallIntervalMinutes * 60_000);
    this.#autoCallTimers.set(poli.id, timer);
  }

  async #saveAutoCallSetting(poliId) {
    const poli = this.#poli.find(item => item.id === poliId);
    if (!poli) return;
    const enabledInput = document.querySelector(`[data-auto-enabled="${CSS.escape(poliId)}"]`);
    const minutesInput = document.querySelector(`[data-auto-minutes="${CSS.escape(poliId)}"]`);
    const interval = Number(minutesInput?.value);
    if (!Number.isInteger(interval) || interval < 1 || interval > 120) {
      this.#notice(new Error("Waktu panggilan otomatis harus 1–120 menit."));
      return;
    }
    try {
      await this.#firebase.update(`poli/${poliId}`, {
        autoCallEnabled: Boolean(enabledInput?.checked),
        autoCallIntervalMinutes: interval
      });
      const timer = this.#autoCallTimers.get(poliId);
      if (timer) clearTimeout(timer);
      this.#autoCallTimers.delete(poliId);
      this.#ensureAutoCallTimer({
        id: poli.id,
        autoCallEnabled: Boolean(enabledInput?.checked),
        autoCallIntervalMinutes: interval
      });
      this.#noticeMessage(`Pengaturan panggilan otomatis ${poli.name} diperbarui.`);
    } catch (error) {
      this.#notice(error);
    }
  }

  async #callNext(poliId, button) {
    setBusy(button, true, "Memanggil…");
    try {
      const queue = await this.#queues.callNext(todayKey(), poliId);
      if (!queue) {
        const poli = this.#poli.find(item => item.id === poliId);
        this.#noticeMessage(`Tidak ada antrean menunggu untuk ${poli?.name || "poli ini"}.`);
        return;
      }
      this.#noticeMessage(`Antrean ${queue.number} dipanggil.`);
    } catch (error) {
      this.#notice(error);
    } finally {
      button.disabled = false;
      button.textContent = "Selanjutnya →";
    }
  }

  #activatePage(hash) {
    const titles = {
      dashboard: "Beranda Admin",
      "admin-queues": "Data Antrean",
      "poli-settings": "Data Poli",
      "doctor-settings": "Data Dokter",
      "schedule-settings": "Jadwal Dokter",
      "patient-settings": "Data Pasien"
    };
    const pageId = hash.slice(1);
    const activePage = Object.prototype.hasOwnProperty.call(titles, pageId) ? pageId : "dashboard";
    document.querySelectorAll(".admin-page").forEach(page => {
      page.hidden = page.id !== activePage;
    });
    document.querySelector("#admin-page-title").textContent = titles[activePage];
    document.querySelectorAll(".sidebar-navigation .side-link").forEach(link => {
      const active = link.hash === `#${activePage}`;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  #renderQueues() {
    const filter = document.querySelector("#queue-filter").value;
    const queues = this.#allQueues.filter(queue => filter === "all" || queue.poliId === filter);
    this.#updateCsvExportButton(filter, queues);
    const rows = document.querySelector("#admin-queue-rows");
    if (!queues.length) {
      rows.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada antrean untuk filter ini.</td></tr>';
      return;
    }
    rows.innerHTML = queues.map(queue => {
      const actions = this.#actions(queue).map(action =>
        `<button class="action-button ${action.className}" data-action="${action.status}" data-id="${escapeHtml(queue.id)}" ${action.disabled ? "disabled" : ""}>${action.label}</button>`
      ).join("");
      return `<tr><td><strong>${escapeHtml(queue.number)}</strong></td><td class="patient-cell"><strong>${escapeHtml(queue.patientName)}</strong><small>${escapeHtml(queue.phone || "")}</small></td><td>${escapeHtml(queue.poliName)}<small class="queue-doctor">${escapeHtml(queue.doctorName || this.#poli.find(poli => poli.id === queue.poliId)?.doctorName || "Dokter belum diatur")}</small></td><td>${escapeHtml(formatTime(queue.createdAt))}</td><td><span class="status-pill status-${queue.status}">${this.#statusLabel(queue.status)}</span></td><td><div class="action-group">${actions || "—"}</div></td></tr>`;
    }).join("");
    rows.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () =>
      this.#changeStatus(button.dataset.id, button.dataset.action)));
  }

  #updateCsvExportButton(poliId, queues) {
    const csvButton = document.querySelector("#download-queues-csv");
    const excelButton = document.querySelector("#download-queues-excel");
    const hint = document.querySelector("#queue-csv-hint");
    const disabled = poliId === "all" || queues.length === 0;
    csvButton.disabled = disabled;
    excelButton.disabled = disabled;
    hint.textContent = poliId === "all"
      ? "Pilih satu poli untuk mengunduh file terpisah."
      : queues.length
        ? "CSV hanya berisi data poli terpilih."
        : "Tidak ada antrean untuk poli dan tanggal ini.";
  }

  #downloadQueuesCsv() {
    const poliId = document.querySelector("#queue-filter").value;
    const date = document.querySelector("#queue-date").value || todayKey();
    const poli = this.#poli.find(item => item.id === poliId);
    const queues = this.#allQueues.filter(queue => queue.poliId === poliId);
    if (poliId === "all" || !poli || !queues.length) {
      this.#notice(new Error("Pilih satu poli yang memiliki data antrean untuk diunduh."));
      return;
    }
    const slug = String(poli.code || poli.id).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    try {
      downloadTextFile(`antrean-${slug}-${date}.csv`, queuesToCsv(queues), "text/csv;charset=utf-8");
      this.#noticeMessage(`CSV antrean ${poli.name} berhasil diunduh.`);
    } catch (error) {
      this.#notice(error);
    }
  }

  #downloadQueuesExcel() {
    const poliId = document.querySelector("#queue-filter").value;
    const date = document.querySelector("#queue-date").value || todayKey();
    const poli = this.#poli.find(item => item.id === poliId);
    const queues = this.#allQueues.filter(queue => queue.poliId === poliId);
    if (poliId === "all" || !poli || !queues.length) {
      this.#notice(new Error("Pilih satu poli yang memiliki data antrean untuk diunduh."));
      return;
    }
    const slug = String(poli.code || poli.id).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    try {
      downloadTextFile(
        `antrean-${slug}-${date}.xls`,
        queuesToExcelHtml(queues, poli.name, date),
        "application/vnd.ms-excel;charset=utf-8"
      );
      this.#noticeMessage(`Tabel Excel antrean ${poli.name} berhasil diunduh.`);
    } catch (error) {
      this.#notice(error);
    }
  }

  #actions(queue) {
    if (queue.status === QueueStatus.WAITING) return [
      { status: QueueStatus.CALLED, label: "Panggil", className: "call" },
      { status: QueueStatus.SKIPPED, label: "Lewati", className: "skip" }
    ];
    if (queue.status === QueueStatus.CALLED) return [
      { status: QueueStatus.DONE, label: "Selesai", className: "done" },
      { status: QueueStatus.SKIPPED, label: "Lewati", className: "skip" }
    ];
    return [];
  }

  async #changeStatus(id, nextStatus) {
    const queue = this.#allQueues.find(item => item.id === id);
    if (!queue) return;
    try {
      await this.#queues.changeStatus(queue, nextStatus);
      this.#noticeMessage(`Status antrean ${queue.number} diperbarui.`);
    } catch (error) {
      this.#notice(error);
    }
  }

  #renderPoli() {
    const filter = document.querySelector("#queue-filter");
    const current = filter.value;
    filter.innerHTML = '<option value="all">Semua poli</option>' + this.#poli.map(poli =>
      `<option value="${escapeHtml(poli.id)}">${escapeHtml(poli.name)}</option>`).join("");
    if (current === "all" || this.#poli.some(poli => poli.id === current)) filter.value = current;
    const doctorSelect = document.querySelector("#poli-doctor");
    const selectedDoctor = doctorSelect.value;
    doctorSelect.innerHTML = '<option value="">Dokter belum ditetapkan</option>' + this.#doctors.map(doctor =>
      `<option value="${escapeHtml(doctor.id)}" ${doctor.active ? "" : "disabled"}>${escapeHtml(doctor.name)}${doctor.active ? "" : " (nonaktif)"}</option>`).join("");
    if (this.#doctors.some(doctor => doctor.id === selectedDoctor)) doctorSelect.value = selectedDoctor;
    const scheduleDoctor = document.querySelector("#schedule-doctor");
    const previousDoctor = scheduleDoctor.value;
    scheduleDoctor.innerHTML = '<option value="">Pilih dokter</option>' + this.#doctors.filter(doctor => doctor.active).map(doctor =>
      `<option value="${escapeHtml(doctor.id)}">${escapeHtml(doctor.name)}</option>`).join("");
    if (this.#doctors.some(doctor => doctor.id === previousDoctor && doctor.active)) scheduleDoctor.value = previousDoctor;
    this.#renderSchedulePoliOptions();
    document.querySelector("#poli-list").innerHTML = this.#poli.length
      ? `<div class="poli-list-heading"><span>DAFTAR POLI</span><small>${this.#poli.length} poli terdaftar</small></div>
        <div class="poli-items">${this.#poli.map(poli =>
          `<article class="poli-row ${poli.active ? "" : "poli-row-inactive"}">
            <div class="poli-row-info">
              <strong>${escapeHtml(poli.name)}</strong>
              <div class="poli-row-meta">
                <span class="poli-status ${poli.active ? "poli-status-active" : "poli-status-inactive"}"><i></i>${poli.active ? "Aktif" : "Nonaktif"}</span>
                <span class="poli-code">Kode ${escapeHtml(poli.code)}</span>
              </div>
              <span class="poli-doctor-info">${escapeHtml(this.#doctorNameFor(poli) || "Dokter belum ditetapkan")} · ${poli.averageServiceMinutes} menit/pasien</span>
            </div>
            <div class="poli-row-actions">
              <button type="button" class="poli-edit" data-edit-poli="${escapeHtml(poli.id)}">Edit</button>
              <button type="button" class="poli-toggle ${poli.active ? "poli-toggle-disable" : "poli-toggle-enable"}" aria-label="${poli.active ? "Nonaktifkan" : "Aktifkan"} ${escapeHtml(poli.name)}" data-toggle-poli="${escapeHtml(poli.id)}">${poli.active ? "Nonaktifkan" : "Aktifkan"}</button>
            </div>
          </article>`
        ).join("")}</div>`
      : '<p class="poli-empty">Belum ada poli. Tambahkan poli pertama melalui formulir di atas.</p>';
    document.querySelectorAll("[data-edit-poli]").forEach(button =>
      button.addEventListener("click", () => this.#editPoli(button.dataset.editPoli)));
    document.querySelectorAll("[data-toggle-poli]").forEach(button =>
      button.addEventListener("click", () => this.#togglePoli(button.dataset.togglePoli)));
  }

  async #createPoli(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const name = form.elements.name.value.trim().replace(/\s+/g, " ");
    const doctorId = form.elements.doctorId.value;
    const averageServiceMinutes = Number(form.elements.averageServiceMinutes.value);
    if (name.length < 2 || name.length > 50) {
      this.#notice(new Error("Nama poli harus terdiri dari 2–50 karakter."));
      return;
    }
    if (!Number.isInteger(averageServiceMinutes) || averageServiceMinutes < 1 || averageServiceMinutes > 120) {
      this.#notice(new Error("Waktu pelayanan harus 1–120 menit per pasien."));
      return;
    }
    setBusy(button, true);
    try {
      const current = this.#poli.find(poli => poli.id === this.#editingPoliId);
      if (current) {
        await this.#firebase.update(`poli/${current.id}`, {
          name, averageServiceMinutes, doctorId: doctorId || null, doctorName: null
        });
        this.#cancelPoliEdit();
        this.#noticeMessage("Data poli berhasil diperbarui.");
      } else {
        const id = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
          .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (!id || this.#poli.some(poli => poli.id === id)) throw new Error("Nama poli tersebut sudah tersedia.");
        const baseCode = (id.replace(/^poli-/, "").replace(/[^a-z0-9]/g, "").slice(0, 3) || "POL").toUpperCase();
        let code = baseCode;
        let suffix = 1;
        while (this.#poli.some(poli => poli.code === code)) code = `${baseCode.slice(0, 3)}${suffix++}`;
        await this.#firebase.set(`poli/${id}`, {
          name, code, doctorId: doctorId || null, averageServiceMinutes, active: true,
          createdAt: this.#firebase.serverTimestamp()
        });
        form.reset();
        form.elements.averageServiceMinutes.value = "15";
        this.#noticeMessage("Poli berhasil ditambahkan.");
      }
    } catch (error) {
      this.#notice(error);
    } finally {
      setBusy(button, false);
      if (!this.#editingPoliId) button.textContent = "Tambah poli";
    }
  }

  #editPoli(id) {
    const poli = this.#poli.find(item => item.id === id);
    if (!poli) return;
    this.#editingPoliId = id;
    const form = document.querySelector("#poli-form");
    form.elements.name.value = poli.name;
    form.elements.doctorId.value = poli.doctorId || "";
    form.elements.averageServiceMinutes.value = String(poli.averageServiceMinutes);
    document.querySelector("#poli-submit").textContent = "Simpan perubahan";
    document.querySelector("#poli-cancel-edit").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    form.elements.name.focus({ preventScroll: true });
  }

  #cancelPoliEdit() {
    this.#editingPoliId = null;
    const form = document.querySelector("#poli-form");
    form.reset();
    form.elements.averageServiceMinutes.value = "15";
    document.querySelector("#poli-submit").textContent = "Tambah poli";
    document.querySelector("#poli-cancel-edit").hidden = true;
  }

  async #togglePoli(id) {
    const poli = this.#poli.find(item => item.id === id);
    if (!poli || !window.confirm(`${poli.active ? "Nonaktifkan" : "Aktifkan"} ${poli.name}? Riwayat dan antrean yang ada tetap tersimpan.`)) return;
    try {
      await this.#firebase.update(`poli/${id}`, { active: !poli.active });
      this.#noticeMessage(`Poli berhasil ${poli.active ? "dinonaktifkan" : "diaktifkan"}.`);
    } catch (error) {
      this.#notice(error);
    }
  }

  #doctorNameFor(poli) {
      return this.#doctors.find(doctor => doctor.id === poli.doctorId)?.name || poli.doctorName || "";
    }

  #renderSchedulePoliOptions() {
      const select = document.querySelector("#schedule-poli");
      const previous = select.value;
      const doctorId = document.querySelector("#schedule-doctor").value;
      const available = this.#poli.filter(poli => poli.active && poli.doctorId === doctorId);
      select.innerHTML = `<option value="">${available.length ? "Pilih poli" : "Tetapkan dokter ke poli terlebih dahulu"}</option>` +
        available.map(poli => `<option value="${escapeHtml(poli.id)}">${escapeHtml(poli.name)}</option>`).join("");
      select.disabled = available.length === 0;
      if (available.some(poli => poli.id === previous)) select.value = previous;
    }

  #renderDoctors() {
      const assignments = new Map();
      this.#poli.forEach(poli => {
        if (poli.doctorId) assignments.set(poli.doctorId, [...(assignments.get(poli.doctorId) || []), poli.name]);
      });
      document.querySelector("#doctor-list").innerHTML = this.#doctors.length
        ? `<div class="poli-list-heading"><span>DAFTAR DOKTER</span><small>${this.#doctors.length} dokter terdaftar</small></div>
          <div class="poli-items">${this.#doctors.map(doctor => `<article class="poli-row ${doctor.active ? "" : "poli-row-inactive"}">
            <div class="poli-row-info"><strong>${escapeHtml(doctor.name)}</strong>
              <div class="poli-row-meta"><span class="poli-status ${doctor.active ? "poli-status-active" : "poli-status-inactive"}"><i></i>${doctor.active ? "Aktif" : "Nonaktif"}</span><span class="poli-code">${escapeHtml(doctor.specialty)}</span></div>
              <span class="poli-doctor-info">Poli: ${escapeHtml((assignments.get(doctor.id) || []).join(", ") || "Belum ditetapkan")}</span>
            </div><div class="poli-row-actions">
              <button type="button" class="poli-edit" data-edit-doctor="${escapeHtml(doctor.id)}">Edit</button>
              <button type="button" class="poli-toggle ${doctor.active ? "poli-toggle-disable" : "poli-toggle-enable"}" data-toggle-doctor="${escapeHtml(doctor.id)}">${doctor.active ? "Nonaktifkan" : "Aktifkan"}</button>
            </div></article>`).join("")}</div>`
        : '<p class="poli-empty">Belum ada data dokter. Tambahkan dokter sebelum membuat jadwal.</p>';
      document.querySelectorAll("[data-edit-doctor]").forEach(button =>
        button.addEventListener("click", () => this.#editDoctor(button.dataset.editDoctor)));
      document.querySelectorAll("[data-toggle-doctor]").forEach(button =>
        button.addEventListener("click", () => this.#toggleDoctor(button.dataset.toggleDoctor)));
    }

  async #saveDoctor(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("button[type=submit]");
      setBusy(button, true);
      try {
        await this.#adminData.saveDoctor({
          name: form.elements.name.value,
          specialty: form.elements.specialty.value
        }, this.#editingDoctorId);
        this.#cancelDoctorEdit();
        this.#noticeMessage("Data dokter berhasil disimpan.");
      } catch (error) {
        this.#notice(error);
      } finally {
        setBusy(button, false);
        if (!this.#editingDoctorId) button.textContent = "Tambah dokter";
      }
    }

  #editDoctor(id) {
      const doctor = this.#doctors.find(item => item.id === id);
      if (!doctor) return;
      this.#editingDoctorId = id;
      const form = document.querySelector("#doctor-form");
      form.elements.name.value = doctor.name;
      form.elements.specialty.value = doctor.specialty;
      document.querySelector("#doctor-submit").textContent = "Simpan perubahan";
      document.querySelector("#doctor-cancel-edit").hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "center" });
      form.elements.name.focus({ preventScroll: true });
    }

  #cancelDoctorEdit() {
      this.#editingDoctorId = null;
      const form = document.querySelector("#doctor-form");
      form.reset();
      document.querySelector("#doctor-submit").textContent = "Tambah dokter";
      document.querySelector("#doctor-cancel-edit").hidden = true;
    }

  async #toggleDoctor(id) {
      const doctor = this.#doctors.find(item => item.id === id);
      if (!doctor || !window.confirm(`${doctor.active ? "Nonaktifkan" : "Aktifkan"} ${doctor.name}? Dokter nonaktif tidak dapat menerima antrean baru.`)) return;
      try {
        await this.#adminData.setDoctorActive(id, !doctor.active);
        this.#noticeMessage(`Dokter berhasil ${doctor.active ? "dinonaktifkan" : "diaktifkan"}.`);
      } catch (error) {
        this.#notice(error);
      }
    }

  #renderSchedules() {
      const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
      const rows = document.querySelector("#schedule-rows");
      if (!this.#schedules.length) {
        rows.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada jadwal dokter.</td></tr>';
        return;
      }
      rows.innerHTML = this.#schedules.map(schedule => {
        const doctor = this.#doctors.find(item => item.id === schedule.doctorId);
        const poli = this.#poli.find(item => item.id === schedule.poliId);
        return `<tr><td>${escapeHtml(doctor?.name || "Dokter tidak ditemukan")}</td><td>${escapeHtml(poli?.name || "Poli tidak ditemukan")}</td>
          <td>${days[schedule.dayOfWeek] || "—"}</td><td>${escapeHtml(schedule.startTime)}–${escapeHtml(schedule.endTime)}</td>
          <td><span class="poli-status ${schedule.active ? "poli-status-active" : "poli-status-inactive"}"><i></i>${schedule.active ? "Aktif" : "Nonaktif"}</span></td>
          <td><div class="action-group"><button class="poli-edit" data-edit-schedule="${escapeHtml(schedule.id)}">Edit</button>
          <button class="poli-toggle ${schedule.active ? "poli-toggle-disable" : "poli-toggle-enable"}" data-toggle-schedule="${escapeHtml(schedule.id)}">${schedule.active ? "Nonaktifkan" : "Aktifkan"}</button></div></td></tr>`;
      }).join("");
      rows.querySelectorAll("[data-edit-schedule]").forEach(button =>
        button.addEventListener("click", () => this.#editSchedule(button.dataset.editSchedule)));
      rows.querySelectorAll("[data-toggle-schedule]").forEach(button =>
        button.addEventListener("click", () => this.#toggleSchedule(button.dataset.toggleSchedule)));
    }

  async #saveSchedule(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("button[type=submit]");
      setBusy(button, true);
      try {
        await this.#adminData.saveSchedule({
          doctorId: form.elements.doctorId.value,
          poliId: form.elements.poliId.value,
          dayOfWeek: form.elements.dayOfWeek.value,
          startTime: form.elements.startTime.value,
          endTime: form.elements.endTime.value
        }, this.#editingScheduleId);
        this.#cancelScheduleEdit();
        this.#noticeMessage("Jadwal dokter berhasil disimpan.");
      } catch (error) {
        this.#notice(error);
      } finally {
        setBusy(button, false);
        if (!this.#editingScheduleId) button.textContent = "Tambah jadwal";
      }
    }

  #editSchedule(id) {
      const schedule = this.#schedules.find(item => item.id === id);
      if (!schedule) return;
      this.#editingScheduleId = id;
      const form = document.querySelector("#schedule-form");
      form.elements.doctorId.value = schedule.doctorId;
      this.#renderSchedulePoliOptions();
      form.elements.poliId.value = schedule.poliId;
      form.elements.dayOfWeek.value = String(schedule.dayOfWeek);
      form.elements.startTime.value = schedule.startTime;
      form.elements.endTime.value = schedule.endTime;
      document.querySelector("#schedule-submit").textContent = "Simpan perubahan";
      document.querySelector("#schedule-cancel-edit").hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    }

  #cancelScheduleEdit() {
      this.#editingScheduleId = null;
      const form = document.querySelector("#schedule-form");
      form.reset();
      this.#renderSchedulePoliOptions();
      document.querySelector("#schedule-submit").textContent = "Tambah jadwal";
      document.querySelector("#schedule-cancel-edit").hidden = true;
    }

  async #toggleSchedule(id) {
      const schedule = this.#schedules.find(item => item.id === id);
      if (!schedule) return;
      try {
        await this.#adminData.setScheduleActive(id, !schedule.active);
        this.#noticeMessage(`Jadwal berhasil ${schedule.active ? "dinonaktifkan" : "diaktifkan"}.`);
      } catch (error) {
        this.#notice(error);
      }
    }

  #renderPatients() {
      const query = document.querySelector("#patient-search").value.trim().toLocaleLowerCase("id");
      const patients = this.#patients.filter(patient =>
        [patient.name, patient.email, patient.phone].some(value =>
          String(value || "").toLocaleLowerCase("id").includes(query)));
      const rows = document.querySelector("#patient-rows");
      if (!patients.length) {
        rows.innerHTML = `<tr><td colspan="3" class="empty-state">${this.#patients.length ? "Pasien tidak ditemukan." : "Belum ada akun pasien."}</td></tr>`;
        return;
      }
      rows.innerHTML = patients.map(patient => `<tr><td><strong>${escapeHtml(patient.name)}</strong></td>
        <td>${escapeHtml(patient.email)}</td><td>${escapeHtml(patient.phone || "—")}</td></tr>`).join("");
    }

  #statusLabel(status) {
    return ({ WAITING: "Menunggu", CALLED: "Dipanggil", DONE: "Selesai", SKIPPED: "Dilewati", CANCELLED: "Dibatalkan" })[status] || status;
  }

  #notice(error) { showNotice(document.querySelector("#dashboard-notice"), errorMessage(error), "error"); }
  #noticeMessage(message) { showNotice(document.querySelector("#dashboard-notice"), message, "success"); }
}

new AdminApp();
