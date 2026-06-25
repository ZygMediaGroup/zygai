import React, { useEffect, useState } from 'react';
import { Brain, BookOpen, GraduationCap, Plus, Trash2, ChevronRight, CheckCircle2, XCircle, RefreshCw, AlertCircle, Sparkles, ChevronLeft, Menu } from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import clsx from 'clsx';

interface Material {
  id: string;
  knowledge_id: string;
  type: 'flashcards' | 'quiz';
  title: string;
  content: any[];
  created_at: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

const LearningArea: React.FC = () => {
  const { token } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selection
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);
  
  // Create Form
  const [newType, setNewType] = useState<'flashcards' | 'quiz'>('flashcards');
  const [newTitle, setNewTitle] = useState('');
  const [newKB, setNewKB] = useState('');

  // Quiz State
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [showQuizResults, setShowQuizResults] = useState(false);

  // Flashcard State
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    fetchMaterials();
    fetchKnowledgeBases();
  }, []);

  // Close mobile sidebar when material is selected or creating
  useEffect(() => {
    if (selectedMaterial || isCreating) {
      setShowMobileSidebar(false);
    } else {
      setShowMobileSidebar(true);
    }
  }, [selectedMaterial, isCreating]);

  const fetchMaterials = async () => {
    try {
      const resp = await fetch(`${API_BASE}/learning`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) {
        throw new Error(`Server error: ${resp.status}`);
      }
      const data = await resp.json();
      setMaterials(data.materials || []);
    } catch (e: any) {
      console.error('Fetch materials error:', e);
      setError('Could not load library. Please check if the server is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchKnowledgeBases = async () => {
    try {
      const resp = await fetch(`${API_BASE}/personal`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) return;
      const data = await resp.json();
      setKnowledgeBases(data.personal || []);
    } catch (e) {
      console.error('Fetch KB error:', e);
    }
  };

  const fetchMaterialDetails = async (id: string) => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/learning/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await resp.json();
      setSelectedMaterial(data.material);
      setQuizAnswers({});
      setShowQuizResults(false);
      setCurrentCardIndex(0);
      setFlipped(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!newKB || !newTitle) return;
    setGenerating(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/learning/generate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          knowledgeId: newKB,
          type: newType,
          title: newTitle
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to generate');
      
      setMaterials([data, ...materials]);
      setSelectedMaterial(data);
      setIsCreating(false);
      setNewTitle('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this learning material?')) return;
    try {
      await fetch(`${API_BASE}/learning/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setMaterials(materials.filter(m => m.id !== id));
      if (selectedMaterial?.id === id) setSelectedMaterial(null);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading && materials.length === 0) {
    return <div className="p-8 text-center text-ink-500 dark:text-ink-400">Loading your learning materials...</div>;
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-ink-900 overflow-hidden relative">
      {/* Header */}
      <div className="border-b border-ink-200 px-4 md:px-6 py-4 dark:border-ink-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <button 
              onClick={() => setShowMobileSidebar(!showMobileSidebar)}
              className="md:hidden p-2 hover:bg-ink-50 dark:hover:bg-ink-900 rounded-lg text-ink-500 dark:text-ink-100"
            >
              <Menu size={20} />
            </button>
            <div className="p-2 bg-saffron-500 rounded-xl text-white hidden md:block dark:bg-ink-100 dark:text-black">
              <GraduationCap size={24} />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-ink-900 dark:text-ink-50">AI Learning</h1>
              <p className="text-[8px] md:text-[10px] uppercase tracking-widest text-ink-400 font-bold">Summer Update Preview</p>
            </div>
          </div>
          <button
            onClick={() => {
              setIsCreating(true);
              setSelectedMaterial(null);
            }}
            className="flex items-center gap-2 rounded-xl bg-saffron-500 px-3 md:px-4 py-2 text-xs md:text-sm font-semibold text-white hover:bg-saffron-600 transition-all shadow-lg shadow-saffron-500/20 dark:bg-ink-100 dark:text-black dark:hover:bg-white dark:shadow-none"
          >
            <Plus size={16} />
            <span className="hidden xs:inline">New Material</span>
            <span className="xs:hidden">New</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar - Responsive */}
        <div className={clsx(
          "absolute inset-0 z-20 bg-white dark:bg-ink-950 md:relative md:translate-x-0 md:w-80 border-r border-ink-200 dark:border-ink-800 transition-transform duration-300 ease-in-out",
          showMobileSidebar ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}>
          <div className="p-4 space-y-2 overflow-y-auto h-full bg-ink-50/20 dark:bg-ink-950">
            <div className="flex items-center justify-between mb-4 md:hidden">
              <span className="text-xs font-black uppercase tracking-widest text-ink-400">Your Library</span>
              <button onClick={() => setShowMobileSidebar(false)} className="p-2 text-ink-500 dark:text-ink-100">
                <ChevronLeft size={20} />
              </button>
            </div>
            {materials.length === 0 && !isCreating && (
              <div className="text-center py-12 px-4 border-2 border-dashed border-ink-200 dark:border-ink-800 rounded-2xl">
                <Brain className="mx-auto text-ink-300 mb-2" size={32} />
                <p className="text-sm font-medium text-ink-500 dark:text-ink-400">No learning materials yet.</p>
                <button onClick={() => { setIsCreating(true); setShowMobileSidebar(false); }} className="text-saffron-500 text-xs font-bold mt-2 hover:underline">Create Now</button>
              </div>
            )}
            {materials.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  fetchMaterialDetails(m.id);
                  setShowMobileSidebar(false);
                }}
                className={clsx(
                  "w-full flex flex-col gap-1 p-4 rounded-2xl text-left transition-all group relative",
                  selectedMaterial?.id === m.id 
                    ? "bg-white dark:bg-ink-900 shadow-md ring-2 ring-saffron-500/50 dark:ring-ink-600/60" 
                    : "hover:bg-white dark:hover:bg-ink-900 hover:shadow-sm"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={clsx(
                    "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                    m.type === 'flashcards' ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                  )}>
                    {m.type}
                  </span>
                  <Trash2 
                    size={14} 
                    className="text-ink-300 dark:text-ink-500 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-all"
                    onClick={(e) => handleDelete(m.id, e)}
                  />
                </div>
                <span className="text-sm font-bold text-ink-900 dark:text-ink-50 truncate pr-4">
                  {m.title}
                </span>
                <span className="text-[10px] text-ink-400 font-medium">
                  {new Date(m.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-ink-50/30 dark:bg-ink-950/20 p-4 md:p-8">
          {isCreating ? (
            <div className="max-w-xl mx-auto bg-white dark:bg-ink-950 rounded-3xl border border-ink-200 dark:border-ink-800 shadow-2xl p-6 md:p-8 animate-in fade-in zoom-in duration-300">
              <div className="h-10 w-10 md:h-12 md:w-12 bg-saffron-100 dark:bg-ink-900 rounded-2xl flex items-center justify-center mb-4 md:mb-6">
                <Sparkles className="text-saffron-500" size={20} />
              </div>
              <h2 className="text-xl md:text-2xl font-bold mb-2 text-ink-900 dark:text-ink-50">
                Create Learning Material
              </h2>
              <p className="text-ink-500 dark:text-ink-400 text-xs md:text-sm mb-6 md:mb-8">AI will transform your knowledge base into study tools.</p>
              
              <div className="space-y-4 md:space-y-6">
                <div>
                  <label className="block text-[10px] md:text-xs font-black uppercase tracking-widest text-ink-400 mb-2 md:mb-3">
                    Material Type
                  </label>
                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <button
                      onClick={() => setNewType('flashcards')}
                      className={clsx(
                        "flex flex-col items-center gap-2 md:gap-3 p-4 md:p-6 rounded-2xl border-2 transition-all",
                        newType === 'flashcards' 
                          ? "border-saffron-500 bg-saffron-50 dark:bg-ink-900 shadow-inner dark:border-ink-600" 
                          : "border-ink-100 dark:border-ink-800 hover:border-saffron-200"
                      )}
                    >
                      <BookOpen size={24} className={newType === 'flashcards' ? "text-saffron-500" : "text-ink-300 dark:text-ink-500"} />
                      <span className="text-xs md:text-sm font-bold text-ink-900 dark:text-ink-50">Flashcards</span>
                    </button>
                    <button
                      onClick={() => setNewType('quiz')}
                      className={clsx(
                        "flex flex-col items-center gap-2 md:gap-3 p-4 md:p-6 rounded-2xl border-2 transition-all",
                        newType === 'quiz' 
                          ? "border-saffron-500 bg-saffron-50 dark:bg-ink-900 shadow-inner dark:border-ink-600" 
                          : "border-ink-100 dark:border-ink-800 hover:border-saffron-200"
                      )}
                    >
                      <GraduationCap size={24} className={newType === 'quiz' ? "text-saffron-500" : "text-ink-300 dark:text-ink-500"} />
                      <span className="text-xs md:text-sm font-bold text-ink-900 dark:text-ink-50">Quiz</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] md:text-xs font-black uppercase tracking-widest text-ink-400 mb-1.5 md:mb-2">
                    Source Knowledge Base
                  </label>
                  <select
                    value={newKB}
                    onChange={(e) => setNewKB(e.target.value)}
                    className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-medium outline-none focus:ring-2 focus:ring-saffron-400 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-50"
                  >
                    <option value="">Select a Knowledge Base...</option>
                    {knowledgeBases.map(kb => (
                      <option key={kb.id} value={kb.id}>{kb.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] md:text-xs font-black uppercase tracking-widest text-ink-400 mb-1.5 md:mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Deep Learning Fundamentals"
                    className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-medium outline-none focus:ring-2 focus:ring-saffron-400 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-50"
                  />
                </div>

                {error && (
                  <div className="p-3 md:p-4 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-600 text-[10px] md:text-xs flex items-center gap-2 md:gap-3 border border-red-100 dark:border-red-900/30">
                    <AlertCircle size={16} />
                    <span className="font-medium">{error}</span>
                  </div>
                )}

                <div className="flex gap-3 md:gap-4 pt-2 md:pt-4">
                  <button
                    onClick={() => setIsCreating(false)}
                    className="flex-1 px-3 md:px-4 py-2.5 md:py-3 rounded-xl border border-ink-200 dark:border-ink-800 text-xs md:text-sm font-bold text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-900 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={generating || !newKB || !newTitle}
                    className="flex-[2] bg-saffron-500 text-white font-black py-2.5 md:py-3 rounded-xl hover:bg-saffron-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl shadow-saffron-500/30 transition-transform active:scale-95 text-xs md:text-sm"
                  >
                    {generating ? (
                      <>
                        <RefreshCw className="animate-spin" size={16} />
                        Thinking...
                      </>
                    ) : 'Generate Now'}
                  </button>
                </div>
              </div>
            </div>
          ) : selectedMaterial ? (
            <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-10">
                <div className="flex items-center gap-3 md:gap-4">
                   <div className="p-2.5 md:p-3 bg-white dark:bg-ink-900 rounded-2xl shadow-sm border border-ink-200 dark:border-ink-800">
                    {selectedMaterial.type === 'flashcards' ? <BookOpen className="text-blue-500 w-5 h-5 md:w-6 md:h-6" /> : <GraduationCap className="text-purple-500 w-5 h-5 md:w-6 md:h-6" />}
                   </div>
                   <div>
                    <h2 className="text-lg md:text-2xl font-black text-ink-900 dark:text-ink-50 leading-tight">{selectedMaterial.title}</h2>
                    <p className="text-[8px] md:text-[10px] text-ink-400 uppercase font-black tracking-[0.2em] md:tracking-[0.3em] mt-1">{selectedMaterial.type} • {selectedMaterial.content.length} Items</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedMaterial(null);
                    setShowMobileSidebar(true);
                  }}
                  className="w-full md:w-auto px-4 py-2 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 text-ink-500 dark:text-ink-100 text-xs md:text-sm font-bold hover:bg-ink-50 transition-all flex items-center justify-center gap-2"
                >
                  <ChevronLeft size={16} className="md:hidden" />
                  Back to Library
                </button>
              </div>

              {selectedMaterial.type === 'flashcards' && (
                <div className="flex flex-col items-center gap-6 md:gap-10">
                  <div 
                    onClick={() => setFlipped(!flipped)}
                    className="relative w-full max-w-xl h-64 md:h-80 cursor-pointer perspective-1000 group"
                  >
                    <div className={clsx(
                      "w-full h-full relative transition-all duration-700 preserve-3d shadow-2xl rounded-[32px] md:rounded-[40px]",
                      flipped && "rotate-y-180"
                    )}>
                      {/* Front */}
                      <div className="absolute w-full h-full backface-hidden bg-white dark:bg-ink-900 border-4 border-ink-50 dark:border-ink-800 rounded-[32px] md:rounded-[40px] p-8 md:p-12 flex flex-col items-center justify-center text-center">
                        <div className="absolute top-6 left-6 md:top-8 md:left-8 text-[8px] md:text-[10px] font-black text-ink-300 uppercase tracking-widest">Question</div>
                        <p className="text-lg md:text-2xl font-bold text-ink-800 dark:text-ink-100 leading-tight">
                          {selectedMaterial.content[currentCardIndex]?.question}
                        </p>
                        <div className="absolute bottom-6 md:bottom-8 text-[8px] md:text-[10px] text-saffron-500 font-black uppercase tracking-widest opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity">Tap to Reveal Answer</div>
                      </div>
                      {/* Back */}
                      <div className="absolute w-full h-full backface-hidden bg-gradient-to-br from-saffron-400 to-saffron-600 rounded-[32px] md:rounded-[40px] p-8 md:p-12 flex flex-col items-center justify-center text-center shadow-xl rotate-y-180">
                        <div className="absolute top-6 left-6 md:top-8 md:left-8 text-[8px] md:text-[10px] font-black text-white/50 uppercase tracking-widest">Answer</div>
                        <p className="text-lg md:text-2xl font-black text-white leading-tight">
                          {selectedMaterial.content[currentCardIndex]?.answer}
                        </p>
                        <div className="absolute bottom-6 md:bottom-8 text-[8px] md:text-[10px] text-white/50 font-black uppercase tracking-widest">Tap to Hide</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 md:gap-8">
                    <button
                      disabled={currentCardIndex === 0}
                      onClick={() => { setCurrentCardIndex(currentCardIndex - 1); setFlipped(false); }}
                      className="p-3 md:p-4 rounded-2xl bg-white dark:bg-ink-900 border-2 border-ink-100 dark:border-ink-800 disabled:opacity-30 hover:border-saffron-400 transition-all shadow-sm text-ink-900 dark:text-ink-50"
                    >
                      <ChevronRight className="rotate-180 w-5 h-5 md:w-6 md:h-6" />
                    </button>
                    <div className="flex flex-col items-center">
                      <span className="text-xl md:text-2xl font-black text-ink-900 dark:text-ink-50">
                        {currentCardIndex + 1}
                      </span>
                      <span className="text-[8px] md:text-[10px] font-black text-ink-400 uppercase tracking-widest">of {selectedMaterial.content.length}</span>
                    </div>
                    <button
                      disabled={currentCardIndex === selectedMaterial.content.length - 1}
                      onClick={() => { setCurrentCardIndex(currentCardIndex + 1); setFlipped(false); }}
                      className="p-3 md:p-4 rounded-2xl bg-white dark:bg-ink-900 border-2 border-ink-100 dark:border-ink-800 disabled:opacity-30 hover:border-saffron-400 transition-all shadow-sm text-ink-900 dark:text-ink-50"
                    >
                      <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
                    </button>
                  </div>
                </div>
              )}

              {selectedMaterial.type === 'quiz' && (
                <div className="space-y-4 md:space-y-6 pb-20">
                  {selectedMaterial.content.map((q: QuizQuestion, qIdx: number) => (
                    <div key={qIdx} className="bg-white dark:bg-ink-900 rounded-[24px] md:rounded-[32px] border border-ink-200 dark:border-ink-800 p-6 md:p-8 shadow-sm">
                      <p className="font-black text-base md:text-xl mb-4 md:mb-6 text-ink-900 dark:text-ink-50 flex gap-3 md:gap-4">
                        <span className="text-saffron-500 opacity-50 font-mono">{String(qIdx + 1).padStart(2, '0')}</span>
                        {q.question}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        {q.options.map((opt, oIdx) => {
                          const isSelected = quizAnswers[qIdx] === oIdx;
                          const isCorrect = q.correctIndex === oIdx;
                          const showCorrect = showQuizResults && isCorrect;
                          const showWrong = showQuizResults && isSelected && !isCorrect;

                          return (
                            <button
                              key={oIdx}
                              disabled={showQuizResults}
                              onClick={() => setQuizAnswers({ ...quizAnswers, [qIdx]: oIdx })}
                              className={clsx(
                                "flex items-center justify-between p-4 md:p-5 rounded-xl md:rounded-2xl border-2 text-left transition-all relative overflow-hidden",
                                isSelected && !showQuizResults && "border-saffron-500 bg-saffron-50 dark:bg-saffron-950/20",
                                !isSelected && !showQuizResults && "border-ink-50 dark:border-ink-800 hover:border-saffron-200 hover:bg-ink-50/50",
                                showCorrect && "border-green-500 bg-green-50 dark:bg-green-950/20",
                                showWrong && "border-red-500 bg-red-50 dark:bg-red-950/20"
                              )}
                            >
                              <span className={clsx("text-xs md:text-sm pr-4 md:pr-6 text-ink-700 dark:text-ink-200", isSelected || showCorrect ? "font-bold" : "font-medium")}>{opt}</span>
                              {showCorrect && <CheckCircle2 className="text-green-500 flex-shrink-0" size={18} />}
                              {showWrong && <XCircle className="text-red-500 flex-shrink-0" size={18} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="sticky bottom-6 md:bottom-8 max-w-[280px] md:max-w-xs mx-auto">
                    {!showQuizResults ? (
                      <button
                        onClick={() => {
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                          setShowQuizResults(true);
                        }}
                        className="w-full bg-ink-900 dark:bg-white text-white dark:text-black font-black py-4 md:py-5 rounded-[20px] md:rounded-[24px] shadow-2xl transition-transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 md:gap-3 text-sm md:text-base"
                      >
                        Submit My Answers
                        <ChevronRight size={20} />
                      </button>
                    ) : (
                      <div className="bg-white dark:bg-ink-900 p-5 md:p-6 rounded-[24px] md:rounded-[32px] shadow-2xl border-4 border-saffron-400 text-center">
                        <p className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-ink-400 mb-1">Final Score</p>
                        <p className="text-3xl md:text-4xl font-black text-ink-900 dark:text-ink-50 mb-3 md:mb-4">
                          {Object.keys(quizAnswers).filter(idx => quizAnswers[Number(idx)] === selectedMaterial.content[Number(idx)].correctIndex).length} <span className="text-ink-300">/</span> {selectedMaterial.content.length}
                        </p>
                        <button
                          onClick={() => { setQuizAnswers({}); setShowQuizResults(false); }}
                          className="w-full bg-saffron-500 text-white font-bold py-2.5 md:py-3 rounded-xl md:rounded-2xl hover:bg-saffron-600 transition-all text-xs md:text-sm"
                        >
                          Restart Quiz
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[70vh] text-center max-w-2xl mx-auto py-10 md:py-20">
              <div className="relative mb-8 md:mb-12">
                <div className="absolute -inset-4 bg-saffron-400/20 blur-3xl rounded-full animate-pulse"></div>
                <div className="relative h-24 w-24 md:h-32 md:w-32 bg-gradient-to-br from-saffron-400 to-saffron-600 rounded-[32px] md:rounded-[40px] flex items-center justify-center shadow-2xl transform rotate-3">
                  <GraduationCap className="text-white w-12 h-12 md:w-16 md:h-16" />
                </div>
                <div className="absolute -bottom-3 -right-3 md:-bottom-4 md:-right-4 h-12 w-12 md:h-16 md:w-16 bg-white dark:bg-ink-900 rounded-xl md:rounded-2xl shadow-xl flex items-center justify-center transform -rotate-12 border border-ink-100 dark:border-ink-800">
                  <Sparkles className="text-saffron-500 w-6 h-6 md:w-8 md:h-8" />
                </div>
              </div>
              
              <h2 className="text-2xl md:text-4xl font-black text-ink-900 dark:text-ink-50 mb-3 md:mb-4 tracking-tight leading-tight">Summer Update:<br className="md:hidden" /> AI Learning</h2>
              <p className="text-ink-500 dark:text-ink-400 text-sm md:text-lg mb-8 md:mb-10 leading-relaxed font-medium px-4">
                Unlock the power of your documents. ZygAI can now generate interactive flashcards and 
                comprehensive quizzes directly from your personal knowledge base.
              </p>
              
              <div className="grid grid-cols-1 gap-4 md:gap-6 w-full mb-10 md:mb-12 px-4">
                {[
                  { icon: BookOpen, title: "Smart Flashcards", desc: "AI-generated Q&A for rapid memorization." },
                  { icon: GraduationCap, title: "Interactive Quizzes", desc: "Test your knowledge with custom MCQs." },
                  { icon: Brain, title: "Deep Analysis", desc: "Extract key concepts automatically." }
                ].map((feature, i) => (
                  <div key={i} className="p-4 md:p-6 bg-white dark:bg-ink-900 rounded-2xl md:rounded-3xl border border-ink-100 dark:border-ink-800 shadow-sm text-left flex md:block items-center gap-4">
                    <feature.icon className="text-saffron-500 mb-0 md:mb-4 flex-shrink-0" size={24} />
                    <div>
                      <h3 className="font-bold text-sm md:text-base text-ink-900 dark:text-ink-50 mb-0.5 md:mb-1">{feature.title}</h3>
                      <p className="text-[10px] md:text-xs text-ink-400 font-medium leading-relaxed">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setIsCreating(true)}
                className="group relative bg-ink-900 dark:bg-white text-white dark:text-black font-black px-8 md:px-12 py-4 md:py-5 rounded-[20px] md:rounded-[24px] hover:scale-105 transition-all shadow-2xl flex items-center gap-3 md:gap-4 overflow-hidden text-sm md:text-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-saffron-400 to-saffron-600 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500 opacity-10"></div>
                <Plus size={24} className="text-saffron-500" />
                <span>Get Started</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}} />
    </div>
  );
};

export default LearningArea;
