const mongoose = require("mongoose");
const { User, Doctor, Department, Hospital, Patient, Appointment, DepartmentQuestionnaire, AuditLog, normalizeRole, ANSWER_TYPES } = require("../models/schemas");
const { AppError } = require("../utils/async");
const { hashPassword } = require("../utils/password");
const { assertHospitalScope, assertDepartmentScope } = require("../middleware/permissions");

function hospitalIdOf(req) {
  const id = req.user.hospital_id;
  if (!id) throw new AppError("You are not linked to a hospital", 403);
  return id;
}

// ----- Hospitals -----

async function getMyHospital(req, res) {
  const hospital = await Hospital.findById(hospitalIdOf(req)).populate("user_id", "email full_name is_active");
  if (!hospital) throw new AppError("Hospital not found", 404);
  res.json({ hospital });
}

async function updateMyHospital(req, res) {
  const hospital = await Hospital.findById(hospitalIdOf(req));
  if (!hospital) throw new AppError("Hospital not found", 404);
  const updates = ["hospital_type", "phone", "icu_total_beds", "general_total_beds", "active_doctors"];
  for (const key of updates) {
    if (req.body[key] !== undefined) hospital[key] = req.body[key];
  }
  if (req.body.location) hospital.location = { ...hospital.location, ...req.body.location };
  await hospital.save();
  await AuditLog.create({ user_id: req.user.id, action: "HOSPITAL_UPDATED", entity: "HOSPITAL", entity_id: String(hospital._id) });
  res.json({ hospital });
}

// ----- Departments -----

function departmentDetails(department) {
  return {
    id: String(department._id),
    hospital_id: String(department.hospital_id),
    name: department.name,
    code: department.code,
    description: department.description,
    is_active: department.is_active,
    hod_id: department.hod_id ? String(department.hod_id) : null,
    hod_name: department.hod_name || null,
    doctor_count: department.doctor_count || 0,
    created_at: department.createdAt,
  };
}

async function listMyDepartments(req, res) {
  const hospitalId = hospitalIdOf(req);
  const departments = await Department.find({ hospital_id: hospitalId }).sort({ name: 1 }).lean();
  const hodIds = departments.map((d) => d.hod_id).filter(Boolean);
  const hodUsers = hodIds.length ? await User.find({ _id: { $in: hodIds } }, "full_name email role").lean() : [];
  const hodByName = new Map(hodUsers.map((u) => [String(u._id), u.full_name]));
  const doctorCounts = await Doctor.aggregate([
    { $match: { hospital_id: hospitalId, department_id: { $in: departments.map((d) => d._id) } } },
    { $group: { _id: "$department_id", count: { $sum: 1 } } },
  ]);
  const countByDept = new Map(doctorCounts.map((c) => [String(c._id), c.count]));
  res.json({
    departments: departments.map((d) => ({
      ...departmentDetails(d),
      hod_name: d.hod_id ? (hodByName.get(String(d.hod_id)) || null) : null,
      doctor_count: countByDept.get(String(d._id)) || 0,
    })),
  });
}

async function createDepartment(req, res) {
  const hospitalId = hospitalIdOf(req);
  const { name, code, description } = req.body;
  if (!name?.trim()) throw new AppError("Department name is required", 400);
  const exists = await Department.findOne({ hospital_id: hospitalId, name: { $regex: `^${name.trim()}$`, $options: "i" } });
  if (exists) throw new AppError("A department with that name already exists", 409);
  const department = await Department.create({
    hospital_id: hospitalId,
    name: name.trim(),
    code: code?.trim() || null,
    description: description?.trim() || null,
  });
  await AuditLog.create({ user_id: req.user.id, action: "DEPARTMENT_CREATED", entity: "DEPARTMENT", entity_id: String(department._id) });
  res.status(201).json({ department: departmentDetails(department) });
}

