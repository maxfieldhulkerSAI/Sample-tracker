import { useCallback } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sample, TrackSettings } from "@/lib/audioEngine";
import { cn } from "@/lib/utils";
import { Volume2, ArrowDownToLine } from "lucide-react";

interface MixerProps {
  tracks: number;
  samples: Sample[];
  trackSettings: Map<number, TrackSettings>;
  trackMutes: Set<number>;
  trackSolos: Set<number>;
  onSetTrackVolume: (track: number, volume: number) => void;
  onSetDuckingEnabled: (track: number, enabled: boolean) => void;
  onSetDuckingSource: (track: number, source: number | null) => void;
  onSetDuckingAmount: (track: number, amount: number) => void;
  onSetDuckingAttack: (track: number, attack: number) => void;
  onSetDuckingRelease: (track: number, release: number) => void;
  onToggleMute: (track: number) => void;
  onToggleSolo: (track: number) => void;
}

export function Mixer({
  tracks,
  samples,
  trackSettings,
  trackMutes,
  trackSolos,
  onSetTrackVolume,
  onSetDuckingEnabled,
  onSetDuckingSource,
  onSetDuckingAmount,
  onSetDuckingAttack,
  onSetDuckingRelease,
  onToggleMute,
  onToggleSolo,
}: MixerProps) {
  const getSettings = useCallback((track: number): TrackSettings => {
    return trackSettings.get(track) || {
      volume: 100,
      ducking: {
        enabled: false,
        sourceTrack: null,
        amount: 50,
        attack: 10,
        release: 100,
      },
    };
  }, [trackSettings]);

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-6">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-4">
          <Volume2 className="h-4 w-4" />
          <span>Mixer</span>
        </div>

        {Array.from({ length: tracks }, (_, track) => {
          const settings = getSettings(track);
          const isMuted = trackMutes.has(track);
          const isSoloed = trackSolos.has(track);

          return (
            <div
              key={track}
              className={cn(
                "p-3 rounded-lg border border-border bg-card/50 space-y-3",
                isMuted && "opacity-50"
              )}
            >
              {/* Track Header */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Track {track + 1}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onToggleMute(track)}
                    className={cn(
                      "px-2 py-0.5 text-xs font-medium rounded",
                      isMuted
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    M
                  </button>
                  <button
                    onClick={() => onToggleSolo(track)}
                    className={cn(
                      "px-2 py-0.5 text-xs font-medium rounded",
                      isSoloed
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    S
                  </button>
                </div>
              </div>

              {/* Volume Fader */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Volume</Label>
                  <span className="text-xs font-mono text-muted-foreground">
                    {settings.volume}%
                  </span>
                </div>
                <Slider
                  value={[settings.volume]}
                  onValueChange={([value]) => onSetTrackVolume(track, value)}
                  max={100}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Ducking Section */}
              <div className="pt-2 border-t border-border/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowDownToLine className="h-3 w-3 text-muted-foreground" />
                    <Label className="text-xs text-muted-foreground">Ducking</Label>
                  </div>
                  <Switch
                    checked={settings.ducking.enabled}
                    onCheckedChange={(checked) => onSetDuckingEnabled(track, checked)}
                  />
                </div>

                {settings.ducking.enabled && (
                  <div className="space-y-3 animate-in fade-in duration-200">
                    {/* Sidechain Source */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Trigger Track</Label>
                      <Select
                        value={settings.ducking.sourceTrack?.toString() ?? "none"}
                        onValueChange={(value) =>
                          onSetDuckingSource(track, value === "none" ? null : parseInt(value))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs bg-background">
                          <SelectValue placeholder="Select track" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border border-border z-50">
                          <SelectItem value="none" className="text-xs">None</SelectItem>
                          {Array.from({ length: tracks }, (_, t) => (
                            t !== track && (
                              <SelectItem key={t} value={t.toString()} className="text-xs">
                                Track {t + 1}
                              </SelectItem>
                            )
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Amount */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Amount</Label>
                        <span className="text-xs font-mono text-muted-foreground">
                          {settings.ducking.amount}%
                        </span>
                      </div>
                      <Slider
                        value={[settings.ducking.amount]}
                        onValueChange={([value]) => onSetDuckingAmount(track, value)}
                        max={100}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    {/* Attack */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Attack</Label>
                        <span className="text-xs font-mono text-muted-foreground">
                          {settings.ducking.attack}ms
                        </span>
                      </div>
                      <Slider
                        value={[settings.ducking.attack]}
                        onValueChange={([value]) => onSetDuckingAttack(track, value)}
                        min={1}
                        max={200}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    {/* Release */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Release</Label>
                        <span className="text-xs font-mono text-muted-foreground">
                          {settings.ducking.release}ms
                        </span>
                      </div>
                      <Slider
                        value={[settings.ducking.release]}
                        onValueChange={([value]) => onSetDuckingRelease(track, value)}
                        min={10}
                        max={1000}
                        step={10}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
