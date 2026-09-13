const { Conversation, Message, Doctor, Patient, Medication, AiConfig } = require("../models/schemas");
const { AppError } = require("../utils/async");
const { queryAiService } = require("../services/aiClient");

/** List own conversations (patient sees own; doctor sees their patients'). */
async function listMyConversations(req, res) {
  const user = req.user;
  if (user.role === "DOCTOR") return listDoctorConversations(req, res);

  const patient = await requirePatient(user.id);
  const conversations = await Conversation.find({ patient_id: patient._id })
    .sort({ updatedAt: -1 })
    .populate({ path: "doctor_id", populate: { path: "user_id", select: "full_name" } })
    .lean();

  res.json({
    conversations: conversations.map((c) => ({
      id: c._id,
      patient_id: c.patient_id,
      doctor_id: c.doctor_id?._id,
      title: c.title,
      summary: c.summary,
      status: c.status,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      specialty: c.doctor_id?.specialty,
      doctor_name: c.doctor_id?.user_id?.full_name || "Doctor",
    })),
  });
}

/** Doctor lists conversations for their patients. */
async function listDoctorConversations(req, res) {
  const user = req.user;
  if (user.role !== "DOCTOR") throw new AppError("Forbidden", 403);
  const doctor = await requireDoctor(user.id);
  const conversations = await Conversation.find({ doctor_id: doctor._id })
    .sort({ updatedAt: -1 })
    .populate({ path: "patient_id", populate: { path: "user_id", select: "full_name" } })
    .lean();

  res.json({
    conversations: conversations.map((c) => ({
      id: c._id,
      patient_id: c.patient_id?._id,
      doctor_id: c.doctor_id,
      title: c.title,
      summary: c.summary,
      status: c.status,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      patient_name: c.patient_id?.user_id?.full_name || "Patient",
    })),
  });
}

async function getConversation(req, res) {
  const conv = await assertConversationAccess(req.user, req.params.id);
  const messages = await Message.find({ conversation_id: conv._id }).sort({ createdAt: 1 });
  res.json({
    conversation: {
      id: conv._id,
      patient_id: conv.patient_id,
      doctor_id: conv.doctor_id,
      title: conv.title,
      summary: conv.summary,
      status: conv.status,
    },
    messages: messages.map((m) => ({
      id: m._id,
      conversation_id: m.conversation_id,
      sender: m.sender,
      content: m.content,
      safety_flags: m.safety_flags,
      created_at: m.createdAt,
    })),
  });
}

/** Patient creates a new conversation with a doctor. */
async function createConversation(req, res) {
  const user = req.user;
  const patient = await requirePatient(user.id);
  const { doctorId, title } = req.body;
  if (!doctorId) throw new AppError("doctorId is required", 400);

  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new AppError("Doctor not found", 404);

  const conv = await Conversation.create({
    patient_id: patient._id,
    doctor_id: doctor._id,
    title: title || "New consultation",
  });
  res.status(201).json({
    conversation: { id: conv._id, patient_id: conv.patient_id, doctor_id: conv.doctor_id, title: conv.title, status: conv.status },
  });
}

/**
 * Core chat flow:
 *   save patient message -> call AI service (RAG) -> save AI response
 */
async function sendMessage(req, res) {
  const user = req.user;
  const conv = await assertConversationAccess(user, req.params.id);

  const { content } = req.body;
  if (!content || !content.trim()) throw new AppError("content is required", 400);

  await Message.create({ conversation_id: conv._id, sender: "patient", content });

  const [history, aiConfig] = await Promise.all([
    Message.find({ conversation_id: conv._id }).sort({ createdAt: 1 }).limit(20).lean(),
    AiConfig.findOne({ doctor_id: conv.doctor_id }).lean(),
  ]);

  const aiResponse = await queryAiService({
    question: content,
    conversationId: String(conv._id),
    doctorId: String(conv.doctor_id),
    patientId: String(conv.patient_id),
    aiConfig: aiConfig
      ? {
          system_prompt: aiConfig.system_prompt ?? undefined,
          response_style: aiConfig.response_style ?? undefined,
          language: aiConfig.language ?? undefined,
          temperature: aiConfig.temperature,
          max_tokens: aiConfig.max_tokens,
          emergency_policy: aiConfig.emergency_policy ?? undefined,
        }
      : null,
    history: history.map((h) => ({ id: h._id, sender: h.sender, content: h.content })),
    summary: conv.summary,
  });

  const aiMsg = await Message.create({
    conversation_id: conv._id,
    sender: "ai",
    content: aiResponse.answer,
    safety_flags: aiResponse.safety_flags,
  });

  if (aiResponse.emergency) {
    conv.status = "escalated";
  }
  await conv.save();

  res.json({
    message: {
      id: String(aiMsg._id),
      conversation_id: String(conv._id),
      sender: "ai",
      content: aiResponse.answer,
      safety_flags: aiResponse.safety_flags,
    },
    sources: aiResponse.sources,
    emergency: aiResponse.emergency,
  });
}

