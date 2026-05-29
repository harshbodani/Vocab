import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  updateDoc, 
  arrayUnion, 
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import { 
  BookOpen, 
  Brain, 
  Loader2, 
  Trophy,
  ChevronRight,
  ChevronLeft,
  Volume2,
  Sparkles,
  Lightbulb,
  Dna,
  History,
  Target,
  Award,
  Trash2,
  RefreshCw,
  AlertCircle,
  GraduationCap,
  Zap,
  Quote,
  CheckCircle2
} from 'lucide-react';

const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'lexiquest-pro-ultra';
const apiKey = "";

const App = () => {
  const [user, setUser] = useState(null);
  const [seenWords, setSeenWords] = useState([]);
  const [sessionQueue, setSessionQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  
  // Feature States
  const [mnemonic, setMnemonic] = useState('');
  const [isGeneratingMnemonic, setIsGeneratingMnemonic] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioError, setAudioError] = useState(false);

  // Test State
  const [showTest, setShowTest] = useState(false);
  const [testQuestions, setTestQuestions] = useState([]);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState([]);
  const [testFinished, setTestFinished] = useState(false);

  const SESSION_SIZE = 15; // Increased to 15 high-level words

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        setAuthError("Authentication error. Please refresh.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const userDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'user_data', 'profile');
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setSeenWords(docSnap.data().seenWords || []);
      } else {
        setDoc(userDocRef, { seenWords: [], joinedAt: new Date().toISOString() });
      }
    }, (err) => console.error(err));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    setMnemonic('');
    setAudioError(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentIndex]);

  const callGemini = async (systemPrompt, userPrompt, schema) => {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { responseMimeType: "application/json", responseSchema: schema }
      })
    });
    if (!response.ok) throw new Error("Failed to generate content");
    const data = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text);
  };

  const generateMnemonic = async () => {
    if (!sessionQueue[currentIndex]) return;
    setIsGeneratingMnemonic(true);
    
    const schema = { type: "OBJECT", properties: { mnemonic: { type: "STRING" } } };

    try {
      const result = await callGemini(
        "You are an elite linguistic memory coach.",
        `Word: ${sessionQueue[currentIndex].word}\nDefinition: ${sessionQueue[currentIndex].definition}\nCreate a clever, vivid mnemonic device to remember this CAT/GMAT word.`,
        schema
      );
      setMnemonic(result.mnemonic);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingMnemonic(false);
    }
  };

  const playAudio = async () => {
    if (!sessionQueue[currentIndex] || isSpeaking) return;
    setIsSpeaking(true);
    setAudioError(false);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: sessionQueue[currentIndex].word }] }],
          generationConfig: { 
            responseModalities: ["AUDIO"], 
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } 
          }
        })
      });

      const data = await response.json();
      if (!data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) throw new Error("Audio generation failed");
      
      const pcmData = data.candidates[0].content.parts[0].inlineData.data;
      const audioBlob = pcmToWav(pcmData, 24000);
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => setAudioError(true)).finally(() => setIsSpeaking(false));
      }
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
      };
    } catch (error) {
      console.error(error);
      setIsSpeaking(false);
      setAudioError(true);
    }
  };

  const pcmToWav = (base64Pcm, sampleRate) => {
    const binaryString = window.atob(base64Pcm);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };

    writeString(0, 'RIFF'); view.setUint32(4, 36 + len, true);
    writeString(8, 'WAVE'); writeString(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); writeString(36, 'data');
    view.setUint32(40, len, true);

    return new Blob([wavHeader, bytes], { type: 'audio/wav' });
  };

  const startNewSession = async () => {
    setLoading(true);
    setShowTest(false);
    setTestFinished(false);
    setUserAnswers([]);
    setCurrentTestIndex(0);
    
    const schema = {
      type: "OBJECT",
      properties: {
        words: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              word: { type: "STRING" },
              ipa: { type: "STRING" },
              definition: { type: "STRING" },
              example: { type: "STRING" },
              synonyms: { type: "ARRAY", items: { type: "STRING" } },
              antonyms: { type: "ARRAY", items: { type: "STRING" } },
              roots: {
                type: "OBJECT",
                properties: {
                  root: { type: "STRING" },
                  meaning: { type: "STRING" },
                  origin: { type: "STRING" }
                }
              }
            }
          }
        }
      }
    };

    try {
      // Exclude last 300 words to ensure constant freshness
      const exclusionList = seenWords.slice(-300).join(', ') || 'none';
      const systemPrompt = `You are a strict elite vocabulary curator. 
      Your database consists of the 1000 hardest and most frequently tested words in the CAT, GMAT, and GRE exams.
      From this master list, generate exactly ${SESSION_SIZE} highly advanced, sophisticated words.
      CRITICAL INSTRUCTION: You MUST NOT include any of the following words: [${exclusionList}].
      Ensure complete, detailed JSON response.`;

      const result = await callGemini(
        systemPrompt,
        `Provide ${SESSION_SIZE} advanced words. Include definition, IPA, complex usage example, synonyms, antonyms, and root word analysis.`,
        schema
      );

      // Safe mapping in case AI misses an array
      const safeWords = (result.words || []).map(w => ({
        word: w.word || 'Unknown',
        ipa: w.ipa || '',
        definition: w.definition || '',
        example: w.example || '',
        synonyms: Array.isArray(w.synonyms) ? w.synonyms : [],
        antonyms: Array.isArray(w.antonyms) ? w.antonyms : [],
        roots: w.roots || { root: 'N/A', meaning: 'Unknown', origin: 'Various' }
      }));

      setSessionQueue(safeWords);
      setCurrentIndex(0);
      
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'user_data', 'profile'), {
        seenWords: arrayUnion(...safeWords.map(w => w.word.toLowerCase()))
      });
    } catch (error) {
      console.error(error);
      setAuthError("Failed to fetch words. The AI might be overloaded. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const generateTest = () => {
    const questions = (sessionQueue || []).map((w, i) => {
      const distractors = (sessionQueue || [])
        .filter((_, idx) => idx !== i)
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map(d => d.definition);
      
      const options = [w.definition, ...distractors].sort(() => 0.5 - Math.random());
      return { word: w.word, correct: w.definition, options };
    });
    setTestQuestions(questions);
    setShowTest(true);
  };

  const handleTestAnswer = (answer) => {
    const newAnswers = [...userAnswers, answer];
    setUserAnswers(newAnswers);
    if (currentTestIndex < testQuestions.length - 1) {
      setCurrentTestIndex(prev => prev + 1);
    } else {
      setTestFinished(true);
    }
  };

  const currentWord = sessionQueue[currentIndex];

  if (authError) return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] p-4">
      <div className="text-center p-8 bg-[#11131A] border border-red-500/20 rounded-[2rem] max-w-md w-full">
        <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
        <h2 className="text-white font-bold text-xl mb-2">Connection Interrupted</h2>
        <p className="text-slate-400 text-sm mb-6">{authError}</p>
        <button onClick={() => window.location.reload()} className="bg-red-500/10 text-red-500 px-6 py-3 rounded-xl font-bold w-full hover:bg-red-500/20 transition-colors">
          Refresh Application
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      {/* Immersive Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[150px] rounded-full mix-blend-screen"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[150px] rounded-full mix-blend-screen"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02]"></div>
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row min-h-screen">
        
        {/* Sidebar / Header */}
        <aside className="lg:w-80 border-b lg:border-b-0 lg:border-r border-white/5 bg-[#0A0C10]/80 backdrop-blur-2xl p-6 lg:p-8 flex flex-col lg:h-screen lg:sticky top-0">
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-500/20">
              <GraduationCap size={24} className="text-white" />
            </div>
            <h1 className="font-black text-2xl tracking-tighter text-white">LexiQuest <span className="text-indigo-500">Ultra</span></h1>
          </div>

          <div className="hidden lg:block space-y-8 flex-grow">
            <div className="bg-gradient-to-b from-white/[0.05] to-transparent p-6 rounded-[2rem] border border-white/5">
               <h3 className="text-[10px] font-black uppercase text-indigo-400 mb-6 tracking-widest flex items-center gap-2">
                 <Target size={14} /> Global Mastery
               </h3>
               <div className="flex items-baseline gap-2 mb-3">
                 <span className="text-6xl font-black text-white tracking-tighter">{seenWords.length}</span>
               </div>
               <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-6">High-Level Words Conquered</p>
               
               <div className="relative h-1.5 w-full bg-black rounded-full overflow-hidden mb-6">
                  <div 
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000 shadow-[0_0_10px_rgba(99,102,241,0.5)]" 
                    style={{width: `${Math.min((seenWords.length/1000)*100, 100)}%`}}
                  ></div>
               </div>
               <p className="text-xs text-slate-400 text-center">Targeting 1000 Word Master Pool</p>
            </div>
            
            <div className="bg-indigo-500/10 border border-indigo-500/20 p-6 rounded-[2rem]">
               <Zap className="text-indigo-400 mb-3" size={20} />
               <h4 className="text-sm font-black text-white mb-2">CAT/GMAT Curator</h4>
               <p className="text-xs text-indigo-200/70 leading-relaxed">Our AI exclusively pulls from a pool of the 1000 hardest examination words, guaranteeing rigorous practice.</p>
            </div>
          </div>

          <div className="hidden lg:block mt-auto pt-6 border-t border-white/5">
             <button 
               onClick={() => {
                 if (window.confirm("Wipe all mastery progress permanently?")) {
                   deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'user_data', 'profile'));
                 }
               }} 
               className="w-full flex items-center justify-center gap-2 py-3 text-[10px] font-black text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all uppercase tracking-widest"
             >
               <Trash2 size={14} /> Wipe Database
             </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-12 w-full max-w-5xl mx-auto flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-indigo-500/20 blur-3xl animate-pulse"></div>
                <div className="w-24 h-24 border-2 border-white/5 rounded-[2rem] flex items-center justify-center bg-[#0A0C10] shadow-2xl relative z-10">
                  <Loader2 className="animate-spin text-indigo-500" size={40} />
                </div>
              </div>
              <h2 className="text-3xl font-black text-white tracking-tight mb-2">Curating 15 Master Words</h2>
              <p className="text-slate-500 font-medium">Cross-referencing your history with the 1000-word elite database...</p>
            </div>
          ) : showTest ? (
            <div className="flex-1 flex flex-col bg-[#0A0C10] border border-white/5 rounded-[3rem] p-8 md:p-16 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none"></div>
              
              {testFinished ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in duration-700 relative z-10">
                   <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-[2rem] flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-8 transform rotate-12">
                     <Trophy size={48} className="text-white -rotate-12" />
                   </div>
                   <h2 className="text-6xl font-black mb-4 text-white tracking-tighter">Sprint Complete</h2>
                   
                   <div className="bg-white/5 border border-white/10 px-8 py-4 rounded-3xl mb-12">
                     <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-1">Final Score</p>
                     <p className="text-5xl font-black text-white">
                       <span className="text-emerald-400">{userAnswers.filter((a, i) => a === testQuestions[i]?.correct).length}</span>
                       <span className="text-slate-600 text-3xl"> / {SESSION_SIZE}</span>
                     </p>
                   </div>

                   <button 
                    onClick={startNewSession} 
                    className="bg-white text-black px-12 py-5 rounded-[2rem] font-black text-lg transition-all shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:shadow-[0_0_60px_rgba(255,255,255,0.25)] hover:scale-105 active:scale-95 flex items-center gap-3"
                   >
                     Start Next 15 Words <ChevronRight size={24} />
                   </button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-500 relative z-10">
                  <div className="flex justify-between items-center mb-16">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] bg-indigo-500/10 px-4 py-2 rounded-full">
                      Question {currentTestIndex + 1} of {SESSION_SIZE}
                    </span>
                    <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 transition-all duration-300" style={{width: `${(currentTestIndex/SESSION_SIZE)*100}%`}}></div>
                    </div>
                  </div>
                  
                  <h3 className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-4">Identify the definition for:</h3>
                  <h2 className="text-5xl md:text-7xl font-black mb-16 text-white tracking-tighter">{testQuestions[currentTestIndex]?.word}</h2>
                  
                  <div className="grid gap-4 mt-auto">
                    {(testQuestions[currentTestIndex]?.options || []).map((opt, i) => (
                      <button 
                        key={i} 
                        onClick={() => handleTestAnswer(opt)} 
                        className="group w-full text-left p-6 rounded-3xl bg-[#11131A] border border-white/5 hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all flex items-center justify-between"
                      >
                        <span className="font-medium text-slate-300 group-hover:text-white transition-colors text-lg leading-relaxed">{opt}</span>
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-colors shrink-0 ml-4">
                          <ChevronRight size={16} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : currentWord ? (
            <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-12 duration-1000 pb-10">
               
               {/* Top Navigation */}
               <div className="flex items-center justify-between mb-12">
                 <div className="flex gap-1.5">
                   {[...Array(SESSION_SIZE)].map((_, i) => (
                     <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === currentIndex ? 'w-8 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : i < currentIndex ? 'w-2 bg-indigo-500/30' : 'w-2 bg-white/10'}`}></div>
                   ))}
                 </div>
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                   Word {currentIndex + 1} / {SESSION_SIZE}
                 </span>
               </div>

               {/* Word Header */}
               <div className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
                  <div>
                    <h1 className="text-7xl md:text-9xl font-black text-white tracking-tighter leading-none mb-4 selection:bg-indigo-500/40">{currentWord.word}</h1>
                    <div className="flex items-center gap-4">
                      <span className="text-indigo-400 font-mono text-2xl tracking-widest opacity-80">/{currentWord.ipa}/</span>
                      <button 
                        onClick={playAudio} 
                        disabled={isSpeaking} 
                        className={`p-3 rounded-2xl border transition-all ${audioError ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-white/5 border-white/10 text-indigo-400 hover:bg-white/10 hover:scale-105 active:scale-95'}`}
                      >
                        {isSpeaking ? <Loader2 className="animate-spin" size={24} /> : <Volume2 size={24} />}
                      </button>
                    </div>
                  </div>
                  
                  <button 
                    onClick={generateMnemonic} 
                    disabled={isGeneratingMnemonic} 
                    className="relative overflow-hidden group bg-white/5 border border-white/10 text-white px-6 py-4 rounded-[2rem] font-bold transition-all hover:bg-white/10 active:scale-95 flex items-center gap-3 backdrop-blur-xl"
                  >
                    <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-2 rounded-xl text-white">
                      {isGeneratingMnemonic ? <Loader2 className="animate-spin" size={16} /> : <Lightbulb size={16} />}
                    </div>
                    <span>AI Mnemonic</span>
                  </button>
               </div>

               {/* AI Mnemonic Dropdown */}
               {mnemonic && (
                 <div className="mb-8 bg-gradient-to-r from-amber-500/10 to-orange-500/5 border border-amber-500/20 p-8 rounded-[2.5rem] flex gap-6 animate-in zoom-in-95 duration-500">
                    <p className="text-2xl font-bold italic leading-tight text-amber-100">"{mnemonic}"</p>
                 </div>
               )}

               {/* Bento Grid */}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-grow">
                 
                 {/* Definition - Large */}
                 <div className="md:col-span-2 bg-[#0E1116] border border-white/5 p-8 md:p-10 rounded-[2.5rem] shadow-xl group hover:border-indigo-500/30 transition-colors flex flex-col justify-center">
                   <h4 className="text-[10px] font-black uppercase text-indigo-500 mb-4 tracking-[0.3em] flex items-center gap-2">
                     <BookOpen size={14} /> Core Semantics
                   </h4>
                   <p className="text-3xl font-bold leading-tight text-slate-200 group-hover:text-white transition-colors">{currentWord.definition}</p>
                 </div>

                 {/* Root Word - Etymology */}
                 <div className="md:col-span-1 bg-gradient-to-b from-[#151125] to-[#0E1116] border border-purple-500/20 p-8 rounded-[2.5rem] relative overflow-hidden group flex flex-col">
                    <Dna className="absolute -right-4 -bottom-4 text-purple-500/10 -rotate-12 group-hover:scale-110 transition-transform duration-700" size={150} />
                    <div className="relative z-10 flex flex-col h-full">
                      <h4 className="text-[10px] font-black uppercase text-purple-400 tracking-[0.3em] mb-6 flex items-center gap-2">
                        <History size={14} /> Etymology
                      </h4>
                      <div className="mt-auto">
                        <p className="text-4xl font-black text-white tracking-tighter mb-2">{currentWord.roots?.root || "N/A"}</p>
                        <p className="text-sm font-bold text-slate-400 mb-4">Means: <span className="text-purple-300">{currentWord.roots?.meaning || "Undetermined"}</span></p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{currentWord.roots?.origin || "Various"} Origin</p>
                      </div>
                    </div>
                 </div>

                 {/* Usage Context - Large */}
                 <div className="md:col-span-2 bg-[#0E1116] border border-white/5 p-8 md:p-10 rounded-[2.5rem] shadow-xl relative overflow-hidden flex flex-col justify-center">
                   <Quote className="absolute top-8 right-8 text-white/5" size={80} />
                   <h4 className="text-[10px] font-black uppercase text-slate-500 mb-6 tracking-[0.3em] relative z-10">Academic Usage</h4>
                   <p className="text-2xl font-medium italic leading-relaxed text-slate-300 relative z-10">
                     "{currentWord.example}"
                   </p>
                 </div>

                 {/* Synonyms/Antonyms */}
                 <div className="md:col-span-1 flex flex-col gap-6">
                   <div className="flex-1 bg-[#0E1116] border border-white/5 p-6 rounded-[2rem]">
                     <h4 className="text-[10px] font-black uppercase text-emerald-500 mb-4 tracking-widest">Synonyms</h4>
                     <div className="flex flex-wrap gap-2">
                       {(currentWord.synonyms || []).map((s, i) => (
                         <span key={i} className="bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-tight">{s}</span>
                       ))}
                       {(!currentWord.synonyms || currentWord.synonyms.length === 0) && <span className="text-slate-600 text-xs font-medium">None provided</span>}
                     </div>
                   </div>
                   <div className="flex-1 bg-[#0E1116] border border-white/5 p-6 rounded-[2rem]">
                     <h4 className="text-[10px] font-black uppercase text-rose-500 mb-4 tracking-widest">Antonyms</h4>
                     <div className="flex flex-wrap gap-2">
                       {(currentWord.antonyms || []).map((a, i) => (
                         <span key={i} className="bg-rose-500/10 text-rose-400 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-tight">{a}</span>
                       ))}
                       {(!currentWord.antonyms || currentWord.antonyms.length === 0) && <span className="text-slate-600 text-xs font-medium">None provided</span>}
                     </div>
                   </div>
                 </div>
               </div>

               {/* Navigation Controls */}
               <div className="flex justify-between items-center mt-10">
                 <button 
                  onClick={() => setCurrentIndex(i => i-1)} 
                  disabled={currentIndex === 0} 
                  className="px-6 py-4 rounded-2xl font-bold text-slate-500 disabled:opacity-0 flex items-center gap-2 hover:text-white transition-colors"
                 >
                   <ChevronLeft size={20} /> Back
                 </button>
                 
                 {currentIndex < SESSION_SIZE - 1 ? (
                   <button 
                    onClick={() => setCurrentIndex(i => i+1)} 
                    className="bg-white text-black px-10 py-5 rounded-[2rem] font-black text-lg flex items-center gap-3 shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-white/20 hover:scale-105 active:scale-95 transition-all"
                   >
                     Next Word <ChevronRight size={20} />
                   </button>
                 ) : (
                   <button 
                    onClick={() => {
                      const qs = (sessionQueue || []).map((w, i) => ({
                        word: w.word,
                        correct: w.definition,
                        options: [w.definition, ...(sessionQueue || []).filter((_, idx) => idx !== i).sort(() => 0.5-Math.random()).slice(0, 3).map(d => d.definition)].sort(() => 0.5-Math.random())
                      }));
                      setTestQuestions(qs);
                      setShowTest(true);
                    }} 
                    className="bg-gradient-to-r from-emerald-400 to-teal-500 text-black px-10 py-5 rounded-[2rem] font-black text-lg shadow-[0_0_30px_rgba(52,211,153,0.3)] hover:scale-105 active:scale-95 transition-all flex items-center gap-3 animate-pulse hover:animate-none"
                   >
                     Start Mastery Test <CheckCircle2 size={20} />
                   </button>
                 )}
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
               <div className="relative mb-12 group">
                 <div className="absolute inset-0 bg-indigo-500/20 blur-[80px] group-hover:bg-indigo-500/30 transition-colors duration-700"></div>
                 <div className="w-32 h-32 border border-white/10 rounded-[2.5rem] flex items-center justify-center bg-[#0A0C10] shadow-2xl relative z-10 backdrop-blur-xl">
                    <Brain size={50} className="text-indigo-400" />
                 </div>
               </div>
               <h2 className="text-5xl md:text-7xl font-black mb-6 text-white tracking-tighter">Neuro-Vocab Core</h2>
               <p className="text-slate-400 mb-12 max-w-lg mx-auto text-xl leading-relaxed">
                 Initialize a tailored session. Our AI curates exactly 15 high-standard CAT/GMAT/GRE words you haven't seen before.
               </p>
               <button 
                 onClick={startNewSession} 
                 className="bg-white text-black px-12 py-6 rounded-[2.5rem] font-black text-2xl shadow-[0_0_50px_rgba(255,255,255,0.15)] hover:shadow-white/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-4"
               >
                 Commence 15-Word Sprint <ChevronRight size={28} />
               </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;