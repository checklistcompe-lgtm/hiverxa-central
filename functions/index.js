const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const app = require("./server");
const serviceAccount = defineSecret("FIREBASE_SERVICE_ACCOUNT_JSON");

exports.api = onRequest({ region: "us-central1", secrets: [serviceAccount] }, (request, response) => {
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = serviceAccount.value();
  app(request, response);
});
