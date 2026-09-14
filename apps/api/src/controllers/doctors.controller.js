const { Doctor } = require("../models/schemas");
const { AppError } = require("../utils/async");

function doctorDetails(d) {
  return {
    id: d._id,
    specialty: d.specialty,
    license_no: d.license_no,
    full_name: d.user_id?.full_name,
    email: d.user_id?.email,
    hospital_id: d.hospital_id ? String(d.hospital_id) : null,
    department_id: d.department_id ? String(d.department_id) : null,
    is_hod: Boolean(d.is_hod),
  };
}

async function listDoctors(req, res) {
  const filter = {};
  if (req.user?.hospital_id && req.user.role !== "TOP_ADMIN") {
    filter.hospital_id = req.user.hospital_id;
  }
  const doctors = await Doctor.find(filter)
    .populate("user_id", "full_name email is_active")
    .lean();

  res.json({
    doctors: doctors
      .filter((d) => d.user_id?.is_active !== false)
      .map(doctorDetails),
  });
}

async function getDoctor(req, res) {
  const doctor = await Doctor.findById(req.params.id)
    .populate("user_id", "full_name email")
    .lean();
  if (!doctor) {
    throw new AppError("Doctor not found", 404);
  }
  res.json({ doctor: doctorDetails(doctor) });
}

module.exports = { listDoctors, getDoctor };