const { Router } = require("express");
const { listUsers, setUserActive, listAuditLogs, listHospitals, createHospital, updateHospital } = require("../controllers/admin.controller");
const { asyncHandler } = require("../utils/async");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");

const router = Router();

router.use(requireAuth, requirePermission("platform.manage"));

router.get("/users", asyncHandler(listUsers));
router.patch("/users/:id/active", asyncHandler(setUserActive));
router.get("/audit-logs", asyncHandler(listAuditLogs));
router.get("/hospitals", asyncHandler(listHospitals));
router.post("/hospitals", asyncHandler(createHospital));
router.patch("/hospitals/:id", asyncHandler(updateHospital));

module.exports = router;