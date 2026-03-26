// [GLITCH_ENGINE :: AUDIO_CORE]

export interface Track {
  id: number;
  title: string;
  artist: string;
  duration: string;
  bpm: number;
  color: string;
  accent: string;
  chords: number[][];
  melody: number[];
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private intervalId: any = null;
  private step: number = 0;
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.3;
      this.createNoiseBuffer();
    }
  }

  private createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = 2 * this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }

  setVolume(val: number) {
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(val, this.ctx?.currentTime || 0, 0.1);
  }

  private playKick(time: number) {
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

  private playHiHat(time: number) {
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

  private playChord(time: number, freqs: number[]) {
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

  private playMelody(time: number, freq: number) {
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
    this.stop();
    this.step = 0;
    const secondsPerBeat = 60 / track.bpm;
    const stepTime = secondsPerBeat / 4;

    this.intervalId = setInterval(() => {
      const time = this.ctx!.currentTime + 0.1;
      if (this.step % 8 === 0) this.playKick(time);
      if (this.step % 4 === 0) this.playHiHat(time);
      if (this.step % 16 === 0) {
        const chordIdx = (this.step / 16) % track.chords.length;
        this.playChord(time, track.chords[chordIdx]);
      }
      const melodyIdx = this.step % track.melody.length;
      this.playMelody(time, track.melody[melodyIdx]);
      this.step++;
    }, stepTime * 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const audioEngine = new AudioEngine();
