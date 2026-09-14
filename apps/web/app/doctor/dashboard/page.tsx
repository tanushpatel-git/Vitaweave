"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, FileText, Save, ChevronDown, Upload, Trash2, Send } from "lucide-react";
import DoctorSidebar from "./components/DoctorSidebar";
import DoctorTopBar from "./components/DoctorTopBar";
import SmartCaseHistoryView from "./components/SmartCaseHistoryView";
import PatientClinicalSummaryPage from "./components/PatientClinicalSummary";
import MedicalDocumentsView from "./components/MedicalDocumentsView";
import { api, ApiError, type DocumentRow, type Conversation, type Message, type AiConfig } from "../../../lib/api";

const ACCEPTED = ".txt,.md,.csv,.json";

function uniqueLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("case-history");

  // ── AI Config state ─────────────────────────────────────────────────────
  const [config, setConfig] = useState({
    extraSystemInstructions: "",
    responseStyle: "default",
    language: "en",
    maxTokens: "512",
    temperature: "0.7",
    emergencyPolicy: "",
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    const loadConfig = async () => {
      try {
        const res = await api.getAiConfig();
        if (!mounted || !res.config) return;
        setConfig({
          extraSystemInstructions: res.config.system_prompt || "",
          responseStyle: res.config.response_style || "default",
          language: res.config.language || "en",
          maxTokens: String(res.config.max_tokens || 512),
          temperature: String(res.config.temperature ?? 0.7),
          emergencyPolicy: res.config.emergency_policy || "",
        });
      } catch {
        // Defaults used if config unavailable
      } finally {
        if (mounted) setConfigLoading(false);
      }
    };
    loadConfig();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    setConfigSaving(true);
    setSaveMessage("");
    try {
      const payload: Partial<AiConfig> = {
        system_prompt: config.extraSystemInstructions || undefined,
        response_style: config.responseStyle || undefined,
        language: config.language || undefined,
        max_tokens: parseInt(config.maxTokens, 10) || 512,
        temperature: parseFloat(config.temperature) || 0.7,
        emergency_policy: config.emergencyPolicy || undefined,
      };
      await api.updateAiConfig(payload);
      setSaveMessage("Configuration saved successfully!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save configuration.";
      setSaveMessage(message);
    } finally {
      setConfigSaving(false);
    }
  };

  // ── Conversations state ─────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);

  // ── Open conversation viewer ─────────────────────────────────────────────
  const [openConversation, setOpenConversation] = useState<Conversation | null>(null);
  const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadConversations = async () => {
      try {
        const res = await api.listConversations();
        if (mounted) setConversations(res.conversations);
      } catch {
        // Ignore conversation load errors
      } finally {
        if (mounted) setConversationsLoading(false);
      }
    };
    loadConversations();
    return () => {
      mounted = false;
    };
  }, []);

  const openConversationHandler = async (conversation: Conversation) => {
    setOpenConversation(conversation);
    setConversationMessages([]);
    setMessagesLoading(true);
    try {
      const res = await api.getConversation(conversation.id);
      setConversationMessages(res.messages);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Could not load conversation.";
      setConversationMessages([
        {
          id: uniqueLocalId(),
          conversation_id: conversation.id,
          sender: "system",
          content: message,
          safety_flags: {},
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setMessagesLoading(false);
    }
  };

  const closeConversationHandler = () => {
    setOpenConversation(null);
    setConversationMessages([]);
    setReplyText("");
  };

  const handleReply = async () => {
    const text = replyText.trim();
    if (!text || !openConversation) return;

    const doctorMessage: Message = {
      id: uniqueLocalId(),
      conversation_id: openConversation.id,
      sender: "doctor",
      content: text,
      safety_flags: {},
      created_at: new Date().toISOString(),
    };

    setConversationMessages((current) => [...current, doctorMessage]);
    setReplyText("");
    setReplySending(true);

    try {
      const res = await api.sendMessage(openConversation.id, text);
      setConversationMessages((current) => [...current, res.message]);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Message could not be sent.";
      setConversationMessages((current) => [
        ...current,
        {
          id: uniqueLocalId(),
          conversation_id: openConversation.id,
          sender: "system",
          content: message,
          safety_flags: {},
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setReplySending(false);
    }
  };

  // ── Knowledge Docs state ─────────────────────────────────────────────────
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docName, setDocName] = useState("");
  const [docVersion, setDocVersion] = useState("v1");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    const loadDocs = async () => {
      try {
        const res = await api.listDocuments();
        if (mounted) setDocs(res.documents);
      } catch {
        // Ignore document load errors
      } finally {
        if (mounted) setDocsLoading(false);
      }
    };
    loadDocs();
    return () => {
      mounted = false;
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadError("");
    if (file && !docName) {
      const base = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      setDocName(base.charAt(0).toUpperCase() + base.slice(1));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError("Please select a file.");
      return;
    }
    if (!docName.trim()) {
      setUploadError("Please enter a document name.");
      return;
    }
    if (!docVersion.trim()) {
      setUploadError("Please enter a version.");
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      const res = await api.uploadDocument(
        selectedFile,
        docName.trim(),
        "medical",
        docVersion.trim()
      );
      setDocs((current) => [res.document, ...current]);

      setSelectedFile(null);
      setDocName("");
      setDocVersion("v1");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload document.";
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteDocument(id);
      setDocs((current) => current.filter((d) => d.id !== id));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete document.";
      alert(message);
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f6f5] text-[#17201d]">
      {/* MOBILE OVERLAY */}
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* SIDEBAR */}
      <DoctorSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
        }}
      />

      {/* MAIN */}
      <div className="lg:pl-[260px]">
        {/* TOP BAR */}
        <DoctorTopBar onMenuClick={() => setSidebarOpen(true)} />

        {/* CONTENT */}
        <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
          {/* SMART DIGITAL PATIENT CASE HISTORY SECTION */}
          {activeTab === "case-history" && (
            <div className="w-full">
              <SmartCaseHistoryView />
            </div>
          )}

          {activeTab === "patient-summary" && <PatientClinicalSummaryPage />}

          {activeTab === "patient-documents" && <MedicalDocumentsView />}

          {/* AI CONFIG SECTION */}
          {activeTab === "ai-config" && (
            <div className="max-w-4xl">
              <div className="mb-6">
                <h2 className="text-3xl font-medium tracking-[-0.045em]">
                  AI Response Configuration
                </h2>
                <p className="mt-2 text-sm text-[#7b8581]">
                  Customize how TLUX responds in your clinical workspace
                </p>
              </div>

              <div className="space-y-6 rounded-[22px] border border-[#e0e6e2] bg-white p-7 shadow-[0_8px_30px_rgba(20,30,25,0.025)]">
                {/* Extra System Instructions */}
                <div>
                  <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                    Extra system instructions
                  </label>
                  <textarea
                    value={config.extraSystemInstructions}
                    onChange={(e) =>
                      setConfig({ ...config, extraSystemInstructions: e.target.value })
                    }
                    placeholder="Enter additional system instructions..."
                    className="w-full rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] p-4 text-sm outline-none transition placeholder:text-[#a4aca8] focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                    rows={4}
                  />
                </div>

                {/* Response Style */}
                <div>
                  <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                    Response style
                  </label>
                  <div className="relative">
                    <select
                      value={config.responseStyle}
                      onChange={(e) =>
                        setConfig({ ...config, responseStyle: e.target.value })
                      }
                      className="h-13 w-full appearance-none rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-4 text-sm text-[#35403c] outline-none transition focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                    >
                      <option value="default">Default</option>
                      <option value="simple">Simple and concise</option>
                      <option value="detailed">Detailed</option>
                      <option value="empathetic">Empathetic</option>
                    </select>
                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#9aa49f]"
                    />
                  </div>
                </div>

                {/* Language — Indian languages */}
                <div>
                  <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                    Language
                  </label>
                  <div className="relative">
                    <select
                      value={config.language}
                      onChange={(e) =>
                        setConfig({ ...config, language: e.target.value })
                      }
                      className="h-13 w-full appearance-none rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-4 text-sm text-[#35403c] outline-none transition focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                    >
                      <option value="en">English</option>
                      <option value="hi">Hindi</option>
                      <option value="ta">Tamil</option>
                      <option value="mr">Marathi</option>
                      <option value="te">Telugu</option>
                    </select>
                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#9aa49f]"
                    />
                  </div>
                </div>

                {/* Max Tokens */}
                <div>
                  <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                    Max tokens
                  </label>
                  <input
                    type="number"
                    value={config.maxTokens}
                    onChange={(e) =>
                      setConfig({ ...config, maxTokens: e.target.value })
                    }
                    className="h-13 w-full rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-4 text-sm outline-none transition placeholder:text-[#a4aca8] focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                    placeholder="512"
                  />
                </div>

                {/* Temperature */}
                <div>
                  <div className="mb-2.5 flex items-center justify-between">
                    <label className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                      Temperature
                    </label>
                    <span className="rounded-lg border border-[#dfe5e2] bg-[#f9faf9] px-2.5 py-1 font-mono text-xs font-medium text-[#35403c]">
                      {parseFloat(config.temperature || "0.7").toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.temperature}
                    onChange={(e) =>
                      setConfig({ ...config, temperature: e.target.value })
                    }
                    className="h-2 w-full cursor-pointer accent-[#17201d]"
                  />
                  <div className="mt-2 flex justify-between text-[10px] text-[#a4aca8]">
                    <span>0.0 (Precise / Deterministic)</span>
                    <span>1.0 (Creative / Exploratory)</span>
                  </div>
                </div>

                {/* Emergency Policy */}
                <div>
                  <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                    Emergency policy
                  </label>
                  <textarea
                    value={config.emergencyPolicy}
                    onChange={(e) =>
                      setConfig({ ...config, emergencyPolicy: e.target.value })
                    }
                    placeholder="Enter emergency policy instructions..."
                    className="w-full rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] p-4 text-sm outline-none transition placeholder:text-[#a4aca8] focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                    rows={4}
                  />
                </div>

                {/* Save Button */}
                {saveMessage && (
                  <p className="text-xs font-medium text-emerald-600">{saveMessage}</p>
                )}
                <button
                  onClick={handleSave}
                  disabled={configSaving || configLoading}
                  className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-[#17201d] px-6 text-sm font-medium text-white shadow-[0_12px_30px_rgba(23,32,29,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#26332e] hover:shadow-[0_18px_40px_rgba(23,32,29,0.2)] active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Save size={17} />
                  {configSaving ? "Saving..." : configLoading ? "Loading..." : "Save configuration"}
                </button>
              </div>
            </div>
          )}

          {/* CONVERSATIONS SECTION */}
          {activeTab === "conversations" && !openConversation && (
            <div className="max-w-4xl">
              <div className="mb-6">
                <h2 className="text-3xl font-medium tracking-[-0.045em]">
                  Conversations
                </h2>
                <p className="mt-2 text-sm text-[#7b8581]">
                  Your conversation history with clinical AI and consultations
                </p>
              </div>
              <div className="rounded-[22px] border border-[#e0e6e2] bg-white p-7 shadow-[0_8px_30px_rgba(20,30,25,0.025)]">
                {conversationsLoading ? (
                  <p className="text-sm text-[#929b97]">Loading conversations...</p>
                ) : conversations.length === 0 ? (
                  <p className="text-sm text-[#929b97]">
                    No active clinical conversations in archive. Start a new session using Ask TLUX.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {conversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        onClick={() => openConversationHandler(conversation)}
                        className="flex w-full items-start justify-between rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-5 py-4 text-left transition hover:border-[#b9c9c2] hover:bg-white"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#17201d]">
                            {conversation.title || conversation.patient_name || "Untitled conversation"}
                            <span className={`ml-2 rounded-full px-2 py-0.5 font-mono text-[9px] ${
                              conversation.status === "open"
                                ? "bg-[#e4f1eb] text-[#648678]"
                                : conversation.status === "escalated"
                                  ? "bg-red-50 text-red-500"
                                  : "bg-[#f0f2f1] text-[#7b837f]"
                            }`}>
                              {conversation.status}
                            </span>
                          </p>
                          {conversation.patient_name && (
                            <p className="mt-0.5 text-xs text-[#929b97]">{conversation.patient_name}</p>
                          )}
                          {conversation.updated_at && (
                            <p className="mt-1 text-[9px] text-[#b0b8b4]">
                              Updated {new Date(conversation.updated_at).toLocaleString("en-IN")}
                            </p>
                          )}
                        </div>
                        <span className="ml-4 shrink-0 rounded-xl border border-[#dfe5e2] bg-white px-3 py-2 text-[10px] font-medium text-[#69736f]">
                          Open
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONVERSATION DETAIL */}
          {activeTab === "conversations" && openConversation && (
            <div className="max-w-4xl">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={closeConversationHandler}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#dfe5e2] bg-white text-[#69736f] transition hover:bg-[#f9faf9]"
                    title="Back to conversations"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <div>
                    <h2 className="text-2xl font-medium tracking-[-0.045em]">
                      {openConversation.title || openConversation.patient_name || "Conversation"}
                    </h2>
                    <p className="mt-1 text-xs text-[#7b8581]">
                      {openConversation.patient_name
                        ? `With ${openConversation.patient_name}`
                        : "Patient consultation"}
                      <span className={`ml-2 rounded-full px-2 py-0.5 font-mono text-[9px] ${
                        openConversation.status === "open"
                          ? "bg-[#e4f1eb] text-[#648678]"
                          : openConversation.status === "escalated"
                            ? "bg-red-50 text-red-500"
                            : "bg-[#f0f2f1] text-[#7b837f]"
                      }`}>
                        {openConversation.status}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-[#e0e6e2] bg-white p-7 shadow-[0_8px_30px_rgba(20,30,25,0.025)]">
                <div className="max-h-[460px] space-y-5 overflow-y-auto pr-2">
                  {messagesLoading ? (
                    <p className="text-sm text-[#929b97]">Loading conversation...</p>
                  ) : conversationMessages.length === 0 ? (
                    <p className="py-10 text-center text-sm text-[#929b97]">
                      No messages yet. Send the patient a message to begin.
                    </p>
                  ) : (
                    conversationMessages.map((message) =>
                      message.sender === "doctor" ? (
                        <div key={message.id} className="flex justify-end">
                          <div className="max-w-[78%]">
                            <div className="rounded-[18px] rounded-br-md bg-[#17201d] px-4 py-3 text-sm leading-6 text-white">
                              {message.content}
                            </div>
                            <p className="mt-1.5 text-right text-[9px] text-[#9ba29f]">
                              {new Date(message.created_at).toLocaleString("en-IN")}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div key={message.id} className="flex justify-start">
                          <div className="max-w-[78%]">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-[#e0e6e2] bg-[#f9faf9] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[#69736f]">
                                {message.sender === "patient" ? "Patient" : message.sender === "ai" ? "TLUX AI" : "System"}
                              </span>
                            </div>
                            <div className="mt-1.5 rounded-[18px] rounded-tl-md border border-[#e0e6e2] bg-white px-4 py-3 text-sm leading-6 text-[#4c5651]">
                              {message.content}
                            </div>
                            <p className="mt-1 text-[9px] text-[#9ba29f]">
                              {new Date(message.created_at).toLocaleString("en-IN")}
                            </p>
                          </div>
                        </div>
                      )
                    )
                  )}
                </div>

                <div className="mt-6 flex items-end gap-2 border-t border-[#edf0ee] pt-4">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleReply();
                      }
                    }}
                    rows={1}
                    disabled={replySending}
                    placeholder={replySending ? "Sending..." : "Reply to the patient..."}
                    className="min-h-[42px] flex-1 resize-none rounded-xl border border-[#dfe5e2] bg-[#f9faf9] px-4 py-2.5 text-sm outline-none transition placeholder:text-[#a4aca8] focus:border-[#aab5b0] focus:bg-white disabled:opacity-60"
                  />
                  <button
                    onClick={handleReply}
                    disabled={replySending || !replyText.trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#17201d] text-white transition hover:bg-[#26332e] disabled:opacity-50 disabled:pointer-events-none"
                    title="Send reply"
                  >
                    <Send size={15} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* KNOWLEDGE DOCUMENTS SECTION */}
          {activeTab === "knowledge" && (
            <div className="max-w-4xl">
              <div className="mb-6">
                <h2 className="text-3xl font-medium tracking-[-0.045em]">
                  Knowledge Documents
                </h2>
                <p className="mt-2 text-sm text-[#7b8581]">
                  Manage your clinical guidelines and medical knowledge base
                </p>
              </div>

              {/* Upload Card */}
              <div className="rounded-[22px] border border-[#e0e6e2] bg-white p-7 shadow-[0_8px_30px_rgba(20,30,25,0.025)]">
                <p className="mb-5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                  Upload new document
                </p>

                <div className="space-y-4">
                  {/* File picker */}
                  <div>
                    <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                      File
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED}
                      onChange={handleFileChange}
                      className="w-full rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-4 py-3 text-sm text-[#35403c] outline-none transition file:mr-4 file:rounded-xl file:border-0 file:bg-[#17201d] file:px-3 file:py-1.5 file:text-[10px] file:font-medium file:text-white hover:file:bg-[#26332e] focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                    />
                    <p className="mt-1.5 text-[10px] text-[#a4aca8]">
                      Accepted: .txt, .md, .csv, .json
                    </p>
                  </div>

                  {/* Document name */}
                  <div>
                    <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                      Document name
                    </label>
                    <input
                      type="text"
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      placeholder="e.g. Clinical Guidelines"
                      className="h-13 w-full rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-4 text-sm outline-none transition placeholder:text-[#a4aca8] focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                    />
                  </div>

                  {/* Version */}
                  <div>
                    <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                      Version
                    </label>
                    <input
                      type="text"
                      value={docVersion}
                      onChange={(e) => setDocVersion(e.target.value)}
                      placeholder="e.g. v1"
                      className="h-13 w-full rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-4 text-sm outline-none transition placeholder:text-[#a4aca8] focus:border-[#aab5b0] focus:bg-white focus:ring-4 focus:ring-[#17201d]/[0.035]"
                    />
                  </div>

                  {/* Error */}
                  {uploadError && (
                    <p className="text-xs text-red-500">{uploadError}</p>
                  )}

                  {/* Upload button */}
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-[#17201d] px-6 text-sm font-medium text-white shadow-[0_12px_30px_rgba(23,32,29,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#26332e] hover:shadow-[0_18px_40px_rgba(23,32,29,0.2)] active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <Upload size={17} />
                    {uploading ? "Uploading..." : "Upload document"}
                  </button>
                </div>
              </div>

              {/* Uploaded documents list */}
              {docsLoading ? (
                <div className="mt-6 rounded-[22px] border border-[#e0e6e2] bg-white p-7 shadow-[0_8px_30px_rgba(20,30,25,0.025)]">
                  <p className="text-sm text-[#929b97]">Loading documents...</p>
                </div>
              ) : docs.length > 0 ? (
                <div className="mt-6 rounded-[22px] border border-[#e0e6e2] bg-white p-7 shadow-[0_8px_30px_rgba(20,30,25,0.025)]">
                  <p className="mb-5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#69736f]">
                    Uploaded documents ({docs.length})
                  </p>

                  <div className="space-y-3">
                    {docs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-2xl border border-[#dfe5e2] bg-[#f9faf9] px-5 py-4"
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#dfe5e2] bg-white">
                            <FileText size={15} className="text-[#69736f]" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#17201d]">
                              {doc.title}
                              {doc.version && (
                                <span className="ml-2 rounded-full bg-[#edf3f1] px-2 py-0.5 font-mono text-[9px] text-[#4c756c]">
                                  {doc.version}
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[10px] text-[#929b97]">
                              {doc.file_name}
                            </p>
                            <div className="mt-1 flex items-center gap-3">
                              <span className="rounded-full border border-[#e0e6e2] bg-white px-2 py-0.5 font-mono text-[9px] text-[#69736f]">
                                {doc.document_type || "TXT"}
                              </span>
                              <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] ${
                                doc.status === "active"
                                  ? "bg-[#e4f1eb] text-[#648678]"
                                  : doc.status === "error"
                                    ? "bg-red-50 text-red-500"
                                    : "bg-[#f3efe6] text-[#8c7752]"
                              }`}>
                                {doc.status}
                              </span>
                              <span className="text-[9px] text-[#b0b8b4]">
                                {new Date(doc.created_at).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#dfe5e2] bg-white text-[#b0b8b4] transition hover:border-red-200 hover:bg-red-50 hover:text-red-400"
                          title="Remove document"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
