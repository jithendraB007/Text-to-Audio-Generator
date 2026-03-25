"use client";

import React, { useState, useEffect } from 'react';

type Generation = 'child' | 'young' | 'adult' | 'senior';

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

const ACCENT_PRESETS = [
    { id: 'en-US', label: 'US English',         female: 'Aria',    male: 'Guy'     },
    { id: 'en-GB', label: 'UK English',          female: 'Sonia',   male: 'Ryan'    },
    { id: 'en-AU', label: 'Australian English',  female: 'Natasha', male: 'William' },
    { id: 'en-CA', label: 'Canadian English',    female: 'Clara',   male: 'Liam'    },
    { id: 'en-IN', label: 'Indian English',      female: 'Neerja',  male: 'Prabhat' },
];

const GENERATIONS: { id: Generation; label: string; hint: string }[] = [
    { id: 'child',  label: 'Child',       hint: 'Higher pitch, slightly faster' },
    { id: 'young',  label: 'Young Adult', hint: 'Bright, upbeat tone'           },
    { id: 'adult',  label: 'Adult',       hint: 'Neutral, natural voice'        },
    { id: 'senior', label: 'Senior',      hint: 'Lower pitch, measured pace'    },
];

export default function Home() {
    const [script, setScript] = useState(
        "A: Hello there! Welcome to AccentTalk.\nB: Hi! This uses Microsoft Edge's neural voices.\nA: Exactly — real voices, different ages and accents, completely free."
    );
    const [speakerA, setSpeakerA] = useState<SpeakerConfig>({
        gender: 'female', accentPreset: 'en-US', generation: 'young', speed: 1.0, pauseAfterLineMs: 400,
    });
    const [speakerB, setSpeakerB] = useState<SpeakerConfig>({
        gender: 'male', accentPreset: 'en-GB', generation: 'adult', speed: 1.0, pauseAfterLineMs: 400,
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [statusMsg, setStatusMsg] = useState('');
    const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

    useEffect(() => {
        const load = () => {
            const v = window.speechSynthesis.getVoices();
            if (v.length > 0) setAvailableVoices(v);
        };
        load();
        window.speechSynthesis.onvoiceschanged = load;
    }, []);

    const parseScript = (text: string): ScriptLine[] => {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const result: ScriptLine[] = [];
        let cur: 'A' | 'B' = 'A';
        for (const line of lines) {
            const up = line.toUpperCase();
            if (up.startsWith('A:')) { cur = 'A'; result.push({ speaker: 'A', text: line.substring(2).trim() }); }
            else if (up.startsWith('B:')) { cur = 'B'; result.push({ speaker: 'B', text: line.substring(2).trim() }); }
            else result.push({ speaker: cur, text: line });
        }
        return result;
    };

    const voiceLabel = (cfg: SpeakerConfig) => {
        const preset = ACCENT_PRESETS.find(p => p.id === cfg.accentPreset) ?? ACCENT_PRESETS[0];
        const name = cfg.gender === 'female' ? preset.female : preset.male;
        const gen = GENERATIONS.find(g => g.id === cfg.generation)?.label ?? 'Adult';
        return `${name} · ${gen}`;
    };

    const generateAudio = async () => {
        if (!script.trim()) { alert('Please enter a script.'); return; }
        setIsGenerating(true);
        setAudioUrl(null);
        setStatusMsg('Generating with Microsoft Edge neural voices…');
        try {
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script, speakers: { A: speakerA, B: speakerB } }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Server error ${res.status}`);
            }
            const blob = await res.blob();
            setAudioUrl(URL.createObjectURL(blob));
            setStatusMsg('');
        } catch (e: any) {
            alert('Error: ' + e.message);
            setStatusMsg('');
        } finally {
            setIsGenerating(false);
        }
    };

    const getBestVoice = (cfg: SpeakerConfig) => {
        let pool = availableVoices.filter(v => v.lang.toLowerCase().startsWith(cfg.accentPreset.toLowerCase()));
        if (!pool.length) pool = availableVoices;
        const femaleKw = ['samantha', 'zira', 'hazel', 'victoria', 'karen', 'allison', 'ava', 'female', 'aria', 'sonia', 'natasha'];
        const maleKw   = ['david', 'mark', 'george', 'daniel', 'alex', 'male', 'guy', 'ryan', 'william'];
        const kw = cfg.gender === 'female' ? femaleKw : maleKw;
        return pool.find(v => kw.some(k => v.name.toLowerCase().includes(k))) || pool[0];
    };

    const generationPitch = (gen: Generation): number => {
        return { child: 1.4, young: 1.15, adult: 1.0, senior: 0.8 }[gen] ?? 1.0;
    };

    const playLivePreview = () => {
        if (window.speechSynthesis.speaking) { window.speechSynthesis.cancel(); return; }
        const lines = parseScript(script);
        let i = 0;
        const next = () => {
            if (i >= lines.length) return;
            const line = lines[i++];
            const cfg = line.speaker === 'A' ? speakerA : speakerB;
            const utt = new SpeechSynthesisUtterance(line.text);
            const v = getBestVoice(cfg);
            if (v) utt.voice = v;
            utt.rate  = cfg.speed;
            utt.lang  = cfg.accentPreset;
            utt.pitch = generationPitch(cfg.generation);
            utt.onend = () => setTimeout(next, cfg.pauseAfterLineMs);
            window.speechSynthesis.speak(utt);
        };
        next();
    };

    return (
        <div className="app-container">
            <header className="header">
                <div className="logo">
                    AccentTalk{' '}
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'normal' }}>
                        Microsoft Neural Voices · Free
                    </span>
                </div>
                <button className="btn" style={{ border: '1px solid var(--border-color)', background: 'white' }}>
                    My Projects
                </button>
            </header>

            <main className="main-content">
                {/* Script editor */}
                <section className="workspace">
                    <h2>Script Workspace</h2>
                    <div className="editor-container">
                        <div className="editor-toolbar">
                            <span>{script.length} / 5000 characters</span>
                            <span className="status-badge">A: / B: speaker format</span>
                        </div>
                        <textarea
                            className="script-input"
                            value={script}
                            onChange={e => setScript(e.target.value)}
                            placeholder={"A: Hello\nB: Hi there!"}
                        />
                    </div>
                    {statusMsg && (
                        <p style={{ marginTop: '1rem', color: 'var(--primary-color)', fontWeight: 500 }}>
                            {statusMsg}
                        </p>
                    )}
                </section>

                {/* Sidebar config */}
                <section className="sidebar">
                    <h2>Speaker Configuration</h2>

                    {(['A', 'B'] as const).map(spk => {
                        const cfg    = spk === 'A' ? speakerA : speakerB;
                        const setCfg = spk === 'A' ? setSpeakerA : setSpeakerB;
                        return (
                            <div className="card" key={spk}>
                                <h3>Speaker {spk}</h3>

                                <div style={{
                                    background: '#e0e7ff', borderRadius: 6,
                                    padding: '0.4rem 0.75rem', fontSize: '0.8rem',
                                    color: 'var(--primary-color)', fontWeight: 600,
                                    marginBottom: '1rem'
                                }}>
                                    {voiceLabel(cfg)}
                                </div>

                                <div className="form-group">
                                    <label>Gender</label>
                                    <select value={cfg.gender}
                                        onChange={e => setCfg({ ...cfg, gender: e.target.value as 'male' | 'female' })}>
                                        <option value="female">Female</option>
                                        <option value="male">Male</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Accent</label>
                                    <select value={cfg.accentPreset}
                                        onChange={e => setCfg({ ...cfg, accentPreset: e.target.value })}>
                                        {ACCENT_PRESETS.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.label} ({cfg.gender === 'female' ? p.female : p.male})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Generation / Age</label>
                                    <select value={cfg.generation}
                                        onChange={e => setCfg({ ...cfg, generation: e.target.value as Generation })}>
                                        {GENERATIONS.map(g => (
                                            <option key={g.id} value={g.id}>
                                                {g.label} — {g.hint}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Speed ({cfg.speed}x)</label>
                                    <input type="range" min="0.5" max="1.5" step="0.1"
                                        value={cfg.speed}
                                        onChange={e => setCfg({ ...cfg, speed: parseFloat(e.target.value) })} />
                                </div>

                                <div className="form-group">
                                    <label>Pause after line ({cfg.pauseAfterLineMs}ms)</label>
                                    <input type="range" min="0" max="1500" step="100"
                                        value={cfg.pauseAfterLineMs}
                                        onChange={e => setCfg({ ...cfg, pauseAfterLineMs: parseInt(e.target.value) })} />
                                </div>
                            </div>
                        );
                    })}

                    <button className="btn btn-primary" onClick={generateAudio} disabled={isGenerating}>
                        {isGenerating ? 'Generating…' : 'Generate Audio (Neural)'}
                    </button>

                    <button
                        className="btn"
                        style={{ border: '1px solid var(--border-color)', background: 'white', width: '100%', marginTop: '0.5rem' }}
                        onClick={playLivePreview}
                        disabled={availableVoices.length === 0}
                    >
                        Quick Browser Preview
                    </button>

                    <div className="card" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        <strong>Voice Engine</strong><br />
                        Uses <strong>Microsoft Edge Neural TTS</strong> — high-quality AI voices, free, no API key.<br />
                        Child, Young Adult, Adult, and Senior voice profiles via pitch and rate shaping.<br />
                        Preview uses your browser's built-in voices.
                    </div>
                </section>
            </main>

            {audioUrl && (
                <footer className="player-bar">
                    <div className="audio-controls">
                        <audio controls src={audioUrl} autoPlay>
                            Your browser does not support the audio element.
                        </audio>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <a href={audioUrl} download="AccentTalk_output.mp3">
                            <button className="btn btn-primary"
                                style={{ margin: 0, padding: '0.5rem 1rem', width: 'auto' }}>
                                Download MP3
                            </button>
                        </a>
                    </div>
                </footer>
            )}
        </div>
    );
}
