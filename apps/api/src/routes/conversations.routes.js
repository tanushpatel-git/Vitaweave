const { Router } = require("express");
const {
  listMyConversations,
  listDoctorConversations,
  getConversation,
  createConversation,
  sendMessage,
  getPatientConversationSummary,
} = require("../controllers/conversations.controller");
const { asyncHandler } = require("../utils/async");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = Router();

// patient + doctor can list their own
router.get("/", requireAuth, asyncHandler(listMyConversations));
router.get("/doctor", requireAuth, requireRole("DOCTOR"), asyncHandler(listDoctorConversations));
router.get("/doctor/patients/:patientId/summary", requireAuth, requireRole("DOCTOR"), asyncHandler(getPatientConversationSummary));
router.get("/:id", requireAuth, asyncHandler(getConversation));
router.post("/", requireAuth, requireRole("PATIENT"), asyncHandler(createConversation));
router.post("/:id/messages", requireAuth, asyncHandler(sendMessage));

module.exports = router;
