const { AppError } = require("../utils/async");

const PERMISSIONS = {
  TOP_ADMIN: [
    "platform.manage",
    "hospital.manage",
    "hospital.view.all",
    "users.manage",
    "audit.read",
  ],
  HOSPITAL_ADMIN: [
    "hospital.manage",
    "department.manage",
    "doctor.manage",
    "staff.manage",
    "appointment.manage",
    "patient.view",
  ],
  HOD: [
    "department.view",
    "department.questionnaire",
    "doctor.view",
    "appointment.view",
    "patient.view",
  ],
  DOCTOR: ["appointment.view", "patient.view"],
  STAFF: ["appointment.manage", "patient.view"],
  PATIENT: ["appointment.self", "patient.self"],
};

const ROLE_LABELS = {
  TOP_ADMIN: "Platform Admin",
  HOSPITAL_ADMIN: "Hospital Admin",
  HOD: "Head of Department",
  DOCTOR: "Doctor",
  STAFF: "Staff",
  PATIENT: "Patient",
};

function hasPermission(user, permission) {
  if (!user?.role) return false;
  return (PERMISSIONS[user.role] || []).includes(permission);
}

function requirePermission(...permissions) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError("Unauthenticated", 401));
    const allowed = permissions.some((permission) => hasPermission(req.user, permission));
    if (!allowed) return next(new AppError("Forbidden", 403));
    next();
  };
}

function isHospitalScopeAllowed(user, hospitalId) {
  if (user?.role === "TOP_ADMIN") return true;
  return user?.hospital_id && hospitalId && String(user.hospital_id) === String(hospitalId);
}

function assertHospitalScope(user, hospitalId) {
  if (!isHospitalScopeAllowed(user, hospitalId)) {
    throw new AppError("You do not have access to this hospital", 403);
  }
}

function isDepartmentScopeAllowed(user, department) {
  if (!department) return false;
  if (!isHospitalScopeAllowed(user, department.hospital_id)) return false;
  if (["HOSPITAL_ADMIN", "STAFF"].includes(user?.role)) return true;
  if (user?.role === "HOD") {
    if (department.hod_id && user.id && String(department.hod_id) === String(user.id)) return true;
    if (user.department_id && String(user.department_id) === String(department._id)) return true;
    return false;
  }
  if (user?.role === "DOCTOR") {
    return user.department_id && String(user.department_id) === String(department._id);
  }
  return false;
}

function assertDepartmentScope(user, department) {
  if (!isDepartmentScopeAllowed(user, department)) {
    throw new AppError("You do not have access to this department", 403);
  }
}

module.exports = {
  PERMISSIONS,
  ROLE_LABELS,
  hasPermission,
  requirePermission,
  isHospitalScopeAllowed,
  assertHospitalScope,
  isDepartmentScopeAllowed,
  assertDepartmentScope,
};