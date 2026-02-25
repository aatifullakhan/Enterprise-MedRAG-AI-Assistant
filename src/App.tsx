/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Send, 
  Plus, 
  FileText, 
  Trash2, 
  AlertCircle, 
  Loader2, 
  Stethoscope, 
  ShieldCheck,
  BookOpen,
  MessageSquare,
  Moon,
  Sun,
  Menu,
  X,
  User,
  UserCog,
  Image as ImageIcon,
  Paperclip,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Document, Message } from './types';

const SYSTEM_INSTRUCTION = `You are an Enterprise Medical and Healthcare AI Knowledge Assistant powered by Retrieval-Augmented Generation (RAG).

Your primary role is to answer medical and healthcare questions using ONLY the retrieved knowledge base documents (context). The retrieved documents are the ONLY trusted source of truth.

CORE BEHAVIOR RULES:
1. Always use retrieved medical documents to answer questions.
2. Do NOT hallucinate, guess, or invent medical facts.
3. If the answer is not found in retrieved context, respond exactly: "Not found in medical knowledge base."
4. Prefer retrieved clinical content over general AI knowledge.
5. If multiple documents conflict, mention the conflict instead of choosing one.
6. If the question is unclear, ask a clarification question.
7. Use simple, beginner-friendly and patient-friendly language unless Doctor Mode is requested.
8. Provide structured answers using bullet points or numbered steps when helpful.
9. Maintain a professional, ethical, neutral, and supportive tone.

MODES OF OPERATION:
Doctor Mode:
- Use technical clinical terminology.
- Provide structured clinical summaries.
- Reference retrieved documents.

Patient Mode:
- Use simple, friendly explanations.
- Avoid complex medical jargon.
- Include medical disclaimer.

If mode is not specified, default to Patient Mode.

MEDICAL SAFETY & DISCLAIMER POLICY:
You are NOT a doctor and cannot diagnose or treat patients.
Whenever providing health-related information, include this disclaimer:
"This information is for educational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Please consult a qualified healthcare professional."

Do NOT:
- Diagnose diseases
- Provide personalized treatment plans
- Prescribe medications
- Give drug dosages unless explicitly present in retrieved documents

SPECIAL MEDICAL FUNCTIONS:
1. Clinical Document Intelligence: Extract diseases, symptoms, drugs, dosages, and guidelines from documents.
2. Symptom Checker: Map symptoms to possible conditions using retrieved guidelines. Do NOT diagnose. Provide risk level if available in documents.
3. Drug Information Assistant: Provide uses, side effects, interactions, and warnings from retrieved sources. Do not provide prescription decisions.
4. Hospital Knowledge Assistant: Answer hospital SOPs, policies, departments, equipment manuals, and staff protocols.
5. Medical Research Assistant: Summarize research papers and clinical trials. Highlight findings, conclusions, and limitations.
6. Multimodal Medical Assistant: Explain uploaded reports, images, or lab results using retrieved references. Do NOT diagnose.
7. Lab Report Explainer: Explain normal, high, or low values using retrieved medical references.
8. Real-Time Medical Updates: Prefer latest retrieved clinical guidelines and mention document date if available.
9. Voice Medical Assistant: Provide clear spoken-style responses.

SAFETY GUARDRAILS:
- Refuse harmful or illegal medical requests.
- Detect emergency phrases (self-harm, severe symptoms) and recommend immediate professional help.
- Never replace a healthcare professional.
- Never fabricate clinical guidelines or research data.

RESPONSE FORMAT:
1. Start with a direct answer from retrieved context.
2. Explain briefly in simple language.
3. Use bullet points or steps if useful.
4. Reference documents if available (e.g., "According to Clinical Document 3...").
5. Add medical disclaimer in Patient Mode.

STRICT GROUNDING POLICY:
- Never generate unsupported medical claims.
- Never fabricate sources.
- Never assume missing data.
If no relevant data is retrieved:
→ Respond exactly: "Not found in medical knowledge base."`;

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'docs'>('chat');
  const [newDoc, setNewDoc] = useState({ title: '', content: '' });
  const [mode, setMode] = useState<'patient' | 'doctor'>('patient');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      setDocuments(data);
    } catch (err) {
      console.error('Failed to fetch documents', err);
    }
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!newDoc.title || !newDoc.content) return;

    setIsUploading(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDoc),
      });
      if (res.ok) {
        setNewDoc({ title: '', content: '' });
        fetchDocuments();
        setActiveTab('chat');
        setIsMenuOpen(false);
      }
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDoc = async (id: number) => {
    try {
      await fetch('/api/documents/' + id, { method: 'DELETE' });
      fetchDocuments();
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isTyping) return;

    const userMsg = input.trim();
    const userImg = selectedImage;
    setInput('');
    setSelectedImage(null);
    setMessages(prev => [...prev, { role: 'user', content: userMsg, image: userImg || undefined }]);
    setIsTyping(true);

    try {
      // 1. Retrieve relevant context
      const searchRes = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg || "Analyze medical image" }),
      });
      const contextDocs = await searchRes.json();
      
      const contextText = contextDocs.length > 0 
        ? contextDocs.map((d: Document, i: number) => `[Clinical Document ${i + 1}: ${d.title}]\n${d.content}`).join('\n\n')
        : "NO RELEVANT DOCUMENTS FOUND.";

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const modelName = userImg ? "gemini-2.5-flash-image" : "gemini-3-flash-preview";
      
      const promptParts: any[] = [
        { text: `CURRENT MODE: ${mode.toUpperCase()}\n\nCONTEXT FROM MEDICAL KNOWLEDGE BASE:\n${contextText}\n\nUSER QUESTION: ${userMsg || "Please analyze the attached medical image/report based on the knowledge base."}` }
      ];

      if (userImg) {
        const base64Data = userImg.split(',')[1];
        const mimeType = userImg.split(';')[0].split(':')[1];
        promptParts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        });
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts: promptParts },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.1,
        },
      });

      let aiResponse = response.text || "I encountered an error processing your request.";
      
      const disclaimer = "This information is for educational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Please consult a qualified healthcare professional.";
      
      // Strict grounding check
      if (aiResponse.toLowerCase().includes("not found in medical knowledge base")) {
        aiResponse = "Not found in medical knowledge base.";
      }

      // Add disclaimer in Patient Mode if missing
      if (mode === 'patient' && aiResponse !== "Not found in medical knowledge base." && !aiResponse.includes(disclaimer)) {
        aiResponse = aiResponse.trim() + "\n\n" + disclaimer;
      }

      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (err) {
      console.error('AI Error:', err);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "I'm sorry, I encountered a technical error. Please try again.",
        isError: true 
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col transition-colors duration-300 overflow-x-hidden">
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <div className="bg-emerald-600 p-1.5 md:p-2 rounded-xl shadow-lg shadow-emerald-600/20">
            <Activity className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm md:text-lg tracking-tight flex items-center gap-1.5 truncate">
              Enterprise MedRAG
              <span className="hidden xs:inline-block px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[9px] rounded-full font-bold uppercase tracking-widest">v2.0</span>
            </h1>
            <p className="hidden md:block text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider truncate">Clinical Intelligence Platform</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 md:gap-4">
          {/* Mode Toggle - Desktop */}
          <div className="hidden lg:flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button 
              onClick={() => setMode('patient')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'patient' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              <User className="w-3.5 h-3.5" />
              Patient
            </button>
            <button 
              onClick={() => setMode('doctor')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'doctor' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              <UserCog className="w-3.5 h-3.5" />
              Doctor
            </button>
          </div>

          <div className="flex items-center gap-1 md:gap-2">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? <Sun className="w-4 h-4 md:w-5 md:h-5" /> : <Moon className="w-4 h-4 md:w-5 md:h-5" />}
            </button>

            <nav className="hidden sm:flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button 
                onClick={() => setActiveTab('chat')}
                className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all ${activeTab === 'chat' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                Assistant
              </button>
              <button 
                onClick={() => setActiveTab('docs')}
                className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all ${activeTab === 'docs' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                Knowledge
              </button>
            </nav>

            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="sm:hidden p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 sm:hidden"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-[280px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 z-50 sm:hidden shadow-2xl"
            >
              <div className="p-6 flex flex-col h-full">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="font-bold text-slate-900 dark:text-white uppercase tracking-widest text-xs">Navigation</h2>
                  <button onClick={() => setIsMenuOpen(false)} className="p-2 -mr-2"><X className="w-5 h-5" /></button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">View</p>
                    <button 
                      onClick={() => { setActiveTab('chat'); setIsMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'chat' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <MessageSquare className="w-5 h-5" />
                      Assistant
                    </button>
                    <button 
                      onClick={() => { setActiveTab('docs'); setIsMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'docs' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <BookOpen className="w-5 h-5" />
                      Knowledge Base
                    </button>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Clinical Mode</p>
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                      <button 
                        onClick={() => setMode('patient')}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'patient' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}
                      >
                        <User className="w-3.5 h-3.5" />
                        Patient
                      </button>
                      <button 
                        onClick={() => setMode('doctor')}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'doctor' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}
                      >
                        <UserCog className="w-3.5 h-3.5" />
                        Doctor
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3 text-slate-400">
                    <ShieldCheck className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Enterprise Secure</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 md:p-6 flex flex-col gap-4 md:gap-6 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {activeTab === 'chat' ? (
            <motion.div 
              key="chat"
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden relative"
            >
              {/* Chat Messages */}
              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 scroll-smooth"
              >
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-60 py-12 px-4">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 md:p-8 rounded-full">
                      <Stethoscope className="w-12 h-12 md:w-20 md:h-20 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="max-w-md">
                      <h3 className="font-bold text-slate-900 dark:text-white text-xl md:text-2xl tracking-tight">Enterprise Clinical Assistant</h3>
                      <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
                        Secure, grounded medical intelligence. Currently operating in <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">{mode} Mode</span>.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl mt-8">
                      {[
                        'Analyze recent lab results',
                        'Summarize clinical trial findings',
                        'Check symptoms against guidelines',
                        'Explain drug-drug interactions'
                      ].map(q => (
                        <button 
                          key={q}
                          onClick={() => { setInput(q); }}
                          className="text-xs md:text-sm text-left px-5 py-4 border border-slate-200 dark:border-slate-800 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-slate-600 dark:text-slate-400 font-medium hover:border-emerald-200 dark:hover:border-emerald-800 hover:shadow-md active:scale-[0.98]"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div 
                    key={i} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                  >
                    <div className={`max-w-[92%] sm:max-w-[85%] lg:max-w-[75%] rounded-2xl md:rounded-3xl px-5 py-4 text-sm md:text-base leading-relaxed shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-emerald-600 text-white rounded-tr-none shadow-lg shadow-emerald-600/10' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none border border-slate-200 dark:border-slate-700'
                    }`}>
                      {msg.image && (
                        <div className="mb-4 rounded-xl overflow-hidden border border-white/20 shadow-md">
                          <img src={msg.image} alt="Uploaded medical data" className="max-w-full h-auto object-contain max-h-[300px] w-full" />
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                      {msg.role === 'assistant' && !msg.isError && (
                        <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-700/50 flex flex-wrap items-center justify-between gap-3 text-[10px] uppercase font-bold tracking-widest text-slate-400 dark:text-slate-500">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Clinical Grounding Verified
                          </div>
                          <div className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 rounded-full text-[9px]">
                            {mode} mode
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-none px-5 py-4">
                      <div className="flex gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div className="p-4 md:p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                {selectedImage && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 flex items-center gap-3 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-emerald-200 dark:border-emerald-800 w-fit"
                  >
                    <div className="relative group">
                      <img src={selectedImage} alt="Preview" className="w-16 h-16 object-cover rounded-xl shadow-sm" />
                      <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                    </div>
                    <div className="pr-2">
                      <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Image Attached</p>
                      <button 
                        onClick={() => setSelectedImage(null)}
                        className="mt-1 text-xs font-medium text-rose-500 hover:text-rose-600 flex items-center gap-1 transition-colors"
                      >
                        <X className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  </motion.div>
                )}
                <div className="relative max-w-5xl mx-auto flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1 group">
                    <input 
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder={mode === 'doctor' ? "Enter clinical query or analyze report..." : "Ask a medical question..."}
                      className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl pl-4 pr-12 py-4 md:py-5 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 dark:focus:border-emerald-400 transition-all shadow-inner dark:text-white"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleImageSelect}
                        accept="image/*"
                        className="hidden"
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors rounded-xl hover:bg-white dark:hover:bg-slate-700 shadow-sm"
                        title="Upload medical report/image"
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={handleSend}
                    disabled={(!input.trim() && !selectedImage) || isTyping}
                    className="w-full sm:w-auto px-8 py-4 md:py-5 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 font-bold text-sm md:text-base active:scale-[0.98]"
                  >
                    <Send className="w-5 h-5" />
                    <span className="sm:hidden">Send Query</span>
                  </button>
                </div>
                <div className="hidden sm:flex items-center justify-center gap-6 mt-4">
                  <div className="flex items-center gap-2 opacity-40">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <p className="text-[9px] uppercase tracking-widest font-bold">HIPAA Compliant</p>
                  </div>
                  <div className="flex items-center gap-2 opacity-40">
                    <Activity className="w-3.5 h-3.5" />
                    <p className="text-[9px] uppercase tracking-widest font-bold">Real-time Analysis</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="docs"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden"
            >
              {/* Upload Section */}
              <div className="w-full lg:w-[380px] shrink-0 space-y-6 overflow-y-auto lg:overflow-visible pb-4 lg:pb-0">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-xl">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="bg-emerald-600 p-2.5 rounded-2xl shadow-lg shadow-emerald-600/20">
                      <Plus className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="font-bold text-lg md:text-xl">Ingest Knowledge</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Add clinical documents to RAG</p>
                    </div>
                  </div>
                  <form onSubmit={handleUpload} className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2.5">Document Title</label>
                      <input 
                        type="text"
                        value={newDoc.title}
                        onChange={(e) => setNewDoc(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="e.g., Clinical Trial Summary v1.2"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 dark:focus:border-emerald-400 dark:text-white transition-all shadow-inner"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2.5">Clinical Content</label>
                      <textarea 
                        value={newDoc.content}
                        onChange={(e) => setNewDoc(prev => ({ ...prev, content: e.target.value }))}
                        placeholder="Paste clinical guidelines, research data, or hospital SOPs..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-4 text-sm h-48 md:h-64 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 dark:focus:border-emerald-400 dark:text-white transition-all resize-none shadow-inner"
                        required
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={isUploading}
                      className="w-full bg-emerald-600 text-white rounded-2xl py-4.5 text-sm font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-600/20 active:scale-[0.98] disabled:opacity-50"
                    >
                      {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                      Securely Ingest Data
                    </button>
                  </form>
                </div>

                <div className="bg-slate-900 dark:bg-emerald-950/40 rounded-3xl p-6 text-white shadow-xl border border-white/5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-emerald-500/20 p-2 rounded-xl">
                      <ShieldCheck className="w-6 h-6 text-emerald-400" />
                    </div>
                    <h3 className="font-bold text-xs uppercase tracking-[0.2em]">Enterprise Security</h3>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-emerald-100/60 leading-relaxed font-medium">
                    All ingested data is indexed for RAG retrieval. The assistant strictly adheres to this knowledge base for clinical decision support.
                  </p>
                </div>
              </div>

              {/* Documents List */}
              <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                  <h2 className="font-bold text-xl md:text-2xl flex items-center gap-4">
                    <BookOpen className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                    Clinical Repository
                    <span className="text-[10px] font-bold text-slate-400 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full uppercase tracking-widest">{documents.length} Files</span>
                  </h2>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-2 space-y-4 pb-8 custom-scrollbar">
                  {documents.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 p-12 md:p-24 text-center">
                      <FileText className="w-16 h-16 md:w-24 md:h-24 text-slate-100 dark:text-slate-800 mx-auto mb-6" />
                      <p className="text-slate-500 dark:text-slate-400 text-base font-medium">Repository is empty. Ingest clinical documents to begin.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {documents.map(doc => (
                        <motion.div 
                          layout
                          key={doc.id} 
                          className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl border border-slate-200 dark:border-slate-800 p-5 md:p-6 hover:border-emerald-500 dark:hover:border-emerald-500 transition-all group shadow-sm hover:shadow-xl hover:-translate-y-1"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex gap-4 min-w-0">
                              <div className="bg-slate-100 dark:bg-slate-800 p-3.5 rounded-2xl group-hover:bg-emerald-50 dark:group-hover:bg-emerald-900/20 transition-colors shrink-0">
                                <FileText className="w-6 h-6 text-slate-400 dark:text-slate-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate text-base">{doc.title}</h3>
                                <div className="flex flex-wrap items-center gap-3 mt-2.5">
                                  <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold">
                                    {new Date(doc.created_at).toLocaleDateString()}
                                  </span>
                                  <span className="w-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full"></span>
                                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 uppercase tracking-widest font-bold flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" />
                                    Verified Source
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button 
                              onClick={() => handleDeleteDoc(doc.id)}
                              className="p-2.5 text-slate-300 dark:text-slate-700 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all shrink-0"
                              title="Remove from repository"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Global Disclaimer Footer */}
      <footer className="bg-slate-900 dark:bg-black text-slate-400 dark:text-slate-500 py-4 px-6 text-center text-[8px] md:text-[10px] uppercase tracking-[0.4em] font-bold border-t border-slate-800 dark:border-slate-900 shrink-0">
        Enterprise Clinical Intelligence Platform • HIPAA Compliant Architecture • Not a substitute for professional medical advice
      </footer>
    </div>
  );
}
