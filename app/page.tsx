'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

type VoiceLanguageMode = 'auto' | 'en' | 'hi' | 'bho';
type AppPanel = 'chat' | 'file' | 'code';
type SpeechRecognitionConstructor = new () => SpeechRecognition;
interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
interface AtsApiResponse extends AtsResult {
  error?: string;
}
type LiveStatus = 'checking' | 'online' | 'offline';
interface AtsResult {
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
  details: {
    keywordCoverage: number;
    formatScore: number;
    lengthScore: number;
  };
}
const CHAT_STORAGE_KEY = 'ai_powered_chat_history_v1';
const THEME_STORAGE_KEY = 'chatbot_black_mode';
const CODE_TEMPLATES: Record<string, string> = {
  c: `/******************************************************************************

Welcome to GDB Online.
  GDB online is an online compiler and debugger tool for C, C++, Python, PHP, Ruby,
  C#, OCaml, VB, Perl, Swift, Prolog, Javascript, Pascal, COBOL, HTML, CSS, JS
  Code, Compile, Run and Debug online from anywhere in world.

*******************************************************************************/
#include <stdio.h>

int main()
{
    printf("Hello World");

    return 0;
}
`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello World" << endl;
    return 0;
}
`,
  java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello World");
    }
}
`,
  python: `def main():
    print("Hello World")

if __name__ == "__main__":
    main()
`,
  javascript: `function main() {
  console.log("Hello World");
}

main();
`,
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recognitionActive, setRecognitionActive] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechSynthesisSupported, setSpeechSynthesisSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguageMode>('auto');
  const [blackMode, setBlackMode] = useState(false);
  const [showAtsChecker, setShowAtsChecker] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsError, setAtsError] = useState('');
  const [atsResult, setAtsResult] = useState<AtsResult | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('checking');
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<AppPanel>('chat');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileQuestion, setFileQuestion] = useState('');
  const [fileAnswer, setFileAnswer] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState('c');
  const [codeInput, setCodeInput] = useState(CODE_TEMPLATES.c);
  const [errorFixSuggestion, setErrorFixSuggestion] = useState('');
  const [fixLoading, setFixLoading] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [stdinInput, setStdinInput] = useState('');
  const [runOutput, setRunOutput] = useState('');
  const [runLoading, setRunLoading] = useState(false);
  const [runStatus, setRunStatus] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const elevenAudioRef = useRef<HTMLAudioElement | null>(null);
  const loadingRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const quickPrompts = [
    'Plan my day in 5 steps',
    'Explain this like I am 12',
    'Summarize a long text clearly',
    'Give me healthy dinner ideas',
    'भोजपुरी में एक छोटा जवाब दीं',
  ];

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<{
        id: number;
        text: string;
        sender: 'user' | 'bot';
        timestamp: string;
      }>;
      if (!Array.isArray(parsed)) return;
      const restored: Message[] = parsed.map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
      setMessages(restored);
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  }, []);

  useEffect(() => {
    setBlackMode(localStorage.getItem(THEME_STORAGE_KEY) === 'true');
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, String(blackMode));
  }, [blackMode]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch (error) {
      console.error('Failed to save chat history:', error);
    }
  }, [messages]);

  const checkLiveStatus = async () => {
    if (!navigator.onLine) {
      setLiveStatus('offline');
      return;
    }

    setLiveStatus('checking');
    try {
      const response = await fetch('/api/chat', {
        method: 'GET',
        cache: 'no-store',
      });
      setLiveStatus(response.ok ? 'online' : 'offline');
    } catch {
      setLiveStatus('offline');
    }
  };

  useEffect(() => {
    void checkLiveStatus();
    const timer = window.setInterval(() => {
      void checkLiveStatus();
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    const synth = window.speechSynthesis;
    setSpeechSynthesisSupported(!!synth);

    if (!synth) return;

    const loadVoices = () => {
      const voices = synth.getVoices?.() || [];
      setAvailableVoices(voices);
    };

    loadVoices();
    synth.onvoiceschanged = loadVoices;

    return () => {
      synth.onvoiceschanged = null;
    };
  }, []);

  const detectLanguageFromText = (text: string): 'en' | 'hi' | 'bho' => {
    if (/[\u0900-\u097F]/.test(text)) {
      // Light Bhojpuri cues (Devanagari; overlaps with Hindi — use Voice: Bhojpuri for sure match).
      const bhoHints =
        /(हमर|हम|बा\b|हई|काहे|का ह|करे के|लइका|लइकी|बिटिया|गाँव|गाम|बिहार|पूरब|पूर्वांचल)/;
      if (bhoHints.test(text)) return 'bho';
      return 'hi';
    }
    return 'en';
  };

  const pickBestVoice = (language: 'en' | 'hi' | 'bho') => {
    if (language === 'bho') {
      const femaleHints = /(female|woman|lekha|swara|veena|aditi)/i;
      return (
        availableVoices.find(
          (v) => (/^bho/i.test(v.lang) || /bhojpuri|bho\b/i.test(v.name)) && femaleHints.test(v.name)
        ) ||
        availableVoices.find((v) => /^bho/i.test(v.lang) || /bhojpuri|bho\b/i.test(v.name)) ||
        availableVoices.find((v) => /^hi(-|_)?/i.test(v.lang) && femaleHints.test(v.name)) ||
        availableVoices.find((v) => /^hi(-|_)?/i.test(v.lang))
      );
    }

    const isEnglish = language === 'en';
    const langRegex = isEnglish ? /^en(-|_)?/i : /^hi(-|_)?/i;
    const femaleHints = /(female|woman|zira|samantha|google uk english female|veena|lekha|swara)/i;
    const premiumHints = isEnglish
      ? /(google us english|google uk english female|samantha|zira|aria|jenny)/i
      : /(google हिन्दी|google hindi|hindi|hemant|lekha|swara|aditi|female)/i;

    return (
      availableVoices.find((v) => langRegex.test(v.lang) && premiumHints.test(v.name)) ||
      availableVoices.find((v) => langRegex.test(v.lang) && femaleHints.test(v.name)) ||
      availableVoices.find((v) => langRegex.test(v.lang)) ||
      availableVoices.find((v) => (isEnglish ? /^en/i.test(v.lang) : /^hi/i.test(v.lang)))
    );
  };

  const speakWithBrowserTts = (text: string, onComplete?: () => void) => {
    if (!speechSynthesisSupported) {
      onComplete?.();
      return;
    }

    const synth = window.speechSynthesis;
    if (!synth) {
      onComplete?.();
      return;
    }

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const activeLanguage = voiceLanguage === 'auto' ? detectLanguageFromText(text) : voiceLanguage;
    const preferredVoice = pickBestVoice(activeLanguage);

    utterance.lang =
      activeLanguage === 'en' ? 'en-US' : activeLanguage === 'hi' ? 'hi-IN' : 'bho-IN';
    utterance.rate = activeLanguage === 'en' ? 0.96 : 0.92;
    utterance.pitch = 1.05;

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => onComplete?.();
    utterance.onerror = () => onComplete?.();

    synth.speak(utterance);
  };

  /** ElevenLabs neural voice when API key is set; otherwise browser speech (lower quality). */
  const speakText = async (text: string, onComplete?: () => void) => {
    const finish = () => onComplete?.();

    if (!voiceEnabled) {
      finish();
      return;
    }

    if (elevenAudioRef.current) {
      elevenAudioRef.current.pause();
      elevenAudioRef.current.src = '';
      elevenAudioRef.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }

    const trimmed = text.trim().slice(0, 4500);
    if (!trimmed) {
      finish();
      return;
    }

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });

      const ct = res.headers.get('content-type') || '';
      if (res.ok && (ct.includes('audio') || ct.includes('octet-stream'))) {
        const blob = await res.blob();
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const audio = new Audio();
          elevenAudioRef.current = audio;
          audio.src = url;
          audio.onended = () => {
            URL.revokeObjectURL(url);
            if (elevenAudioRef.current === audio) elevenAudioRef.current = null;
            finish();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            if (elevenAudioRef.current === audio) elevenAudioRef.current = null;
            speakWithBrowserTts(trimmed, finish);
          };
          await audio.play();
          return;
        }
      }
    } catch {
      /* fall back */
    }

    speakWithBrowserTts(trimmed, finish);
  };

  const stopCurrentSpeech = () => {
    if (elevenAudioRef.current) {
      elevenAudioRef.current.pause();
      elevenAudioRef.current.currentTime = 0;
      elevenAudioRef.current.src = '';
      elevenAudioRef.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  };

  const requestBotReply = async (conversation: Message[]) => {
    loadingRef.current = true;
    setLoading(true);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* */
      }
    }
    setRecognitionActive(false);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: conversation,
          preferredLanguage: voiceLanguage === 'auto' ? undefined : voiceLanguage,
        }),
      });

      const data = await response.json();

      const botMessage: Message = {
        id: Date.now() + 1,
        text: !response.ok
          ? typeof data.error === 'string'
            ? data.error
            : `Request failed (${response.status}).`
          : data.reply || 'Sorry, I could not generate a response.',
        sender: 'bot',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);
      void speakText(botMessage.text);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        text: 'Error: Could not connect to the chatbot.',
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  const dispatchChat = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loadingRef.current) return;

    const userMessage: Message = {
      id: Date.now(),
      text: trimmed,
      sender: 'user',
      timestamp: new Date(),
    };

    const conversation = [...messagesRef.current, userMessage];
    setMessages(conversation);
    setInput('');
    await requestBotReply(conversation);
  };

  useEffect(() => {
    const speechWindow = window as SpeechRecognitionWindow;
    const SpeechRecognitionClass =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);

    const langByMode: Record<VoiceLanguageMode, string> = {
      auto: 'en-US',
      en: 'en-US',
      hi: 'hi-IN',
      bho: 'bho-IN',
    };

    const recognition = new SpeechRecognitionClass();
    recognition.lang = langByMode[voiceLanguage];
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join('');
      setInput(transcript);
    };
    recognition.onspeechend = null;

    recognition.onend = () => {
      setRecognitionActive(false);
    };

    recognition.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === 'aborted') return;
      setRecognitionActive(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onspeechend = null;
      recognition.onend = null;
      recognition.onerror = null;
      try {
        recognition.stop();
      } catch {
        /* */
      }
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setRecognitionActive(false);
    };
  }, [voiceLanguage]);

  const toggleMic = () => {
    if (!speechSupported || !recognitionRef.current) return;

    if (recognitionActive) {
      recognitionRef.current.stop();
      return;
    }

    try {
      recognitionRef.current.start();
      setRecognitionActive(true);
    } catch (error) {
      console.error('Speech recognition error:', error);
      setRecognitionActive(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    await dispatchChat(input);
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const regenerateLastReply = async () => {
    if (loadingRef.current) return;
    const history = messagesRef.current;
    const lastUserIndex = [...history].reverse().findIndex((msg) => msg.sender === 'user');
    if (lastUserIndex === -1) return;
    const keepUntil = history.length - 1 - lastUserIndex;
    const conversation = history.slice(0, keepUntil + 1);
    setMessages(conversation);
    await requestBotReply(conversation);
  };

  const copyMessage = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedMessageId(message.id);
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? null : current));
      }, 1400);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const clearConversation = () => {
    const confirmed = window.confirm('Clear all chat messages?');
    if (!confirmed) return;
    setMessages([]);
    localStorage.removeItem(CHAT_STORAGE_KEY);
  };

  const exportConversation = () => {
    if (!messages.length) return;
    const content = messages
      .map((msg) => {
        const time = msg.timestamp.toLocaleString();
        const who = msg.sender === 'user' ? 'You' : 'Bot';
        return `[${time}] ${who}: ${msg.text}`;
      })
      .join('\n\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `chat-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const runAtsCheck = async () => {
    if (!resumeFile) {
      setAtsError('Please upload your resume first.');
      return;
    }

    setAtsLoading(true);
    setAtsError('');
    try {
      const formData = new FormData();
      formData.append('resumeFile', resumeFile);
      const response = await fetch('/api/ats', {
        method: 'POST',
        body: formData,
      });

      const data: AtsApiResponse = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to run ATS check');
      }
      setAtsResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run ATS check';
      setAtsError(message);
      setAtsResult(null);
    } finally {
      setAtsLoading(false);
    }
  };

  const askFileQuestion = async () => {
    if (!selectedFile) {
      setFileError('Please upload a file first.');
      return;
    }
    if (!fileQuestion.trim()) {
      setFileError('Please enter a question about the file.');
      return;
    }

    setFileLoading(true);
    setFileError('');
    setFileAnswer('');
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('question', fileQuestion);

      const response = await fetch('/api/fileqa', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to process file question');
      }
      setFileAnswer(data.answer || 'No answer generated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process file question';
      setFileError(message);
    } finally {
      setFileLoading(false);
    }
  };

  const applySelectedFile = (file: File | null) => {
    setSelectedFile(file);
    setFileError('');
    setFileAnswer('');
  };

  const fixRuntimeError = async () => {
    if (!codeInput.trim()) {
      setCodeError('Add code before requesting fix suggestions.');
      return;
    }
    if (!runOutput.trim() && !codeError.trim()) {
      setCodeError('Run your code first so I can analyze the error.');
      return;
    }

    setFixLoading(true);
    setCodeError('');
    setErrorFixSuggestion('');
    try {
      const response = await fetch('/api/code-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'fix',
          language: codeLanguage,
          code: codeInput,
          prompt: `Fix this runtime/compile issue. Error output:\n${runOutput || codeError}`,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get coding help');
      }
      setErrorFixSuggestion(data.answer || 'No suggestion generated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get coding help';
      setCodeError(message);
    } finally {
      setFixLoading(false);
    }
  };

  const runCode = async () => {
    const languageToId: Record<string, number> = {
      c: 50,
      javascript: 63,
      python: 71,
      java: 62,
      cpp: 54,
    };
    if (!codeInput.trim()) {
      setCodeError('Add code before running.');
      return;
    }
    setRunLoading(true);
    setCodeError('');
    setRunOutput('');
    setRunStatus('Running...');
    setErrorFixSuggestion('');
    try {
      const response = await fetch('/api/code-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCode: codeInput,
          languageId: languageToId[codeLanguage] || 63,
          stdin: stdinInput,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to run code');
      }
      const output = [data.stdout, data.stderr, data.compileOutput]
        .filter((part: string) => Boolean(part?.trim()))
        .join('\n');
      setRunStatus(data.status || 'Finished');
      setRunOutput(output || `Finished (${data.status || 'done'}) with no output.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run code';
      setCodeError(message);
      setRunStatus('Failed');
    } finally {
      setRunLoading(false);
    }
  };

  const TypingIndicator = () => (
    <div className="flex max-w-xs items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex gap-1">
        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0.12s' }} />
        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0.24s' }} />
      </div>
      <span className="text-sm text-slate-600">Thinking...</span>
    </div>
  );

  return (
    <div className={`app-root min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white px-3 py-3 sm:px-5 sm:py-5 ${blackMode ? 'theme-black' : ''}`}>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 -top-20 h-96 w-96 animate-pulse rounded-full bg-violet-500/20 blur-3xl" />
        <div
          className="absolute right-0 top-20 h-[26rem] w-[26rem] animate-pulse rounded-full bg-cyan-400/20 blur-3xl"
          style={{ animationDelay: '0.8s' }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-80 w-80 animate-pulse rounded-full bg-fuchsia-500/15 blur-3xl"
          style={{ animationDelay: '1.4s' }}
        />
      </div>
      <div className="mx-auto flex h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:h-[calc(100vh-2.5rem)]">
        <header className="shrink-0 border-b border-slate-200 bg-white/80 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-lg font-semibold text-white shadow-sm">C</div>
              <div>
                <h1 className="text-base font-semibold text-slate-900 sm:text-lg">AI powered chatbot</h1>
                <p className="text-xs text-slate-500">Chat, File QA, and Compiler in one place</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setActivePanel('chat')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activePanel === 'chat'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setActivePanel('file')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activePanel === 'file'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                File QA
              </button>
              <button
                type="button"
                onClick={() => setActivePanel('code')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activePanel === 'code'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                Coding
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <button
                type="button"
                onClick={() => setShowAtsChecker((prev) => !prev)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  showAtsChecker
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                title="Open ATS checker"
              >
                ATS Checker
              </button>
              <button
                type="button"
                onClick={exportConversation}
                disabled={!messages.length}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  messages.length
                    ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                }`}
                title="Download chat as text file"
              >
                Export
              </button>
              <button
                type="button"
                onClick={clearConversation}
                disabled={!messages.length}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  messages.length
                    ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                }`}
                title="Clear chat history"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void checkLiveStatus()}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  liveStatus === 'online'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : liveStatus === 'checking'
                      ? 'border-amber-300 bg-amber-50 text-amber-700'
                      : 'border-rose-300 bg-rose-50 text-rose-700'
                }`}
                title="Check chat API status"
              >
                <span className="relative flex h-2 w-2">
                  <span
                    className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${liveStatus === 'online' ? 'animate-ping bg-current' : 'bg-current'}`}
                  />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
                </span>
                {liveStatus === 'online' ? 'Live' : liveStatus === 'checking' ? 'Checking' : 'Offline'}
              </button>
              <button
                type="button"
                onClick={regenerateLastReply}
                disabled={!messages.length || loading}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  !messages.length || loading
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                title="Regenerate latest assistant response"
              >
                Regenerate
              </button>
              <select
                value={voiceLanguage}
                onChange={(e) => setVoiceLanguage(e.target.value as VoiceLanguageMode)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-slate-400"
                aria-label="Read aloud language"
                title="Read aloud language"
              >
                <option value="auto">Voice: Auto</option>
                <option value="en">Voice: English</option>
                <option value="hi">Voice: Hindi</option>
                <option value="bho">Voice: Bhojpuri</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setVoiceEnabled((prev) => {
                    const next = !prev;
                    if (!next) stopCurrentSpeech();
                    return next;
                  })
                }
                className={`rounded-lg border px-3.5 py-1.5 text-xs font-medium transition ${
                  voiceEnabled
                    ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    : 'border-slate-300 bg-slate-100 text-slate-500'
                }`}
              >
                {voiceEnabled ? 'Sound on' : 'Sound off'}
              </button>
              <button
                type="button"
                onClick={stopCurrentSpeech}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                title="Stop current voice playback"
              >
                Stop voice
              </button>
              <button
                type="button"
                onClick={() => setBlackMode((current) => !current)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  blackMode
                    ? 'border-white bg-white text-black hover:bg-slate-200'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                aria-pressed={blackMode}
                title="Toggle black and white interface"
              >
                {blackMode ? 'White mode' : 'Black mode'}
              </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {showAtsChecker && (
            <section className="mx-4 mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:mx-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">ATS Resume Checker</h3>
                <button
                  type="button"
                  onClick={() => setShowAtsChecker(false)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
              <div className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <label className="text-xs font-medium text-slate-700">Upload your resume</label>
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.doc,.docx,image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setResumeFile(file);
                    if (file) {
                      setAtsError('');
                      setAtsResult(null);
                    }
                  }}
                  className="block text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white"
                />
                {resumeFile && (
                  <p className="text-xs text-slate-600">Selected: {resumeFile.name}</p>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={runAtsCheck}
                  disabled={atsLoading}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    atsLoading
                      ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {atsLoading ? 'Checking...' : 'Run ATS Check'}
                </button>
                {atsError && <p className="text-xs text-rose-600">{atsError}</p>}
              </div>
              {atsResult && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-700">ATS Score</p>
                    <p className="text-2xl font-bold text-emerald-800">{atsResult.score}%</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                    <p className="mb-1 text-xs text-slate-700">Breakdown</p>
                    <p className="text-xs text-slate-600">
                      Keyword coverage: {atsResult.details.keywordCoverage}% | Format: {atsResult.details.formatScore}% | Length: {atsResult.details.lengthScore}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 sm:col-span-2">
                    <p className="mb-1 text-xs text-cyan-700">Matched Keywords</p>
                    <p className="text-xs text-cyan-800">{atsResult.matchedKeywords.join(', ') || 'None'}</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="mb-1 text-xs text-amber-700">Missing Keywords</p>
                    <p className="text-xs text-amber-800">{atsResult.missingKeywords.slice(0, 12).join(', ') || 'None'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-3">
                    <p className="mb-1 text-xs text-slate-700">Suggestions</p>
                    <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
                      {atsResult.suggestions.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>
          )}
          {activePanel === 'chat' && (
            <>
              <section className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 px-4 py-5 sm:px-6">
                {messages.length === 0 && (
                  <div className="py-10 text-center">
                    <h2 className="mb-2 text-2xl font-semibold text-slate-900">Start a conversation</h2>
                    <p className="mx-auto mb-6 max-w-md text-sm text-slate-500">
                      Ask anything. Use quick prompts or type your own message.
                    </p>
                    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                      {quickPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => handleQuickPrompt(prompt)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <span className="block text-xs text-slate-400">Try</span>
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-5">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[72%] ${
                          msg.sender === 'user'
                            ? 'rounded-br-md bg-slate-900 text-white'
                            : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p
                            className={`text-[11px] font-medium tracking-wide ${
                              msg.sender === 'user' ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <button
                            type="button"
                            onClick={() => void copyMessage(msg)}
                            className={`text-[11px] font-semibold ${
                              msg.sender === 'user' ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-800'
                            }`}
                            title="Copy message"
                          >
                            {copiedMessageId === msg.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {loading && (
                  <div className="mt-4 flex justify-start">
                    <TypingIndicator />
                  </div>
                )}

                <div ref={messagesEndRef} />
              </section>

              <section className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
                <div className="relative rounded-2xl border border-slate-300 bg-white p-1.5 shadow-sm">
                  <label htmlFor="chat-input" className="sr-only">Type a message</label>
                  <textarea
                    id="chat-input"
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Type your message…"
                    className="w-full resize-none rounded-xl border-0 bg-transparent py-3 pl-3 pr-[5.5rem] text-sm text-slate-900 placeholder:text-slate-400 outline-none ring-0"
                    rows={1}
                    disabled={loading}
                    style={{ minHeight: '52px' }}
                  />

                  <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                    <button
                      onClick={toggleMic}
                      type="button"
                      className={`rounded-xl p-2 transition ${
                        !speechSupported
                          ? 'cursor-not-allowed text-slate-400'
                          : recognitionActive
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                      disabled={!speechSupported || loading}
                      aria-label={
                        speechSupported
                          ? recognitionActive
                            ? 'Stop voice input'
                            : 'Start voice input'
                          : 'Speech recognition not supported'
                      }
                      title={
                        speechSupported
                          ? recognitionActive
                            ? 'Stop listening'
                            : 'Start voice input'
                          : 'Speech recognition not supported'
                      }
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1.5a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0v-6a3 3 0 0 1 3-3z" />
                        <path d="M19 10.5a7 7 0 0 1-14 0" />
                        <path d="M12 18.5v3" />
                        <path d="M8 22h8" />
                      </svg>
                    </button>

                    <button
                      onClick={sendMessage}
                      disabled={loading || !input.trim()}
                      className={`rounded-xl p-2 transition ${
                        loading || !input.trim()
                          ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                      aria-label="Send message"
                    >
                      {loading ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
                  <p className="text-xs text-slate-500">
                    Enter to send · Shift+Enter for new line · Mic for one-shot dictation
                  </p>
                  <p className="text-xs tabular-nums text-slate-600">{input.trim().length}/1000</p>
                </div>
              </section>
            </>
          )}

          {activePanel === 'file' && (
            <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-slate-50/40 px-4 py-5 sm:px-6">
              <h2 className="text-base font-semibold text-slate-900">File Understanding</h2>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0] || null;
                  applySelectedFile(file);
                }}
                className={`flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed p-7 text-sm transition ${
                  dragActive
                    ? 'border-slate-900 bg-slate-100 text-slate-900'
                    : 'border-slate-300 bg-white text-slate-600'
                }`}
              >
                <input
                  type="file"
                  onChange={(e) => applySelectedFile(e.target.files?.[0] || null)}
                  className="hidden"
                  accept=".pdf,.txt,.md,.docx,image/*"
                />
                Drag and drop file here, or click to upload
              </label>
              {selectedFile && (
                <p className="text-xs text-slate-500">Selected: {selectedFile.name}</p>
              )}
              <textarea
                value={fileQuestion}
                onChange={(e) => setFileQuestion(e.target.value)}
                placeholder="Ask about file content (e.g. Summarize this PDF)"
                className="h-28 resize-none rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none"
              />
              <button
                type="button"
                onClick={askFileQuestion}
                disabled={fileLoading}
                className={`w-fit rounded-xl px-4 py-2 text-sm font-medium transition ${
                  fileLoading ? 'cursor-not-allowed bg-slate-200 text-slate-500' : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {fileLoading ? 'Processing...' : 'Ask Question'}
              </button>
              {fileError && <p className="text-sm text-rose-600">{fileError}</p>}
              {fileAnswer && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 whitespace-pre-wrap">
                  {fileAnswer}
                </div>
              )}
            </section>
          )}

          {activePanel === 'code' && (
            <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-slate-50/40 px-4 py-5 sm:px-6">
              <h2 className="text-base font-semibold text-slate-900">Online Compiler Workspace</h2>
              <p className="text-sm text-slate-500">
                Write code, run it, view output/errors, and fix issues in this same panel.
              </p>
              <div className="flex flex-wrap gap-2">
                <select
                  value={codeLanguage}
                  onChange={(e) => {
                    const nextLanguage = e.target.value;
                    setCodeLanguage(nextLanguage);
                    setCodeInput(CODE_TEMPLATES[nextLanguage] || '');
                    setRunOutput('');
                    setRunStatus('');
                    setCodeError('');
                    setErrorFixSuggestion('');
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="c">C</option>
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                </select>
                <button
                  type="button"
                  onClick={() => setCodeInput(CODE_TEMPLATES[codeLanguage] || '')}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  Load Starter Code
                </button>
              </div>
              <textarea
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="Write your code here..."
                className="h-64 resize-none rounded-2xl border border-slate-300 bg-white p-3 font-mono text-sm text-slate-900 shadow-sm outline-none"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={runCode}
                  disabled={runLoading}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    runLoading ? 'cursor-not-allowed bg-slate-200 text-slate-500' : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {runLoading ? 'Running...' : 'Run Code'}
                </button>
                <button
                  type="button"
                  onClick={fixRuntimeError}
                  disabled={fixLoading || runLoading}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    fixLoading || runLoading
                      ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {fixLoading ? 'Analyzing...' : 'Fix Error'}
                </button>
              </div>
              <textarea
                value={stdinInput}
                onChange={(e) => setStdinInput(e.target.value)}
                placeholder="Optional stdin input for code execution"
                className="h-20 resize-none rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none"
              />
              {runStatus && (
                <p className="text-xs font-medium text-slate-600">Status: {runStatus}</p>
              )}
              {codeError && <p className="text-sm text-rose-600">{codeError}</p>}
              {runOutput && (
                <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                  {runOutput}
                </pre>
              )}
              {errorFixSuggestion && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 whitespace-pre-wrap">
                  {errorFixSuggestion}
                </div>
              )}
            </section>
          )}
        </main>

        <footer className="shrink-0 border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-center sm:px-5">
          <p className="text-xs text-slate-500">
            Created by <span className="text-slate-700">Abhijeet Raj</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
