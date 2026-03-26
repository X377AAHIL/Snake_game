/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Trophy, RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types & Constants ---

interface Track {
  id: number;
  title: string;
  artist: string;
  duration: string;
  bpm: number;
  color: string;
  accent: string;
  chords: number[][]; // Hz values
  melody: number[];   // Hz values
}

const TRACKS: Track[] = [
  {
    id: 0,
    title: "Neon Pulse",
    artist: "CyberSynth AI",
    duration: "2:45",
    bpm: 120,
    color: "#00f2ff", // Cyan
    accent: "#0066ff",
    chords: [[261.63, 329.63, 392.00], [349.23, 440.00, 523.25], [392.00, 493.88, 587.33], [349.23, 440.00, 523.25]],
    melody: [523.25, 0, 587.33, 659.25, 0, 523.25, 440.00, 392.00]
  },
  {
    id: 1,
    title: "Viper Wave",
    artist: "RetroGrid",
    duration: "3:12",
    bpm: 105,
    color: "#ff00ff", // Magenta
    accent: "#8800ff",
    chords: [[220.00, 261.63, 329.63], [293.66, 349.23, 440.00], [261.63, 329.63, 392.00], [196.00, 246.94, 293.66]],
    melody: [440.00, 440.00, 493.88, 523.25, 587.33, 523.25, 493.88, 440.00]
  },
  {
    id: 2,
    title: "Emerald Grid",
    artist: "BioLogic",
    duration: "2:58",
    bpm: 135,
    color: "#00ff88", // Emerald
    accent: "#008844",
    chords: [[261.63, 311.13, 392.00], [311.13, 392.00, 466.16], [349.23, 415.30, 523.25], [261.63, 311.13, 392.00]],
    melody: [392.00, 523.25, 659.25, 783.99, 659.25, 523.25, 392.00, 0]
  }
];

const GRID_SIZE = 20;
const CELL_SIZE = 20;
const INITIAL_SNAKE = [{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 }];
const INITIAL_DIRECTION = { x: 0, y: -1 };

// --- Audio Engine ---

class AudioEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  isPlaying: boolean = false;
  currentTrack: Track | null = null;
  step: number = 0;
  intervalId: any = null;
  noiseBuffer: AudioBuffer | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      
      this.masterGain.gain.value = 0.3;
      this.createNoiseBuffer();
    }
  }

  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(0);
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = 2 * this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }

  setVolume(val: number) {
    if (this.masterGain) this.masterGain.gain.value = val;
  }

  playKick(time: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.1);
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  playHiHat(time: number) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(time);
    source.stop(time + 0.05);
  }

  playChord(time: number, freqs: number[]) {
    if (!this.ctx || !this.masterGain) return;
    freqs.forEach(f => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, time);
      gain.gain.setValueAtTime(0.05, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.4);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.4);
    });
  }

  playMelody(time: number, freq: number) {
    if (!this.ctx || !this.masterGain || freq === 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.03, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  start(track: Track) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.currentTrack = track;
    this.isPlaying = true;
    this.step = 0;
    const secondsPerBeat = 60 / track.bpm;
    const stepTime = secondsPerBeat / 4; // 16th notes

    this.intervalId = setInterval(() => {
      const time = this.ctx!.currentTime + 0.1;
      
      // Kick on 1 and 3
      if (this.step % 8 === 0) this.playKick(time);
      
      // Hi-hat on every 8th
      if (this.step % 4 === 0) this.playHiHat(time);

      // Chords on every bar
      if (this.step % 16 === 0) {
        const chordIdx = (this.step / 16) % track.chords.length;
        this.playChord(time, track.chords[chordIdx]);
      }

      // Melody
      const melodyIdx = this.step % track.melody.length;
      this.playMelody(time, track.melody[melodyIdx]);

      this.step++;
    }, stepTime * 1000);
  }

  stop() {
    this.isPlaying = false;
    if (this.intervalId) clearInterval(this.intervalId);
  }
}

const audioEngine = new AudioEngine();

// --- Components ---