async function updateDepartment(req, res) {
  const department = await Department.findById(req.params.id);
  if (!department) throw new AppError("Department not found", 404);
  assertHospitalScope(req.user, department.hospital_id);
  const { name, code, description, hod_id, is_active } = req.body;
  if (name?.trim()) department.name = name.trim();
  if (code !== undefined) department.code = code?.trim() || null;
  if (description !== undefined) department.description = description?.trim() || null;
  if (is_active !== undefined) department.is_active = Boolean(is_active);
  if (hod_id !== undefined) {
    if (hod_id) {
      const hodUser = await User.findById(hod_id);
      if (!hodUser) throw new AppError("Selected user was not found", 404);
      assertHospitalScope(req.user, hodUser.hospital_id);
      const hodDoctor = await Doctor.findOne({ user_id: hodUser._id });
      if (!hodDoctor) throw new AppError("Only a doctor can be assigned as Head of Department", 400);
      hodUser.role = "HOD";
      hodUser.department_id = department._id;
      await hodUser.save();
      hodDoctor.department_id = department._id;
      hodDoctor.is_hod = true;
      await hodDoctor.save();
      if (department.hod_id) {
        const prevHod = await User.findById(department.hod_id);
        if (prevHod && String(prevHod._id) !== String(hodUser._id)) {
          prevHod.role = "DOCTOR";
          await prevHod.save();
          const prevHodDoctor = await Doctor.findOne({ user_id: prevHod._id });
          if (prevHodDoctor) { prevHodDoctor.is_hod = false; await prevHodDoctor.save(); }
        }
      }
      department.hod_id = hodUser._id;
    }
  }
  await department.save();
  await AuditLog.create({ user_id: req.user.id, action: "DEPARTMENT_UPDATED", entity: "DEPARTMENT", entity_id: String(department._id) });
  const populated = await Department.findById(department._id).lean();
  const hodUser = populated.hod_id ? await User.findById(populated.hod_id, "full_name").lean() : null;
  res.json({ department: { ...departmentDetails(populated), hod_name: hodUser?.full_name || null } });
}

async function deleteDepartment(req, res) {
  const department = await Department.findById(req.params.id);
  if (!department) throw new AppError("Department not found", 404);
  assertHospitalScope(req.user, department.hospital_id);
  const assignedDoctors = await Doctor.countDocuments({ department_id: department._id });
  if (assignedDoctors > 0) throw new AppError("Move doctors to another department before deleting", 400);
  await Department.deleteOne({ _id: department._id });
  await AuditLog.create({ user_id: req.user.id, action: "DEPARTMENT_DELETED", entity: "DEPARTMENT", entity_id: String(department._id) });
  res.json({ ok: true });
}

// ----- Doctors -----

function doctorDetails(doctor) {
  return {
    id: String(doctor._id),
    user_id: doctor.user_id ? String(doctor.user_id._id || doctor.user_id) : null,
    full_name: doctor.user_id?.full_name || doctor.full_name || null,
    email: doctor.user_id?.email || doctor.email || null,
    role: doctor.user_id?.role || doctor.role || null,
    hospital_id: doctor.hospital_id ? String(doctor.hospital_id._id || doctor.hospital_id) : null,
    department_id: doctor.department_id ? String(doctor.department_id._id || doctor.department_id) : null,
    specialty: doctor.specialty,
    license_no: doctor.license_no,
    is_hod: Boolean(doctor.is_hod),
  };
}

async function listMyDoctors(req, res) {
  const hospitalId = hospitalIdOf(req);
  const doctors = await Doctor.find({ hospital_id: hospitalId })
    .populate("user_id", "full_name email role is_active is_hod")
    .populate("department_id", "name")
    .sort({ full_name: 1 })
    .lean();
  res.json({ doctors: doctors.map(doctorDetails) });
}

async function createDoctor(req, res) {
  const hospitalId = hospitalIdOf(req);
  const { email, password, fullName, specialty, licenseNo, department_id } = req.body;
  if (!email || !password || !fullName) throw new AppError("email, password and fullName are required", 400);
  if (password.length < 8) throw new AppError("Password must be at least 8 characters", 400);
  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) throw new AppError("A user with that email already exists", 409);
  let department = null;
  if (department_id) {
    department = await Department.findById(department_id);
    if (!department) throw new AppError("Department not found", 404);
    assertHospitalScope(req.user, department.hospital_id);
  }
  const user = await User.create({
    email: email.toLowerCase().trim(),
    password_hash: await hashPassword(password),
    role: "DOCTOR",
    full_name: fullName.trim(),
    hospital_id: hospitalId,
    department_id: department?._id || null,
  });
  const doctor = await Doctor.create({
    user_id: user._id,
    hospital_id: hospitalId,
    department_id: department?._id || null,
    specialty: specialty || department?.name || null,
    license_no: licenseNo?.trim() || null,
    is_hod: false,
  });
  await AuditLog.create({ user_id: req.user.id, action: "DOCTOR_CREATED", entity: "DOCTOR", entity_id: String(doctor._id) });
  res.status(201).json({ doctor: doctorDetails(await Doctor.findById(doctor._id).populate("user_id", "full_name email role").lean()) });
}

