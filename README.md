# MedChat — Medical AI Consultation Chatbot

A privacy-focused medical consultation platform built around **RAG + LangChain
with no fine-tuning**, extended into a full appointment-to-consultation
journey:

- Patients **chat with an AI assistant** whose answers are grounded in
  doctor-approved documents.
- Before each appointment the AI **runs a conversational, bilingual
  (Hindi/English/Hinglish) pre-consultation screening** by voice or text —
  the patient can answer in Hindi, the doctor always sees English.
- Hospital staff **upload lab reports/imaging** that get **AI-extracted,
  OCR'd, and validated**; the AI then builds a **longitudinal health journey**
  (per-test trends across visits) and a **doctor-facing clinical summary** for
  every visit.

```
Next.js              Node/Express          FastAPI + LangChain          MongoDB
Patient / Doctor   → Auth · RBAC ·      →  RAG · memory · safety    →  users · documents ·
Doctor / Hospital     orchestrators         · extraction · trends       chunks · conversations
       UI            (deterministic)        · screening · LLM (Ollama)  reports · preconsultations
```

## Repository layout

```
apps/web        Next.js 16 frontend (patient chat, doctor dashboard)
apps/api        Node/Express backend (plain JavaScript, Mongoose)
services/ai     Python FastAPI + LangChain AI service
database        MongoDB seed data
docs            architecture / security / rag / medical-safety
scripts         ingestion + RAG smoke-test helpers
tlux-agent      working architecture document (source of truth)
```

## Tech stack

| Layer | Technology | Details |
| ----- | ---------- | ------- |
| **Frontend** | Next.js 16.3 (App Router), React 19, TypeScript | `apps/web` — patient / doctor / hospital portals, JWT auth on `localStorage`, centralized `fetch` API client (`lib/api.ts`) |
| | Tailwind CSS v4, framer-motion, lucide-react | Utility styling, UI animation, icon set |
| | 8 client-side clinical ML engines | Diabetes (XGBoost JSON trees), Stroke/Heart Disease/Anemia/Breast Cancer (logistic regression), Heart Failure (Random Forest, 800 JSON trees), Kidney (rule-based CKD staging), Liver (tuned ensemble) |
| **Backend API** | Node.js ≥ 20, Express 4.21 | `apps/api` — plain JavaScript, REST on port 5001 |
| | Mongoose 8 | MongoDB ODM + schemas (users, doctors, patients, documents, chunks, conversations, messages) |
| | jsonwebtoken, bcryptjs | JWT auth + password hashing |
| | multer, uuid, cors, dotenv | File uploads, IDs, CORS, env config |
| **AI Service** | Python ≥ 3.11, FastAPI + Uvicorn | `services/ai` — RAG/LLM service on port 8000 |
| | LangChain 0.3 (ollama, community, text-splitters) | Document ingestion, chunking, retrieval chains |
| | Ollama (llama3.1:8b chat, bge-m3 embeddings, 1024-dim) | Fully local inference + embeddings |
| | PyMongo, pydantic v2, pypdf, httpx | DB access, request models, PDF parsing, HTTP |
| **Database** | MongoDB (Atlas / local) | Collections: `users`, `doctors`, `patients`, `doctordocuments`, `documentchunks`, `conversations`, `messages`, `reports`, `healthtimelines`, `preconsultations`, plus departments/appointments/hospitals; seeded from `database/` |
| **File storage** | ImageKit (cloud, optional) | Report files uploaded to ImageKit (`/reports` folder) with CDN URL + `file_id`; falls back to local `uploads/` when not configured (`apps/api/src/services/imageKit.js`) |
| **OCR + parsing** | pypdf, PyMuPDF, pytesseract, Pillow | PDF text-layer extraction first; scanned files rasterized (PyMuPDF) + OCR'd (tesseract) after grayscale/contrast/2× upscale preprocessing (`medical_document.py`) |
| **Speech-to-text** | faster-whisper (on-premise) | Consultation + screening audio transcribed locally, multilingual/Hinglish, auto language detection with optional hint |
| **Orchestration** | npm workspaces (monorepo) | Shared root scripts (`dev:web`, `dev:api`, `dev:ai`) |
| **Service auth** | `X-AI-Key` header | Shared secret between Express API and FastAPI (`AI_SERVICE_API_KEY` / `API_KEY_FOR_AI`) |

