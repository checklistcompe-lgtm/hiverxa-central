let records = [];
let editingId = null;

function normalizeDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : value;
}

function formatDate(value) {
  const iso = normalizeDate(value);
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || "");
}

function parseDate(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : value;
}

async function loadActaRecords() {
  const response = await fetch("/api/firestore/actas");
  if (!response.ok) throw new Error((await response.json()).error || "No fue posible cargar las actas de Firebase");
  const data = await response.json();
  return data.documents.map(document => {
    const row = document.data;
    const value = (...keys) => keys.map(key => row[key]).find(item => item !== undefined && item !== null && item !== "") ?? "";
    const dateValue = value("Fecha", "fecha", "fechaActa", "createdAt", "fechaEntrega");
    return {
      id: String(value("id", "numeroActa", "numero", "N° ACTA") || document.id),
      firestoreId: document.id,
      type: "acta",
      title: "Acta de entrega",
      asset: [value("placa", "placaVehiculo"), value("marca", "marcaVehiculo")].filter(Boolean).join(" · ") || "Vehículo no informado",
      plate: value("placa", "placaVehiculo"), brand: value("marca", "marcaVehiculo"),
      model: value("modelo", "modeloVehiculo", "modelo:"), year: value("anio", "año", "year"),
      color: value("color"), km: value("kilometraje", "km", "odometro"),
      client: value("propietario", "propietarioCliente", "cliente", "nombreCliente") || "EXPORTADORA FRUTICOLA DEL SUR S.A.", signerName: value("nombreResponsable", "responsable", "usuario", "entrega"),
      signerDni: value("dni", "DNI", "documentoResponsable"), observations: value("observaciones", "observacion"),
      date: normalizeFirebaseDate(dateValue), status: "Completo",
      serviceType: value("tipoServicio"), vehicleType: value("tipoVehiculo"), signatureUrl: value("signatureBase64", "firma", "signatureUrl"), raw: row
    };
  });
}

function normalizeFirebaseDate(value) {
  const text = String(value || "");
  const timestamp = /^\d{4}-\d{2}-\d{2}T/.test(text) ? new Date(text) : null;
  if (timestamp && !Number.isNaN(timestamp.getTime())) return `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2,"0")}-${String(timestamp.getDate()).padStart(2,"0")}`;
  return normalizeDate(text);
}

async function loadChecklistRecords() {
  try {
    const response = await fetch("/api/sheets/Hoja%201");
    if (!response.ok) throw new Error((await response.json()).error || "No fue posible cargar Google Sheets");
    const data = await response.json();
    const checklists = data.records.map(row => ({
      id: row["N° CHECKLIST"] || "Sin número",
      type: "checklist",
      title: "Checklist",
      asset: [row.PLACA, row.MARCA, row.MODELO].filter(Boolean).join(" · ") || "Activo no informado",
      plate: row.PLACA || "",
      brand: row.MARCA || "",
      model: row.MODELO || "",
      year: row.AÑO || "",
      color: row.COLOR || "",
      km: row.KM || "",
      client: row.CLIENTE || "Cliente no informado",
      responsible: row.MECÁNICO || "Responsable no informado",
      date: normalizeDate(row.FECHA),
      status: row.OBSERVACIONES && /pendiente/i.test(row.OBSERVACIONES) ? "Pendiente" : "Completo",
      observations: row.OBSERVACIONES || "",
      signatureUrl: row["FIRMA DIGITAL"] || "",
      vehicleType: row["T. UNIDAD"] || "",
      inventory: row["REVISIÓN GENERAL DE LA UNIDAD"] || "{}",
      fluids: row["NIVEL DE FLUIDOS"] || "{}",
      damagePoints: row["Columna 20"] || "[]",
      drawing: row["DIBUJO DE FIRMA"] || "[]",
      signerName: row["FIRMA CLIENTE"] || "",
      signerDni: row.DNI || "",
      raw: row
    })).filter(record => record.id !== "Sin número")
      .sort((a, b) => {
        const number = value => {
          const matches = String(value).match(/\d+/g);
          return matches ? Number(matches[matches.length - 1]) : Number.NaN;
        };
        const aNumber = number(a.id);
        const bNumber = number(b.id);
        if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) return bNumber - aNumber;
        return String(b.id).localeCompare(String(a.id), "es", { numeric: true });
      });
    let actas = [];
    try { actas = await loadActaRecords(); }
    catch (actaError) { console.error("Error cargando actas", actaError); showToast(actaError.message); }
    records = [...checklists, ...actas].sort((a, b) => {
      if (a.type === "acta" && b.type === "acta") {
        const aDate = new Date(a.raw?.fecha || a.date).getTime();
        const bDate = new Date(b.raw?.fecha || b.date).getTime();
        return bDate - aDate;
      }
      return String(b.id).localeCompare(String(a.id), "es", { numeric: true });
    });
    render();
    showToast(`${checklists.length} checklists y ${actas.length} actas cargados`);
  } catch (error) {
    let actas = [];
    try { actas = await loadActaRecords(); }
    catch (actaError) { console.error("Error cargando actas", actaError); }
    records = actas;
    render();
    showToast(actas.length ? `${actas.length} actas cargadas; Google Sheets no disponible` : error.message);
  }
}

