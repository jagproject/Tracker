
import React, { useEffect, useState } from 'react';

const COLORS = ['#DD0000', '#FFCC00', '#000000', '#FFFFFF', '#10B981'];

export const Confetti: React.FC = () => {
  const [particles, setParticles] = useState<any[]>([]);

  useEffect(() => {
    // Generate particles
    const newParticles = Array.from({ length: 100 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100, // %
      y: -10 - Math.random() * 20, // Start above screen
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 5 + Math.random() * 10,
      speed: 2 + Math.random() * 5,
      angle: Math.random() * 360,
      spin: -5 + Math.random() * 10,
      delay: Math.random() * 2
    }));
    setParticles(newParticles);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[200] overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            animation: `fall ${p.speed}s linear ${p.delay}s forwards`,
            transform: `rotate(${p.angle}deg)`
          }}
        />
      ))}
      <style>{`
        @keyframes fall {
          0% { top: -10%; transform: rotate(0deg) translateX(0px); opacity: 1; }
          100% { top: 110%; transform: rotate(${360 * 2}deg) translateX(${Math.random() * 100 - 50}px); opacity: 0; }
        }
      `}</style>
    </div>
  );
};
