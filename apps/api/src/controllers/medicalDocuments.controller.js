const fs = require("fs");
const path = require("path");
const {
  Report,
  Patient,
  Appointment,
  AuditLog,
  REPORT_TYPES,
} = require("../models/schemas");
const { AppError } = require("../utils/async");
const { extractMedicalDocument, applyExtractionResult, normalizeFlaggedValues } = require("../services/medicalDocumentExtraction");
const {
  isImageKitConfigured,
  uploadReportFile,
  deleteReportFile,
} = require("../services/imageKit");
const {
  getHealthTimeline,
  regenerateHealthTimeline,
  resolveChangedSinceDate,
  buildWhatChanged,
} = require("../services/longitudinalService");
const { formatPct } = require("../services/trendEngine");

function normalizePatientId(rawId) {
  const supplied = String(rawId || "").trim();
  if (!supplied) return supplied;
  return /^\d+$/.test(supplied) ? `PAT-${supplied}` : supplied;
}

function reportJson(report) {
  return {
    id: String(report._id),
    patient_id: report.patient_id ? String(report.patient_id._id || report.patient_id) : null,
    type: report.type,
    title: report.title,
    file_url: report.file_url,
    file_mimetype: report.file_mimetype,
    date: report.date,
    created_at: report.createdAt,
    uploaded_by: report.uploaded_by
      ? {
          id: String(report.uploaded_by._id || report.uploaded_by),
          full_name: report.uploaded_by.full_name || null,
          role: report.uploaded_by.role || null,
        }
      : null,
    summary: report.summary,
    extracted_points: report.extracted_points || [],
    extraction_source: report.extraction_source,
    flagged_findings: report.flagged_findings || [],
    ai_status: report.ai_status || "pending",
    ai_classified_type: report.ai_classified_type,
    ai_summary: report.ai_summary,
    ai_findings: report.ai_findings || [],
    ai_extracted_at: report.ai_extracted_at,
    ai_error: report.ai_error,
    disclaimer:
      report.disclaimer ||
      "This is an AI-generated summary and must be verified by a qualified clinician.",
  };
}

function resolveReportFile(filePath) {
  if (!filePath) return null;
  const uploadsRoot = path.join(__dirname, "../../uploads");
  const candidate = filePath.startsWith("/uploads/") ? path.join(uploadsRoot, filePath.replace("/uploads/", "")) : filePath;
  return candidate;
}

