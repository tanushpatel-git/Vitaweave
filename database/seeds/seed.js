#!/usr/bin/env node
/**
 * Seeds MongoDB with synthetic development data:
 *  - 1 admin user
 *  - 2 doctors (with users)
 *  - 2 patients (with users)
 *  - AI configs for doctors
 *  - conversations + messages
 *  - a doctor knowledge document (chunks are created via the /ingest endpoint)
 *  - a hospital capacity network with daily operational snapshots for forecast testing
 *
 * Idempotent: users are upserted by email; collections used match the
 * Mongoose pluralized names in apps/api (users, doctors, patients,
 * aiconfigs, conversations, messages, doctordocuments).
 */
const dns = require("dns");
const config=require('../../apps/api/src/config.js')
const mongoose=require('mongoose')
const connectDb=require('../../apps/api/src/db.js')
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { MongoClient, ObjectId } = require("mongodb");

function loadEnv() {
  const envPath = path.join(__dirname, "..", "..", ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i);
      const v = t.slice(i + 1);
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}
// async function connectDb() {
//   dns.setServers(["8.8.8.8", "1.1.1.1"]);
//   await mongoose.connect(config.mongoUri, {
//     dbName: config.mongoDbName,
//   });
// }
async function upsertUser(db, { email, full_name, role, password, hospital_id = null, department_id = null }) {
  const hash = await bcrypt.hash(password, 10);
  const now = new Date();
  const filter = { email };
  const doc = {
    email,
    password_hash: hash,
    role,
    full_name,
    is_active: true,
    hospital_id: hospital_id || null,
    department_id: department_id || null,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("users").replaceOne(filter, doc, { upsert: true });
  return db.collection("users").findOne(filter);
}

async function upsertOne(db, collection, filter, doc) {
  await db.collection(collection).replaceOne(filter, doc, { upsert: true });
  return db.collection(collection).findOne(filter);
}

async function main() {
  loadEnv();
  const uri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/medchat";
  const dbname = process.env.MONGODB_DB || "medchat";

  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbname);
  const now = new Date();

  // users
  const admin = await upsertUser(db, {
    email: "admin@medchat.dev",
    full_name: "System Admin",
    role: "TOP_ADMIN",
    password: "admin12345",
  });

  const hospitalAdmin = await upsertUser(db, {
    email: "hospital@medchat.dev",
    full_name: "City General Administrator",
    role: "HOSPITAL_ADMIN",
    password: "hospital12345",
  });

  const drSharma = await upsertUser(db, {
    email: "sharma@medchat.dev",
    full_name: "Dr. Anil Sharma",
    role: "HOD",
    password: "doctor12345",
  });
  const drIyer = await upsertUser(db, {
    email: "iyer@medchat.dev",
    full_name: "Dr. Meera Iyer",
    role: "DOCTOR",
    password: "doctor12345",
  });

  const staffReception = await upsertUser(db, {
    email: "reception@medchat.dev",
    full_name: "Reception Desk",
    role: "STAFF",
    password: "staff12345",
  });

  const patRohan = await upsertUser(db, {
    email: "rohan@medchat.dev",
    full_name: "Rohan Desai",
    role: "PATIENT",
    password: "patient12345",
  });
  const patPriya = await upsertUser(db, {
    email: "priya@medchat.dev",
    full_name: "Priya Patel",
    role: "PATIENT",
    password: "patient12345",
  });

  // Hospital (City General) is owned by the HOSPITAL_ADMIN user.
  const cityGeneral = await upsertOne(
    db,
    "hospitals",
    { code: "VITA-CGH-001" },
    {
      user_id: hospitalAdmin._id,
      code: "VITA-CGH-001",
      name: "City General Hospital",
      hospital_type: "Tertiary",
      registration_number: "MHR-2021-08421",
      administrator_name: "City General Administrator",
      official_email: hospitalAdmin.email,
      phone: "+91 22 4000 0100",
      location: { address: "S.V. Road, Andheri West", city: "Mumbai", state: "Maharashtra", pincode: "400058", latitude: 19.076, longitude: 72.8777 },
      icu_total_beds: 300,
      general_total_beds: 1500,
      active_doctors: 85,
      createdAt: now,
      updatedAt: now,
    }
  );

  // Link the hospital admin to their hospital.
  await db.collection("users").updateOne({ _id: hospitalAdmin._id }, { $set: { hospital_id: cityGeneral._id } });

  // Departments. General Medicine's HOD is Dr. Sharma.
  const genMed = await upsertOne(
    db,
    "departments",
    { hospital_id: cityGeneral._id, name: "General Medicine" },
    {
      hospital_id: cityGeneral._id,
      name: "General Medicine",
      code: "GM",
      description: "Primary care and general internal medicine.",
      hod_id: drSharma._id,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    }
  );
  const cardiology = await upsertOne(
    db,
    "departments",
    { hospital_id: cityGeneral._id, name: "Cardiology" },
    {
      hospital_id: cityGeneral._id,
      name: "Cardiology",
      code: "CARD",
      description: "Heart and vascular care.",
      is_active: true,
      createdAt: now,
      updatedAt: now,
    }
  );
  const endocrinology = await upsertOne(
    db,
    "departments",
    { hospital_id: cityGeneral._id, name: "Endocrinology" },
    {
      hospital_id: cityGeneral._id,
      name: "Endocrinology",
      code: "ENDO",
      description: "Hormonal, diabetic and metabolic care.",
      is_active: true,
      createdAt: now,
      updatedAt: now,
    }
  );
  await upsertOne(
    db,
    "departments",
    { hospital_id: cityGeneral._id, name: "Orthopedics" },
    {
      hospital_id: cityGeneral._id,
      name: "Orthopedics",
      code: "ORTHO",
      description: "Bone, joint and musculoskeletal care.",
      is_active: true,
      createdAt: now,
      updatedAt: now,
    }
  );

  // Link HOD + staff users to their hospital context.
  await db.collection("users").updateOne(
    { _id: drSharma._id },
    { $set: { hospital_id: cityGeneral._id, department_id: genMed._id, role: "HOD" } }
  );
  await db.collection("users").updateOne(
    { _id: staffReception._id },
    { $set: { hospital_id: cityGeneral._id } }
  );

  // Department questionnaires (pre-consultation screening)
  const gmQ1 = new ObjectId();
  const gmQ2 = new ObjectId();
  const gmQ3 = new ObjectId();
  const gmQ4 = new ObjectId();
  await upsertOne(
    db,
    "departmentquestionnaires",
    { department_id: genMed._id },
    {
      hospital_id: cityGeneral._id,
      department_id: genMed._id,
      title: "General Medicine pre-consultation screening",
      description: "Asked to patients before their OPD consultation.",
      version: 1,
      languages: ["English", "Hindi"],
      is_active: true,
      questions: [
        { _id: gmQ1, text: "What problem are you experiencing?", text_hi: "आपको क्या समस्या हो रही है?", answer_type: "text_voice", required: true, options: [], show_if_question: null, show_if_value: null, order: 0, createdAt: now, updatedAt: now },
        { _id: gmQ2, text: "Do you have a fever?", text_hi: "क्या आपको बुखार है?", answer_type: "yes_no", required: true, options: [], show_if_question: null, show_if_value: null, order: 1, createdAt: now, updatedAt: now },
        { _id: gmQ3, text: "Since when do you have the fever?", text_hi: "बुखार कब से है?", answer_type: "text_voice", required: true, options: [], show_if_question: String(gmQ2), show_if_value: "Yes", order: 2, createdAt: now, updatedAt: now },
        { _id: gmQ4, text: "Rate your overall discomfort from 1 to 10", text_hi: "1 से 10 के पैमाने पर अपनी परेशानी को रेट करें", answer_type: "number", required: false, options: [], show_if_question: null, show_if_value: null, order: 3, createdAt: now, updatedAt: now },
      ],
      createdAt: now,
      updatedAt: now,
    }
  );
  const cardQ1 = new ObjectId();
  const cardQ2 = new ObjectId();
  const cardQ3 = new ObjectId();
  const cardQ4 = new ObjectId();
  await upsertOne(
    db,
    "departmentquestionnaires",
    { department_id: cardiology._id },
    {
      hospital_id: cityGeneral._id,
      department_id: cardiology._id,
      title: "Cardiology pre-consultation screening",
      description: "Asked to patients before their cardiology consultation.",
      version: 1,
      languages: ["English", "Hindi"],
      is_active: true,
      questions: [
        { _id: cardQ1, text: "Why are you visiting the cardiology department?", text_hi: "आप कार्डियोलॉजी विभाग में क्यों आए हैं?", answer_type: "text", required: true, options: [], show_if_question: null, show_if_value: null, order: 0, createdAt: now, updatedAt: now },
        { _id: cardQ2, text: "Are you experiencing chest pain?", text_hi: "क्या आपको सीने में दर्द हो रहा है?", answer_type: "yes_no", required: true, options: [], show_if_question: null, show_if_value: null, order: 1, createdAt: now, updatedAt: now },
        { _id: cardQ3, text: "Describe the chest discomfort, including since when", text_hi: "सीने की तकलीफ के बारे में बताएं, कब से है", answer_type: "text_voice", required: true, options: [], show_if_question: String(cardQ2), show_if_value: "Yes", order: 2, createdAt: now, updatedAt: now },
        { _id: cardQ4, text: "How long do symptoms typically last?", text_hi: "लक्षण आमतौर पर कितने समय तक रहते हैं?", answer_type: "multiple_choice", required: false, options: ["A few minutes", "Up to an hour", "Hours", "The whole day"], show_if_question: null, show_if_value: null, order: 3, createdAt: now, updatedAt: now },
      ],
      createdAt: now,
      updatedAt: now,
    }
  );

  // doctors
  const doc1 = await upsertOne(
    db,
    "doctors",
    { user_id: drSharma._id },
    {
      user_id: drSharma._id,
      hospital_id: cityGeneral._id,
      department_id: genMed._id,
      specialty: "General Medicine",
      license_no: "MH-12345",
      is_hod: true,
      createdAt: now,
      updatedAt: now,
    }
  );
  const doc2 = await upsertOne(
    db,
    "doctors",
    { user_id: drIyer._id },
    {
      user_id: drIyer._id,
      hospital_id: cityGeneral._id,
      department_id: cardiology._id,
      specialty: "Cardiology",
      license_no: "MH-67890",
      is_hod: false,
      createdAt: now,
      updatedAt: now,
    }
  );

  // Link drIyer user to their hospital + department.
  await db.collection("users").updateOne(
    { _id: drIyer._id },
    { $set: { hospital_id: cityGeneral._id, department_id: cardiology._id } }
  );

  // patients
  const pat1 = await upsertOne(
    db,
    "patients",
    { user_id: patRohan._id },
    {
      user_id: patRohan._id,
      custom_id: "PAT-1001",
      abha_id: "91-8472-9012-4411",
      dob: "1990-05-12",
      sex: "M",
      blood_type: "O+",
      contact_phone: "+91 98201 44521",
      emergency_contact: {
        name: "Kavita Desai",
        phone: "+91 98201 99887",
        relation: "Spouse",
      },
      known_allergies: ["Penicillin", "Sulfa drugs"],
      chronic_conditions: ["Mild Hypertension", "Seasonal Asthma"],
      createdAt: now,
      updatedAt: now,
    }
  );
  const pat2 = await upsertOne(
    db,
    "patients",
    { user_id: patPriya._id },
    {
      user_id: patPriya._id,
      custom_id: "PAT-1002",
      abha_id: "91-2341-7890-5522",
      dob: "1995-11-02",
      sex: "F",
      blood_type: "A+",
      contact_phone: "+91 97112 33456",
      emergency_contact: {
        name: "Arjun Patel",
        phone: "+91 97112 88990",
        relation: "Brother",
      },
      known_allergies: ["Aspirin / NSAIDs"],
      chronic_conditions: ["Type 2 Diabetes"],
      createdAt: now,
      updatedAt: now,
    }
  );

  // ai_configs
  await upsertOne(
    db,
    "aiconfigs",
    { doctor_id: doc1._id },
    {
      doctor_id: doc1._id,
      system_prompt: "You are Dr. Sharma's assistant for his patients.",
      response_style: "simple",
      language: "English",
      temperature: 0.2,
      max_tokens: 512,
      emergency_policy: "Escalate immediately to Dr. Sharma for any emergency keywords.",
      createdAt: now,
      updatedAt: now,
    }
  );

  // Hospital capacity network. These are synthetic operational records only;
  // they are designed to exercise the capacity forecasting dashboard and must
  // never be interpreted as real patient or facility data.
  const nearbyHospitals = [
    { code: "VITA-GVM-002", name: "Green Valley Medical Centre", distance_km: 4.8, icu_total_beds: 120, icu_occupied: 62, general_total_beds: 500, general_occupied: 275 },
    { code: "VITA-RSH-003", name: "Riverside Hospital", distance_km: 7.2, icu_total_beds: 90, icu_occupied: 76, general_total_beds: 380, general_occupied: 320 },
    { code: "VITA-MCH-004", name: "Metro Care Hospital", distance_km: 9.6, icu_total_beds: 160, icu_occupied: 101, general_total_beds: 700, general_occupied: 410 },
  ];
  for (const hospital of nearbyHospitals) {
    await upsertOne(db, "hospitals", { code: hospital.code }, {
      code: hospital.code,
      name: hospital.name,
      location: { city: "Mumbai", distance_from_city_general_km: hospital.distance_km },
      icu_total_beds: hospital.icu_total_beds,
      general_total_beds: hospital.general_total_beds,
      active_doctors: Math.round((hospital.icu_total_beds + hospital.general_total_beds) / 8),
      createdAt: now,
      updatedAt: now,
    });
  }

  // Demo appointment: hospital staff can look up Priya using PAT-1002.
  const priyaAppointmentTime = new Date(now);
  priyaAppointmentTime.setUTCDate(priyaAppointmentTime.getUTCDate() + 2);
  priyaAppointmentTime.setUTCHours(10, 30, 0, 0);
  await upsertOne(
    db,
    "appointments",
    { patient_id: pat2._id, hospital_id: cityGeneral._id, scheduled_for: priyaAppointmentTime },
    {
      patient_id: pat2._id,
      hospital_id: cityGeneral._id,
      doctor_id: null,
      department_id: endocrinology._id,
      scheduled_for: priyaAppointmentTime,
      department: "Endocrinology",
      reason: "Diabetes follow-up and medication review",
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    }
  );

  // ── Deep Patient Flow demo: Rohan (PAT-1001) is a REPEAT VISIT. ──────────
  // He already had a completed abdominal-pain pre-consultation (visit 1). His
  // new appointment makes him a follow-up so the conversation planner can show
  // recurrence intelligence ("phir se dard" → asks about the previous
  // treatment) and "new since last visit" is meaningful in the doctor view.
  const rohanVisit1 = new Date(now);
  rohanVisit1.setUTCDate(rohanVisit1.getUTCDate() - 5);
  const rohanAppointmentTime = new Date(now);
  rohanAppointmentTime.setUTCDate(rohanAppointmentTime.getUTCDate() + 1);
  rohanAppointmentTime.setUTCHours(9, 30, 0, 0);

  const rohanAppointment = await upsertOne(
    db,
    "appointments",
    { patient_id: pat1._id, hospital_id: cityGeneral._id, scheduled_for: rohanAppointmentTime },
    {
      patient_id: pat1._id,
      hospital_id: cityGeneral._id,
      doctor_id: doc1._id,
      department_id: genMed._id,
      scheduled_for: rohanAppointmentTime,
      department: "General Medicine",
      reason: "Recurrent abdominal pain",
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    }
  );

  const previousVisitQ1 = String(gmQ1);
  const previousVisitQ2 = String(gmQ2);
  const previousVisitQ4 = String(gmQ4);
  // Several days ago Rohan completed a pre-consultation for the SAME department
  // but a DIFFERENT appointment (visit 1). We use a dedicated record so the
  // planner sees "previous visit" context for the brand-new appointment.
  const rohanPrevAppointment = await upsertOne(
    db,
    "appointments",
    { patient_id: pat1._id, hospital_id: cityGeneral._id, scheduled_for: rohanVisit1 },
    {
      patient_id: pat1._id,
      hospital_id: cityGeneral._id,
      doctor_id: doc1._id,
      department_id: genMed._id,
      scheduled_for: rohanVisit1,
      department: "General Medicine",
      reason: "Stomach pain and mild discomfort",
      status: "completed",
      createdAt: rohanVisit1,
      updatedAt: rohanVisit1,
    }
  );
  await upsertOne(
    db,
    "preconsultations",
    { appointment_id: rohanPrevAppointment._id },
    {
      appointment_id: rohanPrevAppointment._id,
      hospital_id: cityGeneral._id,
      department_id: genMed._id,
      patient_id: pat1._id,
      questionnaire_id: null,
      questionnaire_version: 1,
      visit_number: 1,
      status: "completed",
      started_at: rohanVisit1,
      completed_at: rohanVisit1,
      answers: [
        {
          question_id: previousVisitQ1,
          question_text: "What problem are you experiencing?",
          answer_type: "text_voice",
          category: "doctor",
          value: "Mild persistent abdominal pain",
          value_original: "Pet mein halka dard tha",
          translated: true,
          language: "hinglish",
          structured: { summary: "Mild persistent abdominal pain", duration: "5 days", location: "Abdomen", recurrence: "false" },
          confidence: "auto",
          skipped: false,
          not_known: false,
          corrected: false,
          fact_status: "reported",
        },
        {
          question_id: previousVisitQ2,
          question_text: "Do you have a fever?",
          answer_type: "yes_no",
          category: "doctor",
          value: "No",
          value_original: "Nahi",
          translated: true,
          language: "hi",
          structured: {},
          confidence: "auto",
          skipped: false,
          not_known: false,
          corrected: false,
          fact_status: "reported",
        },
        {
          question_id: previousVisitQ4,
          question_text: "Rate your overall discomfort from 1 to 10",
          answer_type: "number",
          category: "doctor",
          value: 4,
          value_original: "4",
          translated: false,
          language: "en",
          structured: {},
          confidence: "auto",
          skipped: false,
          not_known: false,
          corrected: false,
          fact_status: "reported",
        },
      ],
      conversation_log: [
        { role: "ai", question_id: previousVisitQ1, text: "What problem are you experiencing?", hi: "आपको क्या समस्या हो रही है?", ts: rohanVisit1 },
        { role: "patient", question_id: previousVisitQ1, text: "Pet mein halka dard tha", language: "hinglish", ts: rohanVisit1 },
        { role: "ai", question_id: previousVisitQ2, text: "Do you have a fever?", hi: "क्या आपको बुखार है?", ts: rohanVisit1 },
        { role: "patient", question_id: previousVisitQ2, text: "Nahi", language: "hi", ts: rohanVisit1 },
        { role: "ai", question_id: previousVisitQ4, text: "Rate your overall discomfort from 1 to 10", hi: "1 से 10 के पैमाने पर अपनी परेशानी को रेट करें", ts: rohanVisit1 },
        { role: "patient", question_id: previousVisitQ4, text: "4", language: "en", ts: rohanVisit1 },
      ],
      conversation_plan: [
        { type: "doctor", question_id: previousVisitQ1, question_text: "What problem are you experiencing?", created_at: rohanVisit1 },
        { type: "doctor", question_id: previousVisitQ2, question_text: "Do you have a fever?", created_at: rohanVisit1 },
        { type: "doctor", question_id: previousVisitQ4, question_text: "Rate your overall discomfort from 1 to 10", created_at: rohanVisit1 },
      ],
      facts: [
        { key: "symptom.primary", fact: "Primary symptom", value: "Abdominal pain", question_id: previousVisitQ1, source: "patient", visit_id: "V001", recorded_at: rohanVisit1, status: "current", confidence: "auto" },
        { key: "duration", fact: "Duration", value: "5 days", question_id: previousVisitQ1, source: "patient", visit_id: "V001", recorded_at: rohanVisit1, status: "current", confidence: "auto" },
        { key: "location", fact: "Location", value: "Abdomen", question_id: previousVisitQ1, source: "patient", visit_id: "V001", recorded_at: rohanVisit1, status: "current", confidence: "auto" },
        { key: "recurrence", fact: "Symptom recurrence", value: "false", question_id: previousVisitQ1, source: "patient", visit_id: "V001", recorded_at: rohanVisit1, status: "current", confidence: "auto" },
      ],
      summary: {
        narrative:
          "Chief complaint\nMild persistent abdominal pain for 5 days.\n\nSymptoms\nWhat problem are you experiencing?: Mild persistent abdominal pain\nRate your overall discomfort from 1 to 10: 4\n\nMedications, home remedies or self care\nDoctor prescribed a short course of antacid; patient reported improvement.\n\nClinical snapshot\nFirst recorded general-medicine screening for this patient.",
        sections: {
          chief_complaint: "Mild persistent abdominal pain for 5 days.",
          onset_and_duration: "5 days before visit.",
          symptoms: "Mild persistent abdominal pain, located in the abdomen.",
          current_treatment_and_self_care: "Doctor prescribed a short course of antacid tablets; patient took them and felt better.",
          new_since_last_visit: "First recorded visit for this complaint.",
          patients_own_words: "Pet mein halka dard tha (mild pain in the abdomen).",
          disclaimer: "This summary was generated from the patient's own answers and is for reference only.",
        },
        source: "comprehensive",
      },
      corrections: [],
    }
  );

  // Fourteen daily observations make the ML model's trend features meaningful.
  // The final row exactly matches the dashboard's default test scenario.
  const cityHistory = [
    [238, 1085, 332, 112], [242, 1098, 340, 116], [247, 1110, 348, 119],
    [249, 1120, 360, 126], [255, 1140, 372, 130], [260, 1158, 381, 136],
    [268, 1176, 390, 142], [270, 1188, 393, 145], [272, 1192, 395, 147],
    [274, 1195, 396, 148], [276, 1197, 398, 149], [278, 1199, 399, 149],
    [279, 1200, 400, 150], [280, 1200, 400, 150],
  ];
  const snapshotStart = new Date(now);
  snapshotStart.setUTCDate(snapshotStart.getUTCDate() - (cityHistory.length - 1));
  snapshotStart.setUTCHours(0, 0, 0, 0);
  for (let index = 0; index < cityHistory.length; index += 1) {
    const [icu_occupied, general_occupied, opd_patients, emergency_patients] = cityHistory[index];
    const observed_at = new Date(snapshotStart);
    observed_at.setUTCDate(snapshotStart.getUTCDate() + index);
    await upsertOne(db, "hospitalcapacitysnapshots", { hospital_id: cityGeneral._id, observed_at }, {
      hospital_id: cityGeneral._id,
      observed_at,
      icu_occupied,
      general_occupied,
      opd_patients,
      emergency_patients,
      doctors_available: 85,
      source: "synthetic-seed",
      createdAt: now,
      updatedAt: now,
    });
  }

  // conversations + messages
  const conv1 = {
    patient_id: pat1._id,
    doctor_id: doc1._id,
    title: "Managing recurring headaches",
    summary: "Patient reported tension headaches over two weeks; not severe, no aura.",
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  const convResult = await db.collection("conversations").insertOne(conv1);

  await db.collection("messages").insertMany([
    {
      conversation_id: convResult.insertedId,
      sender: "patient",
      content: "Hello, I have had a headache for a few days. What should I do?",
      safety_flags: {},
      createdAt: now,
      updatedAt: now,
    },
    {
      conversation_id: convResult.insertedId,
      sender: "ai",
      content:
        "Based on the available guidance, frequent headaches warrant keeping a symptom diary and consulting your doctor if they worsen. I cannot make a diagnosis here.",
      safety_flags: {},
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // A knowledge document row (chunks get created when ingesting via the AI service)
  await upsertOne(
    db,
    "doctordocuments",
    { file_name: "headache-guidelines.txt" },
    {
      doctor_id: doc1._id,
      title: "Headache Management Guidelines",
      file_name: "headache-guidelines.txt",
      document_type: "medical",
      version: "1",
      uploaded_by: admin._id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    }
  );

  // Digital Case History Seed Data for Rohan Desai (PAT-1001)
  const consent1 = await upsertOne(
    db,
    "consents",
    { patient_id: pat1._id, doctor_id: doc1._id },
    {
      patient_id: pat1._id,
      doctor_id: doc1._id,
      type: "recording",
      granted_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ip_address: "127.0.0.1",
      patient_consent: true,
      doctor_consent: true,
      notes: "DPDP Act 2023 compliant consultation recording authorization.",
      createdAt: now,
      updatedAt: now,
    }
  );

  const consult1 = await upsertOne(
    db,
    "consultations",
    { patient_id: pat1._id, doctor_id: doc1._id },
    {
      patient_id: pat1._id,
      doctor_id: doc1._id,
      date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      audio_ref: "consult_audio_sample_rohan.webm",
      audio_duration: 184,
      transcript: "Doctor: Good morning Rohan. How have your headaches and BP been? Patient: Namaste doctor, the headache comes in the late afternoon, pulsating on the right temple. Also mild dizziness. Doctor: Let's check BP... it is 138/88. Still slightly elevated. Any allergies we should note? Patient: Yes doctor, severe reaction to Penicillin and Sulfa tablets in childhood. Doctor: Understood. I will adjust your antihypertensive to Telmisartan 40mg and add SOS Paracetamol for the headache. Avoid NSAIDs and any penicillin family antibiotics.",
      consent_id: consent1._id,
      status: "finalized",
      createdAt: now,
      updatedAt: now,
    }
  );

  await upsertOne(
    db,
    "casesheets",
    { consultation_id: consult1._id },
    {
      consultation_id: consult1._id,
      patient_id: pat1._id,
      doctor_id: doc1._id,
      symptoms: ["Right-sided pulsating temporal headache", "Afternoon dizziness", "Mild fatigue"],
      previous_diseases_mentioned: ["Stage 1 Essential Hypertension", "Seasonal Asthma"],
      allergies: ["Penicillin", "Sulfa drugs"],
      diagnosis: "Stage 1 Essential Hypertension with Episodic Vascular Cephalea",
      doctors_advice: [
        "Reduce dietary sodium intake (<2g/day)",
        "Maintain morning and evening BP log for 14 days",
        "Adequate sleep hygiene (minimum 7 hours)",
        "Strictly avoid Penicillin / Sulfa derivative medications",
      ],
      follow_up_required: true,
      follow_up_notes: "Review BP chart in 2 weeks or immediately if systolic exceeds 160.",
      created_by_ai: true,
      reviewed_by_doctor: true,
      reviewed_at: now,
      createdAt: now,
      updatedAt: now,
    }
  );

  // Active Medications
  await upsertOne(
    db,
    "medications",
    { patient_id: pat1._id, name: "Telmisartan" },
    {
      patient_id: pat1._id,
      consultation_id: consult1._id,
      doctor_id: doc1._id,
      name: "Telmisartan",
      dosage: "40mg - 1 Tab Morning",
      duration: "Ongoing (30 days)",
      start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      active: true,
      createdAt: now,
      updatedAt: now,
    }
  );
  await upsertOne(
    db,
    "medications",
    { patient_id: pat1._id, name: "Paracetamol 650mg" },
    {
      patient_id: pat1._id,
      consultation_id: consult1._id,
      doctor_id: doc1._id,
      name: "Paracetamol 650mg",
      dosage: "1 Tab SOS (Max 3/day)",
      duration: "5 days SOS",
      start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      active: true,
      createdAt: now,
      updatedAt: now,
    }
  );

  // Medical Reports
  await upsertOne(
    db,
    "reports",
    { patient_id: pat1._id, title: "12-Lead Electrocardiogram (ECG)" },
    {
      patient_id: pat1._id,
      type: "ECG",
      title: "12-Lead Electrocardiogram (ECG)",
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      uploaded_by: drSharma._id,
      summary: "Normal sinus rhythm at 74 bpm. No ST-elevation or ischemic changes. PR interval 150ms.",
      flagged_findings: ["Normal Sinus Rhythm", "Mild LV voltage within normal variants"],
      createdAt: now,
      updatedAt: now,
    }
  );
  await upsertOne(
    db,
    "reports",
    { patient_id: pat1._id, title: "Comprehensive Lipid & Renal Panel" },
    {
      patient_id: pat1._id,
      type: "Blood",
      title: "Comprehensive Lipid & Renal Panel",
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      uploaded_by: drSharma._id,
      summary: "Serum Creatinine 0.9 mg/dL (Normal). Total Cholesterol 210 mg/dL (Borderline High). Triglycerides 165 mg/dL.",
      flagged_findings: ["Borderline High Total Cholesterol (210 mg/dL)", "Normal eGFR (>90 mL/min)"],
      createdAt: now,
      updatedAt: now,
    }
  );

  console.log("Seed complete.");
  console.log("  Top Admin  : admin@medchat.dev   / admin12345");
  console.log("  HOD Doctor : sharma@medchat.dev  / doctor12345  (General Medicine)");
  console.log("  Doctor     : iyer@medchat.dev    / doctor12345  (Cardiology)");
  console.log("  Hospital   : hospital@medchat.dev / hospital12345");
  console.log("  Staff      : reception@medchat.dev / staff12345");
  console.log("  Patient    : rohan@medchat.dev   / patient12345");
  console.log("  Patient    : priya@medchat.dev   / patient12345");
  console.log("  Hospital capacity network: 4 synthetic hospitals / 14 daily snapshots");
  await client.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
