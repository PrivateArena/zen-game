import { useEffect, useMemo, useState } from 'react';
import { SimulationCore } from './game/SimulationCore';
import { GameCanvas } from './components/GameCanvas';
import type { GameState, DuoduoHook } from './types/game';

const TOWER_SHOP = [
  { type: 'Ground', cost: 100, desc: 'Highest ground DPS' },
  { type: 'Fly', cost: 120, desc: 'Anti-air specialist' },
  { type: 'Laser', cost: 150, desc: 'Laser hits both (50% dmg)' },
  { type: 'Bombard', cost: 180, desc: 'Splash damage (ground only)' },
  { type: 'AntiArmor', cost: 160, desc: '2x damage against armor' },
  { type: 'Slow', cost: 130, desc: 'Freeze/slow down speed' }
];

function App() {
  const simulationCore = useMemo(() => new SimulationCore(), []);
  const [gameState, setGameState] = useState<GameState>(() => simulationCore.getState());
  
  // Toggles for Roster Overlays
  const [activeTab, setActiveTab] = useState<'monsters' | 'towers' | 'logs' | null>(null);

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

  const handleBuildTower = (type: string, cost: number) => {
    if (gameState.selectedSlotId) {
      simulationCore.purchaseTower(gameState.selectedSlotId, type, cost);
    }
  };

  const selectedSlot = useMemo(() => {
    if (!gameState.selectedSlotId) return null;
    return gameState.units.find(u => u.id === gameState.selectedSlotId && u.behavior === 'empty_slot') || null;
  }, [gameState.selectedSlotId, gameState.units]);

  return (
    <div className="h-screen bg-slate-950 flex flex-col items-center p-4 gap-3 font-sans select-none text-slate-200 overflow-hidden">
      {/* Top HUD bar */}
      <header className="w-full max-w-6xl flex items-center justify-between border-b border-slate-900 pb-2">
        <div>
          <h1 className="text-lg font-black tracking-wider bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            ROME_AEGIS // MYTHIC_LIMES
          </h1>
          <p className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">
            Decoupled Physics Engine & Phaser 4 Graphic Pipeline
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
            <span className="text-[10px] font-mono text-slate-400">T+{gameState.elapsedTime.toFixed(1)}s</span>
          </div>
        </div>
      </header>

      {/* Main Game Screen with Absolute Overlays */}
      <main className="w-full max-w-6xl flex-1 relative flex items-center justify-center overflow-hidden rounded-xl border border-slate-800 shadow-2xl">
        
        {/* Game Canvas */}
        <GameCanvas simulationCore={simulationCore} />

        {/* 1. BUILD TOWER CONTEXT MENU */}
        {selectedSlot && (
          <div
            className="absolute bg-slate-900/95 backdrop-blur-md border border-indigo-500/30 rounded-xl p-3 shadow-2xl flex flex-col gap-2 z-30 w-60 animate-in fade-in zoom-in duration-150"
            style={{
              left: `${(selectedSlot.x / 800) * 100}%`,
              top: `${(selectedSlot.y / 450) * 100}%`,
              transform: 'translate(-50%, -105%)',
            }}
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-1">
              <span className="text-[9px] font-bold text-slate-400 font-mono uppercase tracking-wider">Build Defenses</span>
              <button
                onClick={() => simulationCore.selectSlot(null)}
                className="text-[9px] text-slate-500 hover:text-slate-300 font-mono"
              >
                Close ×
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto pr-0.5">
              {TOWER_SHOP.map((tower) => {
                const canAfford = gameState.gold >= tower.cost;
                return (
                  <button
                    key={tower.type}
                    disabled={!canAfford}
                    onClick={() => handleBuildTower(tower.type, tower.cost)}
                    className={`flex justify-between items-center p-1.5 rounded border text-left transition-all ${
                      canAfford
                        ? 'bg-slate-950/60 border-slate-800/80 hover:border-indigo-500/50 hover:bg-slate-950 text-slate-200'
                        : 'bg-slate-950/20 border-slate-900/40 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold font-mono">{tower.type}</span>
                      <span className="text-[8px] text-slate-500 leading-tight">{tower.desc}</span>
                    </div>
                    <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${
                      canAfford ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-900 text-slate-600'
                    }`}>
                      {tower.cost}g
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. FLOATING CONTROL BAR (Bottom Left Overlay) */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md border border-slate-800 p-2 rounded-lg z-20 shadow-lg">
          {gameState.status !== 'running' ? (
            <button
              onClick={() => simulationCore.start()}
              disabled={gameState.status === 'gameover' || gameState.status === 'awaiting-interaction'}
              className="py-1 px-3 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs transition-all active:scale-[0.97]"
            >
              Start
            </button>
          ) : (
            <button
              onClick={() => simulationCore.pause()}
              className="py-1 px-3 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-all active:scale-[0.97]"
            >
              Pause
            </button>
          )}

          <button
            onClick={() => simulationCore.reset()}
            className="py-1 px-2.5 rounded bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium text-xs transition-all active:scale-[0.97]"
          >
            Reset
          </button>

          <div className="h-4 w-[1px] bg-slate-800" />

          {/* Speed settings */}
          <div className="flex items-center gap-1">
            {[1, 2, 4].map((speed) => (
              <button
                key={speed}
                onClick={() => simulationCore.setSpeed(speed)}
                className={`py-0.5 px-1.5 rounded text-[10px] font-mono border transition-all ${
                  gameState.simulationSpeed === speed
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                    : 'bg-slate-900/40 text-slate-500 border-transparent hover:bg-slate-900 hover:text-slate-300'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-slate-800" />

          {/* Pulse */}
          <button
            onClick={() => simulationCore.triggerDiagnosticPulse()}
            className="py-1 px-2 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[10px] font-bold text-emerald-400 font-mono active:scale-[0.97]"
          >
            Pulse
          </button>
        </div>

        {/* 3. ROSTER TOGGLES BAR (Bottom Right Overlay) */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-slate-950/80 backdrop-blur-md border border-slate-800 p-1.5 rounded-lg z-20 shadow-lg">
          <button
            onClick={() => setActiveTab(activeTab === 'monsters' ? null : 'monsters')}
            className={`py-1 px-2.5 rounded text-xs font-semibold transition-all ${
              activeTab === 'monsters' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            👾 Monsters ({gameState.units.filter(u => u.factionId === 'monsters' && u.hp > 0).length})
          </button>
          <button
            onClick={() => setActiveTab(activeTab === 'towers' ? null : 'towers')}
            className={`py-1 px-2.5 rounded text-xs font-semibold transition-all ${
              activeTab === 'towers' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🛡️ Defenders ({gameState.units.filter(u => u.factionId === 'towers' && u.behavior !== 'empty_slot').length})
          </button>
          <button
            onClick={() => setActiveTab(activeTab === 'logs' ? null : 'logs')}
            className={`py-1 px-2.5 rounded text-xs font-semibold transition-all ${
              activeTab === 'logs' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            📜 Console Feed
          </button>
        </div>

        {/* 4. SIDE DRAWER LIST PANEL (Right Overlay) */}
        {activeTab && (
          <div className="absolute top-3 bottom-14 right-3 w-72 bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-xl p-3 flex flex-col gap-2.5 z-20 shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex justify-between items-center border-b border-slate-850 pb-1.5">
              <h3 className="text-xs font-bold font-mono tracking-wide uppercase">
                {activeTab === 'monsters' && '👾 Monster Roster'}
                {activeTab === 'towers' && '🛡️ Defensive Forts'}
                {activeTab === 'logs' && '📜 Console Logs'}
              </h3>
              <button
                onClick={() => setActiveTab(null)}
                className="text-[10px] text-slate-500 hover:text-slate-300 font-mono"
              >
                Close ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 scrollbar-thin">
              {activeTab === 'monsters' && (
                gameState.units.filter(u => u.factionId === 'monsters').map(unit => (
                  <div
                    key={unit.id}
                    className={`p-2 rounded border text-[10px] flex flex-col gap-1 ${
                      unit.hp <= 0 ? 'bg-slate-950/40 border-slate-900/40 opacity-40' : 'bg-slate-900/60 border-slate-800/60'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-red-400">{unit.id.split('-').pop()}</span>
                      <span className="text-[8px] text-slate-500 font-mono">({Math.round(unit.x)}, {Math.round(unit.y)})</span>
                    </div>
                    {unit.hp > 0 && (
                      <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                        <div className="bg-red-500 h-full" style={{ width: `${(unit.hp / unit.maxHp) * 100}%` }} />
                      </div>
                    )}
                    <div className="flex justify-between items-center text-[9px] text-slate-400">
                      <span className="italic text-slate-500">{unit.statusText}</span>
                      <span className="font-mono">HP {Math.round(unit.hp)}/{unit.maxHp}</span>
                    </div>
                  </div>
                ))
              )}

              {activeTab === 'towers' && (
                gameState.units.filter(u => u.factionId === 'towers' && u.behavior !== 'empty_slot').map(unit => (
                  <div
                    key={unit.id}
                    className="p-2 rounded border border-blue-500/10 bg-slate-900/60 text-[10px] flex flex-col gap-1"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-blue-400">{unit.id.split('-').pop() || unit.id}</span>
                      <span className="text-[8px] text-slate-500 font-mono">Rng: {unit.range}px</span>
                    </div>
                    <div className="flex justify-between items-center text-[9px] text-slate-400">
                      <span className="italic text-slate-500">{unit.statusText}</span>
                      <span className="font-mono text-blue-300">Dmg: {Math.round(unit.damage)}/s</span>
                    </div>
                  </div>
                ))
              )}

              {activeTab === 'logs' && (
                <div className="flex flex-col gap-1 font-mono text-[9px] text-slate-400 pr-1">
                  {gameState.logs.map((log, index) => (
                    <div
                      key={index}
                      className={`leading-relaxed border-l pl-1.5 ${
                        log.includes('[COMBAT]')
                          ? 'border-red-500 text-slate-300'
                          : log.includes('[DIAGNOSTIC]')
                          ? 'border-emerald-500 text-emerald-400/90'
                          : log.includes('[INTERCEPT]')
                          ? 'border-pink-500 text-pink-400'
                          : 'border-slate-700 text-slate-400'
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. QUIZ INTERCEPT MODAL OVERLAY */}
        {activeIntercept && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-6 rounded-xl border border-slate-800">
            <div className="bg-slate-900 border border-indigo-500/30 max-w-sm w-full rounded-2xl p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-[10px] font-semibold text-indigo-400 font-mono uppercase tracking-wider">
                  {activeIntercept.hook.type === 'quiz_challenge' ? '💡 Historical Quiz' : '📖 History Lesson'}
                </span>
                <span className="text-[9px] font-mono text-slate-500">{activeIntercept.eventId}</span>
              </div>

              {activeIntercept.hook.type === 'quiz_challenge' ? (
                <div className="flex flex-col gap-3">
                  <h3 className="text-xs font-semibold text-slate-200 leading-relaxed">
                    Athenian general Miltiades deployed a famous tactic at Marathon. What was it?
                  </h3>
                  <p className="text-[10px] text-slate-500 italic">
                    Answer correctly to buff your units! Incorrect answers will speed up enemies.
                  </p>
                  <div className="flex flex-col gap-1.5 mt-1">
                    <button
                      onClick={() => handleQuizAnswer(true)}
                      className="w-full py-2 px-3 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-200 font-medium text-[10px] text-left transition-all duration-150"
                    >
                      Thinning the center to envelop the Persian wings.
                    </button>
                    <button
                      onClick={() => handleQuizAnswer(false)}
                      className="w-full py-2 px-3 rounded-lg bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/50 text-slate-300 font-medium text-[10px] text-left transition-all duration-150"
                    >
                      A full naval retreat back to Athens.
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="text-[10px] text-slate-300 leading-relaxed">
                    {activeIntercept.hook.markdown || 'History details here.'}
                  </div>
                  <button
                    onClick={() => handleQuizAnswer(true)}
                    className="w-full py-1.5 px-3 mt-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all"
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
