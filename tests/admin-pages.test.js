import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("each admin sidebar feature points to a dedicated page section", async () => {
  const html = await readFile(new URL("../admin.html", import.meta.url), "utf8");
  const navigation = html.match(/<nav class="sidebar-navigation"[\s\S]*?<\/nav>/)?.[0] || "";
  const targets = [...navigation.matchAll(/href="#([^"]+)"/g)].map(([, id]) => id);
  const pages = [...html.matchAll(/<section\b([^>]*)>/g)]
    .map(([, attributes]) => ({
      id: attributes.match(/\bid="([^"]+)"/)?.[1],
      className: attributes.match(/\bclass="([^"]+)"/)?.[1] || ""
    }))
    .filter(section => section.className.split(/\s+/).includes("admin-page"))
    .map(section => section.id);

  assert.deepEqual(targets, [
    "dashboard", "admin-queues", "poli-settings",
    "doctor-settings", "schedule-settings", "patient-settings"
  ]);
  assert.deepEqual(pages.sort(), [...targets].sort());
});
