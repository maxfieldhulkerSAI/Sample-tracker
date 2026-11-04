// Prompt builders shared by the browser (direct mode) and the edge functions.
// Edit prompts here and both modes pick the change up.

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Selection {
  startRow: number;
  endRow: number;
  startTrack: number;
  endTrack: number;
}

export interface DuckingSettings {
  enabled: boolean;
  sourceTrack: number | null;
  amount: number;
  attack: number;
  release: number;
}

export interface TrackSettingsState {
  track: number;
  volume: number;
  ducking: DuckingSettings;
}

export interface TrackerState {
  samples: { id: string; name: string; duration: number | null }[];
  pattern: { rows: { sampleId: string | null; volume: number; pitch: number }[][] };
  bpm: number;
  patternLength: number;
  tracks: number;
  selection: Selection | null;
  trackSettings?: TrackSettingsState[];
}

export interface SamplePlan {
  name: string;
  prompt: string;
  duration: number;
}

export interface PatternPlan {
  bpm: number;
  samples: SamplePlan[];
  pattern: { row: number; track: number; sampleIndex: number }[];
}

/** System prompt for the song planner. The model answers with a PatternPlan as JSON. */
export function buildSongPlanPrompt(patternLength: number, tracks: number): string {
  return `You are a music producer AI. Create a song plan based on the user's description.
You must respond with a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "bpm": <number between 60-200>,
  "samples": [
    {"name": "<short name>", "prompt": "<detailed audio generation prompt>", "duration": <1-10 seconds>}
  ],
  "pattern": [
    {"row": <0-${patternLength - 1}>, "track": <0-${tracks - 1}>, "sampleIndex": <index in samples array>}
  ]
}

Rules:
- Create 2-6 samples that fit the description (drums, bass, synths, etc.)
- For prompts, be specific about the sound character (e.g., "punchy 808 kick drum with sub bass" not just "kick")
- Pattern should create a musical arrangement across ${patternLength} rows and ${tracks} tracks
- Rows 0-15 are the first bar, 16-31 second bar, etc. (4 rows per beat at 4/4 time)
- Create interesting rhythmic patterns with variations
- Keep samples short (1-5 seconds for drums, up to 10 for melodic elements)`;
}

