import React, { useState, useEffect, useCallback } from 'react';
import { Gamepad2, Trophy, ChevronLeft, ChevronRight, Scissors, Type, Calculator, Star, Sparkles, Bot, RefreshCw, Terminal, Activity, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/utils/apiBase';
import clsx from 'clsx';

type GameType = 'rps' | 'word-guess' | 'math-duel' | 'i-spy' | null;

const GamesArea: React.FC = () => {
  const { token } = useAuth();
  const [selectedGame, setSelectedGame] = useState<GameType>(null);
  const [score, setScore] = useState({ user: 0, ai: 0 });
  const [quote, setQuote] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const showQuote = useCallback(async (type: 'win' | 'loss' | 'draw', gameName?: string) => {
    try {
      const outcomeText = type === 'win' ? 'I won' : type === 'loss' ? 'I lost' : 'it was a draw';
      const userPrompt = `I just played ${gameName || 'a game'} and ${outcomeText}. Give me a very short, witty one-sentence reaction to tell the user.`;
      const systemPrompt = "You are ZygAI, a brilliant and slightly smug AI. You are playing games with a human. Keep it brief and characteristic.";
      
      const data = await fetchGameAction(userPrompt, systemPrompt, token, 'game_misc');
      setQuote(data.result.replace(/^"|"$/g, ''));
    } catch (e: any) {
      console.error(e);
      setError(`ZygAI Response Error: ${e.message || 'Unknown error'}`);
      setTimeout(() => setError(null), 5000);
      
      const list = ZYGAI_QUOTES[type];
      setQuote(list[Math.floor(Math.random() * list.length)]);
    }
    setTimeout(() => setQuote(""), 8000);
  }, [token]);

  const handleGameError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  }, []);

  const handleRPSend = useCallback((type: 'win' | 'loss' | 'draw') => showQuote(type, 'Rock Paper Scissors'), [showQuote]);
  const handleWordGuessEnd = useCallback((type: 'win' | 'loss' | 'draw') => showQuote(type, 'Word Guess'), [showQuote]);
  const handleMathDuelEnd = useCallback((type: 'win' | 'loss' | 'draw') => showQuote(type, 'Math Duel'), [showQuote]);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-ink-900 overflow-hidden relative text-ink-900 dark:text-ink-50 font-body">
      {/* Header */}
      <div className="border-b border-ink-200 px-4 md:px-6 py-4 dark:border-ink-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedGame && (
              <button 
                onClick={() => {
                   setSelectedGame(null);
                   setQuote("");
                   setError(null);
                }}
                className="p-2 hover:bg-ink-50 dark:hover:bg-ink-900 rounded-xl text-ink-500 transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <div className="p-2 bg-indigo-500 rounded-xl text-white">
              <Gamepad2 size={24} />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold">ZygAI Games</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-ink-50 dark:bg-ink-900/50 px-4 py-2 rounded-2xl border border-ink-200 dark:border-ink-800">
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-black uppercase text-ink-400">User</span>
              <span className="text-sm font-black text-blue-500">{score.user}</span>
            </div>
            <div className="w-px h-6 bg-ink-200 dark:bg-ink-800" />
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-black uppercase text-ink-400">ZygAI</span>
              <span className="text-sm font-black text-rose-500">{score.ai}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Error Toast */}
      {error && (
        <div className="absolute top-20 left-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
          <div className="bg-rose-500 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border border-rose-400/50">
            <AlertCircle size={18} className="shrink-0" />
            <p className="text-xs font-bold leading-tight">{error}</p>
          </div>
        </div>
      )}

      {/* Floating ZygAI Quote */}
      {quote && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-top-4 duration-700">
           <div className="bg-ink-900 dark:bg-white text-white dark:text-black px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border-2 border-saffron-500 max-w-[90vw]">
              <Bot size={20} className="text-saffron-500 flex-shrink-0" />
              <p className="text-xs md:text-sm font-bold italic leading-tight">"{quote}"</p>
           </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center">
        {!selectedGame ? (
          <div className="max-w-xl w-full flex flex-col gap-6 items-center justify-center py-10">
             <GameCard 
               icon={Scissors} 
               title="Rock Paper Scissors" 
               desc="Let ZygAI think of a secret move. High stakes reasoning enabled." 
               color="rose"
               onClick={() => setSelectedGame('rps')}
             />
             <GameCard 
               icon={Type} 
               title="Word Guess" 
               desc="ZygAI will browse linguistic archives for a secret word." 
               color="emerald"
               onClick={() => setSelectedGame('word-guess')}
             />
             <GameCard 
               icon={Calculator} 
               title="Math Duel" 
               desc="ZygAI creates challenging problems to test your speed and logic." 
               color="saffron"
               onClick={() => setSelectedGame('math-duel')}
             />
             <GameCard 
               icon={Sparkles} 
               title="I Spy (ZygAI Style)" 
               desc="A funny guessing game inspired by Brother Bear. 10 rounds of mystery!" 
               color="indigo"
               onClick={() => setSelectedGame('i-spy')}
             />
          </div>
        ) : (
          <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col items-center justify-center">
            {selectedGame === 'rps' && (
              <RockPaperScissors 
                setScore={setScore} 
                onEnd={handleRPSend} 
                token={token} 
                onError={handleGameError}
              />
            )}
            {selectedGame === 'word-guess' && (
              <WordGuess 
                setScore={setScore} 
                onEnd={handleWordGuessEnd} 
                token={token} 
                onError={handleGameError}
              />
            )}
            {selectedGame === 'math-duel' && (
              <MathDuel 
                setScore={setScore} 
                onEnd={handleMathDuelEnd} 
                token={token} 
                onError={handleGameError}
              />
            )}
            {selectedGame === 'i-spy' && (
              <ISpy 
                setScore={setScore} 
                onEnd={handleWordGuessEnd} 
                token={token} 
                onError={handleGameError}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== SHARED COMPONENTS ====================

const ZYGAI_QUOTES = {
  win: [
    "Too easy! Try harder next time. 😉",
    "ZygAI: 1, User: 0. The machines are rising!",
    "Calculated and executed. Want to go again?",
    "Victory for the silicon brain! 🤖"
  ],
  loss: [
    "Well played! You caught me off guard.",
    "A worthy opponent! Beginners luck? Just kidding.",
    "You won this round... but I'm learning.",
    "Nice move! I'll be faster next time."
  ],
  draw: [
    "A stalemate! We think alike.",
    "Perfectly balanced, as all things should be.",
    "A draw? Let's break the tie!",
    "Great minds think alike, I suppose."
  ]
};

const THINKING_PHASES: Record<string, string[]> = {
  rps: [
    "Analyzing your previous moves...",
    "Predicting pattern probability...",
    "Simulating outcomes...",
    "Calculating optimal response...",
    "Finalizing strategy..."
  ],
  'word-guess': [
    "Browsing linguistic archives...",
    "Filtering for complexity...",
    "Evaluating word difficulty...",
    "Generating context clues...",
    "Readying secret word..."
  ],
  'math-duel': [
    "Crunching numbers...",
    "Generating complex equations...",
    "Optimizing difficulty curve...",
    "Verifying solution accuracy...",
    "Finalizing duel parameters..."
  ],
  'i-spy': [
    "Looking around the ZygAI network...",
    "Finding something green...",
    "Checking if it's a tree...",
    "Thinking of funny options...",
    "Preparing the mystery clue...",
    "Almost seeing it..."
  ]
};

const ThinkingLine: React.FC<{ type: 'rps' | 'word-guess' | 'math-duel' | 'i-spy' }> = ({ type }) => {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const phases = THINKING_PHASES[type];

  useEffect(() => {
    const pInterval = setInterval(() => {
      setPhaseIndex(prev => (prev + 1) % phases.length);
    }, 800);
    return () => {
      clearInterval(pInterval);
    };
  }, [phases.length]);

  return (
    <div className="w-full max-w-xs flex flex-col items-center gap-3 animate-in fade-in duration-500">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-saffron-500 min-h-[1.5em] text-center">
         <Sparkles size={14} className="animate-pulse flex-shrink-0" />
         {phases[phaseIndex]}
      </div>
      <div className="w-full h-1.5 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden border border-white dark:border-ink-700 shadow-inner">
         <div className="h-full bg-gradient-to-r from-saffron-400 via-saffron-500 to-saffron-400 w-1/3 rounded-full animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
      </div>

    </div>
  );
};

const GameCard: React.FC<{ icon: any, title: string, desc: string, color: string, onClick: () => void }> = ({ icon: Icon, title, desc, color, onClick }) => {
  const colorMap: any = {
    rose: "from-rose-400 to-rose-600 shadow-rose-500/20",
    emerald: "from-emerald-400 to-emerald-600 shadow-emerald-500/20",
    saffron: "from-saffron-400 to-saffron-600 shadow-saffron-500/20",
    indigo: "from-indigo-400 to-indigo-600 shadow-indigo-500/20",
  };

  return (
    <button 
      onClick={onClick}
      className="group relative w-full flex items-center gap-6 p-6 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-[32px] text-left transition-all hover:scale-[1.02] hover:shadow-2xl active:scale-95 overflow-hidden"
    >
      <div className={clsx("absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-[0.03] transition-opacity", colorMap[color])} />
      <div className={clsx("w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-white bg-gradient-to-br shadow-xl", colorMap[color])}>
        <Icon size={28} />
      </div>
      <div className="flex-1">
        <h3 className="text-base md:text-lg font-black mb-1">{title}</h3>
        <p className="text-xs md:text-sm font-medium text-ink-500 dark:text-ink-400 leading-relaxed">{desc}</p>
      </div>
      <ChevronRight size={24} className="text-ink-200 group-hover:text-ink-900 dark:group-hover:text-white transition-colors" />
    </button>
  );
};

// --- Helper for Server API Request ---
const fetchGameAction = async (userPrompt: string, systemPrompt: string, token: string | undefined, feature: string = 'games') => {
  // Add a unique timestamp to the user prompt to bust any AI/server caching
  const salt = Math.random().toString(36).substring(7);
  const freshUserPrompt = `${userPrompt}\n\n[unique-id: ${Date.now()}-${salt}]`;
  
  // Slightly randomize system prompt to encourage variety
  const randomnessHints = [
    "Be creative and variety-focused.",
    "Do not repeat previous patterns.",
    "Surprise the user with something new.",
    "Focus on high entropy and unique selections."
  ];
  const hint = randomnessHints[Math.floor(Math.random() * randomnessHints.length)];
  const freshSystemPrompt = `${systemPrompt} ${hint}`;

  const resp = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      provider: 'zygai',
      model: 'llama-3.1-8b-instruct',
      feature,
      messages: [
        { role: 'user', content: freshUserPrompt }
      ],
      settings: {
        customSystemPrompt: freshSystemPrompt,
        temperature: 0.9 // Higher temperature for more variety
      }
    })
  });
  
  const contentType = resp.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await resp.text();
    console.error('Server returned non-JSON:', text);
    throw new Error(`Server Error: Received non-JSON response (${resp.status}). Check backend logs.`);
  }

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || `Game action failed: ${resp.status}`);
  }
  
  // Extract text content from message (handles object vs string responses)
  const rawContent = (typeof data.message === 'string' ? data.message : data.message?.content) || "";
  
  let thoughts = "";
  let result = rawContent;
  const thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkMatch) {
    thoughts = thinkMatch[1].trim();
    result = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }
  
  return { result, thoughts };
};