### Ports & service map

```
:3000  Next.js web app (apps/web)  ──▶  :5001  Express API (apps/api)
:5001  Express API (apps/api)      ──▶  :8000  FastAPI AI service (services/ai)
:8000  FastAPI AI service          ──▶  Ollama (:11434) — llama3.1:8b + bge-m3
MongoDB  ◀──  Express API + AI service (documents, chunks, users, conversations)
```

### Frontend (apps/web) dependencies

- **Runtime:** `next`, `react`, `react-dom`, `framer-motion`, `lucide-react`
- **Dev:** `typescript`, `tailwindcss`, `@tailwindcss/postcss`, `eslint`, `eslint-config-next`, `@types/*`

### Backend (apps/api) dependencies

`express`, `mongoose`, `jsonwebtoken`, `bcryptjs`, `multer`, `uuid`, `cors`, `dotenv`

### AI service (services/ai) dependencies

`fastapi`, `uvicorn[standard]`, `pydantic>=2.10`, `langchain>=0.3,<1.0`, `langchain-core`, `langchain-community`, `langchain-ollama`, `langchain-text-splitters`, `pymongo[srv]`, `pypdf`, `pymupdf` (alias `fitz`), `pillow`, `python-multipart`, `httpx`, `faster-whisper`; `pytesseract` + tesseract binary (system) for OCR

## Prerequisites

- Node.js ≥ 20.9, npm
- Python ≥ 3.11
- MongoDB Atlas database (set `MONGODB_URI` in `.env`)
- Ollama with a chat model (`llama3.2`) and embedding model (`bge-m3`)
- faster-whisper (pulled on first transcribe; override with `WHISPER_MODEL` /
  `WHISPER_DEVICE` / `WHISPER_COMPUTE_TYPE`)
- tesseract system binary for OCR of scanned reports (`brew install tesseract`
  on macOS / `apt-get install tesseract-ocr` on Debian);
  `pytesseract` only activates OCR when the binary is present

## Setup

One-time install. No Docker required.

```bash
# 1. Start Ollama and pull the models (one-time)
#    macOS: brew install ollama   |   Linux/WSL: curl -fsSL https://ollama.com/install.sh | sh
brew install ollama            # skip if already installed
ollama serve                   # leave running (defaults to :11434)
ollama pull llama3.2           # chat model
ollama pull bge-m3             # embedding model

# 2. Environment — copy and fill in
cp .env.example .env
# .env: set MONGODB_URI to your Atlas connection string (e.g. mongodb+srv://<user>:<pass>@cluster...).

# 3. JS workspaces (web + api)
npm install

# 4. Python AI service
cd services/ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ../..

# 5. Seed the database
npm run db:seed
```

## Run (three terminals, in this order)

The AI service must be up before the API (uploads and chat call it).

```bash
# Terminal 1 — AI service      http://localhost:8000
npm run dev:ai

# Terminal 2 — API             http://localhost:5001
npm run dev:api

# Terminal 3 — Web app         http://localhost:3000
npm run dev:web
```

Sanity check after start:

```bash
curl http://localhost:8000/health   # {"status":"ok","service":"ai",...}
curl http://localhost:5001/health   # {"status":"ok","service":"api","db":"mongodb"}
```

## Seed logins

| Role    | Email               | Password       |
| ------- | ------------------- | -------------- |
| Admin   | admin@medchat.dev   | admin12345     |
| Doctor  | sharma@medchat.dev  | doctor12345    |
| Doctor  | iyer@medchat.dev    | doctor12345    |
| Patient | rohan@medchat.dev   | patient12345   |
| Patient | priya@medchat.dev   | patient12345   |

## Adding a doctor's medical knowledge

As a doctor, upload a PDF/TXT/MD from the **Knowledge documents** tab. The
document is chunked, embedded (bge-m3), and stored in MongoDB scoped to that
doctor. A patient's questions then retrieve **only that doctor's** documents
via doctor-scoped cosine similarity.

## What is in the codebase and why

Everything beyond the chatbot exists to make the **before-visit data capture**
trustworthy: numbers are computed deterministically, the LLM is only ever used
where language matters (explaining, translating, phrasing), and every AI
output for a consultation is non-diagnostic by construction (prompts and
outputs carry a "verify by a clinician" rule and disclaimer).

