import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import type { Pattern, Sample } from "@/lib/audioEngine";
import { audioEngine } from "@/lib/audioEngine";
import { Button } from "@/components/ui/button";
import type { Selection } from "./TrackerDAW";

interface TrackViewProps {
  pattern: Pattern;
  samples: Sample[];
  currentRow: number;
  selectedSample: string | null;
  trackMutes: Set<number>;
  trackSolos: Set<number>;
  selection: Selection | null;
  onSetNote: (row: number, track: number, sampleId: string | null) => void;
  onToggleMute: (track: number) => void;
  onToggleSolo: (track: number) => void;
  onSelectionChange: (selection: Selection | null) => void;
}

function Waveform({ sampleId, color }: { sampleId: string; color: string }) {
  const waveform = useMemo(() => {
    return audioEngine.getSampleWaveform(sampleId, 40);
  }, [sampleId]);

  if (waveform.length === 0) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center gap-[1px] px-1 overflow-hidden">
      {waveform.map((value, i) => (
        <div
          key={i}
          className="w-[2px] bg-black/30 rounded-full"
          style={{
            height: `${Math.max(value * 80, 4)}%`,
          }}
        />
      ))}
    </div>
  );
}

export function TrackView({
  pattern,
  samples,
  currentRow,
  selectedSample,
  trackMutes,
  trackSolos,
  selection,
  onSetNote,
  onToggleMute,
  onToggleSolo,
  onSelectionChange,
}: TrackViewProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ row: number; track: number } | null>(null);

  const getSample = useCallback(
    (sampleId: string | null) => {
      if (!sampleId) return null;
      return samples.find((s) => s.id === sampleId) || null;
    },
    [samples]
  );

  const handleCellClick = (row: number, track: number) => {
    if (isDragging) return;
    
    const currentNote = pattern.rows[row][track].sampleId;
    if (currentNote) {
      onSetNote(row, track, null);
    } else if (selectedSample) {
      onSetNote(row, track, selectedSample);
    }
  };

  const handleMouseDown = (e: React.MouseEvent, row: number, track: number) => {
    if (e.button !== 0) return;
    
    e.preventDefault();
    dragStartRef.current = { row, track };
    setIsDragging(false);
    onSelectionChange({ startRow: row, endRow: row, startTrack: track, endTrack: track });
  };

  useEffect(() => {
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return;
      
      setIsDragging(true);
      const element = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const cellData = element?.closest('[data-row][data-track]');
      if (cellData) {
        const endRow = parseInt(cellData.getAttribute('data-row') || '0');
        const endTrack = parseInt(cellData.getAttribute('data-track') || '0');
        const startRow = dragStartRef.current.row;
        const startTrack = dragStartRef.current.track;
        onSelectionChange({
          startRow: Math.min(startRow, endRow),
          endRow: Math.max(startRow, endRow),
          startTrack: Math.min(startTrack, endTrack),
          endTrack: Math.max(startTrack, endTrack),
        });
      }
    };
    
    const handleMouseUp = () => {
      dragStartRef.current = null;
      setTimeout(() => setIsDragging(false), 50);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSelectionChange(null);
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onSelectionChange]);

  const isRowSelected = useCallback((row: number, track: number) => {
    if (!selection) return false;
    return row >= selection.startRow && row <= selection.endRow &&
           track >= selection.startTrack && track <= selection.endTrack;
  }, [selection]);

  // Calculate sample durations and how many rows they would span
  const getSampleRowSpan = useCallback((sampleId: string) => {
    const duration = audioEngine.getSampleDuration(sampleId);
    if (!duration) return 1;
    
    // Calculate rows based on BPM (4 rows per beat, 60/bpm seconds per beat)
    const bpm = audioEngine.getBpm();
    const secondsPerRow = 60 / bpm / 4;
    return Math.max(1, Math.ceil(duration / secondsPerRow));
  }, []);

  const playheadPosition = (currentRow / pattern.length) * 100;

  // Build a map of which notes to render and their spans
  const noteRenderInfo = useMemo(() => {
    const info: Map<string, { row: number; track: number; span: number; sample: Sample }> = new Map();
    
    for (let trackIndex = 0; trackIndex < pattern.tracks; trackIndex++) {
      for (let rowIndex = 0; rowIndex < pattern.length; rowIndex++) {
        const note = pattern.rows[rowIndex][trackIndex];
        if (note.sampleId) {
          const sample = samples.find(s => s.id === note.sampleId);
          if (sample) {
            const span = getSampleRowSpan(note.sampleId);
            info.set(`${trackIndex}-${rowIndex}`, { row: rowIndex, track: trackIndex, span, sample });
          }
        }
      }
    }
    
    return info;
  }, [pattern, samples, getSampleRowSpan]);

  return (
    <div className="flex-1 overflow-auto bg-background select-none">
      <div className="min-h-full flex flex-col">
        {/* Timeline header */}
        <div className="sticky top-0 z-10 flex bg-card border-b border-border">
          <div className="w-32 shrink-0 p-2 text-xs text-muted-foreground font-bold border-r border-border">
            TRACK
          </div>
          <div className="flex-1 flex relative">
            {/* Beat markers */}
            {Array.from({ length: Math.ceil(pattern.length / 4) }).map((_, beat) => (
              <div
                key={beat}
                className={`flex-1 min-w-[40px] p-2 text-center text-[10px] border-r border-border/50 ${
                  beat % 4 === 0 ? "text-muted-foreground font-bold bg-secondary/30" : "text-muted-foreground/60"
                }`}
              >
                {beat % 4 === 0 ? `Bar ${Math.floor(beat / 4) + 1}` : beat + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Tracks */}
        <div className="flex-1 relative">
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none shadow-[0_0_8px_hsl(var(--primary))]"
            style={{ 
              left: `calc(8rem + ((100% - 8rem) * ${playheadPosition} / 100))`,
            }}
          >
            {/* Playhead top marker */}
            <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-primary" />
          </div>

          {Array.from({ length: pattern.tracks }).map((_, trackIndex) => {
            const isMuted = trackMutes.has(trackIndex);
            const isSoloed = trackSolos.has(trackIndex);
            const hasSolos = trackSolos.size > 0;
            const isEffectivelyMuted = isMuted || (hasSolos && !isSoloed);

            return (
              <div
                key={trackIndex}
                className={`flex border-b border-border/50 min-h-[60px] ${isEffectivelyMuted ? "opacity-50" : ""}`}
              >
                {/* Track label */}
                <div className="w-32 shrink-0 p-2 bg-card border-r border-border flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{
                      backgroundColor: `hsl(${(trackIndex * 60) % 360}, 70%, 50%)`,
                    }}
                  />
                  <span className="text-xs font-medium text-foreground flex-1 truncate">
                    Trk {trackIndex + 1}
                  </span>
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-5 w-5 text-[10px] font-bold ${
                        isMuted ? "bg-destructive/80 text-destructive-foreground hover:bg-destructive" : "hover:bg-muted"
                      }`}
                      onClick={() => onToggleMute(trackIndex)}
                    >
                      M
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-5 w-5 text-[10px] font-bold ${
                        isSoloed ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-muted"
                      }`}
                      onClick={() => onToggleSolo(trackIndex)}
                    >
                      S
                    </Button>
                  </div>
                </div>

                {/* Track timeline */}
                <div className="flex-1 flex relative bg-tracker-row">
                  {/* Grid lines for beats */}
                  {Array.from({ length: Math.ceil(pattern.length / 4) }).map((_, beat) => (
                    <div
                      key={beat}
                      className={`flex-1 min-w-[40px] border-r ${
                        beat % 4 === 0 ? "border-border" : "border-border/30"
                      }`}
                    />
                  ))}

                  {/* Selection overlay */}
                  {selection && trackIndex >= selection.startTrack && trackIndex <= selection.endTrack && (
                    <div
                      className="absolute top-0 bottom-0 bg-primary/20 border-y border-primary/50 pointer-events-none"
                      style={{
                        left: `${(selection.startRow / pattern.length) * 100}%`,
                        width: `${((selection.endRow - selection.startRow + 1) / pattern.length) * 100}%`,
                      }}
                    />
                  )}

                  {/* Notes/clips overlay with waveforms */}
                  <div className="absolute inset-0">
                    {pattern.rows.map((row, rowIndex) => {
                      const key = `${trackIndex}-${rowIndex}`;
                      const noteInfo = noteRenderInfo.get(key);
                      if (!noteInfo) return null;

                      const { span, sample } = noteInfo;
                      const duration = audioEngine.getSampleDuration(sample.id);
                      
                      // Calculate width based on sample length (span), but cap it
                      const maxSpan = Math.min(span, pattern.length - rowIndex);
                      const width = (maxSpan / pattern.length) * 100;
                      const left = (rowIndex / pattern.length) * 100;

                      return (
                        <div
                          key={rowIndex}
                          data-row={rowIndex}
                          data-track={trackIndex}
                          onClick={() => handleCellClick(rowIndex, trackIndex)}
                          onMouseDown={(e) => handleMouseDown(e, rowIndex, trackIndex)}
                          className="absolute top-1 bottom-1 rounded cursor-pointer hover:brightness-110 transition-all overflow-hidden border border-black/20"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            backgroundColor: sample.color,
                            minWidth: "20px",
                          }}
                        >
                          {/* Waveform */}
                          <Waveform sampleId={sample.id} color={sample.color} />
                          
                          {/* Sample info overlay */}
                          <div className="absolute inset-0 flex items-start justify-between p-1 pointer-events-none">
                            <span className="text-[9px] font-bold text-black/80 bg-white/30 px-1 rounded truncate max-w-[80%]">
                              {sample.name}
                            </span>
                            {duration && (
                              <span className="text-[8px] font-medium text-black/60 bg-white/30 px-0.5 rounded">
                                {duration.toFixed(1)}s
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Click areas for adding notes */}
                  <div className="absolute inset-0 flex">
                    {pattern.rows.map((row, rowIndex) => {
                      const note = row[trackIndex];
                      if (note.sampleId) return null;

                      const width = 100 / pattern.length;
                      const left = (rowIndex / pattern.length) * 100;

                      return (
                        <div
                          key={rowIndex}
                          data-row={rowIndex}
                          data-track={trackIndex}
                          onClick={() => handleCellClick(rowIndex, trackIndex)}
                          onMouseDown={(e) => handleMouseDown(e, rowIndex, trackIndex)}
                          className="absolute top-0 bottom-0 cursor-pointer hover:bg-primary/20 transition-colors"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}