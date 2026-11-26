import test from "node:test";
import assert from "node:assert/strict";
import { AdminDataService } from "../js/services/AdminDataService.js";
import { Doctor } from "../js/models/Doctor.js";
import { DoctorSchedule } from "../js/models/DoctorSchedule.js";

function createFirebase({ schedules = {} } = {}) {
  const writes = [];
  const values = {
    "dokter/d1": { name: "dr. Sari", active: true },
    "poli/p1": { name: "Poli Umum", active: true, doctorId: "d1" },
    "jadwal_dokter": schedules
  };
  return {
    writes,
    service: new AdminDataService({
      get: async path => ({ val: () => values[path] || null }),
      set: async (path, value) => { writes.push({ path, value }); },
      update: async (path, value) => { writes.push({ path, value }); },
      newKey: () => "schedule-new",
      serverTimestamp: () => 1_800_000_000_000,
      transaction: async (path, updater) => {
        const current = values[path] || null;
        const next = updater(current);
        if (next === undefined) return { committed: false, snapshot: { val: () => current } };
        values[path] = next;
        writes.push({ path, value: next });
        return { committed: true, snapshot: { val: () => next } };
      }
    })
  };
}

test("doctor and schedule models reject incomplete and invalid records", () => {
  assert.throws(() => new Doctor({ id: "d1", name: "dr. Sari" }), /tidak lengkap/);
  assert.throws(() => new DoctorSchedule({
    id: "s1", doctorId: "d1", poliId: "p1", dayOfWeek: 1,
    startTime: "10:00", endTime: "09:00"
  }), /tidak valid/);
});

test("admin data service saves a valid schedule for an assigned active doctor", async () => {
  const { service, writes } = createFirebase();
  await service.saveSchedule({
    doctorId: "d1", poliId: "p1", dayOfWeek: "1",
    startTime: "08:00", endTime: "12:00"
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "jadwal_dokter");
  assert.equal(writes[0].value["schedule-new"].dayOfWeek, 1);
  assert.equal(writes[0].value["schedule-new"].active, true);
});

test("admin data service rejects overlapping doctor schedules", async () => {
  const { service, writes } = createFirebase({
    schedules: {
      existing: {
        doctorId: "d1", poliId: "p1", dayOfWeek: 1,
        startTime: "08:00", endTime: "10:00", active: true
      }
    }
  });
  await assert.rejects(service.saveSchedule({
    doctorId: "d1", poliId: "p1", dayOfWeek: "1",
    startTime: "09:30", endTime: "11:00"
  }), /bertabrakan/);
  assert.equal(writes.length, 0);
});