### 1. Conversational pre-consultation screening (Hindi/English/Hinglish)

The questionnaire is no longer a static form — the AI **asks** each question
naturally and understands the reply.

- **Questionnaire engine** (`hospital.controller.js`, questionnaire editor):
  each department question has an answer type (yes/no, choice, multi-choice,
  number, date), optional `show_if` conditional rules, a bilingual phrasing
  (`text_hi`), and a **`visit_type`** ("Every visit" / "First visit only" /
  "Follow-up only"). *Why:* questions belong to each branch, and follow-up
  visits must not re-ask everything from the first visit.
- **Conversation engine** (`services/ai/app/api/routes/conversation.py`):
  - `POST /screening/understand-answer` — normalizes a free-text reply to a
    clean English value, detects the language (`en`/`hi`/`hinglish` via
    detectlanguage-style scoring + Devanagari regex fallback), extracts
    structured JSON for yes/no / choice / number / date questions, and asks a
    **clarification re-question** when the answer is not parseable. Hindi
    numerals (एक…दस, incl. छः/छह→6) are mapped to digits deterministically.
    *Why:* the doctor must never read "छः" in a number field — Hindi in, clean
    English out, with the raw original preserved alongside.
  - `POST /screening/phrase-question` — renders the question as a natural,
    spoken-style bilingual sentence (English + हिन्दी), optionally referencing
    the patient's previous-visit answer. *Why:* patients type/speak like they
    talk, and the AI should sound like a receptionist, not a form.
  - `POST /screening/comprehensive-summary` — produces the concluding doctor
    summary as **structure + JSON**: chief complaint, onset, symptoms,
    severity, medication/self-care, previous-visit review, **new since last
    visit**, **patient's own words**, **important for the doctor**, and a
    disclaimer. *Why:* the doctor gets a print-ready, sectioned pre-visit
    summary instead of a chatbot transcript. `patients_own_words` is built
    deterministically from the stored raw (`value_original`) answers so the
    LLM can never invent a quote.
- **Orchestrator** (`apps/api/src/services/screeningConversationService.js`):
  a **deterministic question router** picks the next question by visit type →
  `show_if` conditionals → "already answered" — then calls the AI only to
  phrase/understand/summarize. It stores `conversation_log`, counts visits
  (`visit_number`, first vs follow-up), loads the last visit's summary for
  context, auto-finalizes after the last question, and has a deterministic
  fallback summary if the AI service is down. *Why:* exactly where the node
  goes and which fields exist must be reproducible — the LLM is never the
  decision-maker about flow.
- **Voice in** (`transcription.py` + `ScreeningVoiceInput`): the browser
  records mic audio (MediaRecorder) and streams it to
  `POST /appointments/mine/:id/transcribe` (faster-whisper, on-premise,
  Hinglish-tolerant, per-question language hint). *Why:* older patients
  answer by talking; audio never leaves the machine.
- **Patient UI** (`app/patient/screening/[id]/page.tsx`): chat bubbles with a
  हिन्दी/EN toggle (defaults from the browser language), quick-answer chips
  for yes/no and single-choice questions, multi-select toggles, a progress
  bar, a "from your last visit" card, and a completion screen showing the
  concluded summary. *Why:* a follow-up patient instantly sees what the system
  already knows, and tapping beats typing for structured answers.
- **Doctor UI** (`PatientClinicalSummary.tsx`): the summary renders the
  structured sections, visually highlights **New since last visit**, keeps
  **Patient's own words** in the original Hindi with an English gloss, shows
  the visit number badge, and hides the raw Hindi answers behind an
  "Original answers" block. *Why:* the doctor's column is English-first; raw
  Hindi stays available for semantic verification without cluttering the view.

### 2. Report intelligence: extraction + validation (build the journey)

- **Extraction** (`medical_document.py` + `medicalDocumentExtraction.js`):
  uploaded report files are text-extracted (pypdf text layer → PyMuPDF
  rasterize → tesseract OCR for scans), then classified by report type and
  turned into structured findings (`name`, `value`, `unit`, `reference
  range`, `status`), `flagged_values`, and a clinical summary via the LLM.
  Output is **strict JSON**; nothing is fabricated (prompt-enforced).
  *Why:* staff upload real-world PDFs and phone photos of reports; the data
  that later feeds trends has to be clean.
