export interface Sample {
  id: string;
  name: string;
  buffer: AudioBuffer | null;
  color: string;
}

export interface PatternNote {
  sampleId: string | null;
  volume: number;
  pitch: number; // semitones from original pitch (-24 to +24)
}

export interface Pattern {
  rows: PatternNote[][];
  length: number;
  tracks: number;
}

export interface DuckingSettings {
  enabled: boolean;
  sourceTrack: number | null; // Which track triggers the ducking
  amount: number; // 0-100, how much to reduce volume
  attack: number; // ms, how fast ducking kicks in
  release: number; // ms, how fast volume recovers
}

export interface TrackSettings {
  volume: number; // 0-100, track fader level
  ducking: DuckingSettings;
}

const SAMPLE_COLORS = [
  'hsl(175, 80%, 50%)',
  'hsl(30, 90%, 55%)',
  'hsl(280, 70%, 60%)',
  'hsl(340, 80%, 55%)',
  'hsl(200, 70%, 55%)',
  'hsl(120, 60%, 50%)',
  'hsl(45, 90%, 55%)',
  'hsl(0, 80%, 55%)',
];

class AudioEngine {
  private context: AudioContext | null = null;
  private samples: Map<string, Sample> = new Map();
  private isPlaying = false;
  private currentRow = 0;
  private bpm = 125;
  private pattern: Pattern;
  private intervalId: number | null = null;
  private onRowChange: ((row: number) => void) | null = null;
  private onPlayStateChange: ((playing: boolean) => void) | null = null;
  private activeTrackSources: Map<number, AudioBufferSourceNode> = new Map();
  private activeTrackGains: Map<number, GainNode> = new Map();
  private trackMutes: Set<number> = new Set();
  private trackSolos: Set<number> = new Set();
  private trackSettings: Map<number, TrackSettings> = new Map();
  private duckingState: Map<number, number> = new Map(); // track -> current duck amount (0-1)
  private lastTriggerTime: Map<number, number> = new Map(); // track -> last trigger timestamp

  constructor() {
    this.pattern = this.createEmptyPattern(64, 7);
    this.initTrackSettings(7);
  }

  private initTrackSettings(tracks: number) {
    for (let i = 0; i < tracks; i++) {
      this.trackSettings.set(i, this.getDefaultTrackSettings());
    }
  }

  private getDefaultTrackSettings(): TrackSettings {
    return {
      volume: 100,
      ducking: {
        enabled: false,
        sourceTrack: null,
        amount: 50,
        attack: 10,
        release: 100,
      },
    };
  }

  createEmptyPattern(length: number, tracks: number): Pattern {
    const rows: PatternNote[][] = [];
    for (let i = 0; i < length; i++) {
      const row: PatternNote[] = [];
      for (let t = 0; t < tracks; t++) {
        row.push({ sampleId: null, volume: 100, pitch: 0 });
      }
      rows.push(row);
    }
    return { rows, length, tracks };
  }

  async init() {
    if (!this.context) {
      this.context = new AudioContext();
    }

    // Some browsers can leave resume() pending if not triggered by a valid user gesture.
    // Don't block forever here; decoding can still work even if the context stays suspended.
    if (this.context.state === "suspended") {
      try {
        await Promise.race([
          this.context.resume(),
          new Promise<void>((resolve) => setTimeout(resolve, 1000)),
        ]);
      } catch {
        // Ignore resume failures; we'll try again later.
      }
    }
  }

  async loadSample(file: File): Promise<Sample> {
    await this.init();
    
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.context!.decodeAudioData(arrayBuffer);
    
    const id = crypto.randomUUID();
    const colorIndex = this.samples.size % SAMPLE_COLORS.length;
    
    const sample: Sample = {
      id,
      name: file.name.replace(/\.[^/.]+$/, ''),
      buffer: audioBuffer,
      color: SAMPLE_COLORS[colorIndex],
    };
    
    this.samples.set(id, sample);
    return sample;
  }

