window.buildChecklistPdf = function (record) {
  const parse = value => { try { const x = JSON.parse(value || "{}"); return x && typeof x === "object" ? x : {}; } catch { return {}; } };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" })[ch]);
  const raw = record.raw || {};
  const inventory = parse(record.inventory);
  const fluids = parse(record.fluids);

  const inventoryStructure = [
    ["ACCESORIOS EXTERNOS", ["Faros Delanteros","Luces Direcc. Delanteros","Luces Direcc. Posteriores","Luces de Peligro","Brazo y Plumillas Limpia Parabrizas","Tapa de Gasolina","Antena de Radio","Espejos Laterales","Manijas de Puerta","Alarma","Escarpines","Llanta y Aro de Repuestos","Dado Seguro de Ruedas","Copa de Aro"]],
    ["ACCESORIOS INTERNOS", ["Ceniceros","Espejo Retrovisor Interno","Auto Radio","Alfombra de Protección","Pisos de Jebe","Posa Vasos","Llave de Vehículo"]],
    ["HERRAMIENTAS / EQUIPO", ["Extintor","Gata","Palanca","Estuche de Herramientas","Botiquín","Conos"]],
    ["DOCUMENTOS DEL VEHÍCULO", ["Tarjeta de Propiedad","SOAT","Revisión Técnica","Tarjeta de Circulación","Manual de Propietario","Porta Documentos"]]
  ];

  const allRows = [];
  inventoryStructure.forEach(([category, items]) => {
    allRows.push({ name: category, category, isCategory: true });
    items.forEach(name => allRows.push({ name, category, isCategory: false }));
  });
  const splitIndex = Math.ceil(allRows.length / 2);

  const inventoryTable = rows => rows.map(row => {
    if (row.isCategory) {
      const isDocuments = row.category === "DOCUMENTOS DEL VEHÍCULO";
      return `<tr class="category"><td>${esc(row.name)}</td><td>${isDocuments ? "SÍ" : "B"}</td><td>${isDocuments ? "NO" : "R"}</td><td>${isDocuments ? "" : "M"}</td></tr>`;
    }
    const value = String(inventory[row.name] || "").trim();
    const normalized = value.toLowerCase();
    const isDocuments = row.category === "DOCUMENTOS DEL VEHÍCULO";
    if (isDocuments) return `<tr><td>${esc(row.name)}</td><td>${normalized === "sí" || normalized === "si" || normalized === "bueno" ? "X" : ""}</td><td>${normalized === "no" || normalized === "malo" ? "X" : ""}</td><td></td></tr>`;
    return `<tr><td>${esc(row.name)}</td><td>${normalized === "bueno" ? "X" : ""}</td><td>${normalized === "regular" ? "X" : ""}</td><td>${normalized === "malo" ? "X" : ""}</td></tr>`;
  }).join("");

  const fluidNames = [["Combustible","Combustible"],["Aceite","Aceite"],["Refrigerante","Refrigerante"],["Liq. Freno","Freno"],["Hidrolina","Hidrolina"],["Limpia Parabrisa","Limpia Parabrisa"]];
  const fluidHtml = fluidNames.map(([key, label]) => {
    const foundKey = Object.keys(fluids).find(name => name.toLowerCase().replace(/[^a-záéíóúñ]/gi, "") === key.toLowerCase().replace(/[^a-záéíóúñ]/gi, ""));
    const value = Math.max(0, Math.min(1, Number(foundKey ? fluids[foundKey] : 0) || 0));
    const color = value < 0.25 ? "#E53935" : value < 0.60 ? "#FFB300" : "#43A047";
    const words = label === "Limpia Parabrisa" ? ["Limpia","Parabrisa"] : label.split(" ");
    const scale = key === "Combustible"
      ? '<i class="scale-max">F</i><i class="scale-q3">3/4</i><i class="scale-mid">1/2</i><i class="scale-q1">1/4</i><i class="scale-min">E</i>'
      : '<i class="scale-max">MAX</i><i class="scale-mid">OK</i><i class="scale-min">MIN</i>';
    return `<div class="fluid"><div class="scale">${scale}</div><div class="gauge"><i style="height:${value * 100}%;background:${color}"></i></div><div class="fluid-name">${words.map(w => esc(w)).join("<br>")}</div></div>`;
  }).join("");

  const storedRuc = String(raw.RUC_EMPRESA || raw.RUC || "20605407077").replace(/[^0-9]/g, "");
  const defaultCompanyRuc = storedRuc === "10404845263" ? "10404845263" : "20605407077";

  const aliases = { motolineal:"veh_moto", moto:"veh_moto", motocarguero:"veh_motocarguero", cuatrimoto:"veh_cuatrimoto", camioneta:"veh_camioneta", combi:"veh_combi", minivan:"veh_minivan", suv:"veh_suv", auto:"veh_auto", ambulanciasprinter:"veh_ambulancia_sprinter", ambulanciacombi:"veh_ambulancia_combi", ambulanciacamioneta:"veh_ambulancia_camioneta", ambulancia:"veh_ambulancia_camioneta" };
  const normalizeVehicleText = value => String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  const vehicleText = normalizeVehicleText(record.vehicleType || raw["T. UNIDAD"] || raw.MODELO || "");
  const alias = Object.keys(aliases)
    .sort((a, b) => normalizeVehicleText(b).length - normalizeVehicleText(a).length)
    .find(v => vehicleText.includes(normalizeVehicleText(v)));
  const folder = alias ? aliases[alias] : "veh_auto";
  const silhouette = `/assets/vehicles/${folder}/${folder}.png`;
  const parseJsonArray = value => {
    if (Array.isArray(value)) return value;
    let parsed = value;
    for (let attempt = 0; attempt < 3 && typeof parsed === "string"; attempt++) {
      try { parsed = JSON.parse(parsed || "[]"); } catch { break; }
    }
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.points)) return parsed.points;
    if (parsed && Array.isArray(parsed.marks)) return parsed.marks;
    return [];
  };
  const androidColor = value => {
    const unsigned = (Number(value) || 0) >>> 0;
    return `#${unsigned.toString(16).padStart(8, "0").slice(2)}`;
  };
  const normalized = value => Math.max(0, Math.min(1, value));
  const toCanvasX = value => {
    const number = Number(value);
    return normalized(number > 1 ? number / 246 : number) * 246;
  };
  const toCanvasY = value => {
    const number = Number(value);
    return normalized(number > 1 ? number / 131 : number) * 131;
  };

  const damageStrokes = parseJsonArray(record.drawing || record.damageDrawing).filter(stroke => Array.isArray(stroke?.points));
  const damagePaths = damageStrokes.map(stroke => {
    const points = stroke.points.filter(point => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)));
    if (!points.length) return "";
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${toCanvasX(point.x).toFixed(2)},${toCanvasY(point.y).toFixed(2)}`).join(" ");
    return `<path d="${path}" fill="none" stroke="${androidColor(stroke.color)}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  }).join("");
  const damageMarks = parseJsonArray(record.damagePoints).filter(mark => Number.isFinite(Number(mark?.x)) && Number.isFinite(Number(mark?.y))).map(mark => {
    const x = toCanvasX(mark.x);
    const y = toCanvasY(mark.y);
    return `<circle cx="${x}" cy="${y}" r="5.5" fill="#fff" stroke="#111" stroke-width="1" vector-effect="non-scaling-stroke"/><circle cx="${x}" cy="${y}" r="4" fill="${androidColor(mark.color)}" stroke="#111" stroke-width="0.5"/>`;
  }).join("");
  const damageOverlay = (damagePaths || damageMarks)
    ? `<svg class="damage-overlay" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 246 131" preserveAspectRatio="none" aria-hidden="true">${damagePaths}${damageMarks}</svg>`
    : "";
  let signature = String(record.signatureUrl || "").trim();
  if (signature && /^data:image\//i.test(signature)) {
    // La firma ya está incrustada como Data URL.
  } else if (signature && !/^(https?:\/\/|\/)/i.test(signature)) {
    signature = `data:image/png;base64,${signature.replace(/^base64,?/i, "")}`;
  } else if (signature && /^https?:\/\//i.test(signature)) {
    const apiBase = typeof API_BASE !== "undefined" ? API_BASE : "https://hiverxa-central.onrender.com";
    signature = `${apiBase}/api/drive-image?url=${encodeURIComponent(signature)}`;
  }
  const getNormalizedSheetValue = names => {
    const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    const accepted = names.map(normalize);
    const key = Object.keys(raw).find(name => accepted.includes(normalize(name)) || accepted.some(candidate => candidate === "DIAS" && normalize(name) === "DAS") || accepted.includes(normalize(name.replace(/[?]/g, "I"))));
    return key ? raw[key] : "";
  };
  const storageDays = String(getNormalizedSheetValue(["DÍAS", "DIAS"]) || "0").trim() || "0";
  const storageAmount = Number(String(getNormalizedSheetValue(["SOLES", "SOL"])).replace(/[^0-9.,]/g, "").replace(",", "."));
  const storageCost = Number.isFinite(storageAmount) ? storageAmount.toFixed(2) : "0.00";
  const checked = value => /^(true|sí|si|x)$/i.test(String(value || "").trim()) ? "X" : "";
  const authorization = value => `<span class="auth-box">${checked(value)}</span>`;

  let preview = document.getElementById("pdfPreviewFrame");
  let previewDialog = document.getElementById("pdfPreviewDialog");
  if (!previewDialog) {
    previewDialog = document.createElement("dialog");
    previewDialog.id = "pdfPreviewDialog";
    previewDialog.className = "pdf-preview-dialog";
    previewDialog.setAttribute("aria-label", "Vista previa del checklist");
    preview = document.createElement("iframe");
    preview.id = "pdfPreviewFrame";
    preview.title = "Vista previa del checklist";
    previewDialog.appendChild(preview);
    document.body.appendChild(previewDialog);
  }
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && previewDialog.open) previewDialog.close();
  });
  if (!previewDialog.dataset.closeHandled) {
    previewDialog.dataset.closeHandled = "true";
    previewDialog.addEventListener("close", () => document.body.classList.remove("preview-open"));
  }
  if (!previewDialog.open) previewDialog.showModal();
  document.body.classList.add("preview-open");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Checklist ${esc(record.id)}</title><style>