- **Flagging is math-first** (`normalizeFlaggedValues`): a parameter is
  flagged normal/high/low/critical by comparing its value to the reference
  range with code, not by asking the LLM to "feel" it. *Why:* a 0.1 mg/dL
  difference on a printed range must be decided by arithmetic, not prose.
- **Shared apply helper** (`applyExtractionResult`, `preserveSummary`): upload
  and reprocess run through the same code path so re-extracting never drifts.
  *Why:* same input → same stored result, whether it's the first pass or a
  redo.

### 3. Longitudinal health journey (the "why it changed" story)

- **Trend engine** (`trendEngine.js`): pure-math computation of per-parameter
  time series and % change vs the previous reading and vs the first reading,
  only reading reports with `ai_status: "completed"`. Parameter names are
  matched through an alias table (e.g. `hb`, `hgb`, `haemoglobin` →
  hemoglobin), so one test can be tracked across differently-worded labs.
  *Why:* the doctor must see "Hb dropped 9% since last visit" computed exactly,
  not guessed.
- **Narrator** (`longitudinalService.js` + `longitudinal-summary` AI route):
  the LLM writes a narrative **only over the precomputed facts**
  (report count, date span, per-parameter diffs) and has a deterministic
  fallback when the AI is down. `buildWhatChanged` + `resolveChangedSinceDate`
  feed the "what's changed since X" panel. *Why:* math-first, LLM-last is the
  core correctness rule of this codebase — the model explains, it never
  recalculates.
- **Why the DB layer needs the reserved-key fix:** each journey node stores
  `timeline[].type`. JavaScript's `type` is a reserved key in Mongoose
  sub-documents, so it must be mapped explicitly (`type: { type: String }` in
  the `timeline` schema). *Why:* without the mapping the field is silently
  dropped by Mongoose and timeline entries came back with no type at all.

### 4. Prescription save-only flow (deliberately no AI on prescriptions)

Prescription uploads are saved as-is with `ai_status: "skipped"`; the
patient-entered title/summary is the source of truth, reprocess is blocked for
them. *Why:* you explicitly required that prescriptions are **never parsed or
edited by AI** — a meds list must not be ML-corrected. (Prescriptions are
still shown in the journey/report list, just not extracted.)

### 5. Cloud file storage + deletion hygiene

- **ImageKit** (`imageKit.js`): report binaries go to ImageKit under
  `/reports` (unique file names, `file_id` + CDN URL), keeping heavy bytes out
  of MongoDB; storage gracefully falls back to local `uploads/` when ImageKit
  env keys are absent. *Why:* Mongo stays lean, files are CDN-served, and the
  delete API means cleanup is possible.
- **Delete + permission model** (`DELETE /reports/:id`): hospital staff
  (`HOSPITAL_ADMIN`/`STAFF`) may delete any report they can view; doctors/HOD
  only their own uploads. Deletion is transactional: ImageKit file → local
  file → DB record → AuditLog. *Why:* mistaken or duplicate uploads must be
  removable, and only authorized roles may touch records.

### 6. Translation service (`translation.py` + `translate.js`)

A batched `POST /translate` endpoint turns Hindi/Hinglish into English with an
ASCII heuristic to skip already-English text and a refusal-detection fallback,
so a translation failure degrades to "use the original". *Why:* the doctor
always sees English, but raw non-English input is preserved (never overwritten
with the translation).

### 7. Everything rides the same design principle

| Situation | Deterministic code decides | LLM is allowed to... |
| --------- | -------------------------- | -------------------- |
| Next question to ask | visit rules, conditionals, answered set | — |
| Number extraction, flags, trends, dates | normalization + arithmetic | — |
| "New since last visit" | comparing answers vs previous summary | — |
| Wording of a question / a narrative | — | phrase it naturally |
| Translation | decide *whether* to translate | translate |
| Understanding free text | schema + regex + Hindi digits | parse to structured JSON |
| Diagnosis / treatment | — | **never** (prompt-enforced) |

## API surface (Express, port 5001)

