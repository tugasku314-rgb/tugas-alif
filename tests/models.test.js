import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../js/models/User.js";
import { Patient } from "../js/models/Patient.js";
import { Admin } from "../js/models/Admin.js";
import { Antrean, QueueStatus } from "../js/models/Antrean.js";
import { Poli } from "../js/models/Poli.js";
import { bindPasswordToggles, estimateWait, queuesToCsv, queuesToExcelHtml, todayKey } from "../js/utils.js";

test("user subclasses preserve encapsulated identity and role-specific behavior", () => {
  const patient = new Patient({ uid: "p1", name: "Ayu", email: "ayu@example.test", phone: "08123456789" });
  const admin = new Admin({ uid: "a1", name: "Petugas", email: "admin@example.test" });
  assert.ok(patient instanceof User);
  assert.equal(patient.name, "Ayu");
  assert.equal(patient.phone, "08123456789");
  assert.equal(admin.canManageQueues(), true);
  assert.throws(() => new User({ uid: "", name: "A", email: "a@example.test" }), /tidak lengkap/);
});

test("queue status transitions allow patient cancellation only while waiting", () => {
  const queue = new Antrean({
    id: "q1", uid: "p1", date: "2026-11-18", poliId: "umum", number: "U-001",
    status: QueueStatus.WAITING
  });
  assert.equal(queue.canTransitionTo(QueueStatus.CANCELLED), true);
  queue.transitionTo(QueueStatus.CALLED);
  assert.equal(queue.canTransitionTo(QueueStatus.CANCELLED), false);
  assert.throws(() => queue.transitionTo(QueueStatus.CANCELLED), /tidak diizinkan/);
  queue.transitionTo(QueueStatus.DONE);
  assert.equal(queue.canTransitionTo(QueueStatus.CALLED), false);
});

test("poli and antrean reject malformed required fields", () => {
  assert.throws(() => new Poli({ id: "", name: "Umum" }), /tidak lengkap/);
  assert.throws(() => new Antrean({ id: "q1", uid: "p1" }), /tidak lengkap/);
});

test("poli stores validated automatic call settings", () => {
  const poli = new Poli({
    id: "umum", name: "Poli Umum", autoCallEnabled: true,
    autoCallIntervalMinutes: 15
  });
  assert.equal(poli.autoCallEnabled, true);
  assert.equal(poli.autoCallIntervalMinutes, 15);
  assert.equal(new Poli({ id: "gigi", name: "Poli Gigi" }).autoCallIntervalMinutes, 15);
  assert.equal(new Poli({
    id: "anak", name: "Poli Anak", autoCallIntervalMinutes: 999
  }).autoCallIntervalMinutes, 15);
});

test("queue wait estimate uses people ahead and clinic service duration", () => {
  const estimate = estimateWait(3, 12, new Date("2026-11-19T00:00:00.000Z"));
  assert.equal(estimate.minutes, 36);
  assert.equal(typeof estimate.time, "string");
  assert.ok(estimate.time.length > 0);
  assert.equal(estimateWait(-1, 0).minutes, 0);
});

test("password visibility toggle changes the input type and accessible state", () => {
  const attributes = {};
  const handlers = {};
  const input = { type: "password" };
  const button = {
    dataset: { passwordToggle: "password" },
    textContent: "Lihat",
    addEventListener: (event, callback) => { handlers[event] = callback; },
    setAttribute: (name, value) => { attributes[name] = value; }
  };
  const root = {
    querySelectorAll: () => [button],
    getElementById: id => id === "password" ? input : null
  };

  bindPasswordToggles(root);
  handlers.click();
  assert.equal(input.type, "text");
  assert.equal(button.textContent, "Sembunyikan");
  assert.equal(attributes["aria-pressed"], "true");
  handlers.click();
  assert.equal(input.type, "password");
  assert.equal(attributes["aria-pressed"], "false");
});

test("queue CSV quotes fields and neutralizes spreadsheet formulas", () => {
  const csv = queuesToCsv([{
    number: "UM-001",
    patientName: '=HYPERLINK("x")',
    phone: "08123456789",
    poliName: 'Poli, "Umum"',
    doctorName: "dr. Sari",
    date: "2026-11-19",
    createdAt: 1_800_000_000_000,
    status: QueueStatus.WAITING
  }]);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.startsWith("\uFEFFsep=;\r\n"));
  assert.ok(csv.includes('"No. Antrean";"Nama Pasien"'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes(`"Poli, ""Umum"""`));
  assert.ok(csv.includes('"Menunggu"'));
});

test("queue Excel HTML export contains the requested title, header, and table rows", () => {
  const html = queuesToExcelHtml([{
    number: "GER-001",
    patientName: "Muhammad Alif",
    phone: "08123456789",
    poliName: "Poli Geriatri",
    doctorName: "dr. Chacha",
    date: "2026-11-19",
    createdAt: 1_800_000_000_000,
    status: "DONE"
  }], "Poli Geriatri", "2026-11-19");

  assert.ok(html.includes("DATA ANTREAN PASIEN RAWAT JALAN"));
  assert.ok(html.includes("No. Antrean"));
  assert.ok(html.includes("Muhammad Alif"));
  assert.ok(html.includes("GER-001"));
  assert.ok(html.includes('class="header"'));
  assert.ok(html.includes('border:1px solid'));
});

test("service date uses WIB even when the browser is on a different timezone", () => {
  assert.equal(todayKey(new Date("2026-11-18T18:00:00.000Z")), "2026-11-19");
});
