const { Router } = require("express");
const multer = require("multer");
const {
  uploadReport,
  listPatientReports,
  getReport,
  reprocessReport,
  getDoctorPatientOverview,
  getPatientHealthJourney,
  updateReport,
  deleteReport,
} = require("../controllers/medicalDocuments.controller");
const { asyncHandler } = require("../utils/async");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = Router();

// Files are held in memory so the controller can push them to ImageKit and
// hand the buffer to the AI service without a disk round-trip. Local-disk
// storage remains a fallback when ImageKit is not configured.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Hospital staff / HOD / Doctor upload a medical document for a patient
router.post(
  "/patient/:patientId/upload",
  requireAuth,
  requireRole("HOSPITAL_ADMIN", "STAFF", "DOCTOR", "HOD"),
  upload.single("file"),
  asyncHandler(uploadReport)
);

// List a patient's medical documents (doctor / hospital staff)
router.get(
  "/patient/:patientId",
  requireAuth,
  requireRole("DOCTOR", "HOD", "HOSPITAL_ADMIN", "STAFF"),
  asyncHandler(listPatientReports)
);

// Doctor pre-consultation overview: patient info + appointments + AI documents
router.get(
  "/patient/:patientId/overview",
  requireAuth,
  requireRole("DOCTOR", "HOD"),
  asyncHandler(getDoctorPatientOverview)
);

// Patient health journey: longitudinal trends + AI narrative + what changed
router.get(
  "/patient/:patientId/health-journey",
  requireAuth,
  requireRole("DOCTOR", "HOD"),
  asyncHandler(getPatientHealthJourney)
);

// Single report detail with full AI extraction data
router.get("/:id", requireAuth, asyncHandler(getReport));

// Reprocess a report through the AI pipeline
router.post("/:id/reprocess", requireAuth, requireRole("DOCTOR", "HOD", "HOSPITAL_ADMIN", "STAFF"), asyncHandler(reprocessReport));

// Delete a report (same-hospital staff or the uploader) and its stored file
router.delete("/:id", requireAuth, requireRole("HOSPITAL_ADMIN", "STAFF", "DOCTOR", "HOD"), asyncHandler(deleteReport));

// Update report metadata / doctor verification edits
router.patch("/:id", requireAuth, asyncHandler(updateReport));

module.exports = router;