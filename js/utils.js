export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function formatDate(date) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(`${date}T00:00:00`));
}

export function formatTime(timestamp) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit"
  })
    .format(new Date(timestamp));
}

export function queuesToCsv(queues) {
    const headers = [
      "No. Antrean", "Nama Pasien", "Nomor Telepon", "Poli", "Dokter",
      "Tanggal Daftar", "Waktu Daftar", "Status"
    ];
    const statusLabels = {
      WAITING: "Menunggu",
      CALLED: "Dipanggil",
      DONE: "Selesai",
      SKIPPED: "Dilewati",
      CANCELLED: "Dibatalkan"
    };
    const cell = value => {
      const text = String(value ?? "");
      const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const rows = queues.map(queue => [
      queue.number,
      queue.patientName,
      queue.phone,
      queue.poliName,
      queue.doctorName,
      queue.date,
      formatTime(queue.createdAt),
      statusLabels[queue.status] || queue.status
    ]);
    const title = [`DATA ANTREAN PASIEN RAWAT JALAN`];
    return `\uFEFFsep=;\r\n${title.map(cell).join(";")}\r\n\r\n${[headers, ...rows].map(row => row.map(cell).join(";")).join("\r\n")}`;
}

export function queuesToExcelHtml(queues, poliName, date) {
  const statusLabels = {
    WAITING: "Menunggu",
    CALLED: "Dipanggil",
    DONE: "Selesai",
    SKIPPED: "Dilewati",
    CANCELLED: "Dibatalkan"
  };
  const headers = [
    "No. Antrean", "Nama Pasien", "Nomor Telepon", "Poli", "Dokter",
    "Tanggal Daftar", "Waktu Datang", "Status"
  ];
  const rows = queues.map(queue => [
    queue.number,
    queue.patientName,
    queue.phone,
    queue.poliName,
    queue.doctorName,
    queue.date,
    formatTime(queue.createdAt),
    statusLabels[queue.status] || queue.status
  ]);
  const escape = value => escapeHtml(value);
  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${escape(poliName)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
table{border-collapse:collapse;font-family:Arial,sans-serif;width:100%}
.title td{height:42px;background:#dfeaf8;color:#1f4d78;font-size:16pt;font-weight:bold;text-align:center;vertical-align:middle}
.header td{height:30px;background:#1f4e78;color:#ffffff;font-size:10pt;font-weight:bold;text-align:center;border:1px solid #808080}
.data td{height:24px;font-size:10pt;border:1px solid #b7c9e2;padding:4px}
.done td:last-child{color:#008000}.waiting td:last-child{color:#9a6700}
</style></head><body>
<table>
<tr class="title"><td colspan="8">DATA ANTREAN PASIEN RAWAT JALAN</td></tr>
<tr><td colspan="8"></td></tr>
<tr class="header">${headers.map(header => `<td>${escape(header)}</td>`).join("")}</tr>
${rows.map(row => {
  const status = row[7];
  const rowClass = status === "Selesai" ? "done" : status === "Menunggu" ? "waiting" : "";
  return `<tr class="data ${rowClass}">${row.map((value, column) => `<td>${escape(value)}${column === 5 ? "" : ""}</td>`).join("")}</tr>`;
}).join("\n")}
</table>
</body></html>`;
}

export function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function estimateWait(positionAhead, averageServiceMinutes, now = new Date()) {
  const peopleAhead = Math.max(0, Math.floor(Number(positionAhead) || 0));
  const serviceMinutes = Math.max(1, Math.floor(Number(averageServiceMinutes) || 15));
  const minutes = peopleAhead * serviceMinutes;
  const estimatedCallAt = new Date(now.getTime() + minutes * 60_000);
  const time = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit"
  }).format(estimatedCallAt);
  return { minutes, time };
}

export function todayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function showNotice(element, message, type = "info") {
  element.textContent = message;
  element.className = `notice notice-${type}`;
  element.hidden = false;
}

export function hideNotice(element) {
  element.hidden = true;
  element.textContent = "";
}

export function setBusy(button, busy, busyText = "Memproses…") {
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

export function bindPasswordToggles(root = document) {
  root.querySelectorAll("[data-password-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      const input = root.getElementById(button.dataset.passwordToggle);
      if (!input) throw new Error(`Input kata sandi tidak ditemukan: ${button.dataset.passwordToggle}`);
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      button.textContent = visible ? "Sembunyikan" : "Lihat";
      button.setAttribute("aria-label", visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi");
      button.setAttribute("aria-pressed", String(visible));
    });
  });
}

export function errorMessage(error) {
  const code = error?.code || "";
  const messages = {
    "auth/email-already-in-use": "Email ini sudah terdaftar.",
    "auth/invalid-credential": "Email atau kata sandi salah.",
    "auth/invalid-email": "Format email tidak valid.",
    "auth/weak-password": "Kata sandi harus minimal 8 karakter.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Coba kembali beberapa saat lagi.",
    "permission-denied": "Akses ditolak oleh aturan keamanan database."
  };
  return messages[code] || error?.message || "Terjadi kesalahan. Silakan coba kembali.";
}
