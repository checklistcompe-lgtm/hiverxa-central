const express = require("express");
const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use((request, response, next) => {
  response.header("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "https://hiverxa-central.web.app");
  response.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  if (request.method === "OPTIONS") return response.sendStatus(204);
  next();
});

const spreadsheetId = process.env.GOOGLE_SHEET_ID || "1_Ap3cI2YyKpXHMn1KcYOmlvTyuW8hndp80o9aAPtPjY";
let sheetsClient;
const firestoreCredentialPath = path.join(__dirname, "acta-e-firebase-adminsdk-fbsvc-a3dd5b7f6e.json");

function getServiceCredentials() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (fs.existsSync(firestoreCredentialPath)) return JSON.parse(fs.readFileSync(firestoreCredentialPath, "utf8"));
  throw new Error("No se encontró la credencial de Firebase");
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return value;
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return value.doubleValue;
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return value.booleanValue;
  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return value.timestampValue;
  if (value.mapValue) return decodeFirestoreFields(value.mapValue.fields || {});
  if (value.arrayValue) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  return value;
}

function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

async function getFirestoreAuth() {
  const credentials = getServiceCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/datastore"]
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  return { projectId: credentials.project_id, token: accessToken.token || accessToken }; 
}

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const authOptions = { scopes: [
    "https://www.googleapis.com/auth/spreadsheets"
  ] };
  const credentials = getServiceCredentials();
  authOptions.credentials = credentials;
  const auth = new google.auth.GoogleAuth(authOptions);
  const client = await auth.getClient();
  sheetsClient = google.sheets({ version: "v4", auth: client });
  return sheetsClient;
}

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", spreadsheetId });
});

app.get("/api/sheets", async (_request, response) => {
  try {
    const sheets = await getSheetsClient();
    const result = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "properties.title,sheets.properties"
    });
    response.json({
      title: result.data.properties.title,
      sheets: result.data.sheets.map(sheet => sheet.properties.title)
    });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/sheets/:sheet", async (request, response) => {
  try {
    const sheets = await getSheetsClient();
    const sheet = request.params.sheet;
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheet}'`
    });
    const rows = result.data.values || [];
    if (!rows.length) return response.json({ sheet, columns: [], records: [] });

    const columns = rows[0].map((value, index) => String(value || `Columna ${index + 1}`));
    const records = rows.slice(1).filter(row => row.some(Boolean)).map(row =>
      Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ""]))
    );
    response.json({ sheet, columns, records });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.put("/api/sheets/:sheet/:checklistId", async (request, response) => {
  try {
    const sheets = await getSheetsClient();
    const sheet = request.params.sheet;
    const current = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheet}'` });
    const rows = current.data.values || [];
    if (!rows.length) return response.status(404).json({ error: "La hoja está vacía" });

    const columns = rows[0];
    const idColumn = columns.findIndex(column => column === "N° CHECKLIST");
    const rowIndex = rows.findIndex((row, index) => index > 0 && row[idColumn] === request.params.checklistId);
    if (rowIndex < 0) return response.status(404).json({ error: "Checklist no encontrado" });

    const updates = request.body || {};
    const fieldMap = {
      "N° CHECKLIST": "id", FECHA: "date", PLACA: "plate", MARCA: "brand",
      MODELO: "model", AÑO: "year", COLOR: "color", KM: "km",
      CLIENTE: "client", "FIRMA CLIENTE": "signerName", DNI: "signerDni",
      OBSERVACIONES: "observations"
    };
    const cells = columns.map((column, columnIndex) => {
      const field = fieldMap[column];
      if (field && Object.prototype.hasOwnProperty.call(updates, field)) {
        return updates[field] == null ? "" : String(updates[field]);
      }
      return rows[rowIndex][columnIndex] ?? "";
    });
    const columnLetter = index => { let result = ""; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result; return result; };
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheet}'!A${rowIndex + 1}:${columnLetter(columns.length - 1)}${rowIndex + 1}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [cells] }
    });
    response.json({ ok: true, checklistId: request.params.checklistId });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/firestore/:collection", async (request, response) => {
  try {
    const { projectId, token } = await getFirestoreAuth();
    const collection = encodeURIComponent(request.params.collection);
    const result = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}?pageSize=1000`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error?.message || "No fue posible consultar Firestore");
    const documents = (data.documents || []).map(document => ({
      id: document.name.split("/").pop(),
      name: document.name,
      data: decodeFirestoreFields(document.fields || {})
    }));
    response.json({ projectId, collection: request.params.collection, documents });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

function encodeFirestoreValue(value, fieldName = "") {
  if (["fecha", "fechaEntrega", "createdAt"].includes(fieldName) && typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return { timestampValue: value };
  }
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeFirestoreFields(value) } };
  return { stringValue: String(value ?? "") };
}

function encodeFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeFirestoreValue(value, key)]));
}

app.put("/api/firestore/:collection/:documentId", async (request, response) => {
  try {
    const { projectId, token } = await getFirestoreAuth();
    const collection = request.params.collection;
    const documentId = request.params.documentId;
    const readUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(documentId)}`;
    const currentResult = await fetch(readUrl, { headers: { Authorization: "Bearer " + token } });
    const current = await currentResult.json();
    if (!currentResult.ok) throw new Error(current.error?.message || "Acta no encontrada");
    const existing = decodeFirestoreFields(current.fields || {});
    const updated = { ...existing, ...request.body };
    const writeResult = await fetch(readUrl, {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: encodeFirestoreFields(updated) })
    });
    const writeData = await writeResult.json();
    if (!writeResult.ok) throw new Error(writeData.error?.message || "No fue posible guardar el acta");
    response.json({ ok: true, documentId });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/drive-image", async (request, response) => {
  const rawUrl = request.query.url;
  if (!rawUrl) return response.status(400).json({ error: "Falta el parámetro url" });

  const match = String(rawUrl).match(/(?:\/d\/|id=)([a-zA-Z0-9_-]+)/);
  if (!match) return response.status(400).json({ error: "No se encontró un ID de Drive válido" });

  try {
    const upstream = await fetch(`https://drive.google.com/uc?export=download&id=${match[1]}`, { redirect: "follow" });
    if (!upstream.ok) throw new Error(`Drive respondió ${upstream.status}`);
    const contentType = upstream.headers.get("content-type") || "image/png";
    if (!contentType.startsWith("image/")) throw new Error("El enlace de Drive no devolvió una imagen pública");
    response.setHeader("Content-Type", contentType);
    response.setHeader("Cache-Control", "public, max-age=3600");
    response.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    response.status(502).json({ error: "No fue posible cargar la firma desde Drive", detail: error.message });
  }
});

app.use(express.static(__dirname));
if (require.main === module) {
  app.listen(process.env.PORT || 8080, "0.0.0.0", () => {
    console.log(`Servidor iniciado en http://localhost:${process.env.PORT || 8080}`);
  });
}
module.exports = app;