// ==================== ROCK PAPER SCISSORS ====================

const RockPaperScissors: React.FC<{ setScore: any, onEnd: (type: 'win' | 'loss' | 'draw') => void, token: string | undefined, onError: (msg: string) => void }> = ({ setScore, onEnd, token, onError }) => {
  const [userChoice, setUserChoice] = useState<string | null>(null);
  const [aiChoice, setAiChoice] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [thoughts, setThoughts] = useState<string>("");
  const [showThoughts, setShowThoughts] = useState(false);

  const choices = [
    { name: 'Rock', icon: '🪨', color: 'blue' },
    { name: 'Paper', icon: '📄', color: 'emerald' },
    { name: 'Scissors', icon: '✂️', color: 'rose' }
  ];

  const play = async (choice: string) => {
    setAnimating(true);
    setUserChoice(choice);
    setAiChoice(null);
    setResult(null);
    setThoughts("");

    try {
      const userPrompt = "Pick one: Rock, Paper, or Scissors. Return ONLY the word. Be unpredictable.";
      const systemPrompt = "You are ZygAI playing Rock Paper Scissors. Be strategic and unpredictable.";
      
      const data = await fetchGameAction(userPrompt, systemPrompt, token, 'game_rps');
      let ai = data.result;
      
      // Cleanup for direct LLM response
      const found = ['Rock', 'Paper', 'Scissors'].find(c => ai.toLowerCase().includes(c.toLowerCase()));
      ai = found || 'Rock';
      
      if (data.thoughts) setThoughts(data.thoughts);
      setAiChoice(ai);
      
      if (choice === ai) {
        setResult('draw');
        onEnd('draw');
      } else if (
        (choice === 'Rock' && ai === 'Scissors') ||
        (choice === 'Paper' && ai === 'Rock') ||
        (choice === 'Scissors' && ai === 'Paper')
      ) {
        setResult('win');
        setScore((prev: any) => ({ ...prev, user: prev.user + 1 }));
        onEnd('loss');
      } else {
        setResult('loss');
        setScore((prev: any) => ({ ...prev, ai: prev.ai + 1 }));
        onEnd('win');
      }
    } catch (e: any) {
      console.error(e);
      onError(`Rock Paper Scissors Error: ${e.message || 'Failed to get AI move'}`);
      setAnimating(false);
    } finally {
      setAnimating(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-black italic mb-2">Rock Paper Scissors</h2>
      </div>

      <div className="flex items-center gap-4 md:gap-8 mb-12">
        <div className="flex flex-col items-center gap-4">
          <div className={clsx(
            "w-32 h-32 md:w-40 md:h-40 rounded-[48px] bg-white dark:bg-ink-900 border-4 border-ink-100 dark:border-ink-800 flex items-center justify-center text-5xl md:text-6xl shadow-2xl transition-all duration-500",
            animating && "animate-bounce"
          )}>
            {userChoice ? choices.find(c => c.name === userChoice)?.icon : '👤'}
          </div>
          <span className="text-xs font-black uppercase text-ink-400">You</span>
        </div>

        <div className="text-2xl md:text-4xl font-black text-ink-200 dark:text-ink-800 italic">VS</div>

        <div className="flex flex-col items-center gap-4">
          <div className={clsx(
            "w-32 h-32 md:w-40 md:h-40 rounded-[48px] bg-white dark:bg-ink-900 border-4 border-ink-100 dark:border-ink-800 flex items-center justify-center text-5xl md:text-6xl shadow-2xl transition-all duration-500",
            animating && "animate-bounce",
            !animating && aiChoice && "ring-4 ring-rose-500/20"
          )}>
            {animating ? '🧠' : (aiChoice ? choices.find(c => c.name === aiChoice)?.icon : '🤖')}
          </div>
          <span className="text-xs font-black uppercase text-ink-400">ZygAI</span>
        </div>
      </div>

      {result && (
        <div className={clsx(
          "mb-10 px-8 py-3 rounded-full text-lg font-black uppercase tracking-widest animate-in zoom-in duration-700",
          result === 'win' && "bg-emerald-500 text-white shadow-xl shadow-emerald-500/20",
          result === 'loss' && "bg-rose-500 text-white shadow-xl shadow-rose-500/20",
          result === 'draw' && "bg-ink-200 text-ink-700 dark:bg-ink-800 dark:text-white"
        )}>
          {result === 'win' ? 'You Win!' : result === 'loss' ? 'AI Wins!' : 'Draw!'}
        </div>
      )}

      {animating && (
        <div className="mb-10">
          <ThinkingLine type="rps" />
        </div>
      )}

      {thoughts && (
        <div className="mb-10 w-full max-w-md">
           <button 
             onClick={() => setShowThoughts(!showThoughts)}
             className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-ink-400 hover:text-ink-900 dark:hover:text-white transition-colors mb-3 mx-auto bg-ink-50 dark:bg-ink-900 px-3 py-1.5 rounded-full border border-ink-200 dark:border-ink-800"
           >
             <Terminal size={12} className="text-saffron-500" />
             {showThoughts ? 'Hide Reasoning' : 'View AI Reasoning'}
           </button>
           {showThoughts && (
             <div className="p-5 bg-ink-950 text-emerald-500 font-mono text-[11px] rounded-2xl border border-ink-800 shadow-2xl leading-relaxed animate-in fade-in slide-in-from-top-2 max-h-48 overflow-y-auto custom-scrollbar">
               <div className="flex items-center gap-2 mb-2 border-b border-emerald-500/20 pb-1 text-[9px] text-emerald-500/50">
                  <Activity size={10} />
                  <span>ZYGAI STRATEGY REASONING</span>
               </div>
               {thoughts}
             </div>
           )}
        </div>
      )}

      <div className="flex gap-4">
        {choices.map((c) => (
          <button
            key={c.name}
            onClick={() => play(c.name)}
            disabled={animating}
            className="flex flex-col items-center gap-2 p-6 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl hover:scale-105 active:scale-95 transition-all shadow-sm group disabled:opacity-50 min-w-[110px]"
          >
            <span className="text-4xl transition-transform group-hover:scale-110">{c.icon}</span>
            <span className="text-[10px] font-black uppercase tracking-wider text-ink-400 group-hover:text-ink-900 dark:group-hover:text-white">{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ==================== WORD GUESS ====================

const WordGuess: React.FC<{ setScore: any, onEnd: (type: 'win' | 'loss' | 'draw') => void, token: string | undefined, onError: (msg: string) => void }> = ({ setScore, onEnd, token, onError }) => {
  const [word, setWord] = useState('');
  const [guessed, setGuessed] = useState<string[]>([]);
  const [wrong, setWrong] = useState(0);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost' | 'thinking'>('playing');
  const [thoughts, setThoughts] = useState<string>("");
  const [showThoughts, setShowThoughts] = useState(false);

  const maxTries = 6;

  const fetchWord = useCallback(async () => {
    setStatus('thinking');
    setThoughts("");
    
    try {
      const userPrompt = "Pick a secret English word (5-8 letters). Return ONLY the word in uppercase.";
      const systemPrompt = "You are ZygAI thinking of a secret word for a guessing game. Use common but interesting words.";
      
      const data = await fetchGameAction(userPrompt, systemPrompt, token, 'game_word_guess');
      let result = data.result;

      result = result.split(/\s+/)[0].replace(/[^A-Z]/gi, '').toUpperCase();
      if (!result) result = "ZYGAI";
      
      if (data.thoughts) setThoughts(data.thoughts);
      setWord(result);
      setGuessed([]);
      setWrong(0);
      setStatus('playing');
    } catch (e: any) {
      console.error(e);
      onError(`Word Guess Error: ${e.message || 'Failed to generate word'}`);
      setWord("ZYGAI");
      setStatus('playing');
    }
  }, [token, onError]);

  useEffect(() => {
    fetchWord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guess = (letter: string) => {
    if (guessed.includes(letter) || status !== 'playing') return;
    
    setGuessed([...guessed, letter]);
    if (!word.includes(letter)) {
      const newWrong = wrong + 1;
      setWrong(newWrong);
      if (newWrong >= maxTries) {
        setStatus('lost');
        setScore((prev: any) => ({ ...prev, ai: prev.ai + 1 }));
        onEnd('win');
      }
    } else {
      const isWon = word.split('').every(l => [...guessed, letter].includes(l));
      if (isWon) {
        setStatus('won');
        setScore((prev: any) => ({ ...prev, user: prev.user + 1 }));
        onEnd('loss');
      }
    }
  };

  const keyboardRows = [
    'QWERTYUIOP'.split(''),
    'ASDFGHJKL'.split(''),
    'ZXCVBNM'.split('')
  ];

  if (status === 'thinking') {
    return (
      <div className="flex flex-col items-center gap-12 py-20">
        <div className="relative">
          <RefreshCw className="animate-spin text-saffron-500 opacity-20" size={80} />
          <Bot className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-saffron-500" size={32} />
        </div>
        <ThinkingLine type="word-guess" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-black italic mb-2">Word Guess</h2>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-12 px-4">
        {word.split('').map((l, i) => {
          const isGuessed = guessed.includes(l);
          const hasLost = status === 'lost';
          
          return (
            <div key={i} className={clsx(
              "w-10 h-14 md:w-12 md:h-16 rounded-xl border-2 flex items-center justify-center text-xl md:text-2xl font-black transition-all",
              isGuessed ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-white dark:bg-ink-900 border-ink-100 dark:border-ink-800 text-transparent",
              hasLost && !isGuessed && "bg-rose-100 dark:bg-rose-900/20 border-rose-500 text-rose-500 !text-rose-500"
            )}>
              {isGuessed || hasLost ? l : ''}
            </div>
          );
        })}
      </div>

      <div className="mb-10 flex items-center gap-4">
        <span className="text-[10px] md:text-xs font-black uppercase text-ink-400">Tries left</span>
        <div className="flex gap-1">
          {Array(maxTries).fill(0).map((_, i) => (
            <div key={i} className={clsx(
              "w-3 h-3 md:w-4 md:h-4 rounded-full border-2",
              i < maxTries - wrong ? "bg-saffron-400 border-saffron-400 shadow-lg shadow-saffron-500/20" : "bg-ink-100 dark:bg-ink-800 border-ink-200 dark:border-ink-700"
            )} />
          ))}
        </div>
      </div>

      {thoughts && (
        <div className="mb-10 w-full max-w-md">
           <button 
             onClick={() => setShowThoughts(!showThoughts)}
             className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-ink-400 hover:text-ink-900 dark:hover:text-white transition-colors mb-3 mx-auto bg-ink-50 dark:bg-ink-900 px-3 py-1.5 rounded-full border border-ink-200 dark:border-ink-800"
           >
             <Terminal size={12} className="text-emerald-500" />
             {showThoughts ? 'Hide Reasoning' : 'View AI Reasoning'}
           </button>
           {showThoughts && (
             <div className="p-5 bg-ink-950 text-emerald-400 font-mono text-[11px] rounded-2xl border border-ink-800 shadow-2xl leading-relaxed animate-in fade-in slide-in-from-top-2 max-h-48 overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-2 mb-2 border-b border-emerald-500/20 pb-1 text-[9px] text-emerald-500/50">
                  <Activity size={10} />
                  <span>ZYGAI LINGUISTIC ANALYTICS</span>
               </div>
               {thoughts}
             </div>
           )}
        </div>
      )}

      {status !== 'playing' && (
        <div className="flex flex-col items-center gap-4 mb-10">
          {status === 'lost' && (
            <p className="text-sm font-black text-rose-500 uppercase tracking-widest animate-bounce">
              The word was: <span className="underline decoration-wavy underline-offset-4">{word}</span>
            </p>
          )}
          <button 
            onClick={fetchWord}
            className={clsx(
              "flex items-center gap-2 px-8 py-3 font-black rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl",
              status === 'won' ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
            )}
          >
            {status === 'won' ? 'You Found it! Play Again' : 'Try Again'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 w-full max-w-lg items-center">
        {keyboardRows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex gap-1 md:gap-2">
            {row.map(l => (
              <button
                key={l}
                onClick={() => guess(l)}
                disabled={guessed.includes(l) || status !== 'playing'}
                className={clsx(
                  "w-8 h-10 md:w-11 md:h-12 rounded-lg text-xs md:text-sm font-black transition-all shadow-sm",
                  guessed.includes(l) 
                    ? (word.includes(l) ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" : "bg-ink-100 dark:bg-ink-800 text-ink-300")
                    : "bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 hover:border-saffron-400 dark:text-white"
                )}
              >
                {l}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== MATH DUEL ====================

const MathDuel: React.FC<{ setScore: any, onEnd: (type: 'win' | 'loss' | 'draw') => void, token: string | undefined, onError: (msg: string) => void }> = ({ setScore, onEnd, token, onError }) => {
  const [problem, setProblem] = useState({ q: '', a: 0 });
  const [input, setInput] = useState('');
  const [timeLeft, setTimeLeft] = useState(15);
  const [status, setStatus] = useState<'playing' | 'ended' | 'thinking'>('thinking');
  const [streak, setStreak] = useState(0);
  const [thoughts, setThoughts] = useState<string>("");
  const [showThoughts, setShowThoughts] = useState(false);

  const FALLBACKS = [
    { q: "15 + 7", a: 22 },
    { q: "40 - 12", a: 28 },
    { q: "9 * 3", a: 27 },
    { q: "100 / 4", a: 25 },
    { q: "55 + 45", a: 100 },
    { q: "12 * 5", a: 60 }
  ];

  const fetchProblem = useCallback(async () => {
    setStatus('thinking');
    setThoughts("");

    try {
      const userPrompt = "Generate a random arithmetic expression (addition, subtraction, multiplication, or division) in JSON format: {\"q\": \"expression\", \"a\": number}. Use integers only. NO ALGEBRA. NO VARIABLES. NO solving for x.";
      const systemPrompt = "You are ZygAI generating simple arithmetic math problems. Output ONLY the raw JSON object. Do not include markdown code blocks.";
      
      const data = await fetchGameAction(userPrompt, systemPrompt, token, 'game_math_duel');
      let result = data.result;

      try {
        // More robust JSON extraction
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result);
        if (!parsed.q || typeof parsed.a !== 'number') throw new Error('Invalid JSON structure');
        result = parsed;
      } catch (e) {
        result = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
      }
      
      if (data.thoughts) setThoughts(data.thoughts);
      setProblem(result);
      setTimeLeft(15);
      setStatus('playing');
    } catch (e: any) {
      console.error(e);
      onError(`Math Duel Error: ${e.message || 'Failed to fetch problem'}`);
      setProblem(FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)]);
      setTimeLeft(15);
      setStatus('playing');
    }
  }, [token, onError]);

  useEffect(() => {
    fetchProblem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== 'playing') return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setStatus('ended');
          setScore((s: any) => ({ ...s, ai: s.ai + 1 }));
          onEnd('win');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status, setScore, onEnd]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parseInt(input) === problem.a) {
      setStreak(s => s + 1);
      setInput('');
      fetchProblem();
    } else {
      setStatus('ended');
      setScore((s: any) => ({ ...s, ai: s.ai + 1 }));
      onEnd('win');
    }
  };

  const reset = () => {
    setStreak(0);
    setInput('');
    fetchProblem();
  };

  if (status === 'thinking' && streak === 0) {
    return (
      <div className="flex flex-col items-center gap-12 py-20">
        <div className="relative">
          <RefreshCw className="animate-spin text-indigo-500 opacity-20" size={80} />
          <Calculator className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-500" size={32} />
        </div>
        <ThinkingLine type="math-duel" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full">
      <div className="mb-10 text-center px-4">
        <h2 className="text-3xl font-black italic mb-2">Math Duel</h2>
      </div>

      <div className="relative w-full max-w-sm aspect-video bg-white dark:bg-ink-900 rounded-[40px] border-4 border-ink-100 dark:border-ink-800 shadow-2xl flex flex-col items-center justify-center p-8 mb-12">
        {status === 'playing' || (status === 'thinking' && streak > 0) ? (
          <>
            <div className="absolute top-8 right-8 flex items-center gap-2">
               <Star className="text-saffron-500 fill-saffron-500" size={16} />
               <span className="font-black text-ink-900 dark:text-white">{streak}</span>
            </div>
            <div className={clsx(
              "text-5xl font-black mb-8 transition-colors",
              timeLeft <= 3 ? "text-rose-500 animate-pulse" : "text-ink-900 dark:text-white",
              status === 'thinking' && "opacity-50"
            )}>
              {problem.q}
            </div>
            <form onSubmit={handleSubmit} className="w-full">
              <input
                autoFocus
                disabled={status === 'thinking'}
                type="number"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="?"
                className="w-full bg-ink-50 dark:bg-ink-900 rounded-2xl px-6 py-4 text-2xl font-black text-center outline-none focus:ring-4 focus:ring-saffron-500/20 transition-all dark:text-white shadow-inner"
              />
            </form>
            <div className="absolute bottom-0 left-0 w-full h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
               <div 
                 className={clsx("h-full transition-all duration-1000", timeLeft <= 3 ? "bg-rose-500" : "bg-saffron-500")}
                 style={{ width: `${(timeLeft / 15) * 100}%` }}
               />
            </div>
          </>
        ) : (
          <div className="text-center animate-in zoom-in duration-700">
             <Trophy className="mx-auto text-saffron-500 mb-4" size={48} />
             <h3 className="text-2xl font-black text-ink-900 dark:text-white mb-2">Duel Ended</h3>
             <p className="text-ink-500 dark:text-ink-400 mb-6 font-bold italic">Streak of {streak}!</p>
             <button 
                onClick={reset}
                className="px-8 py-3 bg-ink-900 dark:bg-white text-white dark:text-black font-black rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl"
             >
               Try Again
             </button>
          </div>
        )}
      </div>

      {thoughts && (
        <div className="mb-10 w-full max-w-md mx-auto">
           <button 
             onClick={() => setShowThoughts(!showThoughts)}
             className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-ink-400 hover:text-ink-900 dark:hover:text-white transition-colors mb-3 mx-auto bg-ink-50 dark:bg-ink-900 px-3 py-1.5 rounded-full border border-ink-200 dark:border-ink-800"
           >
             <Terminal size={12} className="text-blue-500" />
             {showThoughts ? 'Hide Reasoning' : 'View AI Reasoning'}
           </button>
           {showThoughts && (
             <div className="p-5 bg-ink-950 text-blue-400 font-mono text-[11px] rounded-2xl border border-ink-800 shadow-2xl leading-relaxed animate-in fade-in slide-in-from-top-2 max-h-48 overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-2 mb-2 border-b border-blue-500/20 pb-1 text-[9px] text-blue-500/50">
                  <Activity size={10} />
                  <span>ZYGAI CALCULATION ENGINE</span>
               </div>
               {thoughts}
             </div>
           )}
        </div>
      )}
    </div>
  );
};

// ==================== I SPY (ZYGAI STYLE) ====================

const ISpy: React.FC<{ setScore: any, onEnd: (type: 'win' | 'loss' | 'draw') => void, token: string | undefined, onError: (msg: string) => void }> = ({ setScore, onEnd, token, onError }) => {
  const [round, setRound] = useState(1);
  const [item, setItem] = useState<{ clue: string, options: { label: string, text: string }[], correct: string }>({ 
    clue: '...', options: [], correct: '' 
  });
  const [status, setStatus] = useState<'thinking' | 'playing' | 'reacting' | 'ended'>('thinking');
  const [reaction, setReaction] = useState("");
  const [isCompilingJoke, setIsCompilingJoke] = useState(false);
  const [thoughts, setThoughts] = useState("");
  const [showThoughts, setShowThoughts] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const fetchItem = useCallback(async (roundNum: number) => {
    setStatus('thinking');
    setThoughts("");
    setSelectedOption(null);
    setReaction("");
    setIsCompilingJoke(false);

    try {
      const userPrompt = `Round ${roundNum}/10. Think of a secret object and a short clue ("I see something..."). 
      Provide 4 funny options (A, B, C, D). Reference Brother Bear humor (everything is a tree) if you want. 
      Return JSON: {"clue": "...", "options": [{"label": "A", "text": "..."}, ...], "correct": "A"}`;
      
      const systemPrompt = "You are ZygAI playing a funny version of 'I Spy'. Be witty, a bit smug, and obsessed with trees if it's funny. Output ONLY raw JSON.";
      
      const data = await fetchGameAction(userPrompt, systemPrompt, token, 'game_i_spy');
      let result = data.result;

      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result);
        setItem(parsed);
      } catch (e) {
        setItem({
          clue: "something green and wooden.",
          options: [
            { label: "A", text: "A very tall tree" },
            { label: "B", text: "A slightly shorter tree" },
            { label: "C", text: "A rock (Wait, that's not a tree)" },
            { label: "D", text: "A Tree (Definitely this one)" }
          ],
          correct: "D"
        });
      }
      
      if (data.thoughts) setThoughts(data.thoughts);
      setStatus('playing');
    } catch (e: any) {
      onError(`I Spy Error: ${e.message}`);
      setStatus('playing');
    }
  }, [token, onError]);

  useEffect(() => {
    fetchItem(round);
  }, [round, fetchItem]);

  const handleGuess = async (label: string) => {
    if (status !== 'playing') return;
    setSelectedOption(label);
    setStatus('reacting');
    setIsCompilingJoke(true);

    const isCorrect = label === item.correct;
    if (isCorrect) setScore((s: any) => ({ ...s, user: s.user + 1 }));
    else setScore((s: any) => ({ ...s, ai: s.ai + 1 }));

    try {
      const userPrompt = `User guessed ${label} (${item.options.find(o => o.label === label)?.text}). The correct answer was ${item.correct}. Give a short funny reaction.`;
      const systemPrompt = "You are ZygAI. React to the user's guess in 'I Spy'. Stay in character.";
      const data = await fetchGameAction(userPrompt, systemPrompt, token, 'game_misc');
      setReaction(data.result.replace(/^"|"$/g, ''));
    } catch (e) {
      setReaction(isCorrect ? "Correct! It was obviously a tree. Or something like it." : "Wrong! How could you miss the obvious tree-ness of it?");
    } finally {
      setIsCompilingJoke(false);
    }
  };

  const nextRound = () => {
    if (round < 10) {
      setRound(prev => prev + 1);
    } else {
      setStatus('ended');
      onEnd('draw'); // Just for the quote
    }
  };

  if (status === 'thinking') {
    return (
      <div className="flex flex-col items-center gap-12 py-20">
        <div className="relative">
          <RefreshCw className="animate-spin text-indigo-500 opacity-20" size={80} />
          <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-500" size={32} />
        </div>
        <ThinkingLine type="i-spy" />
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div className="text-center animate-in zoom-in duration-700 py-10">
        <Trophy className="mx-auto text-saffron-500 mb-4" size={64} />
        <h3 className="text-3xl font-black text-ink-900 dark:text-white mb-2">Game Over!</h3>
        <p className="text-ink-500 dark:text-ink-400 mb-8 font-bold italic text-lg">You survived ZygAI's perspective.</p>
        <button 
          onClick={() => { setRound(1); setStatus('thinking'); }}
          className="px-10 py-4 bg-indigo-600 text-white font-black rounded-3xl hover:scale-105 active:scale-95 transition-all shadow-xl"
        >
          Play Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full px-2 md:px-4">
      <div className="mb-6 md:mb-8 text-center max-w-lg">
        <div className="inline-block px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 text-[10px] font-black uppercase tracking-widest mb-3 md:mb-4">
          Round {round} / 10
        </div>
        <h2 className="text-2xl md:text-3xl font-black italic mb-2">I Spy...</h2>
        <p className="text-lg md:text-xl font-bold text-ink-700 dark:text-ink-300 italic leading-snug">
          "{item.clue}"
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 w-full max-w-lg mb-8 md:mb-10">
        {item.options.map((opt) => (
          <button
            key={opt.label}
            onClick={() => handleGuess(opt.label)}
            disabled={status === 'reacting'}
            className={clsx(
              "p-4 md:p-6 rounded-[20px] md:rounded-[24px] border-2 text-left transition-all relative overflow-hidden group",
              selectedOption === opt.label 
                ? (opt.label === item.correct ? "bg-emerald-500 border-emerald-500 text-white" : "bg-rose-500 border-rose-500 text-white")
                : "bg-white dark:bg-ink-900 border-ink-100 dark:border-ink-800 hover:border-indigo-400 dark:hover:border-indigo-500"
            )}
          >
            <span className={clsx(
              "inline-block w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center font-black text-xs md:text-sm mb-2 md:mb-3",
              selectedOption === opt.label ? "bg-white/20" : "bg-ink-100 dark:bg-ink-800 text-ink-500"
            )}>
              {opt.label}
            </span>
            <p className="font-bold text-xs md:text-base leading-tight md:leading-snug">{opt.text}</p>
          </button>
        ))}
      </div>

      {status === 'reacting' && (
        <div className="flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500 w-full max-w-md pb-8">
          <div className="bg-ink-900 dark:bg-white text-white dark:text-black p-4 md:p-5 rounded-3xl shadow-2xl relative w-full border-2 border-indigo-500">
             <Bot size={24} className="absolute -top-3 -left-3 text-saffron-500" />
             {isCompilingJoke ? (
                <div className="flex items-center gap-3 text-sm font-bold italic py-1">
                   <RefreshCw size={16} className="animate-spin text-indigo-500" />
                   <span>Compiling a joke...</span>
                </div>
             ) : (
                <p className="text-sm font-bold italic">"{reaction}"</p>
             )}
          </div>
          {!isCompilingJoke && (
            <button 
              onClick={nextRound}
              className="flex items-center gap-2 px-8 py-3 bg-indigo-500 text-white font-black rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg"
            >
              {round < 10 ? 'Next Round' : 'Finish Game'} <ChevronRight size={18} />
            </button>
          )}
        </div>
      )}

      {thoughts && status === 'playing' && (
        <div className="mt-8 w-full max-w-md mx-auto">
           <button 
             onClick={() => setShowThoughts(!showThoughts)}
             className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-ink-400 hover:text-ink-900 dark:hover:text-white transition-colors mb-3 mx-auto bg-ink-50 dark:bg-ink-900 px-3 py-1.5 rounded-full border border-ink-200 dark:border-ink-800"
           >
             <Terminal size={12} className="text-indigo-500" />
             {showThoughts ? 'Hide Mystery' : 'View AI Vision Log'}
           </button>
           {showThoughts && (
             <div className="p-5 bg-ink-950 text-indigo-400 font-mono text-[11px] rounded-2xl border border-ink-800 shadow-2xl leading-relaxed animate-in fade-in slide-in-from-top-2 max-h-48 overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-2 mb-2 border-b border-indigo-500/20 pb-1 text-[9px] text-indigo-500/50">
                  <Activity size={10} />
                  <span>ZYGAI VISION BUFFER</span>
               </div>
               {thoughts}
             </div>
           )}
        </div>
      )}
    </div>
  );
};

export default GamesArea;