export default function App() {
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const [progress, setProgress] = useState(0);
  
  // Snake State
  const [snake, setSnake] = useState(INITIAL_SNAKE);
  const [direction, setDirection] = useState(INITIAL_DIRECTION);
  const [food, setFood] = useState({ x: 5, y: 5 });
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAMEOVER'>('START');
  
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(32));
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visualizerRef = useRef<HTMLDivElement>(null);
  const track = TRACKS[currentTrackIdx];

  // --- Audio Effects ---
  useEffect(() => {
    let animationFrame: number;
    const updateFrequency = () => {
      if (isPlaying) {
        setFrequencyData(audioEngine.getFrequencyData());
      }
      animationFrame = requestAnimationFrame(updateFrequency);
    };
    updateFrequency();
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      audioEngine.start(track);
    } else {
      audioEngine.stop();
    }
    return () => audioEngine.stop();
  }, [isPlaying, currentTrackIdx]);

  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setProgress(prev => (prev + 0.1) % 100);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // --- Snake Logic ---
  const spawnFood = useCallback((currentSnake: {x: number, y: number}[]) => {
    let newFood;
    while (true) {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE)
      };
      const collision = currentSnake.some(segment => segment.x === newFood!.x && segment.y === newFood!.y);
      if (!collision) break;
    }
    setFood(newFood);
  }, []);

  const moveSnake = useCallback(() => {
    if (gameState !== 'PLAYING') return;

    setSnake(prevSnake => {
      const head = prevSnake[0];
      const newHead = {
        x: (head.x + direction.x + GRID_SIZE) % GRID_SIZE,
        y: (head.y + direction.y + GRID_SIZE) % GRID_SIZE
      };

      // Self collision
      if (prevSnake.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
        setGameState('GAMEOVER');
        if (score > highScore) setHighScore(score);
        return prevSnake;
      }

      const newSnake = [newHead, ...prevSnake];

      // Food collision
      if (newHead.x === food.x && newHead.y === food.y) {
        setScore(s => s + 10);
        spawnFood(newSnake);
      } else {
        newSnake.pop();
      }

      return newSnake;
    });
  }, [direction, food, gameState, score, highScore, spawnFood]);

  useEffect(() => {
    const interval = setInterval(moveSnake, 150);
    return () => clearInterval(interval);
  }, [moveSnake]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp': if (direction.y === 0) setDirection({ x: 0, y: -1 }); break;
        case 'ArrowDown': if (direction.y === 0) setDirection({ x: 0, y: 1 }); break;
        case 'ArrowLeft': if (direction.x === 0) setDirection({ x: -1, y: 0 }); break;
        case 'ArrowRight': if (direction.x === 0) setDirection({ x: 1, y: 0 }); break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [direction]);

  // --- Rendering Canvas ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Food
    ctx.shadowBlur = 15;
    ctx.shadowColor = track.color;
    ctx.fillStyle = track.color;
    ctx.beginPath();
    ctx.arc(food.x * CELL_SIZE + CELL_SIZE / 2, food.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE / 3, 0, Math.PI * 2);
    ctx.fill();

    // Draw Snake
    snake.forEach((segment, i) => {
      const opacity = Math.max(0.2, 1 - (i / snake.length));
      ctx.shadowBlur = i === 0 ? 20 : 0;
      ctx.shadowColor = track.color;
      ctx.fillStyle = i === 0 ? track.color : `${track.color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
      
      ctx.beginPath();
      if (i === 0) {
        // Head
        ctx.roundRect(segment.x * CELL_SIZE + 2, segment.y * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4, 6);
      } else {
        // Body
        ctx.roundRect(segment.x * CELL_SIZE + 4, segment.y * CELL_SIZE + 4, CELL_SIZE - 8, CELL_SIZE - 8, 4);
      }
      ctx.fill();
    });
  }, [snake, food, track]);

  const startGame = () => {
    setSnake(INITIAL_SNAKE);
    setDirection(INITIAL_DIRECTION);
    setScore(0);
    setGameState('PLAYING');
  };

  const nextTrack = () => setCurrentTrackIdx(prev => (prev + 1) % TRACKS.length);
  const prevTrack = () => setCurrentTrackIdx(prev => (prev - 1 + TRACKS.length) % TRACKS.length);

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden p-4 md:p-8">
      {/* Background Orbs */}
      <div className="orb w-[400px] h-[400px] top-[-100px] left-[-100px]" style={{ backgroundColor: track.color }} />
      <div className="orb w-[500px] h-[500px] bottom-[-150px] right-[-150px]" style={{ backgroundColor: track.accent }} />
      <div className="orb w-[300px] h-[300px] top-[40%] left-[60%]" style={{ backgroundColor: track.color }} />

      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 gap-6 z-10">
        
        {/* Left Panel: Playlist & Visualizer */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="glass rounded-3xl p-6 flex-1 flex flex-col">
            <h2 className="text-xl font-bold mb-6 tracking-widest uppercase opacity-80">Playlist</h2>
            <div className="flex flex-col gap-3">
              {TRACKS.map((t, idx) => (
                <button
                  key={t.id}
                  onClick={() => setCurrentTrackIdx(idx)}
                  className={`flex items-center gap-4 p-3 rounded-2xl transition-all duration-300 ${
                    currentTrackIdx === idx ? 'bg-white/10 border-white/20' : 'hover:bg-white/5 border-transparent'
                  } border`}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold" style={{ backgroundColor: t.color, color: '#000' }}>
                    0{idx + 1}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold truncate w-32">{t.title}</div>
                    <div className="text-[10px] opacity-50 uppercase tracking-tighter">{t.artist}</div>
                  </div>
                  <div className="ml-auto text-[10px] opacity-40">{t.duration}</div>
                </button>
              ))}
            </div>

            <div className="mt-auto pt-8">
              <div className="flex items-end justify-between gap-1 h-32 relative overflow-hidden group">
                {/* Glitch Overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity">
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 bg-[length:100%_2px,3px_100%]" />
                </div>
                
                {Array.from(frequencyData.slice(0, 16)).map((val: any, i) => {
                  const height = (Number(val) / 255) * 100;
                  return (
                    <div key={i} className="relative w-full flex flex-col items-center gap-1">
                      {/* Main Bar */}
                      <motion.div
                        animate={{ height: `${Math.max(4, height)}%` }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="w-full rounded-t-sm relative overflow-hidden"
                        style={{ backgroundColor: track.color }}
                      >
                        {/* Scanline effect inside bar */}
                        <div className="absolute inset-0 bg-black/20" style={{ height: '2px', top: '20%' }} />
                        <div className="absolute inset-0 bg-black/20" style={{ height: '2px', top: '50%' }} />
                        <div className="absolute inset-0 bg-black/20" style={{ height: '2px', top: '80%' }} />
                      </motion.div>
                      
                      {/* Glitch Ghost (Magenta) */}
                      <motion.div
                        animate={{ 
                          height: `${Math.max(4, height * 0.8)}%`,
                          x: isPlaying ? [0, -2, 2, 0] : 0,
                          opacity: isPlaying ? [0.2, 0.5, 0.2] : 0.2
                        }}
                        transition={{ duration: 0.2, repeat: Infinity }}
                        className="absolute inset-0 w-full rounded-t-sm pointer-events-none mix-blend-screen"
                        style={{ backgroundColor: '#ff00ff', left: '-2px' }}
                      />
                      
                      {/* Glitch Ghost (Cyan) */}
                      <motion.div
                        animate={{ 
                          height: `${Math.max(4, height * 1.1)}%`,
                          x: isPlaying ? [0, 2, -2, 0] : 0,
                          opacity: isPlaying ? [0.2, 0.5, 0.2] : 0.2
                        }}
                        transition={{ duration: 0.15, repeat: Infinity, delay: 0.05 }}
                        className="absolute inset-0 w-full rounded-t-sm pointer-events-none mix-blend-screen"
                        style={{ backgroundColor: '#00f2ff', left: '2px' }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-center mt-4 opacity-60 font-mono tracking-[0.4em] uppercase flex items-center justify-center gap-2">
                <span className="animate-pulse">●</span>
                <span>Signal Analysis</span>
                <span className="animate-pulse">●</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center Panel: Snake Game */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="glass rounded-3xl p-6 flex flex-col items-center relative overflow-hidden">
            <div className="w-full flex justify-between items-center mb-4 px-4">
              <div className="flex flex-col">
                <span className="text-[10px] opacity-50 uppercase tracking-widest">Score</span>
                <span className="text-2xl font-bold font-mono">{score.toString().padStart(4, '0')}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] opacity-50 uppercase tracking-widest">High Score</span>
                <div className="flex items-center gap-2">
                  <Trophy size={14} className="text-yellow-500" />
                  <span className="text-2xl font-bold font-mono">{highScore.toString().padStart(4, '0')}</span>
                </div>
              </div>
            </div>

            <div className="relative bg-black/40 rounded-xl border border-white/10 p-1">
              <canvas
                ref={canvasRef}
                width={GRID_SIZE * CELL_SIZE}
                height={GRID_SIZE * CELL_SIZE}
                className="rounded-lg"
              />

              <AnimatePresence>
                {gameState === 'START' && (
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg"
                  >
                    <h3 className="text-3xl font-bold mb-6 tracking-[0.2em]">SYNTH SNAKE</h3>
                    <button 
                      onClick={startGame}
                      className="px-8 py-3 rounded-full font-bold tracking-widest transition-all hover:scale-105 active:scale-95"
                      style={{ backgroundColor: track.color, color: '#000' }}
                    >
                      START MISSION
                    </button>
                    <p className="mt-4 text-[10px] opacity-50">USE ARROW KEYS OR D-PAD</p>
                  </motion.div>
                )}

                {gameState === 'GAMEOVER' && (
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md rounded-lg"
                  >
                    <h3 className="text-3xl font-bold mb-2 text-red-500 tracking-[0.2em]">GAME OVER</h3>
                    <p className="text-xl font-mono mb-8">FINAL SCORE: {score}</p>
                    <button 
                      onClick={startGame}
                      className="flex items-center gap-2 px-8 py-3 rounded-full font-bold tracking-widest transition-all hover:scale-105 active:scale-95"
                      style={{ backgroundColor: track.color, color: '#000' }}
                    >
                      <RefreshCw size={18} />
                      RETRY
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mobile D-Pad */}
            <div className="mt-6 grid grid-cols-3 gap-2 lg:hidden">
              <div />
              <button onClick={() => direction.y === 0 && setDirection({ x: 0, y: -1 })} className="w-12 h-12 glass rounded-xl flex items-center justify-center"><ChevronUp /></button>
              <div />
              <button onClick={() => direction.x === 0 && setDirection({ x: -1, y: 0 })} className="w-12 h-12 glass rounded-xl flex items-center justify-center"><ChevronLeft /></button>
              <button onClick={() => direction.y === 0 && setDirection({ x: 0, y: 1 })} className="w-12 h-12 glass rounded-xl flex items-center justify-center"><ChevronDown /></button>
              <button onClick={() => direction.x === 0 && setDirection({ x: 1, y: 0 })} className="w-12 h-12 glass rounded-xl flex items-center justify-center"><ChevronRight /></button>
            </div>
          </div>
        </div>

        {/* Right Panel: Now Playing */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="glass rounded-3xl p-6 flex flex-col items-center">
            <h2 className="text-xl font-bold mb-6 tracking-widest uppercase opacity-80 w-full">Now Playing</h2>
            
            <div className="relative w-full aspect-square rounded-2xl overflow-hidden mb-6 group">
              <div className="absolute inset-0 bg-gradient-to-br opacity-40" style={{ from: track.color, to: track.accent }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border-4 border-white/20 flex items-center justify-center animate-spin-slow">
                  <div className="w-4 h-4 rounded-full bg-white/40" />
                </div>
              </div>
              {/* Album Art Placeholder */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                 <div className="text-4xl font-black opacity-20 tracking-tighter rotate-[-15deg]">SYNTH</div>
              </div>
            </div>

            <div className="text-center mb-8">
              <h3 className="text-lg font-bold truncate w-48">{track.title}</h3>
              <p className="text-xs opacity-50 uppercase tracking-widest">{track.artist}</p>
            </div>

            {/* Controls */}
            <div className="w-full flex flex-col gap-6">
              <div className="w-full">
                <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full transition-all duration-300" style={{ width: `${progress}%`, backgroundColor: track.color }} />
                </div>
                <div className="flex justify-between mt-2 text-[10px] opacity-40 font-mono">
                  <span>0:00</span>
                  <span>{track.duration}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-8">
                <button onClick={prevTrack} className="opacity-60 hover:opacity-100 transition-opacity"><SkipBack size={24} /></button>
                <button 
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-lg"
                  style={{ backgroundColor: track.color, color: '#000', boxShadow: `0 0 20px ${track.color}44` }}
                >
                  {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                </button>
                <button onClick={nextTrack} className="opacity-60 hover:opacity-100 transition-opacity"><SkipForward size={24} /></button>
              </div>

              <div className="flex items-center gap-4 px-2">
                <Volume2 size={16} className="opacity-40" />
                <input 
                  type="range" 
                  min="0" max="1" step="0.01" 
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-white opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
        input[type='range'] {
          -webkit-appearance: none;
          background: rgba(255,255,255,0.1);
          height: 4px;
          border-radius: 2px;
        }
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