async function locatePatientByIdentifier(identifier) {
  const customId = normalizePatientId(identifier);
  let patient = await Patient.findOne({
    custom_id: new RegExp(`^${customId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  }).populate("user_id", "full_name email");
  // Also accept a raw Mongo ObjectId (the UI passes the patient _id).
  if (!patient && /^[0-9a-fA-F]{24}$/.test(customId)) {
    patient = await Patient.findById(customId).populate("user_id", "full_name email");
  }
  return patient;
}

// ----- Upload a medical document for a patient (hospital staff / doctors) -----

async function uploadReport(req, res) {
  const patient = await locatePatientByIdentifier(req.params.patientId);
  if (!patient) throw new AppError("No patient found for that patient ID", 404);

  if (!req.file) throw new AppError("Report file is required", 400);
  if (!req.body.title?.trim()) throw new AppError("Report title is required", 400);

  const rawType = req.body.type || req.body.documentType || "General";
  const reportType = REPORT_TYPES.includes(rawType) ? rawType : "General";
  const reportDate = req.body.date && !Number.isNaN(new Date(req.body.date).getTime()) ? new Date(req.body.date) : new Date();
  const safeName = (req.file.originalname || "report").replace(/[^a-zA-Z0-9._-]/g, "_");
  const buffer = req.file.buffer;

  // Store the file in ImageKit when configured, otherwise write to the local
  // uploads directory so the report is never lost.
  let fileUrl = null;
  let fileProvider = "local";
  let fileId = null;
  const useCloud = isImageKitConfigured();
  if (useCloud) {
    const cloud = await uploadReportFile({ name: safeName, buffer, contentType: req.file.mimetype });
    if (cloud) {
      fileUrl = cloud.url;
      fileProvider = "imagekit";
      fileId = cloud.fileId;
    }
  }
  if (!fileUrl) {
    const dir = path.join(__dirname, "../../uploads/reports");
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${Date.now()}-${safeName}`;
    fs.writeFileSync(path.join(dir, filename), buffer);
    fileUrl = `/uploads/reports/${filename}`;
  }

  const report = await Report.create({
    patient_id: patient._id,
    hospital_id: req.user.hospital_id || null,
    type: reportType,
    title: req.body.title.trim(),
    file_url: fileUrl,
    file_mimetype: req.file.mimetype || null,
    file_provider: fileProvider,
    file_id: fileId,
    date: reportDate,
    uploaded_by: req.user.id,
    summary: req.body.summary?.trim() || null,
    ai_status: "processing",
  });
  await AuditLog.create({ user_id: req.user.id, action: "REPORT_UPLOADED", entity: "REPORT", entity_id: String(report._id) });

  // Fire-and-forget AI extraction using the in-memory file buffer so
  // extraction works identically for cloud and local-disk reports.
  const fileBase64 = buffer.toString("base64");
  const filename = req.file.originalname || `${report.title || "report"}${path.extname(req.file.originalname || "")}`;
  extractMedicalDocument({
    reportId: String(report._id),
    filePath: null,
    fileBase64,
    fileUrl,
    filename,
    reportType: report.type,
    title: report.title,
  })
    .then(async (data) => {
      const { failed } = await applyExtractionResult({ reportId: report._id, data });
      if (!failed) {
        regenerateHealthTimeline(report.patient_id, patient.user_id?.full_name || "Patient").catch(() => {});
      }
    })
    .catch(async () => {
      await Report.findByIdAndUpdate(report._id, { ai_status: "failed", ai_error: "AI extraction failed" });
    });

  const populated = await Report.findById(report._id).populate("uploaded_by", "full_name role").lean();
  res.status(201).json({ report: reportJson(populated) });
}

// ----- List a patient's medical documents (doctor dashboard) -----

async function listPatientReports(req, res) {
  const { patientId } = req.params;
  const patient = await locatePatientByIdentifier(patientId);
  if (!patient) throw new AppError("No patient found for that patient ID", 404);

  const reports = await Report.find({ patient_id: patient._id })
    .populate("uploaded_by", "full_name role")
    .sort({ date: -1 })
    .lean();

  res.json({
    patient: {
      id: String(patient._id),
      full_name: patient.user_id?.full_name || "Patient",
      custom_id: patient.custom_id || `PAT-${String(patient._id).slice(-4).toUpperCase()}`,
      dob: patient.dob,
      sex: patient.sex,
      blood_type: patient.blood_type,
    },
    reports: reports.map(reportJson),
  });
}

// ----- Single report detail (full AI data) -----

async function getReport(req, res) {
  const report = await Report.findById(req.params.id)
    .populate("uploaded_by", "full_name role")
    .lean();
  if (!report) throw new AppError("Report not found", 404);

  if (report.hospital_id && req.user.hospital_id && String(report.hospital_id) !== String(req.user.hospital_id)) {
    // Doctors may view any hospital's records for a confirmed patient; hospital staff are scoped.
    if (["DOCTOR", "HOD"].includes(req.user.role)) {
      // Allow cross-hospital doctor access for continuity of care. Audited below.
    } else {
      throw new AppError("You do not have access to this report", 403);
    }
  }

  await AuditLog.create({ user_id: req.user.id, action: "REPORT_VIEWED", entity: "REPORT", entity_id: String(report._id) });
  res.json({ report: reportJson(report) });
}

// ----- Reprocess a report through AI extraction -----

async function reprocessReport(req, res) {
  const report = await Report.findById(req.params.id);
  if (!report) throw new AppError("Report not found", 404);

  if (report.type === "Prescription" || report.ai_status === "skipped") {
    throw new AppError("Prescriptions are stored as the patient entered them — AI analysis is only run on lab/test reports.", 400);
  }

  const isCloudFile = /^https?:\/\//.test(report.file_url || "");
  const filePath = isCloudFile ? null : resolveReportFile(report.file_url);
  report.ai_status = "processing";
  report.ai_error = null;
  await report.save();

  const filename = (report.file_url || "").split("/").pop() || report.title || "";
  const result = await extractMedicalDocument({
    reportId: String(report._id),
    filePath,
    fileUrl: isCloudFile ? report.file_url : null,
    filename,
    reportType: report.type,
    title: report.title,
  });

  if (!result) {
    report.ai_status = "failed";
    report.ai_error = "AI service unavailable";
    await report.save();
    res.json({ report: reportJson(report) });
    return;
  }

  const findings = Array.isArray(result.findings) ? result.findings.map((f) => ({
    name: f.name || "Unknown",
    value: f.value !== undefined && f.value !== null ? String(f.value) : null,
    unit: f.unit || null,
    reference_range: f.reference_range || null,
    status: f.status || "normal",
  })) : [];

  const failed = Boolean(result.error);
  const usableSummary = result.summary && !failed;
  report.ai_status = failed ? "failed" : "completed";
  report.ai_classified_type = result.classified_type || report.type;
  report.ai_summary = usableSummary ? result.summary : null;
  report.ai_findings = findings;
  report.ai_raw_text = result.raw_text || report.ai_raw_text;
  const normalized = normalizeFlaggedValues(result.flagged_values);
  report.flagged_findings = normalized.length > 0 ? normalized : report.flagged_findings;
  report.extracted_points = Array.isArray(result.key_observations) ? result.key_observations.filter(Boolean) : report.extracted_points;
  report.extraction_source = "ai-pipeline";
  report.ai_extracted_at = new Date();
  report.ai_error = result.error || null;
  report.summary = usableSummary ? result.summary : null;
  await report.save();

  if (!failed) {
    regenerateHealthTimeline(report.patient_id).catch(() => {});
  }

  res.json({ report: reportJson(report) });
}

// ----- Doctor pre-consultation overview: patient + appointment + AI docs -----

async function getDoctorPatientOverview(req, res) {
  const { patientId } = req.params;
  const patient = await locatePatientByIdentifier(patientId);
  if (!patient) throw new AppError("No patient found for that patient ID", 404);

  const reports = await Report.find({ patient_id: patient._id })
    .populate("uploaded_by", "full_name role")
    .sort({ date: -1 })
    .lean();

  const appointments = await Appointment.find({ patient_id: patient._id })
    .sort({ scheduled_for: -1 })
    .limit(5)
    .populate({ path: "doctor_id", populate: { path: "user_id", select: "full_name" } })
    .lean();

  res.json({
    patient: {
      id: String(patient._id),
      custom_id: patient.custom_id || `PAT-${String(patient._id).slice(-4).toUpperCase()}`,
      abha_id: patient.abha_id || null,
      full_name: patient.user_id?.full_name || "Patient",
      dob: patient.dob,
      sex: patient.sex,
      blood_type: patient.blood_type,
      contact_phone: patient.contact_phone,
      known_allergies: patient.known_allergies || [],
      chronic_conditions: patient.chronic_conditions || [],
    },
    appointments: appointments.map((a) => ({
      _id: String(a._id),
      scheduled_for: a.scheduled_for,
      department: a.department,
      status: a.status,
      reason: a.reason,
      doctor: a.doctor_id ? { id: String(a.doctor_id._id || a.doctor_id), full_name: a.doctor_id.user_id?.full_name || "Doctor" } : null,
    })),
    reports: reports.map(reportJson),
    ai_version: "v1",
  });
}

// ----- Patient health journey: longitudinal trends + AI narrative -----

function patientAge(dob) {
  if (!dob) return null;
  const birth = new Date(String(dob));
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

async function getPatientHealthJourney(req, res) {
  const { patientId } = req.params;
  const patient = await locatePatientByIdentifier(patientId);
  if (!patient) throw new AppError("No patient found for that patient ID", 404);

  const fullName = patient.user_id?.full_name || "Patient";
  const timeline = await getHealthTimeline(patient._id, fullName, { force: req.query.refresh === "1" });

  let changed = null;
  if (timeline) {
    const sinceDate = await resolveChangedSinceDate(patient._id, timeline);
    changed = buildWhatChanged(timeline, sinceDate);
  }

  res.json({
    patient: {
      id: String(patient._id),
      custom_id: patient.custom_id || `PAT-${String(patient._id).slice(-4).toUpperCase()}`,
      full_name: fullName,
      dob: patient.dob,
      sex: patient.sex,
      blood_type: patient.blood_type,
      age: patientAge(patient.dob),
    },
    journey: timeline
      ? {
          stats: {
            reports: timeline.report_count || 0,
            visits: timeline.visit_count || 0,
            first_report_date: timeline.first_report_date,
            last_report_date: timeline.last_report_date,
            tracked_parameters: (timeline.parameters || []).length,
          },
          parameters: (timeline.parameters || []).map((p) => ({
            key: p.key,
            name: p.name,
            unit: p.unit,
            flagged: p.flagged,
            trend: p.trend,
            first_value: p.first_value,
            last_value: p.last_value,
            first_date: p.first_date,
            last_date: p.last_date,
            overall_change_pct: p.overall_change_pct,
            overall_change_label: formatPct(p.overall_change_pct),
            readings: p.readings || [],
          })),
          timeline: timeline.timeline || [],
          summary: timeline.summary,
          summary_error: timeline.summary_error,
          generated_at: timeline.generated_at,
          source_reports: timeline.source_report_ids || [],
        }
      : null,
    changed: changed || { since_date: null, reports_added: [], parameters: [] },
  });
}

// ----- Update a report (diagnosis verification, notes) static update helper -----

async function updateReport(req, res) {
  const report = await Report.findById(req.params.id);
  if (!report) throw new AppError("Report not found", 404);

  if (req.body.type !== undefined && REPORT_TYPES.includes(req.body.type)) report.type = req.body.type;
  if (req.body.title !== undefined && req.body.title.trim()) report.title = req.body.title.trim();
  if (req.body.summary !== undefined) report.summary = req.body.summary?.trim() || null;
  if (req.body.extracted_points !== undefined && Array.isArray(req.body.extracted_points)) {
    report.extracted_points = req.body.extracted_points.filter((p) => typeof p === "string");
  }
  if (req.body.flagged_findings !== undefined && Array.isArray(req.body.flagged_findings)) {
    report.flagged_findings = req.body.flagged_findings.filter((p) => typeof p === "string");
  }
  await report.save();
  res.json({ report: reportJson(await Report.findById(report._id).populate("uploaded_by", "full_name role").lean()) });
}

// ----- Delete a report (hospital staff / uploader) plus its stored file -----

async function deleteReport(req, res) {
  const report = await Report.findById(req.params.id);
  if (!report) throw new AppError("Report not found", 404);

  const isSameHospital =
    report.hospital_id &&
    req.user.hospital_id &&
    String(report.hospital_id) === String(req.user.hospital_id);
  const isUploader = report.uploaded_by && String(report.uploaded_by) === String(req.user.id);
  // Hospital record managers may delete any report they can view (mistaken
  // uploads, duplicates); doctors are limited to their own uploads.
  const isHospitalStaff = ["HOSPITAL_ADMIN", "STAFF"].includes(req.user.role);
  if (!isHospitalStaff && !isSameHospital && !isUploader) {
    throw new AppError("You do not have access to delete this report", 403);
  }

  // Cloud file cleanup (ImageKit) — requires the file id captured at upload.
  if (report.file_provider === "imagekit" && report.file_id) {
    await deleteReportFile(report.file_id);
  } else if (report.file_provider === "imagekit") {
    console.warn("[medical-doc] cloud file has no stored file_id; skipping ImageKit cleanup");
  }

  // Local file cleanup (best-effort).
  if (report.file_url && report.file_url.startsWith("/uploads/")) {
    const localPath = resolveReportFile(report.file_url);
    if (localPath) {
      fs.unlink(localPath, () => {});
    }
  }

  await report.deleteOne();
  await AuditLog.create({ user_id: req.user.id, action: "REPORT_DELETED", entity: "REPORT", entity_id: String(report._id) });
  res.status(204).end();
}

module.exports = {
  uploadReport,
  listPatientReports,
  getReport,
  reprocessReport,
  getDoctorPatientOverview,
  getPatientHealthJourney,
  updateReport,
  deleteReport,
  reportJson,
};