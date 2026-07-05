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
    (window as any).simulationCore = simulationCore;

    const unsubscribe = simulationCore.subscribe((nextState) => {
      setGameState(nextState);
    });

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
    <div className="h-screen bg-slate-950 flex flex-col items-center p-4 gap-4 font-sans select-none text-slate-200 overflow-hidden">
      {/* Top HUD bar */}
      <header className="w-full max-w-6xl flex items-center justify-between border-b border-slate-900 pb-2">
        <div>
          <h1 className="text-lg font-black tracking-wider bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            ROME_AUTOBATTLE // SENATE_ARENA
          </h1>
          <p className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">
            Grid Board positioning & deterministic autobattle ticks
          </p>
        </div>
        
        {/* Resources HUD */}
        <div className="flex items-center gap-4 bg-slate-900/60 border border-slate-800/80 px-3 py-1.5 rounded-lg">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">💰</span>
            <span className="text-xs font-black font-mono text-amber-300">{gameState.gold}g</span>
          </div>
          <div className="h-4 w-[1px] bg-slate-800" />
          <div className="flex items-center gap-1.5">
            <span className="text-sm">❤️</span>
            <span className="text-xs font-black font-mono text-rose-400">{gameState.lives} / 20</span>
          </div>
          <div className="h-4 w-[1px] bg-slate-800" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono text-slate-400 font-bold">Round {gameState.roundIndex}</span>
          </div>
          <div className="h-4 w-[1px] bg-slate-800" />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-bold">Streak:</span>
            <span className={`font-mono font-black ${
              gameState.streak > 0 ? 'text-emerald-400' : gameState.streak < 0 ? 'text-rose-400' : 'text-slate-400'
            }`}>
              {gameState.streak > 0 ? `+${gameState.streak} W` : gameState.streak < 0 ? `${gameState.streak} L` : '0'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Game Arena */}
      <main className="w-full max-w-6xl flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Phaser Graphic Engine */}
        <div className="flex-1 min-h-0 relative rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
          <GameCanvas simulationCore={simulationCore} />
        </div>

        {/* TFT-style HUD Shop & Controller */}
        <div className="shrink-0">
          <UIOverlay
            gameState={gameState}
            config={simulationCore.getConfig()}
            onStart={() => simulationCore.startRound()}
            onPause={() => simulationCore.pause()}
            onReset={() => simulationCore.reset()}
            onSetSpeed={(speed) => simulationCore.setSpeed(speed)}
            onDiagnosticPulse={() => simulationCore.triggerDiagnosticPulse()}
            onBuyUnit={(cardId) => simulationCore.buyUnit(cardId)}
            onRerollShop={() => simulationCore.rerollShop()}
            onBuyXp={() => simulationCore.buyXp()}
            onSellUnit={(unitId) => simulationCore.sellUnit(unitId)}
          />
        </div>

        {/* Interactive Quiz Intercept Modal */}
        {activeIntercept && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-6">
            <div className="bg-slate-900 border border-indigo-500/30 max-w-sm w-full rounded-2xl p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-[10px] font-semibold text-indigo-400 font-mono uppercase tracking-wider">
                  💡 Tactical History Quiz
                </span>
                <span className="text-[9px] font-mono text-slate-500">{activeIntercept.eventId}</span>
              </div>

              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold text-slate-200 leading-relaxed">
                  Which legendary Roman general defeated Hannibal at the Battle of Zama using tactical spacing?
                </h3>
                <p className="text-[10px] text-slate-500 italic">
                  Select correctly to buff Gladiator attack speed. Incorrect answers speed up enemy seek rates.
                </p>
                <div className="flex flex-col gap-1.5 mt-1">
                  <button
                    onClick={() => handleQuizAnswer(true)}
                    className="w-full py-2 px-3 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-200 font-medium text-[10px] text-left transition-all duration-150"
                  >
                    Scipio Africanus
                  </button>
                  <button
                    onClick={() => handleQuizAnswer(false)}
                    className="w-full py-2 px-3 rounded-lg bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/50 text-slate-300 font-medium text-[10px] text-left transition-all duration-150"
                  >
                    Julius Caesar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