  async loadSampleFromBase64(base64: string, name: string, format: string = 'mp3'): Promise<Sample> {
    console.log(`[AudioEngine] loadSampleFromBase64 called for "${name}", format: ${format}, base64 length: ${base64?.length || 0}`);

    if (!base64) {
      throw new Error(`No base64 data provided for sample "${name}"`);
    }

    const cleanedBase64 = base64
      .trim()
      .replace(/^data:.*;base64,/, "")
      .replace(/\s+/g, "");

    await this.init();

    try {
      const mime = format === 'wav'
        ? 'audio/wav'
        : format === 'mp3' || format === 'mpeg'
          ? 'audio/mpeg'
          : `audio/${format}`;

      const dataUrl = `data:${mime};base64,${cleanedBase64}`;
      console.log(`[AudioEngine] base64 -> ArrayBuffer via fetch for "${name}" (${mime})...`);

      const arrayBuffer = await Promise.race([
        fetch(dataUrl).then((r) => r.arrayBuffer()),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Audio data conversion timed out for "${name}"`)), 2000)
        ),
      ]);
      console.log(`[AudioEngine] Got ArrayBuffer (${arrayBuffer.byteLength} bytes) for "${name}"`);

      // Safari/iOS + some Chromium builds can hang on the promise form; callback form is more reliable.
      const decodeWithCallback = (buf: ArrayBuffer) =>
        new Promise<AudioBuffer>((resolve, reject) => {
          // decodeAudioData may detach/consume the buffer; pass a copy.
          const copy = buf.slice(0);
          this.context!.decodeAudioData(copy, resolve, reject);
        });

      console.log(`[AudioEngine] Decoding audio data for "${name}"...`);
      const audioBuffer = await Promise.race([
        decodeWithCallback(arrayBuffer),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Audio decode timed out for "${name}"`)), 8000)
        ),
      ]);

      console.log(
        `[AudioEngine] Audio decoded for "${name}": duration=${audioBuffer.duration.toFixed(2)}s, channels=${audioBuffer.numberOfChannels}`
      );

      const id = crypto.randomUUID();
      const colorIndex = this.samples.size % SAMPLE_COLORS.length;

      const sample: Sample = {
        id,
        name,
        buffer: audioBuffer,
        color: SAMPLE_COLORS[colorIndex],
      };

      this.samples.set(id, sample);
      console.log(`[AudioEngine] Sample "${name}" added with id ${id}. Total samples: ${this.samples.size}`);
      return sample;
    } catch (error) {
      console.error(`[AudioEngine] Failed to load sample "${name}":`, error);
      throw error;
    }
  }

  getSamples(): Sample[] {
    return Array.from(this.samples.values());
  }

  getPattern(): Pattern {
    return this.pattern;
  }

  setNote(row: number, track: number, sampleId: string | null) {
    if (row >= 0 && row < this.pattern.length && track >= 0 && track < this.pattern.tracks) {
      this.pattern.rows[row][track].sampleId = sampleId;
    }
  }

  setVolume(row: number, track: number, volume: number) {
    if (row >= 0 && row < this.pattern.length && track >= 0 && track < this.pattern.tracks) {
      this.pattern.rows[row][track].volume = Math.max(0, Math.min(100, volume));
    }
  }

  setPitch(row: number, track: number, pitch: number) {
    if (row >= 0 && row < this.pattern.length && track >= 0 && track < this.pattern.tracks) {
      this.pattern.rows[row][track].pitch = Math.max(-24, Math.min(24, pitch));
    }
  }

  playSample(sampleId: string, track?: number, noteVolume: number = 100, pitch: number = 0) {
    const sample = this.samples.get(sampleId);
    if (sample?.buffer && this.context) {
      // Stop any existing source on this track
      if (track !== undefined) {
        const existingSource = this.activeTrackSources.get(track);
        if (existingSource) {
          try {
            existingSource.stop();
          } catch (e) {
            // Already stopped
          }
        }
      }

      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      
      // Calculate volume: note volume * track fader
      const trackSettings = track !== undefined ? this.trackSettings.get(track) : null;
      const trackVolume = trackSettings?.volume ?? 100;
      const combinedVolume = (noteVolume / 100) * (trackVolume / 100);
      
      gain.gain.value = combinedVolume;
      source.buffer = sample.buffer;
      source.playbackRate.value = Math.pow(2, pitch / 12);
      source.connect(gain);
      gain.connect(this.context.destination);
      source.start();

      // Track the source and gain for this track (for ducking automation)
      if (track !== undefined) {
        this.activeTrackSources.set(track, source);
        this.activeTrackGains.set(track, gain);
        this.lastTriggerTime.set(track, this.context.currentTime);
        
        // Trigger ducking on tracks that use this track as source
        this.triggerDucking(track);
        
        source.onended = () => {
          if (this.activeTrackSources.get(track) === source) {
            this.activeTrackSources.delete(track);
            this.activeTrackGains.delete(track);
          }
        };
      }
    }
  }

  private triggerDucking(sourceTrack: number) {
    if (!this.context) return;
    
    const now = this.context.currentTime;
    
    // Find all tracks that duck from this source
    for (let track = 0; track < this.pattern.tracks; track++) {
      const settings = this.trackSettings.get(track);
      if (!settings?.ducking.enabled || settings.ducking.sourceTrack !== sourceTrack) {
        continue;
      }
      
      const gainNode = this.activeTrackGains.get(track);
      if (!gainNode) continue;
      
      const { amount, attack, release } = settings.ducking;
      const duckLevel = 1 - (amount / 100);
      const attackTime = attack / 1000;
      const releaseTime = release / 1000;
      
      // Cancel any scheduled changes
      gainNode.gain.cancelScheduledValues(now);
      
      // Get current track volume as base
      const trackVolume = settings.volume / 100;
      
      // Duck down
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(trackVolume * duckLevel, now + attackTime);
      
      // Release back up
      gainNode.gain.linearRampToValueAtTime(trackVolume, now + attackTime + releaseTime);
    }
  }

  private isTrackAudible(track: number): boolean {
    // If any track is soloed, only soloed tracks are audible
    if (this.trackSolos.size > 0) {
      return this.trackSolos.has(track);
    }
    // Otherwise, non-muted tracks are audible
    return !this.trackMutes.has(track);
  }

  private playRow(row: number) {
    // First, record which tracks will trigger (for ducking)
    const triggeredTracks: number[] = [];
    
    for (let track = 0; track < this.pattern.tracks; track++) {
      const note = this.pattern.rows[row][track];
      if (note.sampleId && this.isTrackAudible(track)) {
        triggeredTracks.push(track);
      }
    }
    
    // Play all notes
    for (let track = 0; track < this.pattern.tracks; track++) {
      const note = this.pattern.rows[row][track];
      if (note.sampleId && this.isTrackAudible(track)) {
        this.playSample(note.sampleId, track, note.volume, note.pitch);
      }
    }
  }

  toggleMute(track: number): boolean {
    if (this.trackMutes.has(track)) {
      this.trackMutes.delete(track);
      return false;
    } else {
      this.trackMutes.add(track);
      return true;
    }
  }

  toggleSolo(track: number): boolean {
    if (this.trackSolos.has(track)) {
      this.trackSolos.delete(track);
      return false;
    } else {
      this.trackSolos.add(track);
      return true;
    }
  }

  isTrackMuted(track: number): boolean {
    return this.trackMutes.has(track);
  }

  isTrackSoloed(track: number): boolean {
    return this.trackSolos.has(track);
  }

  getTrackMutes(): Set<number> {
    return new Set(this.trackMutes);
  }

  getTrackSolos(): Set<number> {
    return new Set(this.trackSolos);
  }

  // Track Settings Management
  getTrackSettings(track: number): TrackSettings {
    return this.trackSettings.get(track) || this.getDefaultTrackSettings();
  }

  getAllTrackSettings(): Map<number, TrackSettings> {
    return new Map(this.trackSettings);
  }

  setTrackVolume(track: number, volume: number) {
    const settings = this.trackSettings.get(track) || this.getDefaultTrackSettings();
    settings.volume = Math.max(0, Math.min(100, volume));
    this.trackSettings.set(track, settings);
    
    // Update active gain node if playing
    const gainNode = this.activeTrackGains.get(track);
    if (gainNode && this.context) {
      gainNode.gain.setValueAtTime(settings.volume / 100, this.context.currentTime);
    }
  }

  setTrackDucking(track: number, ducking: Partial<DuckingSettings>) {
    const settings = this.trackSettings.get(track) || this.getDefaultTrackSettings();
    settings.ducking = { ...settings.ducking, ...ducking };
    this.trackSettings.set(track, settings);
  }

  setTrackDuckingEnabled(track: number, enabled: boolean) {
    this.setTrackDucking(track, { enabled });
  }

  setTrackDuckingSource(track: number, sourceTrack: number | null) {
    this.setTrackDucking(track, { sourceTrack });
  }

  setTrackDuckingAmount(track: number, amount: number) {
    this.setTrackDucking(track, { amount: Math.max(0, Math.min(100, amount)) });
  }

  setTrackDuckingAttack(track: number, attack: number) {
    this.setTrackDucking(track, { attack: Math.max(1, Math.min(500, attack)) });
  }

  setTrackDuckingRelease(track: number, release: number) {
    this.setTrackDucking(track, { release: Math.max(10, Math.min(2000, release)) });
  }

  setBpm(bpm: number) {
    this.bpm = Math.max(60, Math.min(300, bpm));
    if (this.isPlaying) {
      this.stop();
      this.play();
    }
  }

  getBpm() {
    return this.bpm;
  }

  play() {
    if (this.isPlaying) return;
    
    this.init();
    this.isPlaying = true;
    this.onPlayStateChange?.(true);
    
    const msPerRow = (60 / this.bpm) * 1000 / 4;
    
    this.playRow(this.currentRow);
    this.onRowChange?.(this.currentRow);
    
    this.intervalId = window.setInterval(() => {
      this.currentRow = (this.currentRow + 1) % this.pattern.length;
      this.playRow(this.currentRow);
      this.onRowChange?.(this.currentRow);
    }, msPerRow);
  }

  stop() {
    this.isPlaying = false;
    this.onPlayStateChange?.(false);
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // Stop all active sample sources
    this.activeTrackSources.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
        // Already stopped
      }
    });
    this.activeTrackSources.clear();
    
    this.currentRow = 0;
    this.onRowChange?.(0);
  }

  getIsPlaying() {
    return this.isPlaying;
  }

  getCurrentRow() {
    return this.currentRow;
  }

  setOnRowChange(callback: (row: number) => void) {
    this.onRowChange = callback;
  }

  setOnPlayStateChange(callback: (playing: boolean) => void) {
    this.onPlayStateChange = callback;
  }

  deleteSample(id: string) {
    this.samples.delete(id);
    // Clear from pattern
    for (let row = 0; row < this.pattern.length; row++) {
      for (let track = 0; track < this.pattern.tracks; track++) {
        if (this.pattern.rows[row][track].sampleId === id) {
          this.pattern.rows[row][track].sampleId = null;
        }
      }
    }
  }

  clearAllSamples() {
    this.samples.clear();
  }

  async trimSample(id: string, startSeconds: number, endSeconds: number): Promise<boolean> {
    const sample = this.samples.get(id);
    if (!sample?.buffer || !this.context) {
      return false;
    }

    const buffer = sample.buffer;
    const sampleRate = buffer.sampleRate;
    const startSample = Math.floor(startSeconds * sampleRate);
    const endSample = Math.floor(endSeconds * sampleRate);
    
    // Validate bounds
    if (startSample < 0 || endSample > buffer.length || startSample >= endSample) {
      return false;
    }

    const newLength = endSample - startSample;
    const numberOfChannels = buffer.numberOfChannels;
    
    // Create new buffer with trimmed audio
    const newBuffer = this.context.createBuffer(numberOfChannels, newLength, sampleRate);
    
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const oldData = buffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);
      for (let i = 0; i < newLength; i++) {
        newData[i] = oldData[startSample + i];
      }
    }

    // Replace the sample's buffer
    sample.buffer = newBuffer;
    return true;
  }

  getSampleDuration(id: string): number | null {
    const sample = this.samples.get(id);
    if (!sample?.buffer) return null;
    return sample.buffer.duration;
  }

  getSampleWaveform(id: string, numPoints: number = 100): number[] {
    const sample = this.samples.get(id);
    if (!sample?.buffer) return [];
    
    const channelData = sample.buffer.getChannelData(0);
    const samplesPerPoint = Math.floor(channelData.length / numPoints);
    const waveform: number[] = [];
    
    for (let i = 0; i < numPoints; i++) {
      const start = i * samplesPerPoint;
      const end = Math.min(start + samplesPerPoint, channelData.length);
      
      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j]);
        if (abs > max) max = abs;
      }
      waveform.push(max);
    }
    
    return waveform;
  }

  async exportToWav(repeats: number = 1, onProgress?: (progress: number) => void): Promise<Blob> {
    await this.init();
    
    const sampleRate = this.context!.sampleRate;
    const secondsPerRow = (60 / this.bpm) / 4;
    const totalRows = this.pattern.length * repeats;
    const totalSeconds = totalRows * secondsPerRow;
    const totalSamples = Math.ceil(totalSeconds * sampleRate);
    
    // Create offline context for rendering
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
    
    // Schedule all notes
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (let row = 0; row < this.pattern.length; row++) {
        const globalRow = repeat * this.pattern.length + row;
        const startTime = globalRow * secondsPerRow;
        
        for (let track = 0; track < this.pattern.tracks; track++) {
          const note = this.pattern.rows[row][track];
          // Check audibility inline to avoid 'this' binding issues
          const hasSolos = this.trackSolos.size > 0;
          const isAudible = hasSolos ? this.trackSolos.has(track) : !this.trackMutes.has(track);
          
          if (note.sampleId && isAudible) {
            const sample = this.samples.get(note.sampleId);
            if (sample?.buffer) {
              const source = offlineCtx.createBufferSource();
              const gain = offlineCtx.createGain();
              
              // Include track volume in export
              const trackSettings = this.trackSettings.get(track);
              const trackVolume = trackSettings?.volume ?? 100;
              const combinedVolume = (note.volume / 100) * (trackVolume / 100);
              
              gain.gain.value = combinedVolume;
              source.buffer = sample.buffer;
              source.playbackRate.value = Math.pow(2, note.pitch / 12);
              source.connect(gain);
              gain.connect(offlineCtx.destination);
              source.start(startTime);
            }
          }
        }
        
        if (onProgress) {
          onProgress((globalRow + 1) / totalRows * 0.5);
        }
      }
    }
    
    // Render audio
    const renderedBuffer = await offlineCtx.startRendering();
    if (onProgress) onProgress(0.75);
    
    // Convert to WAV
    const wavBlob = this.bufferToWav(renderedBuffer);
    if (onProgress) onProgress(1);
    
    return wavBlob;
  }

  private bufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const dataLength = buffer.length * blockAlign;
    const bufferLength = 44 + dataLength;
    
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, bufferLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    
    // Interleave channels and convert to 16-bit
    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(buffer.getChannelData(c));
    }
    
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        const sample = Math.max(-1, Math.min(1, channels[c][i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }
}

export const audioEngine = new AudioEngine();
