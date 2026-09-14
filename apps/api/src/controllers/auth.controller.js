const { User, Doctor, Patient, Hospital, Department, AuditLog, normalizeRole } = require("../models/schemas");
const { hashPassword, comparePassword } = require("../utils/password");
const { signToken } = require("../utils/jwt");
const { AppError } = require("../utils/async");

function toAuthUser({ id, email, role, full_name, doctor_id, patient_id, hospital_id, department_id }) {
  return {
    id: String(id),
    email,
    role: normalizeRole(role),
    full_name,
    doctor_id: doctor_id ? String(doctor_id) : undefined,
    patient_id: patient_id ? String(patient_id) : undefined,
    hospital_id: hospital_id ? String(hospital_id) : undefined,
    department_id: department_id ? String(department_id) : undefined,
  };
}

async function register(req, res) {
  const { email, password, fullName, role } = req.body;

  if (!email || !password || !fullName) {
    throw new AppError("email, password and fullName are required", 400);
  }
  if (role !== "DOCTOR" && role !== "PATIENT") {
    throw new AppError("Public registration accepts DOCTOR or PATIENT accounts only", 400);
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) throw new AppError("Email already registered", 409);

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    email: email.toLowerCase().trim(),
    password_hash: passwordHash,
    role,
    full_name: fullName,
    hospital_id: null,
    department_id: null,
  });

  if (role === "DOCTOR") {
    const { specialty, licenseNo } = req.body;
    const doctor = await Doctor.create({
      user_id: user._id,
      hospital_id: null,
      department_id: null,
      specialty: specialty || null,
      license_no: licenseNo || null,
      is_hod: false,
    });
    await AuditLog.create({ user_id: user._id, action: "REGISTER", entity: "DOCTOR", entity_id: String(doctor._id) });
    const authUser = toAuthUser({ id: user._id, email: user.email, role: user.role, full_name: user.full_name, doctor_id: doctor._id });
    res.status(201).json({ token: signToken(authUser), user: authUser });
  } else {
    const {
      abha_id, dob, sex, blood_type, bloodType, contact_phone,
      emergency_contact, known_allergies, chronic_conditions,
    } = req.body;
    if (!dob || !sex || !blood_type || !contact_phone || !emergency_contact?.name || !emergency_contact?.phone || !emergency_contact?.relation || !Array.isArray(known_allergies) || !Array.isArray(chronic_conditions)) {
      throw new AppError("Complete all required patient profile and emergency contact fields", 400);
    }
    const asStringArray = (value) => Array.isArray(value)
      ? value.map((item) => String(item).trim()).filter(Boolean)
      : [];
    const patient = await Patient.create({
      user_id: user._id,
      // Patient-facing IDs are issued by the server so they cannot collide.
      custom_id: `PAT-${String(user._id).slice(-6).toUpperCase()}`,
      abha_id: abha_id?.trim() || null,
      dob,
      sex,
      blood_type: blood_type || bloodType,
      contact_phone: contact_phone.trim(),
      emergency_contact: {
        name: emergency_contact.name.trim(),
        phone: emergency_contact.phone.trim(),
        relation: emergency_contact.relation.trim(),
      },
      known_allergies: asStringArray(known_allergies),
      chronic_conditions: asStringArray(chronic_conditions),
    });
    await AuditLog.create({ user_id: user._id, action: "REGISTER", entity: "PATIENT", entity_id: String(patient._id) });
    const authUser = toAuthUser({ id: user._id, email: user.email, role: user.role, full_name: user.full_name, patient_id: patient._id });
    res.status(201).json({ token: signToken(authUser), user: authUser, patient });
  }
}

async function updateMyPatientProfile(req, res) {
  const patient = await Patient.findOne({ user_id: req.user.id });
  if (!patient) throw new AppError("Patient profile not found", 404);

  const { abha_id, dob, sex, blood_type, contact_phone, emergency_contact, known_allergies, chronic_conditions } = req.body;
  const asStringArray = (value) => Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : undefined;

  if (abha_id !== undefined) patient.abha_id = abha_id?.trim() || null;
  if (dob !== undefined) patient.dob = dob || null;
  if (sex !== undefined) patient.sex = sex || null;
  if (blood_type !== undefined) patient.blood_type = blood_type || null;
  if (contact_phone !== undefined) patient.contact_phone = contact_phone?.trim() || null;
  if (emergency_contact !== undefined) {
    patient.emergency_contact = {
      name: emergency_contact?.name?.trim() || null,
      phone: emergency_contact?.phone?.trim() || null,
      relation: emergency_contact?.relation?.trim() || null,
    };
  }
  const allergies = asStringArray(known_allergies);
  const conditions = asStringArray(chronic_conditions);
  if (allergies !== undefined) patient.known_allergies = allergies;
  if (conditions !== undefined) patient.chronic_conditions = conditions;
  await patient.save();
  res.json({ patient });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new AppError("email and password are required", 400);
  }
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !user.is_active) {
    throw new AppError("Invalid credentials", 401);
  }
  const ok = await comparePassword(password, user.password_hash);
  if (!ok) throw new AppError("Invalid credentials", 401);

  const doctor = await Doctor.findOne({ user_id: user._id });
  const patient = await Patient.findOne({ user_id: user._id });
  const hospital = await Hospital.findOne({ user_id: user._id });
  const department = user.department_id
    ? await Department.findById(user.department_id)
    : null;

  const authUser = toAuthUser({
    id: user._id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    doctor_id: doctor?._id,
    patient_id: patient?._id,
    hospital_id: hospital?._id || user.hospital_id,
    department_id: department?._id || (doctor?.department_id) || user.department_id,
  });
  const token = signToken(authUser);
  await AuditLog.create({ user_id: user._id, action: "LOGIN", entity: "user", entity_id: String(user._id) });
  res.json({ token, user: authUser });
}

async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError("Not found", 404);
  const doctor = await Doctor.findOne({ user_id: user._id });
  const patient = await Patient.findOne({ user_id: user._id });
  const hospital = await Hospital.findOne({ user_id: user._id });
  res.json({
    user: {
      id: user._id,
      email: user.email,
      role: normalizeRole(user.role),
      full_name: user.full_name,
      doctor_id: doctor?._id,
      doctor,
      patient_id: patient?._id,
      patient,
      hospital_id: hospital?._id || user.hospital_id,
      department_id: doctor?.department_id || user.department_id,
      hospital,
    },
  });
}

module.exports = { register, login, me, updateMyPatientProfile };
