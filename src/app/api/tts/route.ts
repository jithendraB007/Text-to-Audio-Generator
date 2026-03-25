import { NextRequest, NextResponse } from 'next/server';
import { EdgeTTS } from 'edge-tts-universal';

// ─────────────────────────────────────────────────────────────
//  VOICE MAP  —  Microsoft Edge Neural voices (free, no API key)
// ─────────────────────────────────────────────────────────────
const VOICE_MAP: Record<string, { male: string; female: string }> = {
    'en-US': { female: 'en-US-AriaNeural',    male: 'en-US-GuyNeural'     },
    'en-GB': { female: 'en-GB-SoniaNeural',   male: 'en-GB-RyanNeural'    },
    'en-AU': { female: 'en-AU-NatashaNeural', male: 'en-AU-WilliamNeural' },
    'en-CA': { female: 'en-CA-ClaraNeural',   male: 'en-CA-LiamNeural'    },
    'en-IN': { female: 'en-IN-NeerjaNeural',  male: 'en-IN-PrabhatNeural' },
};

// Dedicated child voices where Edge TTS has them (en-US female only)
const CHILD_VOICE_OVERRIDES: Partial<Record<string, { female?: string; male?: string }>> = {
    'en-US': { female: 'en-US-AnaNeural' },
};

// ─────────────────────────────────────────────────────────────
//  GENERATION  —  pitch + rate offsets per age group
// ─────────────────────────────────────────────────────────────
type Generation = 'child' | 'young' | 'adult' | 'senior';

const GENERATION_ADJUSTMENTS: Record<Generation, { pitch: string; rateOffset: number }> = {
    child:  { pitch: '+15Hz', rateOffset: +10 },
    young:  { pitch: '+6Hz',  rateOffset: +5  },
    adult:  { pitch: '+0Hz',  rateOffset:  0  },
    senior: { pitch: '-8Hz',  rateOffset: -10 },
};

interface SpeakerConfig {
    gender: 'male' | 'female';
    accentPreset: string;
    generation: Generation;
    speed: number;
    pauseAfterLineMs: number;
}

interface ScriptLine {
    speaker: 'A' | 'B';
    text: string;
}

function parseScript(text: string): ScriptLine[] {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const result: ScriptLine[] = [];
    let cur: 'A' | 'B' = 'A';
    for (const line of lines) {
        const up = line.toUpperCase();
        if (up.startsWith('A:')) {
            cur = 'A';
            result.push({ speaker: 'A', text: line.substring(2).trim() });
        } else if (up.startsWith('B:')) {
            cur = 'B';
            result.push({ speaker: 'B', text: line.substring(2).trim() });
        } else {
            result.push({ speaker: cur, text: line });
        }
    }
    return result;
}

function getVoiceName(config: SpeakerConfig): string {
    const gen = config.generation ?? 'adult';
    if (gen === 'child') {
        const override = CHILD_VOICE_OVERRIDES[config.accentPreset];
        if (override?.[config.gender]) return override[config.gender]!;
    }
    const map = VOICE_MAP[config.accentPreset] ?? VOICE_MAP['en-US'];
    return map[config.gender];
}

// Convert speed slider (0.5–1.5) + generation offset → Edge TTS rate string
function buildRate(speed: number, rateOffset: number): string {
    const pct = Math.round((speed - 1) * 100) + rateOffset;
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

// Minimal silent MP3 frames for pause between lines (~26ms per frame)
function silenceBuffer(ms: number): Buffer {
    const frame = Buffer.from([
        0xff, 0xfb, 0x90, 0x00,
        ...new Array(413).fill(0),
    ]);
    const count = Math.max(1, Math.ceil(ms / 26));
    return Buffer.concat(Array.from({ length: count }, () => frame));
}

export async function POST(req: NextRequest) {
    try {
        const { script, speakers } = await req.json() as {
            script: string;
            speakers: { A: SpeakerConfig; B: SpeakerConfig };
        };

        if (!script?.trim()) {
            return NextResponse.json({ error: 'Script is empty' }, { status: 400 });
        }

        const lines = parseScript(script).filter(l => l.text.trim());
        if (lines.length === 0) {
            return NextResponse.json({ error: 'No valid lines found' }, { status: 400 });
        }

        // Process all lines in parallel — much faster, avoids Vercel timeout
        const lineBuffers = await Promise.all(lines.map(async line => {
            const config = line.speaker === 'A' ? speakers.A : speakers.B;
            const gen    = config.generation ?? 'adult';
            const adj    = GENERATION_ADJUSTMENTS[gen] ?? GENERATION_ADJUSTMENTS.adult;
            const voice  = getVoiceName(config);
            const rate   = buildRate(config.speed, adj.rateOffset);
            const pitch  = adj.pitch;

            const tts    = new EdgeTTS(line.text, voice, { rate, pitch });
            const result = await tts.synthesize();
            const audio  = Buffer.from(await result.audio.arrayBuffer());
            const pause  = config.pauseAfterLineMs > 0 ? silenceBuffer(config.pauseAfterLineMs) : null;
            return pause ? Buffer.concat([audio, pause]) : audio;
        }));

        return new NextResponse(Buffer.concat(lineBuffers), {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Disposition': 'attachment; filename="AccentTalk_output.mp3"',
            },
        });
    } catch (err: any) {
        console.error('[TTS Error]', err);
        return NextResponse.json(
            { error: err.message || 'TTS generation failed' },
            { status: 500 }
        );
    }
}
