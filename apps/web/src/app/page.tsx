import Link from "next/link";
import { Brain, Box, ArrowRight, Sparkles, MessageSquare, Play, ShieldAlert, Cpu } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="relative flex flex-col min-h-screen bg-slate-950 text-white overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] bg-gradient-to-b from-indigo-500/10 via-transparent to-transparent blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-indigo-400">
          <Brain className="w-6 h-6 text-indigo-500 animate-pulse" />
          <span>Brain Box AI</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-slate-300 hover:text-white transition text-sm">
            Sign In
          </Link>
          <Link
            href="/login?signup=true"
            className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 transition rounded-lg text-white shadow-lg shadow-indigo-600/20"
          >
            Start Automating
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 max-w-4xl mx-auto z-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-950/40 text-indigo-300 text-xs font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Talk to your brain. Let it do the work.</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-indigo-400">
          Your brain, <br />
          connected to everything.
        </h1>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10 leading-relaxed">
          Brain Box AI turns your words and voice into real-world actions. Say goodbye to complex APIs, cron expressions, and node setups.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
          <Link
            href="/login?signup=true"
            className="flex items-center gap-2 px-6 py-3.5 font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 transition text-white shadow-lg shadow-indigo-600/30 text-base w-full sm:w-auto justify-center"
          >
            <span>Start Automating</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="/login?demo=true"
            className="flex items-center gap-2 px-6 py-3.5 font-bold rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 transition text-slate-300 hover:text-white text-base w-full sm:w-auto justify-center"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Try Free Demo</span>
          </Link>
        </div>

        {/* Demo UX Mockup Card */}
        <div className="w-full max-w-2xl border border-slate-800 bg-slate-900/60 rounded-2xl shadow-2xl p-6 text-left relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 right-0 border-l border-b border-yellow-500/20 bg-yellow-950/20 px-3 py-1 text-[10px] font-semibold text-yellow-500 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
            <Cpu className="w-3 h-3" />
            <span>Demo Mode Available</span>
          </div>

          <div className="flex items-start gap-4 mb-6">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
              🎙️
            </div>
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">User Says</p>
              <blockquote className="text-lg text-slate-200 font-medium leading-relaxed">
                "Every morning check my important emails and send me a summary."
              </blockquote>
            </div>
          </div>

          {/* Connective Line */}
          <div className="ml-5 pl-8 border-l border-dashed border-indigo-500/40 py-2">
            <div className="inline-flex items-center gap-2 text-indigo-400 bg-indigo-950/50 border border-indigo-500/20 px-3 py-1 rounded-full text-xs font-semibold my-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
              <span>Analyzing Automation...</span>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-indigo-950 border border-indigo-800 flex items-center justify-center flex-shrink-0">
              🧠
            </div>
            <div className="flex-1">
              <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wider mb-1">Brain Box AI</p>
              <div className="border border-indigo-950 bg-indigo-950/20 rounded-xl p-4 text-sm text-slate-300">
                <p className="font-semibold text-white mb-2">✨ Daily Gmail Summary created:</p>
                <ul className="space-y-2 text-slate-400">
                  <li className="flex items-center gap-2">
                    <span className="text-green-500">✓</span> <span>Checks Gmail category:primary</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-500">✓</span> <span>Summarizes with LLM</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-500">✓</span> <span>Sends you the summary at 8:00 AM</span>
                  </li>
                </ul>
                <div className="mt-4 flex gap-2">
                  <Link href="/login?demo=true" className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 transition rounded-lg text-white">
                    Activate Workflow
                  </Link>
                  <button disabled className="px-3 py-1.5 text-xs font-semibold border border-slate-800 bg-slate-900/50 rounded-lg text-slate-500 cursor-not-allowed">
                    Modify Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-6 text-center text-slate-500 text-xs mt-12">
        <p>© 2026 Brain Box AI. All rights reserved. Think it. Say it. Automate it.</p>
      </footer>
    </div>
  );
}
