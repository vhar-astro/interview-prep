import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  volume: number;
  isActive: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ volume, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Animation loop
    const animate = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      // Base radius plus volume modulation
      // If active, pulse significantly. If not, small breath.
      const baseRadius = 40;
      const pulse = isActive ? volume * 50 : Math.sin(Date.now() / 500) * 5;
      const radius = baseRadius + pulse;

      // Draw outer glow
      const gradient = ctx.createRadialGradient(centerX, centerY, baseRadius, centerX, centerY, radius + 20);
      gradient.addColorStop(0, 'rgba(56, 189, 248, 0.8)'); // Light Blue
      gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 20, 0, Math.PI * 2);
      ctx.fill();

      // Draw core circle
      ctx.fillStyle = isActive ? '#0ea5e9' : '#475569'; // Sky 500 or Slate 600
      ctx.beginPath();
      ctx.arc(centerX, centerY, isActive ? radius : baseRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw ring
      ctx.strokeStyle = '#e0f2fe'; // Sky 50
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, isActive ? radius * 0.8 : baseRadius * 0.8, 0, Math.PI * 2);
      ctx.stroke();

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [volume, isActive]);

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={300} 
      className="w-full max-w-[300px] h-auto mx-auto"
    />
  );
};

export default AudioVisualizer;
