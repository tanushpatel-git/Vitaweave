const express = require("express");
const path = require("path");
const cors = require("cors");
const { config } = require("./config");
const { errorHandler, logRequest } = require("./middleware/error");
const authRoutes = require("./routes/auth.routes");
const doctorsRoutes = require("./routes/doctors.routes");
const conversationsRoutes = require("./routes/conversations.routes");
const documentsRoutes = require("./routes/documents.routes");
const aiConfigRoutes = require("./routes/aiConfig.routes");
const adminRoutes = require("./routes/admin.routes");
const hospitalRoutes = require("./routes/hospital.routes");
const caseHistoryRoutes = require("./routes/caseHistory.routes");
const appointmentsRoutes = require("./routes/appointments.routes");
const medicalDocumentsRoutes = require("./routes/medicalDocuments.routes");
const { connectDb, createIndexes } = require("./db");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use((req, res, next) => {
  const start = Date.now();
  logRequest(req, res, start);
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api", db: "mongodb" });
});

app.use("/api/auth", authRoutes);
app.use("/api/doctors", doctorsRoutes);
app.use("/api/conversations", conversationsRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/ai-config", aiConfigRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/case-history", caseHistoryRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/medical-documents", medicalDocumentsRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

async function start() {
  await connectDb();
  await createIndexes();
  app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port}`);
  });
}

start().catch((e) => {
  console.error("[api] failed to start:", e.message);
  process.exit(1);
});
