const fs = require('fs');
const file = 'app.js';
let text = fs.readFileSync(file, 'utf8');
const startMarker = 'document.getElementById("pdfButton").addEventListener("click", () => {';
const endMarker = '["dashboard", "checklists", "actas"]';
const start = text.indexOf(startMarker);
const dashboardStart = text.indexOf(endMarker, start);
const end = text.lastIndexOf("\n", dashboardStart) + 1;

if (start < 0 || end < 0) throw new Error('PDF listener markers not found');
const replacement = `document.getElementById("pdfButton").addEventListener("click", () => {
  const record = records.find(item => item.id === editingId);
  if (!record) return;
  window.buildChecklistPdf(record);
});`;
text = text.slice(0, start) + replacement + text.slice(end);
fs.writeFileSync(file, text);
