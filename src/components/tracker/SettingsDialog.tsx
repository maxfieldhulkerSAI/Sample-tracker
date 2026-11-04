import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getKeys, setKeys, KEY_LINKS, type ApiKeys } from "@/lib/keys";
import { backendMode } from "@/lib/backend";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which key the user was missing when this opened, if any. */
  highlight?: keyof ApiKeys | null;
}

function KeyField({
  id,
  label,
  value,
  placeholder,
  link,
  hint,
  highlight,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  link: string;
  hint: string;
  highlight: boolean;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className={highlight ? "text-primary" : undefined}>{label}</Label>
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
          Get a key
        </a>
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          className={`font-mono text-xs ${highlight && !value ? "border-primary" : ""}`}
        />
        <Button type="button" variant="outline" size="icon" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide key" : "Show key"}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function SettingsDialog({ open, onOpenChange, highlight = null }: SettingsDialogProps) {
  const [draft, setDraft] = useState<ApiKeys>(getKeys());

  useEffect(() => {
    if (open) setDraft(getKeys());
  }, [open]);

  const save = () => {
    setKeys({ stability: draft.stability.trim(), gemini: draft.gemini.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" /> API keys
          </DialogTitle>
          <DialogDescription>
            {backendMode === "direct"
              ? "This build calls the providers straight from your browser. Keys are stored in this browser's localStorage and sent only to the provider they belong to."
              : "This build routes generation through its Supabase functions, which hold the provider keys. Keys entered here are not used."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <KeyField
            id="stability-key"
            label="Stability API key"
            value={draft.stability}
            placeholder="sk-..."
            link={KEY_LINKS.stability}
            hint="Generates every sample with Stable Audio 3. Sent only to api.stability.ai."
            highlight={highlight === "stability"}
            onChange={(v) => setDraft((d) => ({ ...d, stability: v }))}
          />
          <KeyField
            id="gemini-key"
            label="Google AI (Gemini) API key"
            value={draft.gemini}
            placeholder="AIza..."
            link={KEY_LINKS.gemini}
            hint="Powers the song planner and the chat assistant (gemini-2.5-flash). Optional if you only generate samples by hand. Sent only to generativelanguage.googleapis.com."
            highlight={highlight === "gemini"}
            onChange={(v) => setDraft((d) => ({ ...d, gemini: v }))}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
