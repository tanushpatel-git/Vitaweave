"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clock3,
  FileText,
  HeartPulse,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UsersRound,
  X,
  LucideIcon,
} from "lucide-react";
import { api, ApiError, getStoredUser } from "../../../lib/api";

type View = "consultations" | "specialties" | "doctors" | "chat";

type Doctor = {
  id: string;
  name: string;
  specialty: string;
  experience: string;
  rating: string;
  availability: string;
  initials: string;
  description: string;
};

type Consultation = {
  id: string;
  doctor: Doctor;
  title: string;
  preview: string;
  time: string;
  status: "active" | "scheduled" | "completed";
};

type Message = {
  id: string;
  sender: "user" | "doctor" | "tlux";
  text: string;
  time: string;
};

type Specialty = {
  name: string;
  description: string;
  icon: LucideIcon;
};

const specialties: Specialty[] = [
  {
    name: "Cardiology",
    description: "Heart & vascular health",
    icon: HeartPulse,
  },
  {
    name: "Neurology",
    description: "Brain & nervous system",
    icon: Activity,
  },
  {
    name: "General Medicine",
    description: "Everyday health concerns",
    icon: Stethoscope,
  },
  {
    name: "Dermatology",
    description: "Skin & related conditions",
    icon: Sparkles,
  },
  {
    name: "Endocrinology",
    description: "Hormones & metabolism",
    icon: Activity,
  },
  {
    name: "Pulmonology",
    description: "Lungs & respiratory health",
    icon: Activity,
  },
  {
    name: "Nephrology",
    description: "Kidney health",
    icon: Activity,
  },
  {
    name: "Orthopedics",
    description: "Bones & movement",
    icon: UsersRound,
  },
];

