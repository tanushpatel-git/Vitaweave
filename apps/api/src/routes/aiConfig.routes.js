const { Router } = require("express");
const { getMyAiConfig, upsertMyAiConfig } = require("../controllers/aiConfig.controller");
const { asyncHandler } = require("../utils/async");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = Router();

router.get("/", requireAuth, requireRole("DOCTOR", "HOD"), asyncHandler(getMyAiConfig));
router.put("/", requireAuth, requireRole("DOCTOR", "HOD"), asyncHandler(upsertMyAiConfig));

module.exports = router;