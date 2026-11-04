import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, X, Loader2, Undo2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trackerChat } from "@/lib/backend";
import { toast } from "sonner";
import type { Sample, Pattern, PatternNote } from "@/lib/audioEngine";
import type { Selection } from "./TrackerDAW";

interface ActionSummary {
  type: string;
  description: string;
}

interface PatternSnapshot {
  rows: PatternNote[][];
  bpm: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  actions?: ActionSummary[];
  snapshot?: PatternSnapshot;
}

interface DuckingSettings {
  enabled: boolean;
  sourceTrack: number | null;
  amount: number;
  attack: number;
  release: number;
}

interface TrackSettings {
  volume: number;
  ducking: DuckingSettings;
}

interface TrackerChatProps {
  samples: Sample[];
  pattern: Pattern;
  bpm: number;
  selection: Selection | null;
  trackSettings: Map<number, TrackSettings>;
  onSetNote: (row: number, track: number, sampleId: string | null) => void;
  onSetVolume: (row: number, track: number, volume: number) => void;
  onSetPitch: (row: number, track: number, pitch: number) => void;
  onSetBpm: (bpm: number) => void;
  onGenerateSample: (prompt: string, duration: number, isMelodic?: boolean, key?: string) => Promise<void>;
  onGenerateSong: (description: string) => Promise<void>;
  onClearPattern: () => void;
  onTrimSample: (id: string, startSeconds: number, endSeconds: number) => Promise<boolean>;
  getSampleDuration: (id: string) => number | null;
  onRestorePattern: (rows: PatternNote[][], bpm: number) => void;
  onClearSelection: () => void;
  onSetTrackVolume: (track: number, volume: number) => void;
  onSetDuckingEnabled: (track: number, enabled: boolean) => void;
  onSetDuckingSource: (track: number, source: number | null) => void;
  onSetDuckingAmount: (track: number, amount: number) => void;
  onSetDuckingAttack: (track: number, attack: number) => void;
  onSetDuckingRelease: (track: number, release: number) => void;
  /** Called with the error from a failed turn; returns true if it was a missing key and Settings was opened. */
  onMissingKey?: (err: unknown) => boolean;
}