function initialsFor(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function uniqueLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function Page() {
  const router = useRouter();
  const patientUser = getStoredUser();
  const patientName = patientUser?.full_name || "Patient";
  const patientInitials = patientName.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "PT";
  const [view, setView] = useState<View>("consultations");
  const [selectedSpecialty, setSelectedSpecialty] = useState("Cardiology");
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [activeConsultation, setActiveConsultation] = useState<Consultation | null>(null);
  const [messageText, setMessageText] = useState("");
  const [messagesList, setMessagesList] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // ── API data ────────────────────────────────────────────────────────────
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [loadingConsultations, setLoadingConsultations] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    let mounted = true;
    api
      .listDoctors()
      .then((res) => {
        if (!mounted) return;
        const mapped: Doctor[] = res.doctors.map((doc) => ({
          id: doc.id,
          name: doc.full_name.replace(/^Dr\.?\s+/i, "") ? `Dr. ${doc.full_name.replace(/^Dr\.?\s+/i, "")}` : doc.full_name,
          specialty: doc.specialty || "General Medicine",
          experience: "Verified specialist",
          rating: "—",
          availability: "Available now",
          initials: initialsFor(doc.full_name),
          description: `Specializes in ${doc.specialty || "general medicine"}.`,
        }));
        setDoctors(mapped);
      })
      .catch(() => {
        // Fall back to empty list on error
      })
      .finally(() => {
        if (mounted) setLoadingDoctors(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    api
      .listConversations()
      .then((res) => {
        if (!mounted) return;
        const mapped: Consultation[] = res.conversations.map((conv) => {
          const doctor = conv.doctor_name
            ? {
                id: conv.doctor_id || conv.id,
                name: conv.doctor_name,
                specialty: "Consulting specialist",
                experience: "Verified specialist",
                rating: "—",
                availability: "Available now",
                initials: initialsFor(conv.doctor_name),
                description: "Consulting specialist in your network.",
              }
            : null;
          return {
            id: conv.id,
            doctor: doctor || {
              id: conv.id,
              name: "TLUX Clinical",
              specialty: "Clinical intelligence",
              experience: "AI",
              rating: "—",
              availability: "Available now",
              initials: "TLUX",
              description: "AI-powered clinical intelligence.",
            },
            title: conv.title || "Clinical consultation",
            preview: conv.summary || "Open this consultation to continue.",
            time: conv.updated_at
              ? new Date(conv.updated_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })
              : "Recently",
            status: conv.status === "open" ? "active" : conv.status === "escalated" ? "active" : "completed",
          };
        });
        setConsultations(mapped);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoadingConsultations(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filteredDoctors = doctors.filter((doctor) => {
    const matchesSpecialty =
      selectedSpecialty === "All" || doctor.specialty === selectedSpecialty;

    const normalizedSearch = searchQuery.toLowerCase();

    const matchesSearch =
      doctor.name.toLowerCase().includes(normalizedSearch) ||
      doctor.specialty.toLowerCase().includes(normalizedSearch) ||
      doctor.description.toLowerCase().includes(normalizedSearch);

    return matchesSpecialty && matchesSearch;
  });

  const openDoctorSearch = () => {
    setSelectedSpecialty("All");
    setSearchQuery("");
    setView("doctors");
  };

  const openDoctorSelection = () => {
    setSelectedSpecialty("All");
    setSearchQuery("");
    setView("specialties");
  };

  const openSpecialty = (specialty: string) => {
    setSelectedSpecialty(specialty);
    setSearchQuery("");
    setView("doctors");
  };

  const openDoctor = (doctor: Doctor) => {
    setSelectedDoctor(doctor);
  };

  const startConsultation = async (doctor: Doctor) => {
    setSelectedDoctor(doctor);
    setMessagesList([]);
    setView("chat");

    try {
      const res = await api.createConversation(doctor.id, `${doctor.specialty} consultation`);
      const conv = res.conversation;
      setActiveConsultation({
        id: conv.id,
        doctor,
        title: conv.title || `${doctor.specialty} consultation`,
        preview: "New consultation",
        time: "Just now",
        status: "active",
      });
      const existing = consultations.find(
        (entry) => entry.doctor?.id === doctor.id
      );
      if (!existing) {
        setConsultations((current) => [
          {
            id: conv.id,
            doctor,
            title: conv.title || `${doctor.specialty} consultation`,
            preview: "New consultation",
            time: "Just now",
            status: "active",
          },
          ...current,
        ]);
      }
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Could not start consultation.";
      setActiveConsultation({
        id: uniqueLocalId(),
        doctor,
        title: `${doctor.specialty} consultation`,
        preview: "New consultation",
        time: "Just now",
        status: "active",
      });
      setMessagesList([
        {
          id: uniqueLocalId(),
          sender: "tlux",
          text: message,
          time: "Now",
        },
      ]);
    }
  };

  const openConsultation = async (consultation: Consultation) => {
    setActiveConsultation(consultation);
    setSelectedDoctor(consultation.doctor);
    setView("chat");
    setMessagesList([]);
    setLoadingMessages(true);

    try {
      const res = await api.getConversation(consultation.id);
      const mapped: Message[] = res.messages.map((msg) => ({
        id: msg.id,
        sender: msg.sender === "patient" ? "user" : msg.sender === "doctor" ? "doctor" : "tlux",
        text: msg.content,
        time: new Date(msg.created_at).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));
      setMessagesList(mapped);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Could not load conversations.";
      setMessagesList([
        {
          id: uniqueLocalId(),
          sender: "tlux",
          text: message,
          time: "Now",
        },
      ]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const sendMessage = async () => {
    const trimmedMessage = messageText.trim();

    if (!trimmedMessage || !activeConsultation) return;

    const userMessage: Message = {
      id: uniqueLocalId(),
      sender: "user",
      text: trimmedMessage,
      time: "Now",
    };

    setMessagesList((currentMessages) => [...currentMessages, userMessage]);
    setMessageText("");
    setSending(true);

    // If this is a local consultation (not yet persisted), create it first
    let conversationId = activeConsultation.id;
    if (conversationId.startsWith("local-")) {
      try {
        const res = await api.createConversation(activeConsultation.doctor.id, activeConsultation.title);
        conversationId = res.conversation.id;
        setActiveConsultation((current) =>
          current ? { ...current, id: res.conversation.id } : current
        );
      } catch {
        setSending(false);
        return;
      }
    }

    try {
      const res = await api.sendMessage(conversationId, trimmedMessage);
      const aiMessage: Message = {
        id: res.message.id,
        sender: res.message.sender === "doctor" ? "doctor" : "tlux",
        text: res.message.content,
        time: new Date(res.message.created_at).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessagesList((currentMessages) => [...currentMessages, aiMessage]);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Message could not be sent.";
      setMessagesList((currentMessages) => [
        ...currentMessages,
        {
          id: uniqueLocalId(),
          sender: "tlux",
          text: message,
          time: "Now",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const goBack = () => {
    if (view === "chat") {
      setView("consultations");
      return;
    }

    if (view === "doctors") {
      setView("specialties");
      return;
    }

    if (view === "specialties") {
      setView("consultations");
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f6f5] text-[#171918]">
      <div className="flex min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-[#e3e8e5] bg-[#f8faf9] px-4 py-5 transition-transform duration-300 lg:static lg:translate-x-0 ${
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-8 flex items-center justify-between px-2">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#171918] text-white">
                <Activity size={17} strokeWidth={2.3} />
              </div>

              <div className="text-left">
                <p className="text-[15px] font-semibold tracking-[-0.02em]">
                  TLUX
                </p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#87908b]">
                  VITAWEAVE intelligence
                </p>
              </div>
            </button>

            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="rounded-lg p-2 text-[#7b837f] lg:hidden"
            >
              <X size={18} />
            </button>
          </div>

          <button
            onClick={openDoctorSelection}
            className="mb-3 flex h-11 items-center justify-between rounded-xl bg-[#171918] px-4 text-sm font-medium text-white transition hover:bg-[#292d2b]"
          >
            <span className="flex items-center gap-2">
              <Plus size={16} />
              New consultation
            </span>

            <ArrowRight size={15} />
          </button>

          <button
            onClick={() => openDoctorSearch()}
            className="mb-3 flex h-11 items-center justify-between rounded-xl border border-[#e0e6e2] bg-white px-4 text-sm font-medium text-[#171918] transition hover:bg-[#f4f6f5]"
          >
            <span className="flex items-center gap-2">
              <Search size={16} />
              Search doctors
            </span>

            <ArrowRight size={15} />
          </button>

          <div className="space-y-2">
            <p className="mb-2 px-2 text-[9px] font-semibold tracking-[0.18em] text-[#929a96]">SAVED CONVERSATIONS</p>
            {loadingConsultations ? <p className="px-2 text-xs text-[#929a96]">Loading…</p> : consultations.length ? consultations.map((consultation) => (
              <button key={consultation.id} onClick={() => openConsultation(consultation)} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] transition ${activeConsultation?.id === consultation.id && view === "chat" ? "bg-white shadow-[0_4px_20px_rgba(20,30,25,0.05)]" : "hover:bg-white/70"}`}>
                <MessageCircle size={14} className="shrink-0 text-[#8c9691]"/>
                <span className="min-w-0 flex-1 truncate text-[#4d5651]">{consultation.title}</span>
                <span className="text-[9px] text-[#9aa39f]">{consultation.time}</span>
              </button>
            )) : <p className="px-2 text-xs leading-5 text-[#929a96]">No saved conversations yet. Start a consultation to create one.</p>}
          </div>

          <div className="mt-auto space-y-1">
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-[#68716d] hover:bg-white">
              <ShieldCheck size={17} />
              Privacy & security
            </button>

            <div className="mt-3 rounded-xl border border-[#e0e6e2] bg-white/70 p-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#6f9989]" />
                <span className="text-[11px] font-medium text-[#59635e]">
                  TLUX connected
                </span>
              </div>

              <p className="mt-1 text-[10px] leading-4 text-[#929a96]">
                Your health context is available to assist this consultation.
              </p>
            </div>
          </div>
        </aside>

        {mobileSidebarOpen && (
          <button
            aria-label="Close navigation"
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px] lg:hidden"
          />
        )}

        <section className="min-w-0 flex-1">
          <header className="flex h-[74px] items-center justify-between border-b border-[#e3e8e5] bg-[#f7f9f8]/90 px-5 backdrop-blur-xl lg:px-9">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="rounded-xl border border-[#e0e6e2] bg-white p-2.5 lg:hidden"
              >
                <MessageCircle size={17} />
              </button>

              <button
                onClick={() => router.push("/patient/dashboard")}
                className="flex items-center gap-2 rounded-xl border border-[#e0e6e2] bg-white px-3 py-2 text-xs font-medium text-[#69726e]"
              >
                <ArrowLeft size={14} />
                Back
              </button>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#89928d]">
                  Patient workspace
                </p>
                <p className="text-sm font-medium text-[#2d3531]">
                  {view === "chat"
                    ? selectedDoctor?.name
                    : view === "doctors"
                      ? "Choose your doctor"
                      : view === "specialties"
                        ? "Choose a specialty"
                        : "Your consultations"}
                </p>
              </div>
            </div>

            <div className="hidden items-center gap-3 sm:flex">
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#929b96]"
                />

                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search"
                  className="h-9 w-[190px] rounded-xl border border-[#e1e6e3] bg-white pl-9 pr-3 text-xs outline-none transition focus:border-[#b9c9c2]"
                />
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e1e6e3] bg-white text-xs font-semibold">
                {patientInitials}
              </div>
            </div>
          </header>

          <AnimatePresence mode="wait">
            {view === "consultations" && (
              <ConsultationsView
                consultations={consultations}
                loading={loadingConsultations}
                onNewConsultation={openDoctorSelection}
                onOpenConsultation={openConsultation}
                onOpenDoctorSelection={openDoctorSelection}
                onDoctorSearch={() => openDoctorSearch()}
              />
            )}

            {view === "specialties" && (
              <SpecialtiesView
                specialties={specialties}
                onSelect={openSpecialty}
                onSearchDoctors={() => {
                  openDoctorSearch();
                }}
                searchQuery={searchQuery}
                onSearchChange={(query) => {
                  setSearchQuery(query);
                }}
                onSearchEnter={() => {
                  if (searchQuery.trim()) {
                    setSelectedSpecialty("All");
                    setView("doctors");
                  }
                }}
              />
            )}

            {view === "doctors" && (
              <DoctorsView
                specialty={selectedSpecialty}
                doctors={filteredDoctors}
                loading={loadingDoctors}
                onDoctor={openDoctor}
                onStart={startConsultation}
                selectedDoctor={selectedDoctor}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            )}

            {view === "chat" && selectedDoctor && (
              <ChatView
                doctor={selectedDoctor}
                messages={messagesList}
                loadingMessages={loadingMessages}
                sending={sending}
                messageText={messageText}
                setMessageText={setMessageText}
                onSend={sendMessage}
                onBack={goBack}
              />
            )}
          </AnimatePresence>
        </section>
      </div>
    </main>
  );
}

function ConsultationsView({
  consultations,
  loading,
  onNewConsultation,
  onOpenConsultation,
  onOpenDoctorSelection,
  onDoctorSearch,
}: {
  consultations: Consultation[];
  loading: boolean;
  onNewConsultation: () => void;
  onOpenConsultation: (consultation: Consultation) => void;
  onOpenDoctorSelection: () => void;
  onDoctorSearch: () => void;
}) {
  return (
    <motion.div
      key="consultations"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mx-auto max-w-[1280px] px-5 py-8 lg:px-10 lg:py-12"
    >
      <div className="relative overflow-hidden rounded-[28px] border border-[#dfe7e2] bg-[#e4f0eb] p-7 lg:p-11">
        <div className="absolute -right-20 -top-28 h-[360px] w-[360px] rounded-full border border-white/70" />
        <div className="absolute right-10 top-12 h-[260px] w-[260px] rounded-full border border-white/60" />
        <div className="absolute right-24 top-24 h-[180px] w-[180px] rounded-full border border-white/60" />

        <div className="relative max-w-[650px]">
          <div className="mb-5 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80">
              <Sparkles size={14} className="text-[#668c7e]" />
            </span>

            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#668176]">
              TLUX · Consultation intelligence
            </span>
          </div>

          <h1 className="max-w-[720px] text-[42px] font-medium leading-[0.98] tracking-[-0.055em] text-[#1b2521] sm:text-[58px]">
            Your health,
            <br />
            in conversation.
          </h1>

          <p className="mt-5 max-w-[530px] text-sm leading-6 text-[#66736d] lg:text-[15px]">
            Connect with the right specialist, keep every consultation in one
            place, and use TLUX to understand your health context along the
            way.
          </p>

          <button
            onClick={onNewConsultation}
            className="mt-8 inline-flex items-center gap-3 rounded-xl bg-[#171918] px-5 py-3.5 text-sm font-medium text-white shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-[#282d2a]"
          >
            <Plus size={16} />
            Start a consultation
            <ArrowRight size={15} />
          </button>
        </div>
      </div>

      <div className="mt-12 flex items-end justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a938e]">
            Your consultations
          </p>

          <h2 className="mt-2 text-2xl font-medium tracking-[-0.035em]">
            Continue where you left off.
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onDoctorSearch}
            className="hidden items-center gap-2 text-xs font-semibold text-[#617b70] sm:flex"
          >
            <Search size={14} />
            Search doctors
          </button>

          <button
            onClick={onOpenDoctorSelection}
            className="hidden items-center gap-2 text-xs font-semibold text-[#617b70] sm:flex"
          >
            Find a specialist
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full rounded-[22px] border border-[#e0e6e2] bg-white p-8 text-center">
            <p className="text-sm text-[#929b97]">Loading your consultations...</p>
          </div>
        ) : consultations.length === 0 ? (
          <div className="col-span-full rounded-[22px] border border-[#e0e6e2] bg-white p-8 text-center">
            <MessageCircle size={28} className="mx-auto text-[#a0aba5]" />
            <h3 className="mt-4 text-lg font-medium text-[#171918]">
              No consultations yet
            </h3>
            <p className="mt-2 text-sm text-[#7a847f]">
              Start a new consultation to connect with your doctor
            </p>
            <button
              onClick={onNewConsultation}
              className="mx-auto mt-4 rounded-xl bg-[#171918] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#282d2a]"
            >
              Start a consultation
            </button>
          </div>
        ) : (
          consultations.map((consultation, index) => (
          <motion.button
            key={consultation.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            onClick={() => onOpenConsultation(consultation)}
            className="group text-left"
          >
            <div className="relative h-full overflow-hidden rounded-[22px] border border-[#e0e6e2] bg-white p-5 shadow-[0_8px_30px_rgba(20,30,25,0.035)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(20,30,25,0.07)]">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#edf4f1] text-[#648a7c]">
                  <Stethoscope size={19} />
                </div>

                <span
                  className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                    consultation.status === "active"
                      ? "bg-[#e4f1eb] text-[#648678]"
                      : consultation.status === "scheduled"
                        ? "bg-[#f3efe6] text-[#8c7752]"
                        : "bg-[#f0f2f1] text-[#7b837f]"
                  }`}
                >
                  {consultation.status}
                </span>
              </div>

              <div className="mt-7">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#909994]">
                  {consultation.doctor.specialty}
                </p>

                <h3 className="mt-1 text-[17px] font-semibold tracking-[-0.02em]">
                  {consultation.title}
                </h3>

                <p className="mt-3 min-h-[42px] text-xs leading-5 text-[#77817c]">
                  {consultation.preview}
                </p>
              </div>

              <div className="mt-7 flex items-center justify-between border-t border-[#edf0ee] pt-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e6ebe8] text-[9px] font-semibold text-[#53615a]">
                    {consultation.doctor.initials}
                  </div>

                  <div>
                    <p className="text-[11px] font-medium">
                      {consultation.doctor.name}
                    </p>
                    <p className="text-[9px] text-[#929a96]">
                      {consultation.time}
                    </p>
                  </div>
                </div>

                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f4f6f5] transition group-hover:bg-[#171918] group-hover:text-white">
                  <ArrowRight size={14} />
                </div>
              </div>
            </div>
</motion.button>
          ))
        )}
      </div>
    </motion.div>
  );
}

function SpecialtiesView({
  specialties,
  onSelect,
  onSearchDoctors,
  searchQuery,
  onSearchChange,
  onSearchEnter,
}: {
  specialties: Specialty[];
  onSelect: (specialty: string) => void;
  onSearchDoctors: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchEnter: () => void;
}) {
  return (
    <motion.div
      key="specialties"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mx-auto max-w-[1180px] px-5 py-10 lg:px-10 lg:py-14"
    >
      <div className="max-w-[700px]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7d8983]">
          New consultation
        </p>

        <h1 className="mt-3 text-[42px] font-medium leading-[0.98] tracking-[-0.055em] sm:text-[58px]">
          What would you
          <br />
          like to discuss?
        </h1>

        <p className="mt-5 max-w-[570px] text-sm leading-6 text-[#747e79]">
          Choose a specialty and TLUX will help you find an appropriate
          clinician within your consultation network.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            onClick={onSearchDoctors}
            className="flex items-center gap-2 text-xs font-semibold text-[#617b70] hover:text-[#4a6b60]"
          >
            <Search size={14} />
            Or search for a specific doctor
          </button>

          <span className="hidden text-xs text-[#a0aba5] sm:block">or</span>

          <div className="relative flex gap-2 sm:flex-1">
            <div className="relative flex-1">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#929b96]"
              />

              <input
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onSearchEnter();
                  }
                }}
                placeholder="Search all doctors by name, specialty, or description..."
                className="h-11 w-full rounded-xl border border-[#dfe6e2] bg-white pl-9 pr-4 text-xs outline-none transition focus:border-[#c9d4ce]"
              />
            </div>

            <button
              onClick={onSearchEnter}
              disabled={!searchQuery.trim()}
              className="h-11 whitespace-nowrap rounded-xl bg-[#171918] px-4 text-xs font-medium text-white transition hover:bg-[#282d2b] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {specialties.map((specialty, index) => {
          const Icon = specialty.icon;

          return (
            <motion.button
              key={specialty.name}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              onClick={() => onSelect(specialty.name)}
              className="group relative min-h-[190px] overflow-hidden rounded-[22px] border border-[#e0e6e2] bg-white p-5 text-left shadow-[0_8px_30px_rgba(20,30,25,0.025)] transition duration-300 hover:-translate-y-1 hover:border-[#cbdad3] hover:shadow-[0_18px_40px_rgba(20,30,25,0.07)]"
            >
              <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full border border-[#e9efec] transition duration-500 group-hover:scale-125" />

              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf2ef] text-[#648a7c]">
                <Icon size={18} />
              </div>

              <div className="relative mt-10">
                <h3 className="text-[15px] font-semibold">
                  {specialty.name}
                </h3>

                <p className="mt-1 text-[11px] leading-5 text-[#858e89]">
                  {specialty.description}
                </p>
              </div>

              <div className="absolute bottom-5 right-5 flex h-7 w-7 items-center justify-center rounded-full bg-[#f4f6f5] transition group-hover:bg-[#171918] group-hover:text-white">
                <ArrowRight size={13} />
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

function DoctorsView({
  specialty,
  doctors,
  loading,
  onStart,
  selectedDoctor,
  searchQuery,
  onSearchChange,
}: {
  specialty: string;
  doctors: Doctor[];
  loading: boolean;
  onDoctor: (doctor: Doctor) => void;
  onStart: (doctor: Doctor) => void;
  selectedDoctor: Doctor | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}) {
  return (
    <motion.div
      key="doctors"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mx-auto max-w-[1180px] px-5 py-10 lg:px-10 lg:py-14"
    >
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7d8983]">
            Specialist network
          </p>

          <h1 className="mt-3 text-[42px] font-medium tracking-[-0.055em] sm:text-[52px]">
            {specialty === "All" ? "Find your doctor." : specialty}
          </h1>

          <p className="mt-3 text-sm text-[#7a847f]">
            {doctors.length} specialists available in your consultation
            network.
          </p>
        </div>

        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#929b96]"
          />

          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, specialty, or description..."
            className="h-11 w-full rounded-xl border border-[#dfe6e2] bg-white pl-9 pr-4 text-xs outline-none md:w-[320px]"
          />
        </div>
      </div>

      <div className="mt-10 space-y-3">
        {loading ? (
          <div className="rounded-[22px] border border-[#e0e6e2] bg-white p-8 text-center">
            <p className="text-sm text-[#929b97]">Loading specialists...</p>
          </div>
        ) : doctors.length === 0 ? (
          <div className="rounded-[22px] border border-[#e0e6e2] bg-white p-8 text-center">
            <Search size={32} className="mx-auto text-[#a0aba5]" />
            <h3 className="mt-4 text-lg font-medium text-[#171918]">
              No doctors found
            </h3>
            <p className="mt-2 text-sm text-[#7a847f]">
              Try adjusting your search terms or browse all specialties
            </p>
            <button
              onClick={() => onSearchChange("")}
              className="mt-4 rounded-xl bg-[#171918] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#282d2a]"
            >
              Clear search
            </button>
          </div>
        ) : (
          doctors.map((doctor, index) => (
          <motion.div
            key={doctor.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.06 }}
            className={`rounded-[22px] border bg-white p-5 shadow-[0_8px_30px_rgba(20,30,25,0.025)] transition ${
              selectedDoctor?.id === doctor.id
                ? "border-[#bfd1c9]"
                : "border-[#e0e6e2]"
            }`}
          >
            <div className="flex flex-col gap-5 md:flex-row md:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] bg-[#e8f0ed] text-sm font-semibold text-[#597c70]">
                {doctor.initials}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[16px] font-semibold">
                    {doctor.name}
                  </h3>

                  <span className="rounded-full bg-[#e7f2ec] px-2 py-1 text-[9px] font-semibold text-[#638678]">
                    ● {doctor.availability}
                  </span>
                </div>

                <p className="mt-1 text-xs text-[#65716b]">
                  {doctor.specialty} · {doctor.experience}
                </p>

                <p className="mt-2 max-w-[620px] text-xs leading-5 text-[#89918d]">
                  {doctor.description}
                </p>

                <div className="mt-3 flex items-center gap-4 text-[10px] text-[#77817c]">
                  <span>★ {doctor.rating}</span>
                  <span>Verified specialist</span>
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => onStart(doctor)}
                  className="rounded-xl bg-[#171918] px-4 py-2.5 text-xs font-medium text-white transition hover:bg-[#292d2b]"
                >
                  Start consultation
                </button>
              </div>
            </div>
          </motion.div>
        ))
        )}
      </div>
    </motion.div>
  );
}

function ChatView({
  doctor,
  messages,
  loadingMessages,
  sending,
  messageText,
  setMessageText,
  onSend,
  onBack,
}: {
  doctor: Doctor;
  messages: Message[];
  loadingMessages: boolean;
  sending: boolean;
  messageText: string;
  setMessageText: (value: string) => void;
  onSend: () => void;
  onBack: () => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);
  const patientUser = getStoredUser();
  const patientName = patientUser?.full_name || "Patient";
  const patientInitials = initialsFor(patientName);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!hasScrolled.current) {
      scrollToBottom();
      hasScrolled.current = true;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <motion.div
      key="chat"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-[calc(100vh-74px)]"
    >
      <div className="flex h-full">
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[78px] items-center justify-between border-b border-[#e3e8e5] bg-[#f7f9f8] px-5 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e0e6e2] bg-white lg:hidden"
              >
                <ArrowLeft size={15} />
              </button>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e4efeb] text-xs font-semibold text-[#5f8276]">
                {doctor.initials}
              </div>

              <div>
                <p className="text-sm font-semibold">{doctor.name}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[10px] text-[#7d8782]">
                    {doctor.specialty}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-[#719888]" />
                  <span className="text-[10px] text-[#719888]">
                    Available now
                  </span>
                </div>
              </div>
            </div>

            <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e0e6e2] bg-white text-[#7a837f]">
              <MoreHorizontal size={17} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-7 lg:px-12">
            <div className="mx-auto max-w-[720px]">
              <div className="mb-9 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e5f0ec] text-[#668c7d]">
                  <Sparkles size={18} />
                </div>

                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#87918c]">
                  TLUX consultation
                </p>

                <h2 className="mt-2 text-xl font-medium tracking-[-0.025em]">
                  {doctor.specialty} consultation
                </h2>

                <p className="mx-auto mt-2 max-w-[430px] text-xs leading-5 text-[#89928e]">
                  Your conversation with {doctor.name} is saved securely to
                  your consultation history.
                </p>
              </div>

              <div className="space-y-7">
                {loadingMessages ? (
                  <div className="py-10 text-center">
                    <p className="text-xs text-[#929b97]">Loading conversation...</p>
                  </div>
                ) : (
                messages.map((message) => {
                  if (message.sender === "user") {
                    return (
                      <div key={message.id} className="flex justify-end">
                        <div className="max-w-[78%]">
                          <div className="rounded-[20px] rounded-br-md bg-[#171918] px-4 py-3 text-sm leading-6 text-white">
                            {message.text}
                          </div>
                          <p className="mt-1.5 text-right text-[9px] text-[#9ba29f]">
                            {message.time}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  if (message.sender === "tlux") {
                    return (
                      <div key={message.id} className="flex gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e3f0eb] text-[#638779]">
                          <Sparkles size={14} />
                        </div>

                        <div className="max-w-[82%]">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="text-[10px] font-semibold tracking-wide text-[#60766d]">
                              TLUX
                            </span>
                            <span className="text-[9px] text-[#a0a7a4]">
                              Clinical intelligence
                            </span>
                          </div>

                          <div className="rounded-[20px] rounded-tl-md border border-[#e0e7e3] bg-white px-4 py-3 text-sm leading-6 text-[#4c5651] shadow-[0_5px_20px_rgba(20,30,25,0.025)]">
                            {message.text}
                          </div>

                          <p className="mt-1.5 text-[9px] text-[#9ba29f]">
                            {message.time}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={message.id} className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef1ef] text-[9px] font-semibold text-[#68736d]">
                        {doctor.initials}
                      </div>

                      <div className="max-w-[82%]">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-[#4f5a54]">
                            {doctor.name}
                          </span>
                          <span className="text-[9px] text-[#a0a7a4]">
                            {doctor.specialty}
                          </span>
                        </div>

                        <div className="rounded-[20px] rounded-tl-md border border-[#e0e6e2] bg-white px-4 py-3 text-sm leading-6 text-[#4c5651]">
                          {message.text}
                        </div>

                        <p className="mt-1.5 text-[9px] text-[#9ba29f]">
                          {message.time}
                        </p>
                      </div>
                    </div>
                  );
                })
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>

          <div className="border-t border-[#e3e8e5] bg-[#f7f9f8] px-4 py-4 lg:px-10">
            <div className="mx-auto max-w-[720px]">
              <div className="flex items-end gap-2 rounded-[18px] border border-[#dce4e0] bg-white p-2 shadow-[0_8px_25px_rgba(20,30,25,0.04)]">
                <textarea
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      onSend();
                    }
                  }}
                  rows={1}
                  disabled={sending}
                  placeholder={sending ? "TLUX is responding..." : "Ask TLUX or your doctor..."}
                  className="min-h-[42px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-[#a0a8a4] disabled:opacity-60"
                />

                <button
                  onClick={onSend}
                  disabled={sending}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#171918] text-white transition hover:bg-[#2b302d] disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Send size={15} />
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between px-1">
                <p className="text-[9px] text-[#9aa29e]">
                  TLUX provides health information and decision support.
                </p>

                <span className="hidden text-[9px] text-[#9aa29e] sm:block">
                  Enter to send · Shift + Enter for new line
                </span>
              </div>
            </div>
          </div>
        </section>

        <aside className="hidden w-[290px] shrink-0 border-l border-[#e3e8e5] bg-[#f7f9f8] xl:block">
          <div className="border-b border-[#e3e8e5] px-5 py-5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#8b9490]">
              Health context
            </p>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e5f0ec] text-xs font-semibold text-[#5e8075]">
                {patientInitials}
              </div>

              <div>
                <p className="text-sm font-semibold">{patientName}</p>
                <p className="text-[10px] text-[#929a96]">
                  Patient profile
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-5">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#8a938f]">
                  Health signal
                </p>

                <span className="text-[9px] text-[#729183]">Stable</span>
              </div>

              <div className="relative flex items-center justify-center overflow-hidden rounded-[20px] border border-[#e0e7e3] bg-white py-7">
                <div className="absolute h-32 w-32 rounded-full border border-[#e4ece8]" />
                <div className="absolute h-24 w-24 rounded-full border border-[#e4ece8]" />

                <div className="relative text-center">
                  <p className="text-4xl font-medium tracking-[-0.06em]">
                    82
                  </p>
                  <p className="mt-1 text-[9px] uppercase tracking-[0.15em] text-[#89938e]">
                    Current signal
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#8a938f]">
                Current indicators
              </p>

              <div className="space-y-2">
                <ContextRow
                  icon={<HeartPulse size={14} />}
                  label="Heart rate"
                  value="72 bpm"
                />

                <ContextRow
                  icon={<Activity size={14} />}
                  label="Blood pressure"
                  value="118 / 76"
                />

                <ContextRow
                  icon={<Clock3 size={14} />}
                  label="Sleep average"
                  value="7.4 hrs"
                />
              </div>
            </div>

            <div>
              <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#8a938f]">
                Recent records
              </p>

              <div className="space-y-2">
                <RecordRow label="Cardiovascular assessment" />
                <RecordRow label="Blood pressure check" />
                <RecordRow label="Routine health review" />
              </div>
            </div>

            <div className="rounded-2xl border border-[#dfe8e3] bg-[#e8f1ed] p-4">
              <div className="flex gap-2">
                <ShieldCheck
                  size={14}
                  className="mt-0.5 shrink-0 text-[#64887b]"
                />

                <p className="text-[10px] leading-5 text-[#65746d]">
                  Your health context is used to help organize and explain
                  information. It does not replace professional medical
                  judgment.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </motion.div>
  );
}

function ContextRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#e2e8e5] bg-white px-3 py-3">
      <div className="flex items-center gap-2.5">
        <div className="text-[#719285]">{icon}</div>
        <span className="text-[10px] text-[#68736e]">{label}</span>
      </div>

      <span className="text-[10px] font-semibold text-[#3f4944]">
        {value}
      </span>
    </div>
  );
}

function RecordRow({ label }: { label: string }) {
  return (
    <button className="flex w-full items-center justify-between rounded-xl border border-[#e2e8e5] bg-white px-3 py-3 text-left transition hover:bg-[#fbfcfb]">
      <div className="flex items-center gap-2.5">
        <FileText size={14} className="text-[#81918a]" />

        <span className="truncate text-[10px] text-[#66716b]">
          {label}
        </span>
      </div>

      <ChevronRight size={13} className="shrink-0 text-[#9aa29e]" />
    </button>
  );
}
