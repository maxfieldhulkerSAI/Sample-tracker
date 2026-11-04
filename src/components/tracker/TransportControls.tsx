import { useState } from "react";
import { Play, Square, SkipBack, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { audioEngine } from "@/lib/audioEngine";
import { toast } from "sonner";

interface TransportControlsProps {
  isPlaying: boolean;
  bpm: number;
  onPlay: () => void;
  onStop: () => void;
  onBpmChange: (bpm: number) => void;
}

export function TransportControls({
  isPlaying,
  bpm,
  onPlay,
  onStop,
  onBpmChange,
}: TransportControlsProps) {
  const [repeats, setRepeats] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    
    try {
      const blob = await audioEngine.exportToWav(repeats, (progress) => {
        setExportProgress(Math.round(progress * 100));
      });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `track-export-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Song exported successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export song');
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  return (
    <div className="flex items-center gap-4 p-4 flex-1">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onStop}
          className="hover:bg-secondary"
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        
        <Button
          onClick={isPlaying ? onStop : onPlay}
          className={`w-12 h-12 rounded-full transition-all ${
            isPlaying 
              ? 'bg-accent text-accent-foreground glow-accent' 
              : 'bg-primary text-primary-foreground hover:glow-primary'
          }`}
        >
          {isPlaying ? (
            <Square className="h-5 w-5 fill-current" />
          ) : (
            <Play className="h-5 w-5 fill-current ml-0.5" />
          )}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">BPM</span>
        <Input
          type="number"
          value={bpm}
          onChange={(e) => onBpmChange(parseInt(e.target.value) || 125)}
          className="w-20 h-8 text-center bg-secondary border-border text-foreground font-mono"
          min={60}
          max={300}
        />
      </div>

      <div className="flex items-center gap-2 ml-4 border-l border-border pl-4">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Repeats</span>
        <Input
          type="number"
          value={repeats}
          onChange={(e) => setRepeats(Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))}
          className="w-16 h-8 text-center bg-secondary border-border text-foreground font-mono"
          min={1}
          max={99}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={isExporting}
          className="gap-2"
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {exportProgress}%
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Export WAV
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