```
POST /api/auth/register     POST /api/auth/login      GET /api/auth/me
GET  /api/doctors           GET /api/doctors/:id
GET  /api/conversations     GET /api/conversations/:id
POST /api/conversations     POST /api/conversations/:id/messages
GET/POST /api/documents     DELETE /api/documents/:id
GET/PUT /api/ai-config
GET /api/admin/users        PATCH /api/admin/users/:id/active   GET /api/admin/audit-logs

# Pre-consultation screening (patient)
GET  /api/appointments/mine             GET  /api/appointments/mine/:id/questionnaire
POST /api/appointments/mine/:id/questionnaire/answers   (legacy static form)
GET  /api/appointments/mine/:id/screening/start         (chat session, visits context)
POST /api/appointments/mine/:id/screening/message       (send answer / finalize)
POST /api/appointments/mine/:id/transcribe              (voice → faster-whisper)
GET  /api/appointments/hospital/:id/screening           (staff/doctor view)

# Hospital questionnaire editor (HOD/doctor-configured per branch)
GET/PUT /api/hospitals/departments/:id/questionnaire    (incl. visit_type, show_if, text_hi)

# Doctor case history
GET  /api/case-history/patients/:id/profile
GET  /api/case-history/patients/:id/clinical-summary    (comprehensive screen + reports)
GET  /api/case-history/patients/:id/timeline            (longitudinal health journey)
GET  /api/case-history/patients/:id/emergency           (emergency dataset)
POST /api/case-history/reports          POST /api/case-history/consultations
POST /api/case-history/ai/extract       POST /api/case-history/ai/transcribe-audio

# Medical document store (+ upload via /api/case-history/reports or hospital upload)
GET  /api/medical-documents             GET /api/medical-documents/:id
POST /api/medical-documents/:id/reprocess    DELETE /api/medical-documents/:id  PATCH /api/medical-documents/:id

# Appointments (patient/hospital/doctor views) + hospital admin
GET/POST /api/appointments              GET /api/appointments/hospital   GET /api/appointments/doctor
PATCH /api/appointments/hospital/:id    POST /api/appointments/hospital/patient/:patientId/report
POST /api/appointments/patient/prescriptions  (save-only, ai_status "skipped")
GET/PUT /api/hospitals/me               GET/POST /api/hospitals/departments ...
```

## AI service (FastAPI, port 8000)

```
GET  /health            POST /api/query   (RAG chat)   POST /api/ingest   (document ingestion)
POST /api/extract-case-sheet  (extraction.py — shared extractor, pre-conversation)
POST /api/extract-report       (medical_document.py — OCR + normalized findings)
POST /api/screening/understand-answer  (conversation.py — normalize reply + clarify)
POST /api/screening/phrase-question    (conversation.py — bilingual question phrasing)
POST /api/screening/comprehensive-summary (conversation.py — doctor pre-visit summary)
POST /api/transcribe-audio  (transcription.py — faster-whisper, Hinglish-tolerant)
POST /api/translate         (translation.py — Hindi→English, doctor-safe)
POST /api/longitudinal-summary  (longitudinal.py — health journey narrative)
POST /api/summarize-screening   (summary.py — screening summary)
```

The API and AI service authenticate to each other via the shared
`X-AI-Key` header (`API_KEY_FOR_AI` / `AI_SERVICE_API_KEY`).

### Consultation audio speech-to-text

Doctor consultation audio is transcribed **on-premise** by `faster-whisper`
(multilingual / Hinglish compatible, auto language detection — override with
`WHISPER_MODEL` / `WHISPER_DEVICE` / `WHISPER_COMPUTE_TYPE` in `.env`). The model
(default `small`) downloads from HuggingFace on first transcribe. During live
recording the web UI streams captured audio to this endpoint every few seconds
so the **Raw Consultation Transcript (STT Output)** section fills in as the
doctor and patient speak — independent of browser speech-recognition support.
The same engine powers **screening voice input**: the patient's pre-visit
answers are transcribed per question (with a language hint, e.g. `hi-IN`) and
fed into the conversation engine.

## Verification

```bash
# doctor id via the API
DOCTOR_ID=$(curl -s http://localhost:5001/api/doctors \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost:5001/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"sharma@medchat.dev","password":"doctor12345"}' \
     | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["doctors"][0]["id"])')
source services/ai/venv/bin/activate
python scripts/test_rag.py --doctor-id "$DOCTOR_ID"
```

## Roadmap (from the architecture doc)

Encryption-at-rest, prompt-injection test suite, clinician-reviewed safety
rules, production GPU inference behind the private network.