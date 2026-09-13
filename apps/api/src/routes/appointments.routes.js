const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { createAppointment, listAppointmentOptions, listMyAppointments, updateMyAppointment, listHospitalAppointments, updateHospitalAppointment, getHospitalPatientAppointment, uploadHospitalPatientReport, uploadMyPrescription } = require("../controllers/appointments.controller");
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
router.get("/options", requireAuth, requireRole("PATIENT"), asyncHandler(listAppointmentOptions));
router.get("/mine", requireAuth, requireRole("PATIENT"), asyncHandler(listMyAppointments));
router.patch("/mine/:id", requireAuth, requireRole("PATIENT"), asyncHandler(updateMyAppointment));
router.post("/", requireAuth, requireRole("PATIENT"), asyncHandler(createAppointment));
router.post("/patient/prescriptions", requireAuth, requireRole("PATIENT"), upload.single("file"), asyncHandler(uploadMyPrescription));
router.get("/hospital", requireAuth, requireRole("HOSPITAL"), asyncHandler(listHospitalAppointments));
router.patch("/hospital/:id", requireAuth, requireRole("HOSPITAL"), asyncHandler(updateHospitalAppointment));
router.get("/hospital/patient/:patientId", requireAuth, requireRole("HOSPITAL"), asyncHandler(getHospitalPatientAppointment));
router.post("/hospital/patient/:patientId/report", requireAuth, requireRole("HOSPITAL"), upload.single("file"), asyncHandler(uploadHospitalPatientReport));
module.exports = router;
