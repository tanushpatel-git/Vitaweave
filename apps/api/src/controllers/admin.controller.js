const { User, Hospital, AuditLog, normalizeRole } = require("../models/schemas");
const { AppError } = require("../utils/async");
const { hashPassword } = require("../utils/password");

function sanitisizeUser(user) {
  return {
    id: user._id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    is_active: user.is_active,
    hospital_id: user.hospital_id ? String(user.hospital_id) : null,
    department_id: user.department_id ? String(user.department_id) : null,
    created_at: user.createdAt,
  };
}

async function listUsers(req, res) {
  const { role, q, hospital_id } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (hospital_id) filter.hospital_id = hospital_id;
  if (q) {
    const rx = new RegExp(q, "i");
    filter.$or = [{ email: rx }, { full_name: rx }];
  }
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ users: users.map(sanitisizeUser) });
}

async function setUserActive(req, res) {
  const { active } = req.body;
  if (typeof active !== "boolean") throw new AppError("active is required", 400);
  const user = await User.findByIdAndUpdate(req.params.id, { is_active: active }, { new: true });
  if (!user) throw new AppError("User not found", 404);
  await AuditLog.create({ user_id: req.user.id, action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED", entity: "USER", entity_id: String(user._id) });
  res.json({ ok: true });
}

async function listAuditLogs(_req, res) {
  const logs = await AuditLog.find()
    .populate("user_id", "email")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  res.json({
    logs: logs.map((l) => ({
      id: l._id,
      user_id: l.user_id,
      email: l.user_id?.email,
      action: l.action,
      entity: l.entity,
      entity_id: l.entity_id,
      ip: l.ip,
      created_at: l.createdAt,
    })),
  });
}

async function listHospitals(req, res) {
  const hospitals = await Hospital.find().sort({ createdAt: -1 }).lean();
  res.json({ hospitals });
}

async function createHospital(req, res) {
  const {
    name, code, hospitalType, registrationNumber, phone,
    administratorName, adminEmail, adminPassword,
    address, city, state, pincode, latitude, longitude,
    totalBeds, icuBeds, activeDoctors,
  } = req.body;

  if (!name || !adminEmail || !adminPassword || !administratorName) {
    throw new AppError("name, administratorName, adminEmail and adminPassword are required", 400);
  }
  if (adminPassword.length < 8) {
    throw new AppError("The hospital admin password must be at least 8 characters", 400);
  }

  const existingAdmin = await User.findOne({ email: adminEmail.toLowerCase().trim() });
  if (existingAdmin) throw new AppError("A user with that admin email already exists", 409);
  if (registrationNumber) {
    const existingHospital = await Hospital.findOne({ registration_number: registrationNumber.trim() });
    if (existingHospital) throw new AppError("Hospital registration number already exists", 409);
  }

  const adminUser = await User.create({
    email: adminEmail.toLowerCase().trim(),
    password_hash: await hashPassword(adminPassword),
    role: "HOSPITAL_ADMIN",
    full_name: administratorName.trim(),
  });

  const total = Number(totalBeds) || 0;
  const icu = Number(icuBeds) || 0;
  const hospital = await Hospital.create({
    user_id: adminUser._id,
    code: code?.trim() || `VITA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    name: name.trim(),
    hospital_type: hospitalType || null,
    registration_number: registrationNumber?.trim() || null,
    administrator_name: administratorName.trim(),
    official_email: adminUser.email,
    phone: phone?.trim() || null,
    location: {
      address: address?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      pincode: pincode?.trim() || null,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
    },
    icu_total_beds: Math.max(0, icu),
    general_total_beds: Math.max(0, total - icu),
    active_doctors: Number(activeDoctors) || 0,
  });

  adminUser.hospital_id = hospital._id;
  await adminUser.save();

  await AuditLog.create({
    user_id: req.user.id,
    action: "HOSPITAL_CREATED",
    entity: "HOSPITAL",
    entity_id: String(hospital._id),
  });

  res.status(201).json({ hospital, admin: sanitisizeUser(adminUser) });
}

async function updateHospital(req, res) {
  const hospital = await Hospital.findById(req.params.id);
  if (!hospital) throw new AppError("Hospital not found", 404);
  const updates = ["name", "hospital_type", "registration_number", "phone", "icu_total_beds", "general_total_beds", "active_doctors"];
  for (const key of updates) {
    if (req.body[key] !== undefined) hospital[key] = req.body[key];
  }
  if (req.body.location) hospital.location = { ...hospital.location, ...req.body.location };
  await hospital.save();
  await AuditLog.create({ user_id: req.user.id, action: "HOSPITAL_UPDATED", entity: "HOSPITAL", entity_id: String(hospital._id) });
  res.json({ hospital });
}

module.exports = { listUsers, setUserActive, listAuditLogs, listHospitals, createHospital, updateHospital, normalizeRole };