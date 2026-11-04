import { useCallback, useState } from "react";
import { Upload, Trash2, Volume2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Sample } from "@/lib/audioEngine";
import loadingGif from "@/assets/loading-sample.gif";

interface SampleBrowserProps {
  samples: Sample[];
  selectedSample: string | null;
  onSelectSample: (id: string | null) => void;
  onLoadSample: (file: File) => Promise<void>;
  onDeleteSample: (id: string) => void;
  onPreviewSample: (id: string) => void;
  onGenerateSample: (prompt: string, duration: number) => Promise<void>;
  isGenerating?: boolean;
  isGeneratingSong?: boolean;
}

export function SampleBrowser({
  samples,
  selectedSample,
  onSelectSample,
  onLoadSample,
  onDeleteSample,
  onPreviewSample,
  onGenerateSample,
  isGenerating = false,
  isGeneratingSong = false,
}: SampleBrowserProps) {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const showLoading = isGenerating || isLoadingFiles || isGeneratingSong;

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("audio/")
      );
      if (files.length === 0) return;

      setIsLoadingFiles(true);
      try {
        for (const file of files) {
          await onLoadSample(file);
        }
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [onLoadSample]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputEl = e.target;
      const files = Array.from(inputEl.files || []);
      inputEl.value = "";
      if (files.length === 0) return;

      setIsLoadingFiles(true);
      try {
        for (const file of files) {
          await onLoadSample(file);
        }
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [onLoadSample]
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    await onGenerateSample(prompt.trim(), duration);
    setPrompt("");
  }, [prompt, duration, onGenerateSample]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-border space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Samples
        </h2>
        
        {/* Generate Sample Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground">Generate</span>
          </div>
          <Input
            placeholder="e.g., punchy kick drum"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="h-8 text-xs"
            disabled={isGenerating}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isGenerating) {
                handleGenerate();
              }
            }}
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Duration: {duration}s</label>
              <input
                type="range"
                min="1"
                max="22"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full h-1.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary"
                disabled={isGenerating}
              />
            </div>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              className="h-8"
            >
              <Wand2 className="h-3 w-3" />
            </Button>
          </div>
          {showLoading && (
            <div className="flex flex-col items-center gap-2 py-2">
              <img
                src={loadingGif}
                alt="Loading audio sample"
                className="w-16 h-16 rounded"
              />
              <span className="text-xs text-muted-foreground">
                {isGeneratingSong ? "Generating song..." : isGenerating ? "Generating sample..." : "Loading sample..."}
              </span>
            </div>
          )}
        </div>

        {/* Upload Section */}
        <div className="pt-2 border-t border-border/50">
          <label
            className="flex items-center justify-center gap-2 p-2 border border-dashed border-border rounded-md cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <Upload className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Upload file</span>
            <input
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {samples.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No samples loaded
          </p>
        ) : (
          samples.map((sample, index) => (
            <div
              key={sample.id}
              className={`group flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                selectedSample === sample.id
                  ? "bg-primary/20 border border-primary/50"
                  : "hover:bg-secondary"
              }`}
              onClick={() => onSelectSample(sample.id)}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: sample.color }}
              />
              <span className="text-xs font-mono truncate flex-1">
                {String(index + 1).padStart(2, "0")}:{" "}
                <span className="text-tracker-cell-note">{sample.name}</span>
              </span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreviewSample(sample.id);
                  }}
                >
                  <Volume2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSample(sample.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-3 border-t border-border text-xs text-muted-foreground">
        {samples.length} sample{samples.length !== 1 ? "s" : ""} loaded
      </div>
    </div>
  );
}
