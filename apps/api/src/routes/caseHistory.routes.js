const { Router } = require("express");
const {
  searchPatients,
  getPatientProfile,
  getPatientClinicalSummary,
  getPatientTimeline,
  createConsultation,
  saveCaseSheet,
  uploadReport,
  getEmergencyDataset,
  linkAbhaId,
  extractCaseSheet,
  transcribeAudio,
  transcribeAudioFile,
} = require("../controllers/caseHistory.controller");
const { asyncHandler } = require("../utils/async");
const { requireAuth, requireRole } = require("../middleware/auth");
const multer = require("multer");

const router = Router();
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

// Search patients by name, ID, or ABHA
router.get("/patients/search", requireAuth, asyncHandler(searchPatients));

// Patient profile & emergency dataset
router.get("/patients/:id/profile", requireAuth, asyncHandler(getPatientProfile));
router.get("/patients/:id/clinical-summary", requireAuth, requireRole("DOCTOR"), asyncHandler(getPatientClinicalSummary));
router.get("/patients/:id/timeline", requireAuth, asyncHandler(getPatientTimeline));
router.get("/patients/:id/emergency", requireAuth, asyncHandler(getEmergencyDataset));

// Consultations & DPDP Consent
router.post("/consultations", requireAuth, asyncHandler(createConsultation));
router.post("/consultations/:id/case-sheet", requireAuth, asyncHandler(saveCaseSheet));

// Reports & ABHA
router.post("/reports", requireAuth, asyncHandler(uploadReport));
router.post("/patients/:id/abha", requireAuth, asyncHandler(linkAbhaId));

// AI Extraction & Audio STT
router.post("/ai/extract", requireAuth, asyncHandler(extractCaseSheet));
router.post("/ai/transcribe", requireAuth, asyncHandler(transcribeAudio));
router.post("/ai/transcribe-audio", requireAuth, uploadAudio.single("file"), asyncHandler(transcribeAudioFile));

module.exports = router;
