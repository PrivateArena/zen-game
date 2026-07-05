import React from 'react';
import type { GameState, GameConfig, ShopCard } from '../types/game';

interface UIOverlayProps {
  gameState: GameState;
  config: GameConfig;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onSetSpeed: (speed: number) => void;
  onDiagnosticPulse: () => void;
  onBuyUnit: (cardId: string) => void;
  onRerollShop: () => void;
  onBuyXp: () => void;
  onSellUnit: (unitId: string) => void;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({
  gameState,
  config,
  onStart,
  onPause,
  onReset,
  onSetSpeed,
  onDiagnosticPulse,
  onBuyUnit,
  onRerollShop,
  onBuyXp,
  onSellUnit,
}) => {
  const { status, units, simulationSpeed, elapsedTime, logs, gold, lives, level, xp, shopCards, streak, selectedSlotId } = gameState;

  // Calculate XP needed for next level: Lvl 1->2: 2XP, 2->3: 6XP, 3->4: 10XP, 4->5: 18XP, 5->6: 30XP
  const xpRequirements = [0, 0, 2, 6, 10, 18, 30, 46, 68, 100];
  const nextLvlXp = xpRequirements[level + 1] || 100;

  // Selected unit details
  const selectedUnit = selectedSlotId ? units.find(u => u.id === selectedSlotId && u.factionId === 'towers') : null;

  // Calculate board units count vs max allowed
  const deployedCount = units.filter(u => u.factionId === 'towers' && !u.isBench).length;

  // Calculate Synergies for display
  const activeTraits = new Map<string, number>();
  const distinctTypes = new Set<string>();
  units.forEach(u => {
    if (u.factionId === 'towers' && !u.isBench) {
      distinctTypes.add(u.id.split('-')[0] + '-' + u.id.split('-')[1]);
    }
  });
  distinctTypes.forEach(type => {
    // Get traits from tags
    if (type.includes('Gladiator')) {
      activeTraits.set('Gladiator', (activeTraits.get('Gladiator') || 0) + 1);
    }
    if (type.includes('Mythic')) {
      activeTraits.set('Mythic', (activeTraits.get('Mythic') || 0) + 1);
    }
    if (type.includes('Soldier')) {
      activeTraits.set('Soldier', (activeTraits.get('Soldier') || 0) + 1);
    }
  });

  const getStatusBadge = () => {
    switch (status) {
      case 'combat':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_12px_rgba(239,68,68,0.15)] animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            COMBAT
          </span>
        );
      case 'resolve':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-pink-500/10 text-pink-400 border border-pink-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-pink-400" />
            RESOLVING
          </span>
        );
      case 'gameover':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-600/20 text-red-500 border border-red-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            DEFEATED
          </span>
        );
      default: // planning
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            PLANNING ({Math.ceil(elapsedTime)}s)
          </span>
        );
    }
  };

  return (
    <div className="w-full flex flex-col gap-4 text-slate-200">
      {/* 1. Shop Dock & Arena Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* Arena Controls */}
        <div className="lg:col-span-1 bg-slate-900/70 backdrop-blur-md border border-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
          <div>
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Arena Phase</h2>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              <span className="text-xs font-mono text-slate-400 font-bold">Round {gameState.roundIndex}</span>
            </div>
          </div>

          <div className="flex gap-2">
            {status === 'planning' ? (
              <button
                onClick={onStart}
                className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-lg active:scale-[0.98]"
              >
                Combat Starts
              </button>
            ) : (
              <button
                onClick={onPause}
                disabled
                className="flex-1 py-2 px-3 rounded-lg bg-slate-800 text-slate-500 font-bold text-xs cursor-not-allowed opacity-50"
              >
                Simulating Combat
              </button>
            )}

            <button
              onClick={onReset}
              className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition-all active:scale-[0.98]"
            >
              Reset
            </button>
          </div>

          {/* Speed Multipliers */}
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-semibold">Sim Speed:</span>
            <div className="flex gap-1">
              {[1, 2, 4].map((speed) => (
                <button
                  key={speed}
                  onClick={() => onSetSpeed(speed)}
                  className={`py-1 px-2.5 rounded text-[10px] font-mono border transition-all ${
                    simulationSpeed === speed
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-inner'
                      : 'bg-slate-800/40 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SHOP CARDS DOCK */}
        <div className="lg:col-span-3 bg-slate-900/70 backdrop-blur-md border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5 shadow-xl">
          <div className="flex justify-between items-center border-b border-slate-800/60 pb-1.5">
            <div className="flex items-center gap-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Senate Unit Shop</h3>
              <div className="flex gap-1.5 text-[10px]">
                <button
                  onClick={onRerollShop}
                  disabled={gold < 2 || status !== 'planning'}
                  className="py-1 px-2.5 rounded bg-slate-950 hover:bg-slate-900 border border-slate-800 text-amber-300 font-bold hover:border-amber-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Reroll (2g)
                </button>
                <button
                  onClick={onBuyXp}
                  disabled={gold < 4 || status !== 'planning' || level >= 9}
                  className="py-1 px-2.5 rounded bg-slate-950 hover:bg-slate-900 border border-slate-800 text-blue-300 font-bold hover:border-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Buy +4 XP (4g)
                </button>
              </div>
            </div>
            
            {/* Level and XP indicator */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-bold">Lvl {level}</span>
              <div className="w-16 bg-slate-850 h-2 rounded overflow-hidden border border-slate-800">
                <div className="bg-blue-500 h-full transition-all" style={{ width: `${(xp / nextLvlXp) * 100}%` }} />
              </div>
              <span className="font-mono text-[9px] text-slate-500">{xp}/{nextLvlXp} XP</span>
            </div>
          </div>

          {/* Shop Items Display */}
          <div className="grid grid-cols-5 gap-2">
            {shopCards.map((card, idx) => {
              if (!card) {
                return (
                  <div key={`empty-${idx}`} className="h-20 bg-slate-950/40 border border-dashed border-slate-800/40 rounded-lg flex items-center justify-center text-slate-700 text-[10px]">
                    Sold Out
                  </div>
                );
              }
              const canAfford = gold >= card.cost;
              return (
                <button
                  key={card.id}
                  disabled={!canAfford || status !== 'planning'}
                  onClick={() => onBuyUnit(card.id)}
                  className={`h-20 p-2 rounded-lg border text-left flex flex-col justify-between transition-all select-none ${
                    canAfford && status === 'planning'
                      ? 'bg-slate-950 hover:bg-slate-950/80 border-slate-800 hover:border-amber-500/50'
                      : 'bg-slate-950/20 border-slate-900/60 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="w-full flex justify-between items-start">
                    <span className="text-[10px] font-bold text-slate-300 truncate max-w-[80px]">
                      {card.name}
                    </span>
                    <span className="text-[9px] font-black font-mono text-amber-400">
                      {card.cost}g
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-0.5">
                    {card.traits.map(t => (
                      <span key={t} className="text-[7.5px] px-1 bg-slate-850 rounded text-slate-400">
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* 2. Synergies, Details, and Logs Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* Synergies Panel */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5 shadow-xl">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1.5">
            Active Synergies ({deployedCount}/{level})
          </h3>
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[160px] pr-1">
            {/* Gladiator */}
            <div className="flex items-center justify-between text-xs p-1.5 rounded bg-slate-950/50 border border-slate-850">
              <div className="flex items-center gap-1.5">
                <span>🛡️</span>
                <span className="font-bold">Gladiator</span>
              </div>
              <span className={`font-mono text-xs px-2 py-0.5 rounded font-black ${
                (activeTraits.get('Gladiator') || 0) >= 3 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
              }`}>
                {activeTraits.get('Gladiator') || 0} / 3
              </span>
            </div>

            {/* Mythic */}
            <div className="flex items-center justify-between text-xs p-1.5 rounded bg-slate-950/50 border border-slate-850">
              <div className="flex items-center gap-1.5">
                <span>⚡</span>
                <span className="font-bold">Mythic</span>
              </div>
              <span className={`font-mono text-xs px-2 py-0.5 rounded font-black ${
                (activeTraits.get('Mythic') || 0) >= 2 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
              }`}>
                {activeTraits.get('Mythic') || 0} / 2
              </span>
            </div>

            {/* Soldier */}
            <div className="flex items-center justify-between text-xs p-1.5 rounded bg-slate-950/50 border border-slate-850">
              <div className="flex items-center gap-1.5">
                <span>🗡️</span>
                <span className="font-bold">Soldier</span>
              </div>
              <span className={`font-mono text-xs px-2 py-0.5 rounded font-black ${
                (activeTraits.get('Soldier') || 0) >= 2 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
              }`}>
                {activeTraits.get('Soldier') || 0} / 2
              </span>
            </div>
          </div>
        </div>

        {/* Selected Unit Details Panel */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col gap-2 shadow-xl">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1.5">
            Unit Inspection
          </h3>
          {selectedUnit ? (
            <div className="flex-1 flex flex-col justify-between text-xs gap-1.5">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-200">
                    {selectedUnit.id.split('-').pop()} ({'★'.repeat(selectedUnit.starLevel)})
                  </span>
                  <span className="font-mono text-[9px] text-slate-500">
                    {selectedUnit.isBench ? 'Bench' : `Board (${selectedUnit.boardX}, ${selectedUnit.boardY})`}
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1 rounded overflow-hidden">
                  <div className="bg-blue-500 h-full" style={{ width: `${(selectedUnit.hp / selectedUnit.maxHp) * 100}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-1 text-[9px] font-mono text-slate-400 mt-1">
                  <span>HP: {Math.round(selectedUnit.hp)}/{selectedUnit.maxHp}</span>
                  <span>Dmg: {selectedUnit.damage}</span>
                  <span>Rng: {selectedUnit.range}</span>
                  <span>Speed: {selectedUnit.speed}</span>
                </div>
              </div>

              <button
                onClick={() => onSellUnit(selectedUnit.id)}
                disabled={status !== 'planning'}
                className="w-full py-1 rounded bg-red-950/60 hover:bg-red-900 border border-red-500/25 hover:border-red-500/50 text-red-300 font-bold transition-all text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sell Unit (+{selectedUnit.starLevel === 1 ? 1 : selectedUnit.starLevel === 2 ? 3 : 5}g)
              </button>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500 italic">
              Select an allied unit to view stats or sell
            </div>
          )}
        </div>

        {/* Combat logs terminal */}
        <div className="lg:col-span-2 bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col gap-2 shadow-xl">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1.5">
            Diagnostic Logs
          </h3>
          <div className="flex-1 bg-slate-950/80 border border-slate-900 rounded-lg p-2.5 overflow-y-auto max-h-[140px] font-mono text-[9px] text-slate-400 flex flex-col gap-1 scrollbar-thin">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`leading-relaxed border-l pl-2 ${
                  log.includes('[COMBAT]')
                    ? 'border-red-500 text-slate-350 font-bold'
                    : log.includes('[UPGRADE]')
                    ? 'border-amber-500 text-amber-400 font-bold'
                    : log.includes('[SYNERGY]')
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-slate-800 text-slate-400'
                }`}
              >
                {log}
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-slate-650 italic">Feed offline. Waiting for input...</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
