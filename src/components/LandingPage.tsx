import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Music,
  Gamepad2,
  MapPin,
  KeyRound,
  GraduationCap,
  MessageCircle,
  Zap,
  Shield,
  Globe,
  Rocket,
  ArrowRight,
  CheckCircle,
  Mail,
  Activity,
  Layers,
  Code2,
  Brain,
  Server
} from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';
import BirthdayCountdown from './BirthdayCountdown';

interface LandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin }) => {
  const [healthOpen, setHealthOpen] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<any>(null);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | 'credits' | null>(null);
  const [showCookieBanner, setShowCookieBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('zygai:cookie_consent');
    if (!consent) {
      setShowCookieBanner(true);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem('zygai:cookie_consent', 'true');
    setShowCookieBanner(false);
  };

  const getMcpStatusStyles = (status: string) => {
    switch ((status || 'connected').toLowerCase()) {
      case 'healthy':
      case 'connected':
        return 'bg-emerald-100 text-emerald-700';
      case 'disabled':
        return 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400';
      default:
        return 'bg-rose-100 text-rose-700';
    }
  };

  const loadHealth = async (forceRefresh = false) => {
    setHealthLoading(true);
    setHealthError(null);

    const CACHE_KEY = 'zygai:health_data';
    const CACHE_TIME_KEY = 'zygai:health_last_checked';
    const FIVE_HOURS = 5 * 60 * 60 * 1000;
    const now = Date.now();

    if (forceRefresh !== true) {
      const lastChecked = localStorage.getItem(CACHE_TIME_KEY);
      const cachedData = localStorage.getItem(CACHE_KEY);

      if (cachedData && lastChecked && now - parseInt(lastChecked) < FIVE_HOURS) {
        setHealthData(JSON.parse(cachedData));
        setHealthLoading(false);
        return;
      }
    }

    try {
      const apiProviders = JSON.parse(localStorage.getItem('zygai:api_providers') || '[]');
      let apiToolServers = JSON.parse(localStorage.getItem('zygai:mcp_servers') || '[]');

      // Fetch MCP servers directly from the API (matching AppsArea.tsx) if authenticated
      const token = localStorage.getItem('zygai:token');
      if (token) {
        try {
          const user = JSON.parse(localStorage.getItem('zygai:user') || '{}');
          const endpoint = user?.role === 'admin' ? '/admin/mcp-servers' : '/mcp-servers?enabled=true';
          const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            const fetchedServers = Array.isArray(data) ? data : data.servers || data.apiToolServers || [];
            if (fetchedServers.length > 0) {
              apiToolServers = fetchedServers;
            }
          }
        } catch (err) {
          console.warn('Could not fetch MCPs from API, falling back to local settings.', err);
        }
      }

      // Ping Main API (Use the active model provider's Base URL or default to API_BASE)
      const mainProvider = apiProviders.find((p: any) => p.enabled && p.baseUrl);
      const mainUrl = mainProvider ? mainProvider.baseUrl : API_BASE;
      let mainOk = false;
      try {
        const res = await fetch(mainUrl, { mode: 'no-cors' }).catch(() => null);
        mainOk = res !== null;
      } catch (e) {
        mainOk = false;
      }

      // Ping Exa Search
      let exaOk = false;
      try {
        const res = await fetch('https://exa.ai/favicon.ico', { mode: 'no-cors' }).catch(() => null);
        exaOk = res !== null;
      } catch (e) {
        exaOk = false;
      }

      const data = {
        mainServer: { ok: mainOk, baseUrl: mainUrl },
        exa: { ok: exaOk, baseUrl: 'https://api.exa.ai' },
        apiToolServers
      };

      setHealthData(data);
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIME_KEY, now.toString());
    } catch (error) {
      setHealthError(error instanceof Error ? error.message : 'Health check failed.');
    } finally {
      setHealthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-ink-900 dark:bg-ink-950 dark:text-ink-50 selection:bg-saffron-200 selection:text-ink-900">
      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full border-b border-ink-100/50 bg-white/80 backdrop-blur-md dark:border-ink-800/50 dark:bg-ink-900/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-saffron-400 to-saffron-500 text-ink-900 shadow-glow">
              <Sparkles size={18} strokeWidth={2.5} />
            </div>
            <span className="font-display text-xl font-bold tracking-tight">ZygAI</span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm font-medium text-ink-500 transition hover:text-saffron-500 dark:text-ink-400">Features</a>
            <a href="#pricing" className="text-sm font-medium text-ink-500 transition hover:text-saffron-500 dark:text-ink-400">Pricing</a>
            <a href="/blog" className="text-sm font-medium text-ink-500 transition hover:text-saffron-500 dark:text-ink-400">Blog</a>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={onLogin}
              className="text-sm font-bold uppercase tracking-widest text-ink-600 transition hover:text-saffron-500 dark:text-ink-300"
            >
              Sign In
            </button>
            <button 
              onClick={onGetStarted}
              className="rounded-full bg-ink-900 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-ink-700 dark:bg-saffron-400 dark:text-ink-900 dark:hover:bg-saffron-500 shadow-lg shadow-saffron-500/10"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
        <div className="absolute top-0 left-1/2 -z-10 h-[600px] w-full -translate-x-1/2 opacity-20 blur-[120px] bg-gradient-to-b from-saffron-400 to-transparent"></div>
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-saffron-200 bg-saffron-50 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-saffron-600 dark:border-saffron-900/30 dark:bg-saffron-950/30 dark:text-saffron-400 mb-8 animate-floatIn">
              <Sparkles size={14} className="fill-current" />
              ZygAI 4.1 — Summer Update
            </div>
            <h1 className="max-w-4xl font-display text-5xl font-bold tracking-tight md:text-7xl mb-8 animate-floatIn" style={{ animationDelay: '0.1s' }}>
              Welcome to your <span className="text-transparent bg-clip-text bg-gradient-to-r from-saffron-500 to-saffron-600">Summer Creativity</span>
            </h1>
            <p className="max-w-2xl text-lg text-ink-600 dark:text-ink-300 mb-10 animate-floatIn" style={{ animationDelay: '0.2s' }}>
              Experience the Summer Creativity & Learning Update. Now with AI music generation, AI Learning with quizzes & flashcards, and expanded MCP integrations. Create, learn, and build with the most powerful models — all in one place.
            </p>

            <div className="max-w-md w-full animate-floatIn" style={{ animationDelay: '0.25s' }}>
              <BirthdayCountdown />
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 animate-floatIn" style={{ animationDelay: '0.3s' }}>
              <button 
                onClick={onGetStarted}
                className="group flex items-center gap-2 rounded-full bg-ink-900 px-8 py-4 text-sm font-bold text-white transition hover:bg-ink-700 dark:bg-saffron-400 dark:text-ink-900 dark:hover:bg-saffron-500 shadow-2xl shadow-saffron-500/20"
              >
                Start Chatting Now
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </button>
              <a href="#features" className="px-8 py-4 text-sm font-bold text-ink-500 transition hover:text-ink-900 dark:hover:text-ink-50">
                Explore Features
              </a>
            </div>
          </div>
          
          {/* Mockup Preview */}
          <div className="mt-12 sm:mt-20 rounded-3xl border border-ink-100 bg-white/50 p-2 shadow-2xl dark:border-ink-800 dark:bg-ink-900/50 backdrop-blur-sm animate-floatIn" style={{ animationDelay: '0.4s' }}>
            <div className="rounded-2xl border border-ink-100 bg-white overflow-hidden shadow-inner dark:border-ink-800 dark:bg-ink-950 aspect-[16/9]">
              <img
                src="/photos/zygailanding.PNG"
                alt="ZygAI Workspace Interface"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-ink-50/50 dark:bg-ink-900/20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <h2 className="font-display text-3xl font-bold md:text-4xl mb-4">Everything you need</h2>
            <p className="text-ink-500 dark:text-ink-400">Powerful tools designed for the modern AI workflow.</p>
          </div>
          
          <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: <Music size={24} />,
                title: "ZygMusic — AI Music Generation",
                desc: "Generate original music from a text prompt using Google Lyria 3 Pro. Create cinematic, lo-fi, jazz, electronic and more — instantly.",
                isNew: true
              },
              {
                icon: <KeyRound size={24} />,
                title: "ZygAI API",
                desc: "Access ZygAI programmatically with our developer API. Build integrations, automate workflows, and embed AI into your own apps.",
                isNew: true
              },
              {
                icon: <Gamepad2 size={24} />,
                title: "Games — Play vs ZygAI",
                desc: "Challenge ZygAI in classic games like Rock Paper Scissors, Word Guess, Math Duel and more. Play solo or go head-to-head with the AI.",
                isNew: true
              },
              {
                icon: <MapPin size={24} />,
                title: "Ask ZygAI for Places",
                desc: "Ask ZygAI to find restaurants, attractions, or local spots near you. Get smart, context-aware place recommendations instantly.",
                isNew: true
              },
              {
                icon: <GraduationCap size={24} />,
                title: "AI Learning",
                desc: "Learn anything with AI-generated Quizzes and Flashcards. Pick a topic, choose your format, and start studying — powered by ZygAI.",
                isNew: true
              },
              {
                icon: <Layers size={24} />,
                title: "Custom Skills & Marketplace",
                desc: "ZygAI 3.7 exclusive: Build personal knowledge bases or explore community-created agents."
              },
              {
                icon: <Zap size={24} />,
                title: "Real-time Streaming",
                desc: "Watch responses appear token by token for natural, interactive conversations."
              },
              {
                icon: <Code2 size={24} />,
                title: "Code Interpreter",
                desc: "Execute code in a secure sandbox. Run Python, JavaScript, and more with instant results."
              },
              {
                icon: <Brain size={24} />,
                title: "Vibe Coder",
                desc: "AI-powered code generation and assistance with intelligent context awareness and project-specific insights."
              },
              {
                icon: <Globe size={24} />,
                title: "Multi-Model Access",
                desc: "Switch between the latest models from OpenAI, Anthropic, and local Llama instances effortlessly."
              },
              {
                icon: <Shield size={24} />,
                title: "Private & Secure",
                desc: "Your conversations are yours. We prioritize privacy and security in every part of the stack."
              },
              {
                icon: <Server size={24} />,
                title: "Dedicated Infrastructure",
                desc: <>ZygAI has its own robust infrastructure, proudly powered by <a href="https://obsidianhost.net" target="_blank" rel="noopener noreferrer" className="text-saffron-500 hover:underline transition-colors">ObsidianHost</a>.</>
              },
              {
                icon: <Sparkles size={24} />,
                title: "Beautiful Interface",
                desc: "A premium, distraction-free design that lets you focus on your ideas and the AI's intelligence."
              },
              {
                icon: <Rocket size={24} />,
                title: "Pre-release Functions",
                desc: "Be the first to test new AI capabilities and integrations as they are developed."
              },
              {
                icon: <Brain size={24} />,
                title: "Smart Title Generation",
                desc: "AI automatically generates meaningful chat titles from your conversation content."
              }
            ].map((f, i) => (
              <div key={i} className="group relative rounded-3xl border border-ink-100 bg-white p-8 transition hover:border-saffron-300 dark:border-ink-800 dark:bg-ink-900/50">
                {f.isNew && (
                  <span className="absolute top-4 right-4 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white shadow-sm">New</span>
                )}
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-saffron-100 text-saffron-600 dark:bg-saffron-900/40 dark:text-saffron-400 group-hover:scale-110 transition-transform">
                  {f.icon}
                </div>
                <h3 className="mb-3 font-display text-xl font-bold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-ink-500 dark:text-ink-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <h2 className="font-display text-3xl font-bold md:text-4xl mb-4">Simple, transparent pricing</h2>
            <p className="text-ink-500 dark:text-ink-400">Scale your intelligence as your needs grow.</p>
          </div>

          <div className="grid gap-8 md:grid-cols-3 items-start">
            {/* Free Plan */}
            <div className="flex flex-col rounded-3xl border border-ink-100 dark:border-ink-800 p-8">
              <h3 className="font-display text-lg font-bold mb-2">Free</h3>
              <div className="mb-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">0€</span>
                <span className="text-ink-500">/mo</span>
              </div>
              <p className="text-sm text-ink-500 dark:text-ink-400 mb-8">Perfect for exploring ZygAI capabilities.</p>
               <ul className="mb-8 flex-1 space-y-4">
                {['Standard ZygAI models', 'Web search access', 'Standard response time'].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm font-medium">
                    <CheckCircle size={18} className="text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <button onClick={onGetStarted} className="w-full rounded-2xl border border-ink-200 py-3 text-sm font-bold transition hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-900">
                Current Plan
              </button>
            </div>

             {/* Go Plan */}
             <div className="flex flex-col rounded-3xl border border-ink-100 bg-ink-50/50 dark:border-ink-800 dark:bg-ink-900/50 p-8 shadow-xl">
               <h3 className="font-display text-lg font-bold mb-2">ZygAI Go</h3>
               <div className="mb-6 flex items-baseline gap-1">
                 <span className="text-4xl font-bold tracking-tight">7€</span>
                 <span className="text-ink-500">/mo</span>
               </div>
               <p className="text-sm text-ink-500 dark:text-ink-400 mb-8">Full access for creative professionals.</p>
               <ul className="mb-8 flex-1 space-y-4">
                 {['Everything in Free', 'Access to all models', 'Higher message limits', 'Bigger memory', 'Priority response', 'Code interpreter'].map((f, i) => (
                   <li key={i} className="flex items-center gap-3 text-sm font-medium">
                     <CheckCircle size={18} className="text-saffron-500" />
                     {f}
                   </li>
                 ))}
               </ul>
               <button onClick={onGetStarted} className="w-full rounded-2xl bg-ink-900 py-3 text-sm font-bold text-white transition hover:bg-ink-700 dark:bg-saffron-400 dark:text-ink-900 dark:hover:bg-saffron-500 shadow-lg shadow-saffron-500/20">
                 Get Started
               </button>
             </div>

            {/* Plus Plan */}
            <div className="flex flex-col rounded-3xl border-2 border-saffron-400 p-8 relative">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-saffron-400 px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-ink-900">Recommended</div>
              <h3 className="font-display text-lg font-bold mb-2">ZygAI Plus</h3>
              <div className="mb-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">15€</span>
                <span className="text-ink-500">/mo</span>
              </div>
              <p className="text-sm text-ink-500 dark:text-ink-400 mb-8">Maximum power for advanced workflows.</p>
               <ul className="mb-8 flex-1 space-y-4">
                {['Everything in Go', 'Advanced reasoning models', 'Highest usage limits', 'Pre-release features', 'Priority support', 'Advanced code interpreter'].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm font-medium">
                    <CheckCircle size={18} className="text-saffron-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <button onClick={onGetStarted} className="w-full rounded-2xl bg-saffron-400 py-3 text-sm font-bold text-ink-900 transition hover:bg-saffron-500 shadow-lg shadow-saffron-500/20">
                Get Plus
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-100 dark:border-ink-800 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col md:flex-row justify-between items-start gap-12">
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-saffron-400 to-saffron-500 text-ink-900 shadow-glow" aria-hidden="true">
                  <Sparkles size={16} strokeWidth={2.5} />
                </div>
                <span className="font-display text-lg font-bold tracking-tight">ZygAI</span>
              </div>
              <p className="text-sm text-ink-500 dark:text-ink-400 max-w-xs">Elevating human potential through accessible, powerful, and private artificial intelligence.</p>
              <div className="flex items-center gap-4">
                <a href="https://discord.gg/uNzQDatrRr" target="_blank" rel="noopener noreferrer" className="text-ink-400 hover:text-saffron-500 transition-colors" aria-label="Join our Discord"><MessageCircle size={18} aria-hidden="true" /></a>
                <a href="mailto:zygimantas@zygvlogs.site" className="text-ink-400 hover:text-saffron-500 transition-colors" aria-label="Email support"><Mail size={18} aria-hidden="true" /></a>
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-12">
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">Product</h4>
                <ul className="space-y-2 text-sm text-ink-500 dark:text-ink-400">
                  <li><a href="#features" className="hover:text-saffron-500">Features</a></li>
                  <li><a href="#pricing" className="hover:text-saffron-500">Pricing</a></li>
                  <li><a href="/blog" className="hover:text-saffron-500">Blog</a></li>
                </ul>
              </div>
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">Support</h4>
                <ul className="space-y-2 text-sm text-ink-500 dark:text-ink-400">
                  <li>
                    <button 
                      onClick={() => {
                        setHealthOpen(true);
                        loadHealth();
                      }}
                      className="hover:text-saffron-500 text-left"
                    >
                      ZygAI Health
                    </button>
                  </li>
                  <li><a href="mailto:zygimantas@zygvlogs.site" className="hover:text-saffron-500">Contact</a></li>
                </ul>
              </div>
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">Legal</h4>
                <ul className="space-y-2 text-sm text-ink-500 dark:text-ink-400">
                  <li><button onClick={() => setLegalModal('privacy')} className="hover:text-saffron-500 text-left">Privacy</button></li>
                  <li><button onClick={() => setLegalModal('terms')} className="hover:text-saffron-500 text-left">Terms</button></li>
                  <li><button onClick={() => setLegalModal('credits')} className="hover:text-saffron-500 text-left">Credits</button></li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="mt-12 pt-8 border-t border-ink-100 dark:border-ink-800 text-center text-[10px] font-bold uppercase tracking-widest text-ink-400">
            <p>&copy; {new Date().getFullYear()} ZygMediaGroup. All rights reserved.</p>
            <p className="mt-2 opacity-60">Made in Babrai, Lithuania</p>
          </div>
        </div>
      </footer>

      {healthOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm"
          onClick={() => setHealthOpen(false)}
        >
          <div 
            className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-ink-200 bg-white p-5 shadow-xl dark:border-ink-700 dark:bg-ink-900 animate-floatIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-saffron-500" />
                <p className="text-sm font-semibold text-ink-700 dark:text-ink-100">
                  ZygAI Health Status
                </p>
              </div>
              <button
                onClick={() => setHealthOpen(false)}
                className="text-xs uppercase tracking-[0.2em] text-ink-400 hover:text-ink-600 dark:hover:text-ink-300"
              >
                Close
              </button>
            </div>
            {healthLoading && (
              <div className="mt-6 flex justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-saffron-500 border-t-transparent"></div>
              </div>
            )}
            {healthError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                {healthError}
              </div>
            )}
            {healthData && !healthLoading && (
              <div className="mt-4 grid gap-3 text-xs text-ink-600 dark:text-ink-100">
                <div className="flex items-center justify-between p-2 rounded-lg bg-ink-50 dark:bg-ink-800/50">
                  <span className="font-medium">Main API</span>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                      healthData.mainServer?.ok
                        ? 'bg-emerald-100 text-emerald-700'
                        : healthData.mainServer?.baseUrl
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {healthData.mainServer?.ok
                      ? 'Operational'
                      : healthData.mainServer?.baseUrl
                        ? 'Issues'
                        : 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-ink-50 dark:bg-ink-800/50">
                  <span className="font-medium">Exa Search</span>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                      (healthData.exa?.ok || healthData.searxng?.ok)
                        ? 'bg-emerald-100 text-emerald-700'
                        : (healthData.exa?.baseUrl || healthData.searxng?.baseUrl)
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {(healthData.exa?.ok || healthData.searxng?.ok)
                      ? 'Operational'
                      : (healthData.exa?.baseUrl || healthData.searxng?.baseUrl)
                        ? 'Issues'
                        : 'Unknown'}
                  </span>
                </div>
                
                <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-ink-400 font-bold">
                  MCP Integrations
                </div>
                {Array.isArray(healthData.apiToolServers) && healthData.apiToolServers.length > 0 ? (
                  healthData.apiToolServers.map((server: any, idx: number) => (
                    <div
                      key={server.id || server.baseUrl || `mcp-${idx}`}
                      className="rounded-lg border border-ink-100 dark:border-ink-800 p-2 flex items-center justify-between"
                    >
                      <span className="font-medium">{server.name || server.id || 'MCP Server'}</span>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${getMcpStatusStyles(
                          server.status
                        )}`}
                      >
                        {(server.status || 'connected').toLowerCase()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-[11px] text-ink-400 italic p-2">No MCP servers configured.</div>
                )}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => loadHealth(true)}
                className="rounded-full border border-ink-200 px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-500 transition hover:border-saffron-400 hover:text-saffron-500 hover:bg-saffron-50 dark:border-ink-700 dark:hover:bg-ink-800"
              >
                Refresh Status
              </button>
            </div>
          </div>
        </div>
      )}

      {legalModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-sm"
          onClick={() => setLegalModal(null)}
        >
          <div 
            className="w-full max-w-2xl rounded-2xl border border-ink-200 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900 max-h-[80vh] overflow-y-auto animate-floatIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-xl font-bold text-ink-900 dark:text-ink-50">
                {legalModal === 'privacy' ? 'Privacy Policy' : legalModal === 'terms' ? 'Terms of Service' : 'Credits & Thanks'}
              </h3>
              <button
                onClick={() => setLegalModal(null)}
                className="text-xs uppercase tracking-[0.2em] text-ink-400 hover:text-ink-600 dark:hover:text-ink-300"
              >
                Close
              </button>
            </div>
            <div className="prose dark:prose-invert max-w-none text-sm text-ink-600 dark:text-ink-300 space-y-4">
              {legalModal === 'privacy' ? (
                <>
                  <p><strong>Effective Date:</strong> {new Date().toLocaleDateString()}</p>
                  <p>When you use ZygAI, you trust us with your data. It is our responsibility to protect your privacy and ensure your data remains secure.</p>
                  <h4 className="text-base font-bold text-ink-900 dark:text-ink-50 mt-6">Information we collect</h4>
                  <p>We collect information to provide better services to all our users. We securely store your prompts, AI interactions, and account metadata. We do not sell your personal data to third parties.</p>
                  <h4 className="text-base font-bold text-ink-900 dark:text-ink-50 mt-6">How we use your information</h4>
                  <p>We use the information we collect from all our services to provide, maintain, protect, and improve them, to develop new ones, and to protect ZygAI and our users. Your private models and MCP connections remain locally encrypted or securely tokenized.</p>
                  <h4 className="text-base font-bold text-ink-900 dark:text-ink-50 mt-6">Your privacy controls</h4>
                  <p>You have the right to access, update, or delete your information at any time through your workspace settings. We give you control over what you share and who you share it with.</p>
                </>
              ) : legalModal === 'terms' ? (
                <>
                  <p><strong>Effective Date:</strong> {new Date().toLocaleDateString()}</p>
                  <p>Welcome to ZygAI! Thanks for using our platform and services. By using our Services, you are agreeing to these terms. Please read them carefully.</p>
                  <h4 className="text-base font-bold text-ink-900 dark:text-ink-50 mt-6">Using our Services</h4>
                  <p>You must follow any policies made available to you within the Services. Don't misuse our Services. For example, don't interfere with our Services or try to access them using a method other than the interface and the instructions that we provide. We may suspend or stop providing our Services to you if you do not comply with our terms or policies or if we are investigating suspected misconduct.</p>
                  <h4 className="text-base font-bold text-ink-900 dark:text-ink-50 mt-6">Your Content in our Services</h4>
                  <p>Some of our Services allow you to upload, submit, store, send or receive content. You retain ownership of any intellectual property rights that you hold in that content. In short, what belongs to you stays yours.</p>
                  <h4 className="text-base font-bold text-ink-900 dark:text-ink-50 mt-6">Warranties and Disclaimers</h4>
                  <p>We provide our Services using a commercially reasonable level of skill and care and we hope that you will enjoy using them. But there are certain things that we don't promise about our Services. The AI responses are generated automatically and we do not guarantee their accuracy or reliability.</p>
                </>
              ) : (
                <div className="space-y-6 py-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-xs uppercase tracking-widest text-ink-400 font-bold">Project Founder</p>
                    <p className="text-lg font-bold text-ink-900 dark:text-ink-50">Zygiuos</p>
                    <p className="text-xs text-ink-500">For making the whole ZygAI platform a reality.</p>
                  </div>
                  
                  <div className="h-px bg-ink-100 dark:bg-ink-800"></div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-ink-400 font-bold mb-1">Infrastructure</p>
                      <p className="font-bold text-ink-800 dark:text-ink-100">Ruby from ObsidianHost</p>
                      <a href="https://obsidianhost.net" target="_blank" rel="noopener noreferrer" className="text-xs text-saffron-500 hover:underline">obsidianhost.net</a>
                    </div>
                    
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-ink-400 font-bold mb-1">Development</p>
                      <p className="font-bold text-ink-800 dark:text-ink-100">0daysophie</p>
                      <a href="https://sophie.com.de" target="_blank" rel="noopener noreferrer" className="text-xs text-saffron-500 hover:underline">sophie.com.de</a>
                    </div>
                    
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-ink-400 font-bold mb-1">Creative Partner</p>
                      <p className="font-bold text-ink-800 dark:text-ink-100">Damon Mars</p>
                      <a href="https://youtube.com/@drdamonmars" target="_blank" rel="noopener noreferrer" className="text-xs text-saffron-500 hover:underline">drdamonmars YouTube</a>
                    </div>
                    
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-ink-400 font-bold mb-1">Special Contributor</p>
                      <p className="font-bold text-ink-800 dark:text-ink-100">Pizza Cat</p>
                      <p className="text-xs text-ink-500">The silent supporter (no platforms).</p>
                    </div>
                  </div>
                  
                  <div className="h-px bg-ink-100 dark:bg-ink-800"></div>
                  
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] uppercase tracking-widest text-ink-400 font-bold">Media & Production</p>
                    <p className="font-bold text-ink-800 dark:text-ink-100">ZygMediaGroup</p>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-8 flex justify-end border-t border-ink-100 dark:border-ink-800 pt-4">
              <button
                onClick={() => setLegalModal(null)}
                className="rounded-full bg-ink-900 px-6 py-2 text-xs font-bold text-white transition hover:bg-ink-700 dark:bg-saffron-400 dark:text-ink-900 dark:hover:bg-saffron-500 shadow-lg shadow-saffron-500/10"
              >
                {legalModal === 'credits' ? 'Thank You' : 'I Understand'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCookieBanner && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-ink-200 bg-white/95 p-4 shadow-2xl backdrop-blur-md dark:border-ink-800 dark:bg-ink-950/95 animate-floatIn" role="status" aria-label="Cookie consent">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row px-6">
            <div className="text-sm text-ink-600 dark:text-ink-300">
              We use cookies to enhance your experience, serve personalized content, and analyze our traffic. By continuing to use ZygAI, you consent to our use of cookies.
            </div>
            <div className="flex w-full sm:w-auto justify-end gap-4 shrink-0 items-center">
              <button
                onClick={() => setLegalModal('privacy')}
                className="text-xs font-bold uppercase tracking-widest text-ink-500 transition hover:text-saffron-500 dark:text-ink-400"
              >
                Privacy Policy
              </button>
              <button
                onClick={acceptCookies}
                className="rounded-full bg-ink-900 px-6 py-2.5 text-xs font-bold text-white transition hover:bg-ink-700 dark:bg-saffron-400 dark:text-ink-900 dark:hover:bg-saffron-500 shadow-lg shadow-saffron-500/10"
              >
                Accept Cookies
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
