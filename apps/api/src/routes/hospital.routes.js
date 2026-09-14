const { Router } = require("express");
const {
  getMyHospital,
  updateMyHospital,
  listMyDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listMyDoctors,
  createDoctor,
  updateDoctor,
  listMyStaff,
  createStaff,
  listMyPatients,
  getDepartmentQuestionnaire,
  saveDepartmentQuestionnaire,
} = require("../controllers/hospital.controller");
const { asyncHandler } = require("../utils/async");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");

const router = Router();

router.use(requireAuth);

router.get("/me", requirePermission("hospital.manage"), asyncHandler(getMyHospital));
router.patch("/me", requirePermission("hospital.manage"), asyncHandler(updateMyHospital));

router.get("/departments", requirePermission("department.manage", "department.view"), asyncHandler(listMyDepartments));
router.post("/departments", requirePermission("department.manage"), asyncHandler(createDepartment));
router.patch("/departments/:id", requirePermission("department.manage"), asyncHandler(updateDepartment));
router.delete("/departments/:id", requirePermission("department.manage"), asyncHandler(deleteDepartment));

router.get("/doctors", requirePermission("department.manage", "department.view", "appointment.manage", "appointment.view"), asyncHandler(listMyDoctors));
router.post("/doctors", requirePermission("doctor.manage"), asyncHandler(createDoctor));
router.patch("/doctors/:id", requirePermission("doctor.manage"), asyncHandler(updateDoctor));

router.get("/staff", requirePermission("staff.manage"), asyncHandler(listMyStaff));
router.post("/staff", requirePermission("staff.manage"), asyncHandler(createStaff));

router.get("/patients", requirePermission("appointment.manage", "patient.view"), asyncHandler(listMyPatients));

router.get("/departments/:id/questionnaire", requirePermission("department.questionnaire", "department.manage"), asyncHandler(getDepartmentQuestionnaire));
router.put("/departments/:id/questionnaire", requirePermission("department.questionnaire", "department.manage"), asyncHandler(saveDepartmentQuestionnaire));

module.exports = router;