const body = document.body;
const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const statusFilter = document.getElementById("statusFilter");
const recordsBody = document.getElementById("recordsBody");
const tableWrap = document.getElementById("tableWrap");
const tableHorizontalScroll = document.getElementById("tableHorizontalScroll");
const tableScrollThumb = document.getElementById("tableScrollThumb");
const dialog = document.getElementById("editorDialog");
const fields = document.getElementById("editorFields");

function saveRecords() {
  localStorage.setItem("reportRecords", JSON.stringify(records));
}

function filteredRecords() {
  const query = searchInput.value.trim().toLowerCase();
  return records.filter(record => {
    const searchable = Object.values(record).join(" ").toLowerCase();
    return (!query || searchable.includes(query)) &&
      (!typeFilter.value || record.type === typeFilter.value) &&
      (!statusFilter.value || record.status === statusFilter.value);
  });
}

function escapeTableValue(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" })[character]);
}

function syncTableScroll() {
  requestAnimationFrame(() => {
    if (!tableWrap || !tableHorizontalScroll || !tableScrollThumb) return;
    tableScrollThumb.style.width = `${tableWrap.scrollWidth}px`;
    tableHorizontalScroll.hidden = tableWrap.scrollWidth <= tableWrap.clientWidth;
  });
}

let tableScrollEventsConfigured = false;
function configureTableScroll() {
  if (tableScrollEventsConfigured) return;
  tableScrollEventsConfigured = true;
  tableWrap.addEventListener("scroll", () => {
    tableHorizontalScroll.scrollLeft = tableWrap.scrollLeft;
  });
  tableHorizontalScroll.addEventListener("scroll", () => {
    tableWrap.scrollLeft = tableHorizontalScroll.scrollLeft;
  });
}
configureTableScroll();
window.addEventListener("resize", syncTableScroll);

