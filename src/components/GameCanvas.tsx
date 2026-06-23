import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { SimulationCore } from '../game/SimulationCore';
import { MainScene } from '../game/MainScene';

interface GameCanvasProps {
  simulationCore: simulationCore;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ simulationCore }) => {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    // Standard Phaser 4 config structure with preserveDrawingBuffer enabled for snapshots
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 800,
      height: 450,
      parent: 'game-container',
      backgroundColor: '#111827',
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      render: {
        preserveDrawingBuffer: true
      },
      scene: [MainScene]
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Pass the SimulationCore instance to MainScene on launch
    game.scene.start('MainScene', { simulationCore });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [simulationCore]);

  return (
    <div className="relative w-full aspect-[16/9] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
      <div id="game-container" className="w-full h-full flex items-center justify-center" />
    </div>
  );
};
