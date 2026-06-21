import { useEffect, useMemo, useState } from 'react';
import { SimulationCore } from './game/SimulationCore';
import { GameCanvas } from './components/GameCanvas';
import { UIOverlay } from './components/UIOverlay';
import type { GameState, DuoduoHook } from './types/game';

function App() {
  const simulationCore = useMemo(() => new SimulationCore(), []);
  const [gameState, setGameState] = useState<GameState>(() => simulationCore.getState());
  
  // Interactive Quiz Intercept State
  const [activeIntercept, setActiveIntercept] = useState<{
    eventId: string;
    hook: DuoduoHook;
    resume: (result: { success: boolean }) => void;
  } | null>(null);

  useEffect(() => {
    const unsubscribe = simulationCore.subscribe((nextState) => {
      setGameState(nextState);
    });

    // Listen for zen-duo intercepts
    const handleIntercept = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { eventId, hook, resume } = customEvent.detail;
      setActiveIntercept({ eventId, hook, resume });
    };

    window.addEventListener('zen-game-intercept', handleIntercept);

    return () => {
      unsubscribe();
      window.removeEventListener('zen-game-intercept', handleIntercept);
    };
  }, [simulationCore]);

  const handleQuizAnswer = (correct: boolean) => {
    if (activeIntercept) {
      activeIntercept.resume({ success: correct });
      setActiveIntercept(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center p-6 gap-6 font-sans select-none text-slate-200">
      {/* Top Navigation / Watermark */}
      <header className="w-full max-w-6xl flex items-center justify-between border-b border-slate-850 pb-4">
        <div>
          <h1 className="text-xl font-black tracking-wider bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            ZEN_MATRIX // CORE_SIM
          </h1>
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">
            Decoupled Physics Engine & Phaser 4 Graphic Pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-400">
            TS 5.0+
          </span>
          <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-purple-400">
            React 19
          </span>
          <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-pink-400">
            Phaser 4
          </span>
        </div>
      </header>

      {/* Main Layout Grid */}
      <main className="w-full max-w-6xl flex flex-col gap-6 relative">
        {/* Game Window Layer */}
        <GameCanvas simulationCore={simulationCore} />

        {/* UI HUD Controls & Rosters */}
        <UIOverlay
          gameState={gameState}
          config={simulationCore.getConfig()}
          onStart={() => simulationCore.start()}
          onPause={() => simulationCore.pause()}
          onReset={() => simulationCore.reset()}
          onSetSpeed={(speed) => simulationCore.setSpeed(speed)}
          onDiagnosticPulse={() => simulationCore.triggerDiagnosticPulse()}
        />

        {/* zen-duo Interactive Quiz / Info Overlay */}
        {activeIntercept && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-6 rounded-xl border border-slate-800">
            <div className="bg-slate-900 border border-indigo-500/30 max-w-md w-full rounded-2xl p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-semibold text-indigo-400 font-mono uppercase tracking-wider">
                  {activeIntercept.hook.type === 'quiz_challenge' ? '💡 Historical Quiz' : '📖 History Lesson'}
                </span>
                <span className="text-[10px] font-mono text-slate-500">{activeIntercept.eventId}</span>
              </div>

              {activeIntercept.hook.type === 'quiz_challenge' ? (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold text-slate-200 leading-relaxed">
                    Athenian general Miltiades deployed a famous tactic at Marathon. What was it?
                  </h3>
                  <p className="text-xs text-slate-400 italic">
                    Answer correctly to buff your units! Incorrect answers will speed up enemies.
                  </p>
                  <div className="flex flex-col gap-2 mt-2">
                    <button
                      onClick={() => handleQuizAnswer(true)}
                      className="w-full py-2.5 px-4 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-indigo-200 font-medium text-xs text-left transition-all duration-150"
                    >
                      Thinning the center to envelop the Persian wings.
                    </button>
                    <button
                      onClick={() => handleQuizAnswer(false)}
                      className="w-full py-2.5 px-4 rounded-lg bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/50 text-slate-300 font-medium text-xs text-left transition-all duration-150"
                    >
                      A full naval retreat back to Athens.
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="text-xs text-slate-300 leading-relaxed">
                    {activeIntercept.hook.markdown || 'History details here.'}
                  </div>
                  <button
                    onClick={() => handleQuizAnswer(true)}
                    className="w-full py-2 px-4 mt-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all duration-150"
                  >
                    Ack, continue simulation
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
