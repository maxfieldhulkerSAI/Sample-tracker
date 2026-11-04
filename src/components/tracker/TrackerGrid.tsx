import { useCallback, useState, useRef, useEffect } from "react";
import type { Pattern, Sample } from "@/lib/audioEngine";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX } from "lucide-react";
import type { Selection } from "./TrackerDAW";

interface TrackerGridProps {
  pattern: Pattern;
  samples: Sample[];
  currentRow: number;
  selectedSample: string | null;
  trackMutes: Set<number>;
  trackSolos: Set<number>;
  selection: Selection | null;
  onSetNote: (row: number, track: number, sampleId: string | null) => void;
  onSetVolume: (row: number, track: number, volume: number) => void;
  onSetPitch: (row: number, track: number, pitch: number) => void;
  onToggleMute: (track: number) => void;
  onToggleSolo: (track: number) => void;
  onSelectionChange: (selection: Selection | null) => void;
}

export function TrackerGrid({
  pattern,
  samples,
  currentRow,
  selectedSample,
  trackMutes,
  trackSolos,
  selection,
  onSetNote,
  onSetVolume,
  onSetPitch,
  onToggleMute,
  onToggleSolo,
  onSelectionChange,
}: TrackerGridProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; track: number; field: 'volume' | 'pitch' } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ row: number; track: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const getSampleDisplay = useCallback(
    (sampleId: string | null) => {
      if (!sampleId) return { text: "---", color: undefined };
      const sample = samples.find((s) => s.id === sampleId);
      if (!sample) return { text: "---", color: undefined };
      const index = samples.indexOf(sample) + 1;
      return {
        text: String(index).padStart(2, "0"),
        color: sample.color,
      };
    },
    [samples]
  );

  const handleCellClick = (row: number, track: number) => {
    // If we just finished dragging, don't trigger a click
    if (isDragging) return;
    
    const currentNote = pattern.rows[row][track].sampleId;
    if (currentNote) {
      onSetNote(row, track, null);
    } else if (selectedSample) {
      onSetNote(row, track, selectedSample);
    }
  };

  const handleMouseDown = (e: React.MouseEvent, row: number, track: number) => {
    // Only start selection with left mouse button
    if (e.button !== 0) return;
    // Don't start selection if clicking on a note cell action
    if ((e.target as HTMLElement).closest('input')) return;
    
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
      // Reset isDragging after a short delay to prevent the click from firing
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

  const isSelected = useCallback((row: number, track: number) => {
    if (!selection) return false;
    return row >= selection.startRow && row <= selection.endRow &&
           track >= selection.startTrack && track <= selection.endTrack;
  }, [selection]);

  const handleVolumeClick = (e: React.MouseEvent, row: number, track: number) => {
    e.stopPropagation();
    const note = pattern.rows[row][track];
    if (!note.sampleId) return;
    setEditingCell({ row, track, field: 'volume' });
    setEditValue(String(note.volume));
  };

  const handlePitchClick = (e: React.MouseEvent, row: number, track: number) => {
    e.stopPropagation();
    const note = pattern.rows[row][track];
    if (!note.sampleId) return;
    setEditingCell({ row, track, field: 'pitch' });
    setEditValue(String(note.pitch));
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (editingCell?.field === 'pitch') {
      const val = e.target.value.replace(/[^\d-]/g, "").slice(0, 3);
      setEditValue(val);
    } else {
      const val = e.target.value.replace(/\D/g, "").slice(0, 3);
      setEditValue(val);
    }
  };

  const handleEditSubmit = () => {
    if (editingCell) {
      if (editingCell.field === 'volume') {
        const volume = Math.max(0, Math.min(100, parseInt(editValue) || 0));
        onSetVolume(editingCell.row, editingCell.track, volume);
      } else {
        const pitch = Math.max(-24, Math.min(24, parseInt(editValue) || 0));
        onSetPitch(editingCell.row, editingCell.track, pitch);
      }
    }
    setEditingCell(null);
    setEditValue("");
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleEditSubmit();
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setEditValue("");
    }
  };

  const formatPitch = (pitch: number) => {
    if (pitch === 0) return "+00";
    return pitch > 0 ? `+${String(pitch).padStart(2, "0")}` : String(pitch).padStart(3, "0");
  };

  return (
    <div 
      className="flex-1 overflow-auto bg-background select-none" 
      ref={gridRef}
    >
      <div className="min-w-fit">
        {/* Header */}
        <div className="sticky top-0 z-10 flex bg-card border-b border-border">
          <div className="w-12 p-2 text-center text-xs text-muted-foreground font-bold border-r border-border">
            ROW
          </div>
          {Array.from({ length: pattern.tracks }).map((_, track) => {
            const isMuted = trackMutes.has(track);
            const isSoloed = trackSolos.has(track);
            const hasSoloedTracks = trackSolos.size > 0;
            const isAudible = hasSoloedTracks ? isSoloed : !isMuted;
            
            return (
              <div
                key={track}
                className={`flex-1 min-w-[140px] p-1.5 text-center text-xs font-bold border-r border-border flex items-center justify-between ${
                  !isAudible ? "opacity-50" : ""
                }`}
              >
                <span className="text-muted-foreground">T{track + 1}</span>
                <div className="flex gap-1">
                  <Button
                    variant={isMuted ? "destructive" : "ghost"}
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => onToggleMute(track)}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                  </Button>
                  <Button
                    variant={isSoloed ? "default" : "ghost"}
                    size="icon"
                    className={`h-5 w-5 text-[10px] font-bold ${isSoloed ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => onToggleSolo(track)}
                    title={isSoloed ? "Unsolo" : "Solo"}
                  >
                    S
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pattern rows */}
        <div className="divide-y divide-border/30">
          {pattern.rows.map((row, rowIndex) => {
            const isCurrentRow = rowIndex === currentRow;
            const isBeat = rowIndex % 4 === 0;
            const isBar = rowIndex % 16 === 0;

            return (
              <div
                key={rowIndex}
                className={`flex transition-colors ${
                  isCurrentRow
                    ? "bg-primary/20 border-l-2 border-l-tracker-playhead"
                    : isBar
                    ? "bg-tracker-row-beat"
                    : isBeat
                    ? "bg-tracker-row-highlight"
                    : "bg-tracker-row"
                }`}
              >
                <div
                  className={`w-12 p-1.5 text-center text-xs font-mono border-r border-border/50 ${
                    isCurrentRow
                      ? "text-primary font-bold"
                      : isBeat
                      ? "text-muted-foreground"
                      : "text-muted-foreground/60"
                  }`}
                >
                  {String(rowIndex).padStart(2, "0")}
                </div>

                {row.map((note, trackIndex) => {
                  const display = getSampleDisplay(note.sampleId);
                  const isEditingVolume = editingCell?.row === rowIndex && editingCell?.track === trackIndex && editingCell?.field === 'volume';
                  const isEditingPitch = editingCell?.row === rowIndex && editingCell?.track === trackIndex && editingCell?.field === 'pitch';
                  const cellIsSelected = isSelected(rowIndex, trackIndex);

                  return (
                    <div
                      key={trackIndex}
                      data-row={rowIndex}
                      data-track={trackIndex}
                      onClick={() => handleCellClick(rowIndex, trackIndex)}
                      onMouseDown={(e) => handleMouseDown(e, rowIndex, trackIndex)}
                      className={`flex-1 min-w-[140px] p-1.5 text-xs font-mono border-r border-border/30 cursor-pointer transition-all hover:bg-secondary/50 flex items-center gap-1 ${
                        note.sampleId ? "font-bold" : ""
                      } ${cellIsSelected ? "bg-primary/30 ring-1 ring-primary/50" : ""}`}
                    >
                      <span
                        style={{ color: display.color }}
                        className={!display.color ? "text-muted-foreground/40" : ""}
                      >
                        {display.text}
                      </span>
                      {isEditingVolume ? (
                        <Input
                          type="text"
                          value={editValue}
                          onChange={handleEditChange}
                          onBlur={handleEditSubmit}
                          onKeyDown={handleEditKeyDown}
                          autoFocus
                          className="w-10 h-5 px-1 py-0 text-xs font-mono bg-background border-primary"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          onClick={(e) => handleVolumeClick(e, rowIndex, trackIndex)}
                          className={`${
                            note.sampleId
                              ? "text-tracker-cell-volume hover:text-primary hover:underline cursor-text"
                              : "text-muted-foreground/40"
                          }`}
                        >
                          {note.sampleId ? String(note.volume).padStart(2, "0") : "--"}
                        </span>
                      )}
                      {isEditingPitch ? (
                        <Input
                          type="text"
                          value={editValue}
                          onChange={handleEditChange}
                          onBlur={handleEditSubmit}
                          onKeyDown={handleEditKeyDown}
                          autoFocus
                          className="w-10 h-5 px-1 py-0 text-xs font-mono bg-background border-primary"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          onClick={(e) => handlePitchClick(e, rowIndex, trackIndex)}
                          className={`${
                            note.sampleId
                              ? "text-tracker-cell-pitch hover:text-primary hover:underline cursor-text"
                              : "text-muted-foreground/40"
                          }`}
                        >
                          {note.sampleId ? formatPitch(note.pitch) : "---"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}