async function updateDoctor(req, res) {
  const hospitalId = hospitalIdOf(req);
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw new AppError("Doctor not found", 404);
  assertHospitalScope(req.user, doctor.hospital_id);
  const user = await User.findById(doctor.user_id);
  const { department_id, specialty, license_no, is_active } = req.body;
  if (department_id !== undefined) {
    if (department_id) {
      const department = await Department.findById(department_id);
      if (!department) throw new AppError("Department not found", 404);
      assertHospitalScope(req.user, department.hospital_id);
    }
    doctor.department_id = department_id || null;
    if (user) user.department_id = doctor.department_id;
  }
  if (specialty !== undefined) doctor.specialty = specialty || null;
  if (license_no !== undefined) doctor.license_no = license_no || null;
  await doctor.save();
  if (user) {
    if (is_active !== undefined) user.is_active = Boolean(is_active);
    await user.save();
  }
  await AuditLog.create({ user_id: req.user.id, action: "DOCTOR_UPDATED", entity: "DOCTOR", entity_id: String(doctor._id) });
  res.json({ doctor: doctorDetails(await Doctor.findById(doctor._id).populate("user_id", "full_name email role is_active").populate("department_id", "name").lean()) });
}

// ----- Staff -----

async function listMyStaff(req, res) {
  const hospitalId = hospitalIdOf(req);
  const staff = await User.find({ hospital_id: hospitalId, role: "STAFF" })
    .sort({ full_name: 1 })
    .lean();
  res.json({ staff: staff.map((u) => ({ id: String(u._id), full_name: u.full_name, email: u.email, role: u.role, is_active: u.is_active, created_at: u.createdAt })) });
}

async function createStaff(req, res) {
  const hospitalId = hospitalIdOf(req);
  const { email, password, fullName, role } = req.body;
  if (!email || !password || !fullName) throw new AppError("email, password and fullName are required", 400);
  if (password.length < 8) throw new AppError("Password must be at least 8 characters", 400);
  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) throw new AppError("A user with that email already exists", 409);
  const effectiveRole = role === "STAFF" || role === "HOSPITAL_ADMIN" ? role : "STAFF";
  if (effectiveRole === "HOSPITAL_ADMIN") throw new AppError("Hospital admins are created by the platform administrator", 403);
  const user = await User.create({
    email: email.toLowerCase().trim(),
    password_hash: await hashPassword(password),
    role: effectiveRole,
    full_name: fullName.trim(),
    hospital_id: hospitalId,
  });
  await AuditLog.create({ user_id: req.user.id, action: "STAFF_CREATED", entity: "USER", entity_id: String(user._id) });
  res.status(201).json({ staff: { id: String(user._id), full_name: user.full_name, email: user.email, role: user.role, is_active: user.is_active } });
}

// ----- Patients -----

async function listMyPatients(req, res) {
  const hospitalId = hospitalIdOf(req);
  const appointments = await Appointment.aggregate([
    { $match: { hospital_id: hospitalId } },
    { $group: { _id: "$patient_id" } },
  ]);
  const patientIds = appointments.map((a) => a._id);
  const patients = patientIds.length
    ? await Patient.find({ _id: { $in: patientIds } }).populate("user_id", "full_name email").lean()
    : [];
  res.json({ patients });
}

// ----- Department Questionnaires (Question Builder) -----

function questionJson(q) {
  return {
    id: String(q._id),
    text: q.text,
    text_hi: q.text_hi || null,
    answer_type: q.answer_type,
    required: Boolean(q.required),
    options: q.options || [],
    show_if_question: q.show_if_question ? String(q.show_if_question) : null,
    show_if_value: q.show_if_value || null,
    visit_type: q.visit_type || "all",
    order: q.order,
  };
}

