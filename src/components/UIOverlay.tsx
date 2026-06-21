import React from 'react';
import type { GameState, GameConfig } from '../types/game';

interface UIOverlayProps {
  gameState: GameState;
  config: GameConfig;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onSetSpeed: (speed: number) => void;
  onDiagnosticPulse: () => void;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({
  gameState,
  config,
  onStart,
  onPause,
  onReset,
  onSetSpeed,
  onDiagnosticPulse,
}) => {
  const { status, units, simulationSpeed, elapsedTime, logs } = gameState;

  // Status Badge Colors & Glows
  const getStatusBadge = () => {
    switch (status) {
      case 'running':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.15)] animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            RUNNING
          </span>
        );
      case 'paused':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            PAUSED
          </span>
        );
      case 'awaiting-interaction':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-pink-500/10 text-pink-400 border border-pink-500/20 shadow-[0_0_12px_rgba(236,72,153,0.15)] animate-bounce">
            <span className="h-1.5 w-1.5 rounded-full bg-pink-400" />
            QUIZ INTERRUPT
          </span>
        );
      case 'gameover':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_12px_rgba(239,68,68,0.15)]">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            TERMINATED
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            STANDBY
          </span>
        );
    }
  };

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-4 gap-6 text-slate-200">
      {/* 1. Control Center Panel */}
      <div className="lg:col-span-1 bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 flex flex-col gap-4 shadow-xl">
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">System Controller</h2>
          <div className="flex items-center gap-2 mt-2">
            {getStatusBadge()}
            <span className="text-xs font-mono text-slate-500">T+{elapsedTime.toFixed(1)}s</span>
          </div>
        </div>

        {/* Action Triggers */}
        <div className="flex flex-col gap-2">
          {status !== 'running' ? (
            <button
              onClick={onStart}
              disabled={status === 'gameover' || status === 'awaiting-interaction'}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-all duration-200 shadow-lg shadow-indigo-600/25 active:scale-[0.98]"
            >
              Start Simulation
            </button>
          ) : (
            <button
              onClick={onPause}
              className="w-full py-2.5 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm transition-all duration-200 shadow-lg shadow-amber-600/25 active:scale-[0.98]"
            >
              Pause Simulation
            </button>
          )}

          <button
            onClick={onReset}
            className="w-full py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm border border-slate-700 transition-all duration-200 active:scale-[0.98]"
          >
            Reset Environment
          </button>
        </div>

        {/* Speed Multipliers */}
        <div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">Sim Rate</span>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 4].map((speed) => (
              <button
                key={speed}
                onClick={() => onSetSpeed(speed)}
                className={`py-1.5 rounded-md text-xs font-mono border transition-all ${
                  simulationSpeed === speed
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-inner'
                    : 'bg-slate-800/40 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-300'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Diagnostic Action */}
        <div className="mt-auto pt-4 border-t border-slate-800/60">
          <button
            onClick={onDiagnosticPulse}
            className="w-full py-2 px-3 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-emerald-400 font-mono tracking-wide transition-all duration-200 flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            DIAGNOSTIC PULSE
          </button>
        </div>
      </div>

      {/* 2. Roster Panels (Dynamic Factions) */}
      <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.values(config.factions).map((faction) => {
          const factionUnits = units.filter((u) => u.factionId === faction.id);
          const activeCount = factionUnits.filter((u) => u.hp > 0).length;

          return (
            <div
              key={faction.id}
              className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-xl"
            >
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <h3
                  className="text-sm font-semibold flex items-center gap-1.5"
                  style={{ color: faction.color }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: faction.color }}
                  />
                  {faction.name}
                </h3>
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded border"
                  style={{
                    backgroundColor: `${faction.color}1a`,
                    color: faction.color,
                    borderColor: `${faction.color}33`,
                  }}
                >
                  {activeCount} / {factionUnits.length} Active
                </span>
              </div>

              <div className="flex flex-col gap-2 overflow-y-auto max-h-[280px] pr-1 scrollbar-thin">
                {factionUnits.map((unit) => (
                  <div
                    key={unit.id}
                    className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1.5 transition-all ${
                      unit.hp <= 0
                        ? 'bg-slate-950/40 border-slate-900/40 opacity-40'
                        : 'bg-slate-950/60 border-slate-800/60'
                    }`}
                    style={{
                      borderColor: unit.hp > 0 ? `${faction.color}15` : undefined,
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-medium text-slate-300">
                        {unit.id.split('-').pop()}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        Pos: ({Math.round(unit.x)}, {Math.round(unit.y)})
                      </span>
                    </div>
                    {/* Health Bar */}
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full transition-all duration-300"
                        style={{
                          backgroundColor: faction.color,
                          width: `${(unit.hp / unit.maxHp) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-500 italic truncate max-w-[120px]">
                        {unit.statusText}
                      </span>
                      <span className="font-mono font-semibold" style={{ color: faction.color }}>
                        HP: {Math.round(unit.hp)}/{unit.maxHp}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Terminal Diagnostics Log Panel */}
      <div className="lg:col-span-1 bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-4 flex flex-col gap-2 shadow-xl">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">
          Diagnostic Log Feed
        </h3>
        <div className="flex-1 bg-slate-950/80 border border-slate-900 rounded-lg p-3 overflow-y-auto h-[280px] font-mono text-[10px] text-slate-400 flex flex-col gap-1.5 scrollbar-thin">
          {logs.map((log, index) => (
            <div
              key={index}
              className={`leading-relaxed border-l-2 pl-2 ${
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
          {logs.length === 0 && (
            <div className="text-slate-600 italic">Console output empty.</div>
          )}
        </div>
      </div>
    </div>
  );
};