*{box-sizing:border-box}@page{size:A4 portrait;margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;background:#ddd;font-family:Arial;color:#00041A;font-size:7pt}.page{width:595pt;height:842pt;background:#fff;margin:0 auto;position:relative;overflow:hidden}.preview-toolbar{position:fixed;right:12px;top:12px;z-index:20;display:flex;gap:8px}.preview-toolbar button{border:0;border-radius:6px;padding:9px 14px;font-size:12px;font-weight:bold;cursor:pointer}.preview-toolbar .print-action{background:#1769e0;color:#fff}.preview-toolbar .close-action{background:#263244;color:#fff}@media print{html,body{background:#fff!important}.preview-toolbar{display:none}.page{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}img{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
.brand{position:absolute;left:35pt;top:22pt;width:350pt}.brand-name{font-size:15pt;line-height:15pt;font-weight:bold}.brand-ruc{font-size:9.5pt;font-weight:bold;margin-top:3pt}.brand-line{font-size:7.5pt;margin-top:10pt;line-height:9pt}.brand-extra{font-size:7pt;line-height:9pt;margin-top:0}.doc-box{position:absolute;right:35pt;top:22pt;width:160pt;height:55pt;border:1.5pt solid #00041A;text-align:center;font-weight:bold}.doc-title{font-size:10pt;padding-top:10pt}.doc-number{font-size:12pt;color:#C62828;padding-top:5pt}.doc-meta{position:absolute;right:35pt;top:79pt;width:160pt;text-align:center;font-size:7.5pt;font-weight:bold;line-height:10pt}
.section-title{position:absolute;left:35pt;background:#F0F4F8;width:525pt;height:14pt;border-left:1pt solid #00041A;border-right:1pt solid #00041A;border-top:1pt solid #00041A;border-bottom:0;padding-left:5pt;font-size:8.5pt;font-weight:bold;line-height:11pt;color:#00041A}.data-box{position:absolute;left:35pt;width:525pt;border-left:1pt solid #00041A;border-right:1pt solid #00041A;border-bottom:1pt solid #00041A;border-top:0;padding:5pt 10pt}.client-section{top:122pt}.client-box{top:138pt;height:54pt;border-top:0;padding:6pt 10pt}.client-grid{display:grid;grid-template-columns:52pt 1fr;row-gap:7pt}.vehicle-section{top:198pt}.vehicle-box{top:214pt;height:40pt;border-top:0;padding:3pt 10pt}.vehicle-grid{display:grid;grid-template-columns:repeat(4,1fr);row-gap:2pt;column-gap:8pt;line-height:8pt}
.inventory{position:absolute;top:260pt;width:257.5pt;height:auto;left:35pt}.inventory.right{left:302.5pt}.inventory table{width:100%;border-collapse:collapse;table-layout:fixed}.inventory td{height:12pt;border:.25pt solid #B0BEC5;font-size:7pt;padding:0 3pt}.inventory td:first-child{width:205.5pt;overflow:hidden}.inventory td:not(:first-child){width:14pt;text-align:center;font-weight:bold}.inventory tr.category td{background:#E1E8ED;color:#00041A;font-weight:bold;font-size:7.5pt;border:.25pt solid #B0BEC5}.inventory tr.category td:first-child{font-size:7.5pt}.inventory td:nth-child(2){color:#2E7D32}.inventory td:nth-child(3){color:#F57C00}.inventory td:nth-child(4){color:#C62828}
.fluids-panel{position:absolute;left:35pt;top:494pt;width:257.5pt;padding-bottom:3pt}.sub-title{height:14pt;margin:0 -1pt 3pt;background:#F0F4F8;border:0;padding:2pt 5pt;font-size:8pt;font-weight:bold;line-height:9pt;color:#00041A}.fluids{height:92pt;border-top:0;width:257.5pt;display:flex;padding-top:5pt}.fluid{position:relative;width:42pt;height:82pt}.scale{position:absolute;left:-2pt;top:0;width:16pt;height:65pt;font-size:4.5pt;text-align:right}.scale i{position:absolute;right:0;font-style:normal;white-space:nowrap;line-height:5pt}.scale-max{top:-1pt}.scale-q3{top:15pt}.scale-mid{top:30pt}.scale-q1{top:45pt}.scale-min{bottom:-1pt}.gauge{position:absolute;left:16pt;top:0;width:16pt;height:65pt;border:.8pt solid #455A64;border-radius:3pt;overflow:hidden;background:#fff}.gauge i{position:absolute;left:0;bottom:0;width:100%}.fluid-name{position:absolute;left:2pt;top:68pt;width:38pt;text-align:center;font-size:5.5pt;line-height:6.5pt;font-weight:bold}
.damage-panel{position:absolute;left:310pt;top:494pt;width:250pt}.damage-box{position:relative;width:250pt;height:135pt;border:.5pt solid #B0BEC5;display:flex;align-items:center;justify-content:center;overflow:hidden}.damage-box img{width:246pt;height:131pt;object-fit:contain}.damage-overlay{position:absolute;left:2pt;top:2pt;width:246pt;height:131pt;pointer-events:none;z-index:5;overflow:visible}
.bottom{position:absolute;left:35pt;top:656pt;width:525pt;height:95pt;display:grid;grid-template-columns:260pt 253pt;gap:12pt}.bottom>div{border:0;min-height:95pt}.bottom .sub-title{margin:0}.observations,.authorizations{padding:5pt 6pt}.bottom .sub-title{padding-bottom:2pt}.observations{font-size:7pt;line-height:8pt;height:78pt;overflow:hidden}.authorizations{font-size:5.9pt;line-height:7.8pt}.auth-item{display:flex;align-items:flex-start;gap:3pt;margin-bottom:2pt}.auth-box{display:inline-block;flex:none;width:6pt;height:6pt;border:.8pt solid #00041A;background:#fff;line-height:5pt;text-align:center;font-size:5pt;font-weight:bold}.signature{position:absolute;left:370pt;top:722pt;width:160pt;height:62pt;text-align:center;color:#00041A}.signature img{position:absolute;left:25pt;top:0;width:110pt;height:60pt;object-fit:contain}.signature-line{position:absolute;left:0;top:62pt;border-top:1.1pt solid #00041A;width:160pt}.signature-label{position:absolute;left:0;top:66pt;width:160pt;font-weight:bold;font-size:7.8pt;line-height:8pt}.signature-name{position:absolute;left:0;top:75pt;width:160pt;font-size:5.8pt;line-height:6.5pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.legal{position:absolute;left:-5pt;top:92pt;width:170pt;text-align:center;color:#666;font-size:5.8pt;font-style:italic;line-height:6.2pt}.footer{position:absolute;left:35pt;bottom:8pt;width:330pt;font-size:5.5pt;color:#777}
</style></head><body><div class="preview-toolbar"><label style="display:flex;align-items:center;gap:6px;background:#fff;border-radius:6px;padding:0 8px;font-size:12px;font-weight:bold">Razón social<select id="company-ruc" onchange="setChecklistCompany(this.value)"><option value="20605407077">RUC 20 · GRUPO HIVERXA S.A.C.</option><option value="10404845263">RUC 10 · HIDALGO HUAMANÍ LUIS ALBERTO</option></select></label><button type="button" class="print-action" onclick="window.print()">Imprimir / Guardar PDF</button><button type="button" class="close-action" onclick="parent.document.getElementById('pdfPreviewDialog').close()">Cerrar</button></div><div class="page">
<div class="brand"><div class="brand-name" id="company-name"></div><div class="brand-ruc" id="company-ruc-label"></div><div class="brand-line" id="company-activity-1"></div><div class="brand-extra" id="company-activity-2"></div><div class="brand-extra">Jr. Tupac Amaru Mz. W1 Lt. 21B | Caraz - Áncash - Perú</div><div class="brand-extra">Web: hiverxamotors.com | Email: luis.hidalgo@hiverxamotors.com</div><div class="brand-extra">Cel: 999 623 122 | 043-707036</div></div>
<div class="doc-box"><div class="doc-title">CHECKLIST VEHICULAR</div><div class="doc-number">N° ${esc(record.id)}</div></div><div class="doc-meta">Fecha y Hora: ${esc(raw.FECHA || record.date)} | ${esc(raw.HORA || "")}<br>Técnico: ${esc(record.responsible)}</div>
<div class="section-title client-section">I. DATOS DEL CLIENTE</div><div class="data-box client-box"><div class="client-grid"><b>CLIENTE:</b><span>${esc(record.client)}</span><b>DNI/RUC:</b><span>${esc(raw["DNI/RUC"] || raw.DNI || raw.RUC)}</span><b>DIRECCIÓN:</b><span>${esc(raw.DIRECCIÓN || raw.DIRECCION || "")}</span></div></div>
<div class="section-title vehicle-section">II. DATOS DEL VEHÍCULO</div><div class="data-box vehicle-box"><div class="vehicle-grid"><div><b>PLACA:</b> ${esc(raw.PLACA || record.plate)}</div><div><b>AÑO:</b> ${esc(raw.AÑO)}</div><div><b>MOTOR:</b> ${esc(raw.MOTOR)}</div><div><b>SOAT:</b> ${esc(raw.SOAT)}</div><div><b>MARCA:</b> ${esc(raw.MARCA)}</div><div><b>COLOR:</b> ${esc(raw.COLOR)}</div><div><b>VIN:</b> ${esc(raw.VIN)}</div><div><b>RT:</b> ${esc(raw["REV TEC"] || raw.RT)}</div><div><b>MODELO:</b> ${esc(raw.MODELO)}</div><div><b>KM:</b> ${esc(raw.KM)}</div><div><b>SERIE:</b> ${esc(raw.SERIE)}</div><div><b>TIPO:</b> ${esc(raw["T. UNIDAD"] || "")}</div></div></div>
<div class="inventory"><table><tbody>${inventoryTable(allRows.slice(0, splitIndex))}</tbody></table></div><div class="inventory right"><table><tbody>${inventoryTable(allRows.slice(splitIndex))}</tbody></table></div>
<div class="fluids-panel"><div class="sub-title">III. NIVELES DE FLUIDOS</div><div class="fluids">${fluidHtml}</div></div><div class="damage-panel"><div class="sub-title">IV. ESTADO DE CARROCERÍA</div><div class="damage-box"><img src="${silhouette}" alt="Vistas del vehículo">${damageOverlay}</div></div>
<div class="bottom"><div><div class="sub-title">V. OBSERVACIONES</div><div class="observations">${esc(record.observations || raw.OBSERVACIONES || "")}</div></div><div><div class="sub-title">VI. AUTORIZACIONES</div><div class="authorizations"><div class="auth-item">${authorization(raw.A1)}<span>Autorizo conducir mi vehículo para pruebas en exteriores del taller.</span></div><div class="auth-item">${authorization(raw.A2)}<span>Autorizo enviar mi vehículo para trabajos en talleres de su elección.</span></div><div class="auth-item">${authorization(raw.A3)}<span>Declaro que no he dejado objetos ni dinero dentro del vehículo que pueda registrarse como pérdida.</span></div><div class="auth-item">${authorization(raw.A4)}<span>Acepto retirar mi vehículo en un máximo de ${esc(storageDays)} días después de finalizado el servicio; caso contrario asumiré un costo de S/ ${esc(storageCost)} diario por concepto de cochera (interna y/o externa).</span></div></div></div></div>
<div class="signature">${signature ? `<img src="${signature}" alt="Firma">` : ""}<div class="signature-line"></div><div class="signature-label">FIRMA DEL CLIENTE</div><div class="signature-name"><b>${esc(record.signerName || record.client)}</b> &nbsp; DNI: ${esc(record.signerDni || raw["DNI/RUC"] || "")}</div><div class="legal">Declaro haber dejado mi vehículo según checklist, aceptando y autorizando lo detallado.</div></div><div class="footer">© ${new Date().getFullYear()} Hiverxa Motor's - Software de Gestión de Taller</div>
</div><script>
window.setChecklistCompany = ruc => {
  const companies = {
    "20605407077": {
      name: "GRUPO HIVERXA S.A.C.", ruc: "RUC: 20605407077",
      activity1: "Servicio de Transporte de Personal",
      activity2: "Alquiler de Vehículos, Servicios de mantenimiento, Reparación y venta de repuestos y accesorios en el rubro Automotriz y Maquinaria Pesada"
    },
    "10404845263": {
      name: "HIDALGO HUAMANÍ LUIS ALBERTO", ruc: "RUC: 10404845263",
      activity1: "Centro De Diagnóstico Y Reparación Automotriz",
      activity2: "Laboratorio Common Rail | Alquiler De Vehículos"
    }
  };
  const company = companies[ruc] || companies["20605407077"];
  document.getElementById("company-name").textContent = company.name;
  document.getElementById("company-ruc-label").textContent = company.ruc;
  document.getElementById("company-activity-1").textContent = company.activity1;
  document.getElementById("company-activity-2").textContent = company.activity2;
};
(function(){
  const selectedRuc = "${defaultCompanyRuc}";
  document.getElementById("company-ruc").value = selectedRuc;
  setChecklistCompany(selectedRuc);
  const alignDamageOverlay = () => {
    const box = document.querySelector('.damage-box');
    const image = box?.querySelector('img');
    const overlay = box?.querySelector('.damage-overlay');
    if (!box || !image || !overlay || !image.naturalWidth || !image.naturalHeight) return;
    const boxRect = box.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const scale = Math.min(imageRect.width / image.naturalWidth, imageRect.height / image.naturalHeight);
    const renderedWidth = image.naturalWidth * scale;
    const renderedHeight = image.naturalHeight * scale;
    overlay.style.left = (imageRect.left - boxRect.left + (imageRect.width - renderedWidth) / 2) + 'px';
    overlay.style.top = (imageRect.top - boxRect.top + (imageRect.height - renderedHeight) / 2) + 'px';
    overlay.style.width = renderedWidth + 'px';
    overlay.style.height = renderedHeight + 'px';
  };
  window.addEventListener('load', alignDamageOverlay);
  window.addEventListener('resize', alignDamageOverlay);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') parent.document.getElementById('pdfPreviewDialog')?.close(); });
  document.querySelector('.damage-box img')?.addEventListener('load', alignDamageOverlay);
  alignDamageOverlay();
})();
</script></body></html>`;
  preview.srcdoc = html;
};

window.buildActaPdf = function(record) {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" })[ch]);
  const raw = record.raw || {};
  const get = (...keys) => keys.map(key => raw[key]).find(value => value !== undefined && value !== null && value !== "") ?? "";
  const longDate = value => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || "");
    const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${date.getDate()} de ${months[date.getMonth()]} del ${date.getFullYear()}`;
  };
  let signature = String(get("signatureBase64", "firma", "signatureUrl") || "");
  if (signature && !/^data:image/i.test(signature)) signature = `data:image/png;base64,${signature}`;
  const owner = get("propietarioCliente","propietario","cliente","nombreCliente") || "EXPORTADORA FRUTICOLA DEL SUR S.A.";
  const responsible = get("nombreResponsable","responsable","usuario","entrega") || record.signerName;
  const dni = get("dni","DNI","documentoResponsable") || record.signerDni;
  const plate = get("placa","placaVehiculo") || record.plate;
  const vehicleType = get("tipoVehiculo") || record.vehicleType;
  const brand = get("marca","marcaVehiculo") || record.brand;
  const model = get("modelo","modeloVehiculo") || record.model;
  const service = get("tipoServicio") || record.serviceType;
  const serviceDate = get("fecha","Fecha","fechaActa") || record.date;
  let preview = document.getElementById("pdfPreviewFrame");
  let previewDialog = document.getElementById("pdfPreviewDialog");
  if (!previewDialog) {
    previewDialog = document.createElement("dialog"); previewDialog.id = "pdfPreviewDialog"; previewDialog.className = "pdf-preview-dialog";
    preview = document.createElement("iframe"); preview.id = "pdfPreviewFrame"; previewDialog.appendChild(preview); document.body.appendChild(previewDialog);
  }
  if (!previewDialog.open) previewDialog.showModal();
  document.body.classList.add("preview-open");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Acta de conformidad</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact}body{margin:0;background:#ddd;font:12px Arial;color:#000}.toolbar{position:fixed;right:12px;top:12px;z-index:5}.toolbar button{border:0;padding:9px 14px;border-radius:6px;color:#fff;font-weight:bold;background:#173f5f;cursor:pointer}.toolbar button:last-child{background:#263244;margin-left:6px}.page{width:210mm;height:297mm;background:#fff;margin:auto;padding:10mm 18mm 8mm;position:relative;overflow:hidden}.header{height:35mm;display:grid;grid-template-columns:31mm 1fr 34mm;align-items:center;border-bottom:1px solid #111;padding-bottom:1mm;margin-bottom:-1mm}.brand{text-align:center;color:#173f5f;font-size:7px}.brand-mark{display:block;width:25mm;height:25mm;object-fit:contain;margin:0 auto}.brand{text-align:center;align-self:center}.brand-mark:before{content:none}.company{text-align:center;padding:0;align-self:center}.company h1{font-size:18px;margin:0 0 2mm}.company p{font-size:10px;margin:0 0 1mm}.ruc{border:1px solid #222;padding:6px 7px;font-size:10px;font-weight:bold;justify-self:end;align-self:center;margin:0}.title{text-align:center;text-decoration:underline;font-size:20px;font-weight:bold;margin:13mm 0 12mm}.intro{font-size:14px;line-height:1.45;margin-bottom:8mm}.details{width:78%;margin:0 0 10mm 14mm;border-collapse:collapse;font-size:13px}.details td{border:1px solid #222;padding:5px 7px}.details td:first-child{width:45%;font-weight:bold;text-transform:uppercase}.conformity h2{font-size:13px;margin:0 0 9mm}.conformity .lead{font-size:14px;margin:0 0 4mm}.service{font-size:14px;font-weight:bold;margin:3mm 0 8mm 13mm}.legal{font-size:13px;line-height:1.5;margin:0 0 8mm}.closing{font-size:13px;margin-bottom:5mm}.date{text-align:right;font-size:13px;margin:9mm 0 13mm}.signature{text-align:center;width:68mm;margin:3mm auto 0}.signature img{height:28mm;width:58mm;object-fit:contain}.signature .line{border-top:1px solid #222;padding-top:2mm;font-weight:bold}.signature small{font-size:11px}.footer{position:absolute;left:18mm;right:18mm;bottom:7mm;border-top:1px solid #ddd;padding-top:3mm;text-align:center;color:#777;font-size:9px;line-height:1.5}@media print{body{background:#fff}.toolbar{display:none}.page{margin:0}}</style></head><body><div class="toolbar"><button type="button" onclick="window.print()">Imprimir / Guardar PDF</button><button type="button" onclick="parent.document.getElementById('pdfPreviewDialog').close()">Cerrar</button></div><main class="page"><header class="header"><div class="brand"><img class="brand-mark" src="/assets/logo-hiverxa.png"></div><div class="company"><h1>GRUPO HIVERXA S.A.C.</h1><p>Servicio de Transporte de Personal</p><p style="font-size:8px;font-style:italic">Alquiler de vehículos y servicios de mantenimiento preventivo y correctivo para el rubro Automotriz y Maquinaria Pesada</p></div><div class="ruc">RUC: 20605407077</div></header><div class="title">ACTA DE CONFORMIDAD</div><p class="intro">Yo, <b>${esc(String(responsible).toUpperCase())}</b> identificado con D.N.I. N° <b>${esc(dni)}</b>, responsable del vehículo detallado a continuación:</p><table class="details"><tr><td>TIPO DE VEHÍCULO</td><td>${esc(vehicleType)}</td></tr><tr><td>MARCA</td><td>${esc(brand)}</td></tr><tr><td>MODELO</td><td>${esc(model)}</td></tr><tr><td>PLACA / CÓDIGO</td><td>${esc(plate)}</td></tr><tr><td>PROPIETARIO / CLIENTE</td><td>${esc(owner)}</td></tr></table><section class="conformity"><h2>HAGO CONSTAR:</h2><p class="lead">Que se me hace entrega de la unidad descrita tras haber finalizado satisfactoriamente el servicio de:</p><p class="service">${esc(service)}</p><p class="legal">Dicho servicio fue realizado por el taller autorizamos HIVERXA MOTORS / GRUPO HIVERXA S.A.C., representado por el Sr. Luis Alberto Hidalgo Huamani, dejándose constancia de que los trabajos se ejecutaron a entera satisfacción del suscrito y que el vehículo se encuentra en óptimas condiciones intervenidos y el cumplimiento de los plazos establecidos.</p><p class="closing">En señal de conformidad, firmo la presente acta.</p><div class="date">Caraz, ${esc(longDate(serviceDate))}</div><div class="signature">${signature ? `<img src="${esc(signature)}">` : ""}<div class="line">${esc(String(responsible).toUpperCase())}</div><small>D.N.I. N° ${esc(dni)}</small></div></section><footer class="footer">Jr. Mansichi Cáceres #551 - Caraz – Ancash - Perú | Grupo Hiverxa<br>¡Confianza al servicio y satisfacción de sus clientes!</footer></main></body></html>`;
  preview.srcdoc = html;
};