export function TrackerChat({
  samples,
  pattern,
  bpm,
  selection,
  trackSettings,
  onSetNote,
  onSetVolume,
  onSetPitch,
  onSetBpm,
  onGenerateSample,
  onGenerateSong,
  onClearPattern,
  onTrimSample,
  getSampleDuration,
  onRestorePattern,
  onClearSelection,
  onSetTrackVolume,
  onSetDuckingEnabled,
  onSetDuckingSource,
  onSetDuckingAmount,
  onSetDuckingAttack,
  onSetDuckingRelease,
  onMissingKey,
}: TrackerChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const summarizeAction = (action: any): ActionSummary => {
    switch (action.action) {
      case 'setNotes':
        return { type: 'setNotes', description: `Placed ${action.notes?.length || 0} note(s)` };
      case 'clearNotes':
        return { type: 'clearNotes', description: `Cleared ${action.notes?.length || 0} note(s)` };
      case 'clearTrack':
        return { type: 'clearTrack', description: `Cleared track ${action.track}` };
      case 'setVolumes':
        return { type: 'setVolumes', description: `Set ${action.volumes?.length || 0} volume(s)` };
      case 'setPitches':
        return { type: 'setPitches', description: `Set ${action.pitches?.length || 0} pitch(es)` };
      case 'generateSample':
        return { type: 'generateSample', description: `Generated "${action.prompt}"` };
      case 'generateSong':
        return { type: 'generateSong', description: `Generating song: "${action.description}"` };
      case 'setBpm':
        return { type: 'setBpm', description: `Set BPM to ${action.bpm}` };
      case 'clearPattern':
        return { type: 'clearPattern', description: 'Cleared entire pattern' };
      case 'trimSample':
        return { type: 'trimSample', description: `Trimmed sample` };
      case 'setTrackVolume':
        return { type: 'setTrackVolume', description: `Set track ${action.track + 1} volume to ${action.volume}%` };
      case 'setDucking':
        return { type: 'setDucking', description: `Set ducking on track ${action.track + 1}` };
      default:
        return { type: action.action, description: action.action };
    }
  };

  const executeActions = async (actions: any[]): Promise<ActionSummary[]> => {
    const summaries: ActionSummary[] = [];
    for (const action of actions) {
      try {
        summaries.push(summarizeAction(action));
        switch (action.action) {
          case 'setNotes':
            for (const note of action.notes) {
              onSetNote(note.row, note.track, note.sampleId);
            }
            break;
          case 'clearNotes':
            for (const note of action.notes) {
              onSetNote(note.row, note.track, null);
            }
            break;
          case 'clearTrack':
            for (let row = 0; row < pattern.length; row++) {
              onSetNote(row, action.track, null);
            }
            break;
          case 'setVolumes':
            for (const vol of action.volumes) {
              onSetVolume(vol.row, vol.track, vol.volume);
            }
            break;
          case 'setPitches':
            for (const p of action.pitches) {
              onSetPitch(p.row, p.track, p.pitch);
            }
            break;
          case 'generateSample':
            await onGenerateSample(action.prompt, action.duration || 3, action.isMelodic, action.key);
            break;
          case 'generateSong':
            await onGenerateSong(action.description);
            break;
            break;
          case 'setBpm':
            onSetBpm(action.bpm);
            break;
          case 'clearPattern':
            onClearPattern();
            break;
          case 'trimSample':
            await onTrimSample(action.sampleId, action.startSeconds, action.endSeconds);
            break;
          case 'setTrackVolume':
            onSetTrackVolume(action.track, action.volume);
            break;
          case 'setDucking':
            if (action.enabled !== undefined) {
              onSetDuckingEnabled(action.track, action.enabled);
            }
            if (action.sourceTrack !== undefined) {
              onSetDuckingSource(action.track, action.sourceTrack);
            }
            if (action.amount !== undefined) {
              onSetDuckingAmount(action.track, action.amount);
            }
            if (action.attack !== undefined) {
              onSetDuckingAttack(action.track, action.attack);
            }
            if (action.release !== undefined) {
              onSetDuckingRelease(action.track, action.release);
            }
            break;
        }
      } catch (error) {
        console.error('Error executing action:', action, error);
      }
    }
    return summaries;
  };

  const handleRevert = (messageIndex: number) => {
    const msg = messages[messageIndex];
    if (msg.snapshot) {
      onRestorePattern(msg.snapshot.rows, msg.snapshot.bpm);
      toast.success("Reverted changes");
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Capture snapshot before changes
      const snapshot: PatternSnapshot = {
        rows: pattern.rows.map(row => row.map(note => ({ ...note }))),
        bpm,
      };

      const trackerState = {
        samples: samples.map(s => ({ 
          id: s.id, 
          name: s.name,
          duration: getSampleDuration(s.id)
        })),
        pattern: {
          rows: pattern.rows.map(row => row.map(note => ({ 
            sampleId: note.sampleId,
            volume: note.volume,
            pitch: note.pitch
          })))
        },
        bpm,
        patternLength: pattern.length,
        tracks: pattern.tracks,
        selection: selection ? {
          startRow: selection.startRow,
          endRow: selection.endRow,
          startTrack: selection.startTrack,
          endTrack: selection.endTrack,
        } : null,
        trackSettings: Array.from({ length: pattern.tracks }, (_, i) => {
          const settings = trackSettings.get(i);
          return {
            track: i,
            volume: settings?.volume ?? 100,
            ducking: settings?.ducking ?? { enabled: false, sourceTrack: null, amount: 50, attack: 10, release: 100 }
          };
        }),
      };

      const data = await trackerChat([...messages, userMessage], trackerState);

      let assistantMessage: Message = { role: 'assistant', content: data.message };

      if (data.actions && data.actions.length > 0) {
        const summaries = await executeActions(data.actions);
        assistantMessage.actions = summaries;
        assistantMessage.snapshot = snapshot;
        toast.success(`Applied ${data.actions.length} change(s)`);
      }

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      toast.error(error instanceof Error ? error.message : "Failed to get response");
      onMissingKey?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSelectionLabel = () => {
    if (!selection) return null;
    const rows = selection.endRow - selection.startRow + 1;
    const tracks = selection.endTrack - selection.startTrack + 1;
    return `${rows} row${rows > 1 ? 's' : ''} × ${tracks} track${tracks > 1 ? 's' : ''}`;
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 flex items-center gap-2">
        {selection && (
          <div className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full shadow-lg flex items-center gap-1.5">
            <span>{getSelectionLabel()}</span>
            <button 
              onClick={onClearSelection}
              className="hover:bg-primary-foreground/20 rounded p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <Button
          onClick={() => setIsOpen(true)}
          className="h-12 w-12 rounded-full shadow-lg"
          size="icon"
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 h-96 bg-card border border-border rounded-lg shadow-xl flex flex-col overflow-hidden z-50">
      <div className="p-3 border-b border-border flex items-center justify-between bg-card">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">AI Assistant</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Selection indicator */}
      {selection && (
        <div className="px-3 py-1.5 bg-primary/10 border-b border-primary/20 flex items-center justify-between">
          <span className="text-[10px] text-primary font-medium">
            Selection: Rows {selection.startRow}-{selection.endRow}, Tracks {selection.startTrack + 1}-{selection.endTrack + 1}
          </span>
          <button 
            onClick={onClearSelection}
            className="text-primary hover:text-primary/80 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8">
            <p className="mb-2">Ask me to edit your pattern!</p>
            <p className="text-[10px]">Try: "Add a kick on every beat" or "Make the hi-hats faster"</p>
            {selection && (
              <p className="text-[10px] text-primary mt-2">
                Selection active - changes will focus on selected region
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className="space-y-1">
                <div
                  className={`text-xs p-2 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground ml-4'
                      : 'bg-secondary text-secondary-foreground mr-4'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mr-4 bg-muted/50 rounded-lg p-2 border border-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                        <Check className="h-3 w-3 text-green-500" />
                        Changes applied
                      </span>
                      {msg.snapshot && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[10px] gap-1 hover:bg-destructive/20 hover:text-destructive"
                          onClick={() => handleRevert(i)}
                        >
                          <Undo2 className="h-3 w-3" />
                          Revert
                        </Button>
                      )}
                    </div>
                    <ul className="text-[10px] text-muted-foreground space-y-0.5">
                      {msg.actions.map((action, j) => (
                        <li key={j} className="flex items-center gap-1">
                          <span className="text-primary">•</span>
                          {action.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Thinking...
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="p-2 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={selection ? "Edit selected region..." : "Ask for edits..."}
            className="text-xs h-8"
            disabled={isLoading}
          />
          <Button size="icon" className="h-8 w-8" onClick={handleSend} disabled={isLoading || !input.trim()}>
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}