/** A live, doctor-facing aggregation of all conversations for one patient. */
async function getPatientConversationSummary(req, res) {
  const doctor = await requireDoctor(req.user.id);
  const patient = await Patient.findById(req.params.patientId).populate("user_id", "full_name email").lean();
  if (!patient) throw new AppError("Patient not found", 404);

  const conversations = await Conversation.find({ patient_id: patient._id })
    .sort({ updatedAt: -1 })
    .lean();
  if (!conversations.length) throw new AppError("No conversations found for this patient", 404);

  const conversationIds = conversations.map((conversation) => conversation._id);
  const [messages, activeMedications] = await Promise.all([
    Message.find({ conversation_id: { $in: conversationIds } }).sort({ createdAt: -1 }).lean(),
    Medication.find({ patient_id: patient._id, active: true }).sort({ start_date: -1 }).lean(),
  ]);
  const patientMessages = messages.filter((message) => message.sender === "patient");
  const recentConcerns = patientMessages.slice(0, 5).map((message) => ({
    text: String(message.content || "").replace(/\s+/g, " ").trim().slice(0, 280),
    timestamp: message.createdAt,
  })).filter((message) => message.text);
  const latestConcern = recentConcerns[0]?.text || "No patient-reported concern has been recorded yet.";
  const latestActivity = messages[0]?.createdAt || conversations[0]?.updatedAt;

  res.json({
    summary: {
      patient: {
        id: String(patient._id),
        full_name: patient.user_id?.full_name || "Patient",
        custom_id: patient.custom_id || `PAT-${String(patient._id).slice(-4).toUpperCase()}`,
        dob: patient.dob, sex: patient.sex, blood_type: patient.blood_type,
      },
      conversation_count: conversations.length,
      message_count: messages.length,
      latest_activity: latestActivity,
      latest_patient_update: latestConcern,
      recent_concerns: recentConcerns,
      known_allergies: patient.known_allergies || [],
      chronic_conditions: patient.chronic_conditions || [],
      active_medications: activeMedications.map((medication) => ({
        name: medication.name, dosage: medication.dosage, duration: medication.duration,
      })),
      clinical_note: "This live overview aggregates documented conversation content and health records. It supports clinical review and is not a diagnosis.",
    },
  });
}

async function requirePatient(userId) {
  const patient = await Patient.findOne({ user_id: userId });
  if (!patient) throw new AppError("Patient profile not found", 404);
  return patient;
}

async function requireDoctor(userId) {
  const doctor = await Doctor.findOne({ user_id: userId });
  if (!doctor) throw new AppError("Doctor profile not found", 404);
  return doctor;
}

/** Verify the requesting user may access a conversation (patient or doctor owner). */
async function assertConversationAccess(user, conversationId) {
  if (!conversationId) throw new AppError("Conversation not found", 404);
  const conv = await Conversation.findById(conversationId);
  if (!conv) throw new AppError("Conversation not found", 404);

  if (user.role === "ADMIN") return conv;

  const doctor = await Doctor.findOne({ user_id: user.id });
  const patient = await Patient.findOne({ user_id: user.id });

  const doctorOwns = doctor && String(doctor._id) === String(conv.doctor_id);
  const patientOwns = patient && String(patient._id) === String(conv.patient_id);

  if (!doctorOwns && !patientOwns) {
    throw new AppError("Forbidden", 403);
  }
  return conv;
}

module.exports = { listMyConversations, listDoctorConversations, getConversation, createConversation, sendMessage, getPatientConversationSummary };
