"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

export interface AuthUser {
  id: string;
  email: string;
  role: "ADMIN" | "DOCTOR" | "PATIENT" | "HOSPITAL";
  full_name: string;
  doctor_id?: string;
  patient_id?: string;
  hospital_id?: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("vitaweave_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("vitaweave_token", token);
  else localStorage.removeItem("vitaweave_token");
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("vitaweave_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    localStorage.removeItem("vitaweave_user");
    return null;
  }
}

export function setStoredUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem("vitaweave_user", JSON.stringify(user));
  else localStorage.removeItem("vitaweave_user");
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  withAuth = true
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isForm) headers["Content-Type"] = "application/json";
  if (withAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export interface Doctor {
  id: string;
  full_name: string;
  email: string;
  specialty: string | null;
}

export interface Conversation {
  id: string;
  patient_id?: string;
  doctor_id?: string;
  doctor_name?: string;
  patient_name?: string;
  title: string | null;
  status: "open" | "closed" | "escalated";
  summary?: string | null;
  updated_at?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: "patient" | "ai" | "doctor" | "system";
  content: string;
  safety_flags: Record<string, unknown>;
  created_at: string;
}

export interface PatientConversationSummary {
  patient: { id: string; full_name: string; custom_id: string; dob: string | null; sex: string | null; blood_type: string | null };
  conversation_count: number;
  message_count: number;
  latest_activity?: string;
  latest_patient_update: string;
  recent_concerns: Array<{ text: string; timestamp: string }>;
  known_allergies: string[];
  chronic_conditions: string[];
  active_medications: Array<{ name: string; dosage: string; duration?: string | null }>;
  clinical_note: string;
}

export interface PatientClinicalSummary {
  patient: { id: string; full_name: string; custom_id: string; dob: string | null; sex: string | null; blood_type: string | null };
  consultation_count: number;
  report_count: number;
  latest_activity?: string;
  current_assessment: string;
  reported_symptoms: string[];
  recent_diagnoses: string[];
  latest_advice: string[];
  known_allergies: string[];
  chronic_conditions: string[];
  active_medications: Array<{ name: string; dosage: string; duration?: string | null }>;
  recent_reports: Array<{ title: string; type: string; date: string }>;
  prescription_insights: Array<{ title: string; date: string; points: string[]; source: string }>;
  clinical_note: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  file_name: string;
  document_type: string | null;
  version: string | null;
  status: "pending" | "processing" | "active" | "error";
  created_at: string;
}

export interface AiConfig {
  system_prompt?: string;
  response_style?: string;
  language?: string;
  temperature: number;
  max_tokens: number;
  emergency_policy?: string;
}

export interface MLPrediction {
  model: string;
  n_features: number;
  predicted_class: number | string;
  class_index: number;
  classes: (number | string)[];
  probabilities: number[];
  probability_percent: number;
  positive_index: number | null;
  raw_score: number | null;
  source: string;
}

export const api = {
  register: (payload: {
    email: string;
    password: string;
    fullName: string;
    role: "DOCTOR" | "PATIENT";
    specialty?: string;
    licenseNo?: string;
    abha_id?: string;
    dob?: string;
    sex?: string;
    blood_type?: string;
    contact_phone?: string;
    emergency_contact?: { name: string; phone: string; relation: string };
    known_allergies?: string[];
    chronic_conditions?: string[];
  }) =>
    request<{ token: string; user: AuthUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }, false),

  registerHospital: (payload: {
    email: string; password: string; fullName: string; role: "HOSPITAL";
    hospitalName: string; hospitalType: string; registrationNumber: string;
    phone: string; address: string; city: string; state: string; pincode: string;
    latitude: number; longitude: number; totalBeds: number; icuBeds: number; activeDoctors: number;
  }) => request<{ token: string; user: AuthUser }>('/api/auth/register', {
    method: "POST", body: JSON.stringify(payload),
  }, false),

  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false),

  me: () => request<{ user: AuthUser }>("/api/auth/me"),

  updateMyPatientProfile: (payload: {
    abha_id?: string;
    dob?: string;
    sex?: string;
    blood_type?: string;
    contact_phone?: string;
    emergency_contact?: { name: string; phone: string; relation: string };
    known_allergies?: string[];
    chronic_conditions?: string[];
  }) => request<{ patient: PatientProfile }>("/api/auth/patient-profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  }),

  getHospitalPatientAppointments: (patientId: string) =>
    request<{ patient: PatientProfile; appointments: HospitalAppointment[] }>(
      `/api/appointments/hospital/patient/${encodeURIComponent(patientId)}`
    ),

  uploadHospitalPatientReport: (patientId: string, file: File, payload: { title: string; type: string; summary?: string }) => {
    const body = new FormData();
    body.append("file", file);
    body.append("title", payload.title);
    body.append("type", payload.type);
    if (payload.summary) body.append("summary", payload.summary);
    return request<{ report: Record<string, unknown> }>(`/api/appointments/hospital/patient/${encodeURIComponent(patientId)}/report`, { method: "POST", body });
  },

  getAppointmentOptions: () => request<{ hospitals: AppointmentHospital[]; doctors: AppointmentDoctor[] }>("/api/appointments/options"),

  getMyAppointments: () => request<{ appointments: HospitalAppointment[] }>("/api/appointments/mine"),

  updateMyAppointment: (id: string, payload: { action: "cancel" | "reschedule"; scheduled_for?: string; department?: string; reason?: string; doctor_id?: string }) =>
    request<{ appointment: HospitalAppointment }>(`/api/appointments/mine/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),

  getHospitalAppointments: () => request<{ appointments: HospitalAppointment[] }>("/api/appointments/hospital"),

  updateHospitalAppointment: (id: string, status: "confirmed" | "completed" | "cancelled") =>
    request<{ appointment: HospitalAppointment }>(`/api/appointments/hospital/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),

  createAppointment: (payload: { scheduled_for: string; department?: string; reason?: string; hospital_id?: string; doctor_id?: string }) =>
    request<{ appointment: HospitalAppointment }>("/api/appointments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  uploadMyPrescription: (file: File, title: string, summary?: string) => {
    const body = new FormData();
    body.append("file", file);
    body.append("title", title);
    if (summary) body.append("summary", summary);
    return request<{ report: Record<string, unknown> }>("/api/appointments/patient/prescriptions", { method: "POST", body });
  },

  listDoctors: () => request<{ doctors: Doctor[] }>("/api/doctors"),

  listConversations: () =>
    request<{ conversations: Conversation[] }>("/api/conversations"),

  getConversation: (id: string) =>
    request<{ conversation: Conversation; messages: Message[] }>(
      `/api/conversations/${id}`
    ),

  getPatientConversationSummary: (patientId: string) =>
    request<{ summary: PatientConversationSummary }>(`/api/conversations/doctor/patients/${patientId}/summary`),

  getPatientClinicalSummary: (patientId: string) =>
    request<{ summary: PatientClinicalSummary }>(`/api/case-history/patients/${patientId}/clinical-summary`),

  createConversation: (doctorId: string, title?: string) =>
    request<{ conversation: Conversation }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ doctorId, title }),
    }),

  sendMessage: (id: string, content: string) =>
    request<{
      message: Message;
      sources: Array<{ documentId: string; title: string; content: string }>;
      emergency: boolean;
    }>(`/api/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  listDocuments: () =>
    request<{ documents: DocumentRow[] }>("/api/documents"),

  uploadDocument: (file: File, title?: string, documentType?: string, version?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    if (documentType) form.append("documentType", documentType);
    if (version) form.append("version", version);
    return request<{ document: DocumentRow; chunks: number }>("/api/documents", {
      method: "POST",
      body: form,
    });
  },

  deleteDocument: (id: string) =>
    request<{ deleted: boolean }>(`/api/documents/${id}`, { method: "DELETE" }),

  getAiConfig: () => request<{ config: AiConfig | null }>("/api/ai-config"),

  updateAiConfig: (cfg: Partial<AiConfig>) =>
    request<{ config: AiConfig }>("/api/ai-config", {
      method: "PUT",
      body: JSON.stringify(cfg),
    }),

  // Server-side prediction from the actual trained models (via Next proxy
  // /api/ml/[model] -> services/ml FastAPI -> ml-models/*.pkl).
  predictML: (model: string, features: number[]) =>
    fetch(`/api/ml/${model}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ApiError(
          res.status,
          (data as { error?: string }).error ?? `ML predict failed (${res.status})`
        );
      }
      return data as MLPrediction;
    }),

  // Smart Digital Patient Case History API
  searchPatients: (q?: string) =>
    request<{ patients: PatientProfile[] }>(`/api/case-history/patients/search${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  getPatientProfile: (id: string) =>
    request<{
      patient: PatientProfile;
      stats: { total_consultations: number; active_medications: number; total_reports: number };
    }>(`/api/case-history/patients/${id}/profile`),

  getPatientTimeline: (id: string) =>
    request<{
      patient_id: string;
      total_events: number;
      timeline: TimelineEvent[];
      active_medications: MedicationRecord[];
    }>(`/api/case-history/patients/${id}/timeline`),

  createConsultationWithConsent: (payload: {
    patient_id: string;
    doctor_id?: string;
    patient_consent: boolean;
    doctor_consent: boolean;
    notes?: string;
  }) =>
    request<{
      consultation: { _id: string; patient_id: string; doctor_id: string; status: string; date: string };
      consent: { _id: string; type: string; granted_at: string; patient_consent: boolean; doctor_consent: boolean };
    }>("/api/case-history/consultations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  saveCaseSheet: (
    consultationId: string,
    payload: {
      symptoms: string[];
      previous_diseases_mentioned?: string[];
      allergies?: string[];
      diagnosis?: string | null;
      doctors_advice: string[];
      medications_prescribed: Array<{ name: string; dosage: string; duration: string }>;
      follow_up_required: boolean;
      follow_up_notes?: string | null;
      raw_transcript?: string;
      audio_duration?: number;
    }
  ) =>
    request<{
      success: boolean;
      case_sheet: CaseSheet;
      saved_medications: MedicationRecord[];
      allergy_conflicts: Array<{ medication: string; allergy: string; severity: string; message: string }>;
    }>(`/api/case-history/consultations/${consultationId}/case-sheet`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  uploadPatientReport: (payload: {
    patient_id: string;
    type: string;
    title: string;
    summary?: string;
    flagged_findings?: string[];
    date?: string;
    file_url?: string;
  }) =>
    request<{ report: Record<string, unknown> }>("/api/case-history/reports", {
      method: "POST",
      body: JSON.stringify(payload),
    }),


  getEmergencyDataset: (id: string, reason?: string) =>
    request<EmergencyDataset>(
      `/api/case-history/patients/${id}/emergency${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`
    ),

  linkAbhaId: (id: string, abha_id?: string) =>
    request<{ success: boolean; patient_id: string; abha_id: string; verified_with_abdm: boolean }>(
      `/api/case-history/patients/${id}/abha`,
      {
        method: "POST",
        body: JSON.stringify({ abha_id }),
      }
    ),

  extractCaseSheet: (transcript: string, patient_context?: Record<string, unknown>) =>
    request<CaseSheetExtractionResult>("/api/case-history/ai/extract", {
      method: "POST",
      body: JSON.stringify({ transcript, patient_context }),
    }),

  transcribeAudioFile: (audioBlob: Blob, language = "en-IN", patientName?: string) => {
    const form = new FormData();
    form.append("file", audioBlob, "consultation_audio.webm");
    form.append("language", language);
    if (patientName) form.append("patient_name", patientName);
    return request<{ transcript: string; status: string; source?: string }>(
      "/api/case-history/ai/transcribe-audio",
      {
        method: "POST",
        body: form,
      }
    );
  },
};

export interface PatientProfile {
  id: string;
  custom_id: string;
  abha_id: string | null;
  full_name: string;
  email: string;
  dob: string | null;
  sex: string | null;
  blood_type: string | null;
  contact_phone?: string | null;
  emergency_contact?: {
    name?: string | null;
    phone?: string | null;
    relation?: string | null;
  } | null;
  known_allergies: string[];
  chronic_conditions: string[];
  createdAt?: string;
}

export interface HospitalAppointment {
  _id: string;
  scheduled_for: string;
  department: string;
  reason: string | null;
  status: "requested" | "confirmed" | "completed" | "cancelled";
  hospital?: AppointmentHospital | null;
  doctor?: AppointmentDoctor | null;
  patient?: { id: string; custom_id: string; full_name: string } | null;
}

export interface AppointmentHospital { id: string; name: string; location?: string; }
export interface AppointmentDoctor { id: string; full_name: string; specialty: string | null; }

export interface CaseSheet {
  _id?: string;
  consultation_id?: string;
  patient_id?: string;
  doctor_id?: string;
  symptoms: string[];
  previous_diseases_mentioned: string[];
  allergies: string[];
  diagnosis: string | null;
  doctors_advice: string[];
  medications_prescribed: Array<{ name: string; dosage: string; duration: string }>;
  follow_up_required: boolean;
  follow_up_notes: string | null;
  created_by_ai?: boolean;
  reviewed_by_doctor?: boolean;
  reviewed_at?: string;
}

export interface MedicationRecord {
  id: string;
  name: string;
  dosage: string;
  duration?: string;
  active: boolean;
  start_date: string;
  prescribed_by?: string;
}

export interface TimelineEvent {
  id: string;
  eventType: "CONSULTATION" | "REPORT" | "MEDICATION_REGIMEN" | "EMERGENCY_ACCESS";
  timestamp: string;
  title: string;
  doctor_name?: string;
  status?: string;
  transcript?: string;
  audio_duration?: number;
  case_sheet?: CaseSheet;
  report_type?: string;
  summary?: string;
  file_url?: string;
  flagged_findings?: string[];
  uploaded_by_name?: string;
  medications?: MedicationRecord[];
}

export interface EmergencyDataset {
  emergency_access_granted: boolean;
  audit_log_id: string;
  timestamp: string;
  patient: {
    id: string;
    abha_id: string;
    custom_id: string;
    full_name: string;
    dob: string | null;
    sex: string | null;
    blood_type: string;
    emergency_contact: {
      name: string;
      phone: string;
      relation: string;
    };
    critical_allergies: string[];
    chronic_conditions: string[];
    active_medications: Array<{
      name: string;
      dosage: string;
      duration: string;
    }>;
  };
}

export interface CaseSheetExtractionResult {
  symptoms: string[];
  previous_diseases_mentioned: string[];
  allergies: string[];
  diagnosis: string | null;
  doctors_advice: string[];
  medications_prescribed: Array<{ name: string; dosage: string; duration: string }>;
  follow_up_required: boolean;
  follow_up_notes: string | null;
  extracted_from?: string;
}