function render() {
  const visible = filteredRecords();
  const actaView = typeFilter.value === "acta";
  document.getElementById("recordsHead").innerHTML = actaView
    ? "<tr><th>Placa / Código</th><th>Fecha</th><th>Tipo de vehículo</th><th>Marca</th><th>Modelo</th><th>Propietario / Cliente</th><th>Tipo de mantenimiento</th><th>Usuario</th><th>DNI</th><th></th></tr>"
    : '<tr><th>Documento</th><th>Fecha</th><th>Placa</th><th>Marca</th><th>Modelo</th><th>Año</th><th>Color</th><th>KM</th><th>Cliente</th><th>Usuario</th><th>DNI</th><th>Observaciones</th><th></th></tr>'; 
  recordsBody.innerHTML = visible.map(record => actaView ? `
    <tr>
      <td class="document-cell"><strong>${escapeTableValue(record.plate)}</strong></td>
      <td>${escapeTableValue(formatDate(record.date))}</td>
      <td>${escapeTableValue(record.vehicleType)}</td>
      <td>${escapeTableValue(record.brand)}</td>
      <td>${escapeTableValue(record.model)}</td>
      <td>${escapeTableValue(record.client)}</td>
      <td>${escapeTableValue(record.serviceType)}</td>
      <td>${escapeTableValue(record.signerName)}</td>
      <td>${escapeTableValue(record.signerDni)}</td>
      <td><button class="action-button" data-edit="${escapeTableValue(record.id)}">Editar</button></td>
    </tr>` : `
    <tr>
      <td class="document-cell"><strong>${escapeTableValue(record.id)}</strong></td>
      <td>${escapeTableValue(formatDate(record.date))}</td><td>${escapeTableValue(record.plate)}</td><td>${escapeTableValue(record.brand)}</td>
      <td>${escapeTableValue(record.model)}</td><td>${escapeTableValue(record.year)}</td><td>${escapeTableValue(record.color)}</td>
      <td>${escapeTableValue(record.km)}</td><td>${escapeTableValue(record.client)}</td><td>${escapeTableValue(record.signerName)}</td>
      <td>${escapeTableValue(record.signerDni)}</td><td class="observations-cell" title="${escapeTableValue(record.observations)}">${escapeTableValue(record.observations)}</td>
      <td><button class="action-button" data-edit="${escapeTableValue(record.id)}">Editar</button></td>
    </tr>`).join("");
  document.getElementById("emptyState").hidden = visible.length !== 0;
  syncTableScroll();
}

