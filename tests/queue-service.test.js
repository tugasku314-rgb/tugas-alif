import test from "node:test";
import assert from "node:assert/strict";
import { QueueService } from "../js/services/QueueService.js";
import { QueueStatus } from "../js/models/Antrean.js";
import { adminUid } from "../js/config.js";

function createFirebase({ admin = false, profile = { role: "patient", name: "Ayu", phone: "08123456789" },
  poli = {
    name: "Poli Umum", code: "UM", active: true,
    doctorName: "dr. Sari", averageServiceMinutes: 12
  }, initialCounter = 0,
  queue = null } = {}) {
  const writes = [];
  let counter = initialCounter;
  const user = {
    uid: admin ? adminUid : "patient-1",
    async getIdTokenResult() { return { claims: { admin } }; }
  };
  const firebase = {
    auth: { currentUser: user },
    get: async path => ({
      val: () => path === "users/patient-1" ? profile :
        path.startsWith("dokter/") ? { name: "dr. Sari", active: true } : poli
    }),
    transaction: async (path, updater) => {
      const current = path.startsWith("pengaturan/nomor/") ? counter : queue;
      const next = updater(current);
      if (next === undefined) return { committed: false, snapshot: { val: () => current } };
      if (path.startsWith("pengaturan/nomor/")) counter = next;
      else queue = next;
      return { committed: true, snapshot: { val: () => next } };
    },
    newKey: () => "queue-key",
    serverTimestamp: () => 1_800_000_000_000,
    updateRoot: async value => { writes.push(value); }
  };
  return { firebase, writes, getCounter: () => counter };
}

test("registration uses a transaction counter and writes synchronized queue indexes", async () => {
  const { firebase, writes, getCounter } = createFirebase();
  const service = new QueueService(firebase);
  const result = await service.register({ poliId: "poli-umum" });

  assert.equal(getCounter(), 1);
  assert.equal(result.number, "UM-001");
  assert.equal(result.status, QueueStatus.WAITING);
  assert.equal(writes[0][Object.keys(writes[0]).find(path => path.startsWith("antrean/"))].doctorName, "dr. Sari");
  assert.equal(writes[0][Object.keys(writes[0]).find(path => path.startsWith("antrean/"))].averageServiceMinutes, 12);
  assert.equal(writes.length, 1);
  const paths = Object.keys(writes[0]);
  assert.equal(paths.length, 3);
  assert.ok(paths.some(path => path.startsWith("antrean/")));
  assert.ok(paths.some(path => path === "riwayat_antrean/patient-1/queue-key"));
  assert.ok(paths.some(path => path.startsWith("ringkasan_antrean/")));
});

test("registration rejects an invalid patient profile before allocating a number", async () => {
  const { firebase, writes, getCounter } = createFirebase({ profile: { role: "admin" } });
  const service = new QueueService(firebase);

  await assert.rejects(service.register({ poliId: "poli-umum" }), /Profil pasien tidak valid/);
  assert.equal(getCounter(), 0);
  assert.equal(writes.length, 0);
});

test("registration reads the separately managed doctor assigned to a poli", async () => {
  const { firebase, writes } = createFirebase({
    poli: {
      name: "Poli Umum", code: "UM", active: true,
      doctorId: "doctor-1", averageServiceMinutes: 12
    }
  });
  const service = new QueueService(firebase);
  await service.register({ poliId: "poli-umum" });
  const queuePath = Object.keys(writes[0]).find(path => path.startsWith("antrean/"));
  assert.equal(writes[0][queuePath].doctorName, "dr. Sari");
});

test("admin calls the lowest waiting sequence and mirrors its new status", async () => {
  const date = "2026-11-19";
  let queueMap = {
    later: { uid: "patient-2", date, poliId: "poli-umum", number: "UM-002", sequence: 2, status: QueueStatus.WAITING },
    first: { uid: "patient-1", date, poliId: "poli-umum", number: "UM-001", sequence: 1, status: QueueStatus.WAITING }
  };
  const writes = [];
  const firebase = {
    auth: { currentUser: { uid: adminUid } },
    transaction: async (path, updater) => {
      assert.equal(path, `antrean/${date}/poli-umum`);
      const next = updater(queueMap);
      if (next === undefined) return { committed: false, snapshot: { val: () => queueMap } };
      queueMap = next;
      return { committed: true, snapshot: { val: () => queueMap } };
    },
    updateRoot: async value => { writes.push(value); }
  };
  const service = new QueueService(firebase);

  const called = await service.callNext(date, "poli-umum");

  assert.equal(called.number, "UM-001");
  assert.equal(queueMap.first.status, QueueStatus.CALLED);
  assert.equal(queueMap.later.status, QueueStatus.WAITING);
  assert.equal(writes[0]["riwayat_antrean/patient-1/first/status"], QueueStatus.CALLED);
  assert.equal(writes[0]["ringkasan_antrean/2026-11-19/poli-umum/first/status"], QueueStatus.CALLED);
});

test("admin next call returns null when no queue is waiting", async () => {
  const firebase = {
    auth: { currentUser: { uid: adminUid } },
    transaction: async (_path, updater) => ({
      committed: updater({ q1: { status: QueueStatus.CALLED } }) !== undefined,
      snapshot: { val: () => ({ q1: { status: QueueStatus.CALLED } }) }
    })
  };
  const service = new QueueService(firebase);
  assert.equal(await service.callNext("2026-11-19", "poli-umum"), null);
});

test("admin status change commits the transition and mirrors its status", async () => {
  const queue = {
    uid: "patient-1", patientName: "Ayu", poliName: "Poli Umum", phone: "08123456789",
    number: "UM-001", sequence: 1, date: "2026-11-19", poliId: "poli-umum",
    status: QueueStatus.WAITING, createdAt: 1_800_000_000_000
  };
  const { firebase, writes } = createFirebase({ admin: true, queue });
  const service = new QueueService(firebase);

  await service.changeStatus({ id: "queue-key", ...queue }, QueueStatus.CALLED);

  assert.equal(writes.length, 1);
  assert.equal(writes[0]["riwayat_antrean/patient-1/queue-key/status"], QueueStatus.CALLED);
  assert.equal(writes[0]["ringkasan_antrean/2026-11-19/poli-umum/queue-key/status"], QueueStatus.CALLED);
});

test("patient cannot set an admin-only status", async () => {
  const queue = {
    uid: "patient-1", number: "UM-001", sequence: 1,
    date: "2026-11-19", poliId: "poli-umum", status: QueueStatus.WAITING
  };
  const { firebase, writes } = createFirebase({ queue });
  const service = new QueueService(firebase);

  await assert.rejects(
    service.changeStatus({ id: "queue-key", ...queue }, QueueStatus.CALLED),
    /ditolak atau antrean sudah berubah/
  );
  assert.equal(writes.length, 0);
});
