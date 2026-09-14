const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { createAppointment, listAppointmentOptions, listMyAppointments, updateMyAppointment, listHospitalAppointments, listDoctorAppointments, getAppointmentScreening, updateHospitalAppointment, getHospitalPatientAppointment, uploadHospitalPatientReport, uploadMyPrescription, getMyAppointmentQuestionnaire, submitMyAppointmentScreening, transcribeScreeningAudio, startScreeningConversation, sendScreeningMessage, correctScreeningAnswer } = require("../controllers/appointments.controller");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../utils/async");

const router = Router();
const reportStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    const directory = path.join(__dirname, "../../uploads/reports");
    fs.mkdirSync(directory, { recursive: true });
    callback(null, directory);
  },
  filename: (_req, file, callback) => callback(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`),
});
const upload = multer({ storage: reportStorage, limits: { fileSize: 20 * 1024 * 1024 } });
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
router.get("/options", requireAuth, requireRole("PATIENT"), asyncHandler(listAppointmentOptions));
router.get("/mine", requireAuth, requireRole("PATIENT"), asyncHandler(listMyAppointments));
router.patch("/mine/:id", requireAuth, requireRole("PATIENT"), asyncHandler(updateMyAppointment));
router.post("/", requireAuth, requireRole("PATIENT"), asyncHandler(createAppointment));
router.get("/mine/:id/questionnaire", requireAuth, requireRole("PATIENT"), asyncHandler(getMyAppointmentQuestionnaire));
router.post("/mine/:id/questionnaire/answers", requireAuth, requireRole("PATIENT"), asyncHandler(submitMyAppointmentScreening));
router.get("/mine/:id/screening/start", requireAuth, requireRole("PATIENT"), asyncHandler(startScreeningConversation));
router.post("/mine/:id/screening/message", requireAuth, requireRole("PATIENT"), asyncHandler(sendScreeningMessage));
router.post("/mine/:id/transcribe", requireAuth, requireRole("PATIENT"), audioUpload.single("file"), asyncHandler(transcribeScreeningAudio));
router.post("/patient/prescriptions", requireAuth, requireRole("PATIENT"), upload.single("file"), asyncHandler(uploadMyPrescription));
router.get("/hospital", requireAuth, requireRole("HOSPITAL_ADMIN", "STAFF"), asyncHandler(listHospitalAppointments));
router.get("/doctor", requireAuth, requireRole("DOCTOR", "HOD"), asyncHandler(listDoctorAppointments));
router.get("/hospital/:id/screening", requireAuth, requireRole("HOSPITAL_ADMIN", "STAFF", "DOCTOR", "HOD"), asyncHandler(getAppointmentScreening));
router.post("/hospital/:id/screening/correct", requireAuth, requireRole("HOSPITAL_ADMIN", "STAFF", "DOCTOR", "HOD"), asyncHandler(correctScreeningAnswer));
router.patch("/hospital/:id", requireAuth, requireRole("HOSPITAL_ADMIN", "STAFF"), asyncHandler(updateHospitalAppointment));
router.get("/hospital/patient/:patientId", requireAuth, requireRole("HOSPITAL_ADMIN", "STAFF"), asyncHandler(getHospitalPatientAppointment));
router.post("/hospital/patient/:patientId/report", requireAuth, requireRole("HOSPITAL_ADMIN", "STAFF"), upload.single("file"), asyncHandler(uploadHospitalPatientReport));
module.exports = router;