function openEditor(id) {
  const record = records.find(item => item.id === id);
  if (!record) return;
  editingId = id;
  document.getElementById("dialogType").textContent = record.type === "checklist" ? "CHECKLIST" : "ACTA DE ENTREGA";
  document.getElementById("dialogTitle").textContent = record.title;
  const inputValue = value => String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const vehicleField = record.type === "acta" ? `<label>Tipo de vehículo<input name="vehicleType" value="${inputValue(record.vehicleType)}"></label>` : "";
  const serviceField = record.type === "acta" ? `<label>Tipo de mantenimiento<input name="serviceType" value="${inputValue(record.serviceType)}"></label>` : "";
  fields.innerHTML = `
    <label>Número de documento<input name="id" value="${inputValue(record.id)}" required></label>
    <label>Fecha (DD/MM/AAAA)<input name="date" value="${formatDate(record.date)}" pattern="\\d{1,2}/\\d{1,2}/\\d{4}" placeholder="31/12/2026" required></label>
    <label>Placa / Código<input name="plate" value="${inputValue(record.plate)}"></label>
    ${vehicleField}
    <label>Marca<input name="brand" value="${inputValue(record.brand)}"></label>
    <label>Modelo<input name="model" value="${inputValue(record.model)}"></label>
    ${record.type === "acta" ? "" : '<label>Año<input name="year" value="' + inputValue(record.year) + '"></label><label>Color<input name="color" value="' + inputValue(record.color) + '"></label><label>KM<input name="km" value="' + inputValue(record.km) + '"></label>'}
    ${serviceField}
    <label>Propietario / Cliente<input name="client" value="${inputValue(record.client)}"></label>
    <label>Usuario (quien firma)<input name="signerName" value="${inputValue(record.signerName)}"></label>
    <label>DNI<input name="signerDni" value="${inputValue(record.signerDni)}"></label>
    <label class="wide">Observaciones<textarea name="observations">${inputValue(record.observations)}</textarea></label>`;
  dialog.showModal();
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

recordsBody.addEventListener("click", event => {
  const button = event.target.closest("[data-edit]");
  if (button) openEditor(button.dataset.edit);
});
[searchInput, typeFilter, statusFilter].forEach(control => control.addEventListener("input", render));

document.getElementById("editorForm").addEventListener("submit", event => {
  if (event.submitter?.id === "pdfButton" || !editingId) return;
  event.preventEvent?.();
});

document.getElementById("saveButton").addEventListener("click", async event => {
  event.preventDefault();
  const form = document.getElementById("editorForm");
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const index = records.findIndex(record => record.id === editingId);
  if (index < 0) return;
  const dateValue = String(data.get("date") || "");
  const isoDate = parseDate(dateValue);
  const sheetDate = formatDate(isoDate);
  const changes = {
    id: data.get("id"), date: sheetDate, plate: data.get("plate"), brand: data.get("brand"),
    model: data.get("model"), year: data.get("year"), color: data.get("color"), km: data.get("km"),
    client: data.get("client"), signerName: data.get("signerName"), signerDni: data.get("signerDni"),
    observations: data.get("observations"), vehicleType: data.get("vehicleType") || "", serviceType: data.get("serviceType") || ""
  };
  try {
    const record = records[index];
    const url = record.type === "acta"
      ? `/api/firestore/actas/${encodeURIComponent(record.firestoreId || editingId)}`
      : `/api/sheets/Hoja%201/${encodeURIComponent(editingId)}`;
    const firestoreChanges = {
      ...record.raw,
      id: changes.id, Fecha: changes.date, fecha: isoDate ? new Date(`${isoDate}T12:00:00`).toISOString() : changes.date, placa: changes.plate, marca: changes.brand,
      modelo: changes.model, anio: changes.year, color: changes.color, kilometraje: changes.km,
      propietario: changes.client, cliente: changes.client, nombreResponsable: changes.signerName, dni: changes.signerDni,
      tipoVehiculo: changes.vehicleType, tipoServicio: changes.serviceType, observaciones: changes.observations
    };
    const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record.type === "acta" ? firestoreChanges : changes) });
    if (!response.ok) throw new Error((await response.json()).error || "No fue posible guardar");
    records[index] = {
      ...records[index], ...changes, date: isoDate,
      plate: changes.plate, brand: changes.brand, model: changes.model, year: changes.year,
      color: changes.color, km: changes.km, client: changes.client, vehicleType: changes.vehicleType, serviceType: changes.serviceType,
      signerName: changes.signerName, signerDni: changes.signerDni, observations: changes.observations,
      raw: {
        ...records[index].raw, FECHA: changes.date, PLACA: changes.plate, MARCA: changes.brand,
        MODELO: changes.model, AÑO: changes.year, COLOR: changes.color, KM: changes.km,
        CLIENTE: changes.client, "FIRMA CLIENTE": changes.signerName, DNI: changes.signerDni,
        OBSERVACIONES: changes.observations
      }
    };
    saveRecords();
    await loadChecklistRecords();
    editingId = null;
    dialog.close();
    showToast(record.type === "acta" ? "Cambios guardados en Firebase" : "Cambios guardados en Google Sheets");
  } catch (error) { console.error("Error al guardar checklist", error); showToast(error.message); }
});

document.getElementById("pdfButton").addEventListener("click", () => {
  const record = records.find(item => item.id === editingId);
  if (!record) return;
  try {
    if (record.type === "acta") window.buildActaPdf(record);
    else window.buildChecklistPdf(record);
  } catch (error) { console.error(error); showToast(`No se pudo generar el PDF: ${error.message}`); }
});

["checklists", "actas"].forEach(view => {
  document.querySelector(`[data-view="${view}"]`).addEventListener("click", event => {
    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    event.currentTarget.classList.add("active");
    typeFilter.value = view === "checklists" ? "checklist" : "acta";
    document.getElementById("pageTitle").textContent = view === "checklists" ? "Checklists" : "Actas de entrega";
    render();
  });
});
typeFilter.addEventListener("change", () => {
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === (typeFilter.value === "acta" ? "actas" : "checklists")));
  document.getElementById("pageTitle").textContent = typeFilter.value === "acta" ? "Actas de entrega" : "Checklists";
});

document.getElementById("refreshButton").addEventListener("click", loadChecklistRecords);
loadChecklistRecords();
