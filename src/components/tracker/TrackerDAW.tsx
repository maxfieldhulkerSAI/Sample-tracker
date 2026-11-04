import { useState, useEffect, useCallback } from "react";
import { audioEngine, Sample, PatternNote, TrackSettings } from "@/lib/audioEngine";
import { TransportControls } from "./TransportControls";
import { SampleBrowser } from "./SampleBrowser";
import { TrackerGrid } from "./TrackerGrid";
import { TrackView } from "./TrackView";
import { TrackerChat } from "./TrackerChat";
import { Mixer } from "./Mixer";
import { toast } from "sonner";
import { generateAudio, generateSong, backendMode, MissingKeyError } from "@/lib/backend";
import { SettingsDialog } from "./SettingsDialog";
import type { ApiKeys } from "@/lib/keys";
import { Button } from "@/components/ui/button";
import { Grid3X3, Rows3, SlidersHorizontal, KeyRound } from "lucide-react";

type ViewMode = "tracker" | "tracks";

export interface Selection {
  startRow: number;
  endRow: number;
  startTrack: number;
  endTrack: number;
}

export function TrackerDAW() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [selectedSample, setSelectedSample] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentRow, setCurrentRow] = useState(0);
  const [bpm, setBpm] = useState(125);
  const [pattern, setPattern] = useState(audioEngine.getPattern());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingSong, setIsGeneratingSong] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("tracker");
  const [trackMutes, setTrackMutes] = useState<Set<number>>(new Set());
  const [trackSolos, setTrackSolos] = useState<Set<number>>(new Set());
  const [trackSettings, setTrackSettings] = useState<Map<number, TrackSettings>>(
    audioEngine.getAllTrackSettings()
  );
  const [showMixer, setShowMixer] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [missingKey, setMissingKey] = useState<keyof ApiKeys | null>(null);

  // In direct mode a missing key opens Settings on the right field instead of just erroring.
  const openSettingsFor = useCallback((err: unknown) => {
    if (err instanceof MissingKeyError) {
      setMissingKey(err.provider);
      setSettingsOpen(true);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    audioEngine.setOnRowChange(setCurrentRow);
    audioEngine.setOnPlayStateChange(setIsPlaying);
  }, []);

  const handleLoadSample = useCallback(async (file: File) => {
    try {
      const sample = await audioEngine.loadSample(file);
      setSamples(audioEngine.getSamples());
      setSelectedSample(sample.id);
      toast.success(`Loaded "${sample.name}"`);
    } catch (error) {
      toast.error("Failed to load sample");
    }
  }, []);

  const handleGenerateSample = useCallback(async (prompt: string, duration: number, isMelodic?: boolean, key?: string) => {
    setIsGenerating(true);
    const typeLabel = isMelodic ? `melodic "${prompt}"` : `"${prompt}"`;
    const toastId = toast.loading(`Generating ${typeLabel}...`);
    
    try {
      const data = await generateAudio({
        prompt,
        duration,
        bpm,
        isMelodic: isMelodic || false,
        key,
      });

      // Load the generated audio
      const sample = await audioEngine.loadSampleFromBase64(
        data.audio, 
        prompt.slice(0, 20), 
        data.format
      );
      
      setSamples(audioEngine.getSamples());
      setSelectedSample(sample.id);
      toast.success(`Generated "${sample.name}"`, { id: toastId });
    } catch (error) {
      console.error('Generate error:', error);
      toast.error(error instanceof Error ? error.message : "Failed to generate sample", { id: toastId });
      openSettingsFor(error);
    } finally {
      setIsGenerating(false);
    }
  }, [bpm, openSettingsFor]);

  const handleDeleteSample = useCallback((id: string) => {
    audioEngine.deleteSample(id);
    setSamples(audioEngine.getSamples());
    setPattern({ ...audioEngine.getPattern() });
    if (selectedSample === id) {
      setSelectedSample(null);
    }
    toast.success("Sample deleted");
  }, [selectedSample]);

  const handlePreviewSample = useCallback((id: string) => {
    audioEngine.playSample(id);
  }, []);

  const handleSetNote = useCallback((row: number, track: number, sampleId: string | null) => {
    audioEngine.setNote(row, track, sampleId);
    setPattern({ ...audioEngine.getPattern() });
    if (sampleId) {
      audioEngine.playSample(sampleId);
    }
  }, []);

  const handleSetVolume = useCallback((row: number, track: number, volume: number) => {
    audioEngine.setVolume(row, track, volume);
    setPattern({ ...audioEngine.getPattern() });
  }, []);

  const handleSetPitch = useCallback((row: number, track: number, pitch: number) => {
    audioEngine.setPitch(row, track, pitch);
    setPattern({ ...audioEngine.getPattern() });
  }, []);

  const handleToggleMute = useCallback((track: number) => {
    audioEngine.toggleMute(track);
    setTrackMutes(audioEngine.getTrackMutes());
  }, []);

  const handleToggleSolo = useCallback((track: number) => {
    audioEngine.toggleSolo(track);
    setTrackSolos(audioEngine.getTrackSolos());
  }, []);

  // Mixer handlers
  const handleSetTrackVolume = useCallback((track: number, volume: number) => {
    audioEngine.setTrackVolume(track, volume);
    setTrackSettings(new Map(audioEngine.getAllTrackSettings()));
  }, []);

  const handleSetDuckingEnabled = useCallback((track: number, enabled: boolean) => {
    audioEngine.setTrackDuckingEnabled(track, enabled);
    setTrackSettings(new Map(audioEngine.getAllTrackSettings()));
  }, []);

  const handleSetDuckingSource = useCallback((track: number, source: number | null) => {
    audioEngine.setTrackDuckingSource(track, source);
    setTrackSettings(new Map(audioEngine.getAllTrackSettings()));
  }, []);

  const handleSetDuckingAmount = useCallback((track: number, amount: number) => {
    audioEngine.setTrackDuckingAmount(track, amount);
    setTrackSettings(new Map(audioEngine.getAllTrackSettings()));
  }, []);

  const handleSetDuckingAttack = useCallback((track: number, attack: number) => {
    audioEngine.setTrackDuckingAttack(track, attack);
    setTrackSettings(new Map(audioEngine.getAllTrackSettings()));
  }, []);

  const handleSetDuckingRelease = useCallback((track: number, release: number) => {
    audioEngine.setTrackDuckingRelease(track, release);
    setTrackSettings(new Map(audioEngine.getAllTrackSettings()));
  }, []);

  const handlePlay = useCallback(() => {
    audioEngine.play();
  }, []);

  const handleStop = useCallback(() => {
    audioEngine.stop();
  }, []);

  const handleBpmChange = useCallback((newBpm: number) => {
    setBpm(newBpm);
    audioEngine.setBpm(newBpm);
  }, []);

  const handleClearPattern = useCallback(() => {
    for (let row = 0; row < pattern.length; row++) {
      for (let track = 0; track < pattern.tracks; track++) {
        audioEngine.setNote(row, track, null);
      }
    }
    setPattern({ ...audioEngine.getPattern() });
    toast.success("Pattern cleared");
  }, [pattern.length, pattern.tracks]);

  const handleTrimSample = useCallback(async (id: string, startSeconds: number, endSeconds: number) => {
    const success = await audioEngine.trimSample(id, startSeconds, endSeconds);
    if (success) {
      setSamples([...audioEngine.getSamples()]);
      toast.success("Sample trimmed");
    } else {
      toast.error("Failed to trim sample");
    }
    return success;
  }, []);

  const getSampleDuration = useCallback((id: string) => {
    return audioEngine.getSampleDuration(id);
  }, []);

  const handleRestorePattern = useCallback((rows: PatternNote[][], savedBpm: number) => {
    // Restore BPM
    setBpm(savedBpm);
    audioEngine.setBpm(savedBpm);
    
    // Restore pattern rows
    for (let row = 0; row < rows.length; row++) {
      for (let track = 0; track < rows[row].length; track++) {
        const note = rows[row][track];
        audioEngine.setNote(row, track, note.sampleId);
        audioEngine.setVolume(row, track, note.volume);
        audioEngine.setPitch(row, track, note.pitch);
      }
    }
    setPattern({ ...audioEngine.getPattern() });
  }, []);

  const handleGenerateSong = useCallback(async (description: string) => {
    setIsGeneratingSong(true);
    const toastId = toast.loading("Planning and generating your song...");
    
    try {
      // Clear existing pattern and samples first
      for (let row = 0; row < pattern.length; row++) {
        for (let track = 0; track < pattern.tracks; track++) {
          audioEngine.setNote(row, track, null);
        }
      }
      audioEngine.clearAllSamples();
      setSamples([]);
      setSelectedSample(null);
      setPattern({ ...audioEngine.getPattern() });

      console.log(`[GenerateSong] Generating via ${backendMode} backend...`);
      const data = await generateSong(description, pattern.length, pattern.tracks, (stage) => {
        toast.loading(`${stage}...`, { id: toastId });
      });

      console.log('[GenerateSong] Raw response:', data);

      if (!data) {
        console.error('[GenerateSong] No data returned');
        throw new Error('No data returned from song generation');
      }

      // Validate response structure
      console.log('[GenerateSong] Validating response structure...');
      console.log('[GenerateSong] BPM:', data.bpm);
      console.log('[GenerateSong] Samples:', data.samples);
      console.log('[GenerateSong] Pattern:', data.pattern);

      if (!data.samples || !Array.isArray(data.samples)) {
        console.error('[GenerateSong] Invalid samples array:', data.samples);
        throw new Error('Invalid samples data received');
      }

      if (!data.pattern || !Array.isArray(data.pattern)) {
        console.error('[GenerateSong] Invalid pattern array:', data.pattern);
        throw new Error('Invalid pattern data received');
      }

      // Set BPM
      if (data.bpm) {
        console.log('[GenerateSong] Setting BPM to:', data.bpm);
        setBpm(data.bpm);
        audioEngine.setBpm(data.bpm);
      }

      // Load all generated samples
      toast.loading(`Loading ${data.samples.length} samples...`, { id: toastId });
      const loadedSamples: { id: string; index: number }[] = [];
      
      for (let i = 0; i < data.samples.length; i++) {
        const sampleData = data.samples[i];
        toast.loading(`Loading sample ${i + 1}/${data.samples.length}: ${sampleData.name || 'Untitled'}`, { id: toastId });

        console.log(`[GenerateSong] Loading sample ${i + 1}/${data.samples.length}:`, {
          name: sampleData.name,
          format: sampleData.format,
          audioLength: sampleData.audio?.length || 0
        });
        
        if (!sampleData.audio) {
          console.error(`[GenerateSong] Sample ${i} has no audio data`);
          continue;
        }

        try {
          const sample = await audioEngine.loadSampleFromBase64(
            sampleData.audio,
            sampleData.name,
            sampleData.format
          );
          console.log(`[GenerateSong] Successfully loaded sample:`, sample.id, sample.name);
          loadedSamples.push({ id: sample.id, index: i });
        } catch (sampleError) {
          console.error(`[GenerateSong] Failed to load sample ${i}:`, sampleError);
        }
      }

      console.log('[GenerateSong] Loaded samples:', loadedSamples);
      setSamples(audioEngine.getSamples());

      // Place notes in the pattern
      toast.loading(`Placing ${data.pattern.length} notes...`, { id: toastId });
      let notesPlaced = 0;
      
      for (const note of data.pattern) {
        const sampleMapping = loadedSamples.find(s => s.index === note.sampleIndex);
        if (sampleMapping) {
          console.log(`[GenerateSong] Placing note at row ${note.row}, track ${note.track}, sample ${sampleMapping.id}`);
          audioEngine.setNote(note.row, note.track, sampleMapping.id);
          notesPlaced++;
        } else {
          console.warn(`[GenerateSong] No sample found for index ${note.sampleIndex}`);
        }
      }

      console.log(`[GenerateSong] Placed ${notesPlaced} notes`);
      setPattern({ ...audioEngine.getPattern() });
      
      if (loadedSamples.length === 0) {
        toast.error("Song generated but no samples could be loaded", { id: toastId });
      } else {
        toast.success(`Generated ${loadedSamples.length} samples and placed ${notesPlaced} notes at ${data.bpm} BPM`, { id: toastId });
      }
    } catch (error) {
      console.error('[GenerateSong] Error:', error);
      toast.error(error instanceof Error ? error.message : "Failed to generate song", { id: toastId });
      openSettingsFor(error);
    } finally {
      setIsGeneratingSong(false);
    }
  }, [pattern.length, pattern.tracks, openSettingsFor]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <div className="flex items-center border-b border-border bg-card">
        <TransportControls
          isPlaying={isPlaying}
          bpm={bpm}
          onPlay={handlePlay}
          onStop={handleStop}
          onBpmChange={handleBpmChange}
        />
        <div className="flex items-center gap-1 px-4 border-l border-border">
          <Button
            variant={viewMode === "tracker" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("tracker")}
            className="h-8 gap-1.5"
          >
            <Grid3X3 className="h-4 w-4" />
            <span className="hidden sm:inline">Tracker</span>
          </Button>
          <Button
            variant={viewMode === "tracks" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("tracks")}
            className="h-8 gap-1.5"
          >
            <Rows3 className="h-4 w-4" />
            <span className="hidden sm:inline">Arrange</span>
          </Button>
        </div>
        <div className="flex items-center gap-1 px-4 border-l border-border">
          <Button
            variant={showMixer ? "default" : "ghost"}
            size="sm"
            onClick={() => setShowMixer(!showMixer)}
            className="h-8 gap-1.5"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Mixer</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setMissingKey(null); setSettingsOpen(true); }}
            className="h-8 gap-1.5"
            title="API keys"
          >
            <KeyRound className="h-4 w-4" />
            <span className="hidden sm:inline">Keys</span>
          </Button>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 flex flex-col border-r border-border bg-card">
          <SampleBrowser
            samples={samples}
            selectedSample={selectedSample}
            onSelectSample={setSelectedSample}
            onLoadSample={handleLoadSample}
            onDeleteSample={handleDeleteSample}
            onPreviewSample={handlePreviewSample}
            onGenerateSample={handleGenerateSample}
            isGenerating={isGenerating}
            isGeneratingSong={isGeneratingSong}
          />
        </div>
        
        {viewMode === "tracker" ? (
          <TrackerGrid
            pattern={pattern}
            samples={samples}
            currentRow={currentRow}
            selectedSample={selectedSample}
            trackMutes={trackMutes}
            trackSolos={trackSolos}
            selection={selection}
            onSetNote={handleSetNote}
            onSetVolume={handleSetVolume}
            onSetPitch={handleSetPitch}
            onToggleMute={handleToggleMute}
            onToggleSolo={handleToggleSolo}
            onSelectionChange={setSelection}
          />
        ) : (
          <TrackView
            pattern={pattern}
            samples={samples}
            currentRow={currentRow}
            selectedSample={selectedSample}
            trackMutes={trackMutes}
            trackSolos={trackSolos}
            selection={selection}
            onSetNote={handleSetNote}
            onToggleMute={handleToggleMute}
            onToggleSolo={handleToggleSolo}
            onSelectionChange={setSelection}
          />
        )}

        {showMixer && (
          <div className="w-72 flex flex-col border-l border-border bg-card">
            <Mixer
              tracks={pattern.tracks}
              samples={samples}
              trackSettings={trackSettings}
              trackMutes={trackMutes}
              trackSolos={trackSolos}
              onSetTrackVolume={handleSetTrackVolume}
              onSetDuckingEnabled={handleSetDuckingEnabled}
              onSetDuckingSource={handleSetDuckingSource}
              onSetDuckingAmount={handleSetDuckingAmount}
              onSetDuckingAttack={handleSetDuckingAttack}
              onSetDuckingRelease={handleSetDuckingRelease}
              onToggleMute={handleToggleMute}
              onToggleSolo={handleToggleSolo}
            />
          </div>
        )}
      </div>

      <div className="p-2 bg-card border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {selectedSample ? (
            <>
              Selected:{" "}
              <span className="text-primary">
                {samples.find((s) => s.id === selectedSample)?.name}
              </span>
              {" "}• Click grid to place/remove
            </>
          ) : (
            "Select a sample to place notes"
          )}
        </span>
        <span>
          Row {String(currentRow).padStart(2, "0")} / {pattern.length}
        </span>
      </div>

      <TrackerChat
        samples={samples}
        pattern={pattern}
        bpm={bpm}
        selection={selection}
        trackSettings={trackSettings}
        onSetNote={handleSetNote}
        onSetVolume={handleSetVolume}
        onSetPitch={handleSetPitch}
        onSetBpm={handleBpmChange}
        onGenerateSample={handleGenerateSample}
        onGenerateSong={handleGenerateSong}
        onClearPattern={handleClearPattern}
        onTrimSample={handleTrimSample}
        getSampleDuration={getSampleDuration}
        onRestorePattern={handleRestorePattern}
        onClearSelection={() => setSelection(null)}
        onSetTrackVolume={handleSetTrackVolume}
        onSetDuckingEnabled={handleSetDuckingEnabled}
        onSetDuckingSource={handleSetDuckingSource}
        onSetDuckingAmount={handleSetDuckingAmount}
        onSetDuckingAttack={handleSetDuckingAttack}
        onSetDuckingRelease={handleSetDuckingRelease}
        onMissingKey={openSettingsFor}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} highlight={missingKey} />
    </div>
  );
}