async function getDepartmentQuestionnaire(req, res) {
  const department = await Department.findById(req.params.id);
  if (!department) throw new AppError("Department not found", 404);
  assertDepartmentScope(req.user, department);
  const questionnaire = await DepartmentQuestionnaire.findOne({ department_id: department._id }).lean();
  res.json({
    questionnaire: questionnaire
      ? {
          id: String(questionnaire._id),
          department_id: String(questionnaire.department_id),
          title: questionnaire.title,
          description: questionnaire.description,
          version: questionnaire.version,
          languages: questionnaire.languages,
          is_active: questionnaire.is_active,
          questions: (questionnaire.questions || []).sort((a, b) => a.order - b.order).map(questionJson),
        }
      : {
          id: null,
          department_id: String(department._id),
          title: null,
          description: null,
          version: 0,
          languages: ["English", "Hindi"],
          is_active: true,
          questions: [],
        },
  });
}

async function saveDepartmentQuestionnaire(req, res) {
  const department = await Department.findById(req.params.id);
  if (!department) throw new AppError("Department not found", 404);
  assertDepartmentScope(req.user, department);

  const { title, description, languages, is_active, questions } = req.body;
  if (!Array.isArray(questions)) throw new AppError("questions must be an array", 400);

  const validTypes = new Set(ANSWER_TYPES);
  const makeId = (q) =>
    typeof q.id === "string" && mongoose.Types.ObjectId.isValid(q.id) ? new mongoose.Types.ObjectId(q.id) : new mongoose.Types.ObjectId();
  const sanitized = questions.map((q, index) => {
    const text = typeof q.text === "string" ? q.text.trim() : "";
    if (!text) throw new AppError("Every question needs text", 400);
    const text_hi = typeof q.text_hi === "string" && q.text_hi.trim() ? q.text_hi.trim() : null;
    const answerType = validTypes.has(q.answer_type) ? q.answer_type : "text";
    if (["multiple_choice", "multiple_select"].includes(answerType)) {
      const options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : [];
      if (options.length < 2) throw new AppError(`Question "${text}" needs at least two options`, 400);
      return { _id: makeId(q), text, text_hi, answer_type: answerType, required: Boolean(q.required), options, show_if_question: null, show_if_value: null, visit_type: q.visit_type || "all", order: index };
    }
    return {
      _id: makeId(q),
      text,
      text_hi,
      answer_type: answerType,
      required: Boolean(q.required),
      options: [],
      show_if_question: q.show_if_question ? String(q.show_if_question) : null,
      show_if_value: typeof q.show_if_value === "string" ? q.show_if_value.trim() || null : null,
      visit_type: q.visit_type || "all",
      order: index,
    };
  });

  const validIds = new Set(sanitized.map((q) => String(q._id)));
  for (const q of sanitized) {
    if (q.show_if_question && !validIds.has(q.show_if_question)) {
      throw new AppError(`Question "${q.text}" points to a missing earlier question`, 400);
    }
  }

  const existing = await DepartmentQuestionnaire.findOne({ department_id: department._id });
  const newForm = sanitized.map((q) => ({
    id: String(q._id),
    text: q.text,
    text_hi: q.text_hi || null,
    answer_type: q.answer_type,
    required: q.required,
    options: q.options || [],
    show_if_question: q.show_if_question || null,
    show_if_value: q.show_if_value || null,
    visit_type: q.visit_type || "all",
    order: q.order,
  }));
  const changed = !existing || JSON.stringify(existing.questions.map(questionJson)) !== JSON.stringify(newForm);
  const questionnaire = existing || new DepartmentQuestionnaire({
    hospital_id: department.hospital_id,
    department_id: department._id,
  });

  if (title !== undefined) questionnaire.title = title?.trim() || null;
  if (description !== undefined) questionnaire.description = description?.trim() || null;
  if (Array.isArray(languages)) questionnaire.languages = languages.map((l) => String(l).trim()).filter(Boolean);
  if (is_active !== undefined) questionnaire.is_active = Boolean(is_active);
  questionnaire.questions = sanitized;
  if (changed) questionnaire.version = (existing?.version || 0) + 1;
  await questionnaire.save();

  if (changed) {
    await AuditLog.create({
      user_id: req.user.id,
      action: "QUESTIONNAIRE_UPDATED",
      entity: "QUESTIONNAIRE",
      entity_id: String(questionnaire._id),
    });
  }

  res.json({
    questionnaire: {
      id: String(questionnaire._id),
      department_id: String(questionnaire.department_id),
      title: questionnaire.title,
      description: questionnaire.description,
      version: questionnaire.version,
      languages: questionnaire.languages,
      is_active: questionnaire.is_active,
      questions: sanitized.map(questionJson),
    },
  });
}

module.exports = {
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
};