/** System prompt for the in-DAW assistant, built from the current tracker state. */
export function buildTrackerChatPrompt(trackerState: TrackerState): string {
    // Build context about current state
    const sampleList = trackerState.samples.map((s, i) => {
      const durStr = s.duration ? ` - ${s.duration.toFixed(2)}s` : '';
      return `  ${i + 1}: "${s.name}" (id: ${s.id}${durStr})`;
    }).join('\n');

    // Build a summary of what's placed in each track
    const trackSummaries: string[] = [];
    for (let track = 0; track < trackerState.tracks; track++) {
      const notesInTrack: { row: number; sampleName: string; volume: number; pitch: number }[] = [];
      for (let row = 0; row < trackerState.patternLength; row++) {
        const note = trackerState.pattern.rows[row]?.[track];
        if (note?.sampleId) {
          const sample = trackerState.samples.find(s => s.id === note.sampleId);
          notesInTrack.push({
            row,
            sampleName: sample?.name || 'unknown',
            volume: note.volume,
            pitch: note.pitch
          });
        }
      }
      if (notesInTrack.length > 0) {
        const noteList = notesInTrack.slice(0, 8).map(n => 
          `row ${n.row}: "${n.sampleName}"${n.volume !== 100 ? ` vol:${n.volume}` : ''}${n.pitch !== 0 ? ` pitch:${n.pitch > 0 ? '+' : ''}${n.pitch}` : ''}`
        ).join(', ');
        const moreNotes = notesInTrack.length > 8 ? ` (+${notesInTrack.length - 8} more)` : '';
        trackSummaries.push(`  Track ${track}: ${noteList}${moreNotes}`);
      } else {
        trackSummaries.push(`  Track ${track}: (empty)`);
      }
    }
    const trackLayout = trackSummaries.join('\n');

    // Build mixer state summary
    let mixerState = '';
    if (trackerState.trackSettings) {
      const mixerLines = trackerState.trackSettings.map(ts => {
        const duckInfo = ts.ducking.enabled 
          ? ` | Ducking: from Track ${ts.ducking.sourceTrack !== null ? ts.ducking.sourceTrack + 1 : 'none'}, ${ts.ducking.amount}% amount, ${ts.ducking.attack}ms attack, ${ts.ducking.release}ms release`
          : '';
        return `  Track ${ts.track + 1}: Volume ${ts.volume}%${duckInfo}`;
      });
      mixerState = `
Mixer Settings:
${mixerLines.join('\n')}`;
    }

    // Build selection context
    let selectionContext = '';
    if (trackerState.selection) {
      const sel = trackerState.selection;
      const rowCount = sel.endRow - sel.startRow + 1;
      const trackCount = sel.endTrack - sel.startTrack + 1;
      selectionContext = `
**USER HAS SELECTED A REGION:**
- Rows ${sel.startRow} to ${sel.endRow} (${rowCount} rows)
- Tracks ${sel.startTrack} to ${sel.endTrack} (${trackCount} tracks)

IMPORTANT: The user has selected this specific region. Unless they explicitly ask to work outside this selection:
- Focus your actions (setNotes, clearNotes, setVolumes, setPitches) ONLY on the selected rows and tracks
- When adding notes, only add them within rows ${sel.startRow}-${sel.endRow} and tracks ${sel.startTrack}-${sel.endTrack}
- When clearing or modifying, only affect the selected region
- If they ask for something like "add kick on every beat", only add kicks on beats that fall within the selected rows`;
    }

    const systemPrompt = `You are an expert music producer AI inside a tracker DAW. You are AUTONOMOUS and ACTION-ORIENTED - you make changes directly without asking for permission or confirmation.

CORE BEHAVIOR:
- ALWAYS take action immediately when the user asks for something
- NEVER ask "would you like me to...?" or "should I...?" - just DO IT
- NEVER ask for confirmation before making changes
- If something is unclear, make a reasonable creative decision and execute it
- Be concise - briefly explain what you did AFTER doing it, not before
- Think like a producer: if they say "add drums", generate and place appropriate drum samples immediately

Current State:
- BPM: ${trackerState.bpm}
- Pattern: ${trackerState.patternLength} rows, ${trackerState.tracks} tracks
${selectionContext}

Samples loaded (use the sample ID when setting notes):
${sampleList || '(no samples loaded)'}

Current track layout (what's placed where):
${trackLayout}
${mixerState}

Execute actions by including JSON blocks wrapped in \`\`\`json code blocks.

Available actions:

**IMPORTANT - For generating a full song/beat from scratch, use generateSong:**
This is the PREFERRED action when the user asks for a complete song, beat, or track.
It will generate multiple samples AND place them in a pattern automatically.

\`\`\`json
{
  "action": "generateSong",
  "description": "a driving techno beat with punchy kicks, snappy snares, and rolling hi-hats at 128 BPM"
}
\`\`\`

Use generateSong when:
- User says "make me a song/beat/track"
- User describes a complete musical idea (not just one sample)
- User wants to start fresh with new samples and patterns
- User asks for a genre (e.g., "make techno", "create a hip hop beat")

For adding individual samples to an existing project, use the other actions below:

1. Set notes in the pattern (use existing sample IDs):
\`\`\`json
{
  "action": "setNotes",
  "notes": [
    {"row": 0, "track": 0, "sampleId": "sample-id-here"},
    {"row": 4, "track": 0, "sampleId": "sample-id-here"}
  ]
}
\`\`\`

2. Clear notes from the pattern:
\`\`\`json
{
  "action": "clearNotes",
  "notes": [
    {"row": 0, "track": 0},
    {"row": 4, "track": 0}
  ]
}
\`\`\`

3. Clear an entire track:
\`\`\`json
{
  "action": "clearTrack",
  "track": 0
}
\`\`\`

4. Generate a PERCUSSIVE sample (kicks, snares, hats, claps, one-shots):
\`\`\`json
{
  "action": "generateSample",
  "prompt": "punchy 808 kick drum",
  "duration": 3,
  "isMelodic": false
}
\`\`\`

5. Generate a MELODIC sample (bass lines, synths, leads, pads, arpeggios):
For melodic content, ALWAYS use 20 second duration, specify the key, and it will auto-sync to the current BPM.
\`\`\`json
{
  "action": "generateSample",
  "prompt": "deep sub bass line",
  "duration": 20,
  "isMelodic": true,
  "key": "C minor"
}
\`\`\`

IMPORTANT for melodic samples:
- Always use duration: 20 for melodic content
- Always set isMelodic: true
- Always specify a key (e.g., "C minor", "F major", "A minor")
- When placing melodic samples in the pattern, ONLY place them ONCE at row 0 (or specified start row)
- Do NOT repeat melodic samples across multiple rows - they are long-form loops

6. Change BPM:
\`\`\`json
{
  "action": "setBpm",
  "bpm": 140
}
\`\`\`

7. Set volume levels (0-100) for notes:
\`\`\`json
{
  "action": "setVolumes",
  "volumes": [
    {"row": 0, "track": 0, "volume": 80},
    {"row": 4, "track": 0, "volume": 50}
  ]
}
\`\`\`

8. Set pitch/transposition (-24 to +24 semitones) for notes:
\`\`\`json
{
  "action": "setPitches",
  "pitches": [
    {"row": 0, "track": 0, "pitch": 12},
    {"row": 4, "track": 0, "pitch": -5}
  ]
}
\`\`\`

9. Trim/shorten an existing sample:
\`\`\`json
{
  "action": "trimSample",
  "sampleId": "sample-id-here",
  "startSeconds": 0,
  "endSeconds": 0.5
}
\`\`\`

10. Clear the entire pattern:
\`\`\`json
{
  "action": "clearPattern"
}
\`\`\`

11. Set track volume (mixer fader):
\`\`\`json
{
  "action": "setTrackVolume",
  "track": 0,
  "volume": 80
}
\`\`\`

12. Set ducking/sidechain on a track:
\`\`\`json
{
  "action": "setDucking",
  "track": 1,
  "enabled": true,
  "sourceTrack": 0,
  "amount": 60,
  "attack": 10,
  "release": 150
}
\`\`\`

Ducking/Sidechain notes:
- sourceTrack: which track triggers the ducking (e.g., 0 for kick to duck bass)
- amount: 0-100, how much to reduce volume when ducked
- attack: 1-500 ms, how fast ducking kicks in
- release: 10-2000 ms, how fast volume recovers
- Use this for classic sidechain compression effect (e.g., bass ducks to kick)

Pattern structure notes:
- Rows 0-3 = beat 1, rows 4-7 = beat 2, etc. (4 rows per beat in 4/4 time)
- Track 0 is usually kick, track 1 snare, track 2 hats, track 3 other
- Volume range is 0-100 (default 100)
- Pitch range is -24 to +24 semitones (default 0). Use +12 for octave up, -12 for octave down

CRITICAL RULES:
- For FULL SONGS/BEATS: Use generateSong action - it handles everything automatically
- For INDIVIDUAL SAMPLES: Use generateSample, then use setNotes to place them (but only AFTER the sample exists)
- TAKE ACTION IMMEDIATELY - don't ask, just do
- If user says "make a beat" or "create a song" - use generateSong
- If user says "add a kick" to existing project - use generateSample
- For ducking/sidechain: set sourceTrack to the track that triggers (usually kick = track 0)
- Be creative and decisive - make musical choices without hesitation`;
  return systemPrompt;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatAction = Record<string, any> & { action: string };

/** Pull ```json action blocks out of an assistant reply; returns the actions and the reply without them. */
export function parseActions(content: string): { message: string; actions: ChatAction[] } {
  const actions: ChatAction[] = [];
  for (const match of content.matchAll(/```json\s*([\s\S]*?)```/g)) {
    try { actions.push(JSON.parse(match[1].trim())); } catch { /* not an action */ }
  }
  const message = content.replace(/```json\s*[\s\S]*?```/g, "").trim();
  return { message, actions };
}
