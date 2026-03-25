"use client";

import React, { useState, useEffect, useRef } from 'react';

// Types from PRD
interface SpeakerConfig {
    gender: 'male' | 'female';
    accentPreset: string;
    speed: number;
    pauseAfterLineMs: number;
}

interface ScriptLine {
    speaker: 'A' | 'B';
    text: string;
}

const ACCENT_PRESETS = [
    { id: 'en-US', label: 'US English' },
    { id: 'en-GB', label: 'UK English' },
    { id: 'en-CA', label: 'Canadian English' },
    { id: 'en-AU', label: 'Australian English' },
    { id: 'en-IN', label: 'South East Asian (Style)' },
];

export default function Home() {
    const [script, setScript] = useState("A: Hello there! Welcome to AccentTalk.\nB: Hi! This assumes a native browser TTS instead of AI APIs.\nA: Exactly, it's fast and completely free to use.");
    const [speakerA, setSpeakerA] = useState<SpeakerConfig>({ gender: 'female', accentPreset: 'en-US', speed: 1.0, pauseAfterLineMs: 300 });
    const [speakerB, setSpeakerB] = useState<SpeakerConfig>({ gender: 'male', accentPreset: 'en-GB', speed: 1.0, pauseAfterLineMs: 300 });
    const [isGenerating, setIsGenerating] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

    // Load voices securely on client
    useEffect(() => {
        const loadVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                setAvailableVoices(voices);
            }
        };
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = loadVoices;
        }
    }, []);

    const parseScript = (text: string): ScriptLine[] => {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        const result: ScriptLine[] = [];
        let currentSpeaker: 'A' | 'B' = 'A';

        for (const line of lines) {
            const upper = line.toUpperCase();
            if (upper.startsWith('A:')) {
                currentSpeaker = 'A';
                result.push({ speaker: 'A', text: line.substring(2).trim() });
            } else if (upper.startsWith('B:')) {
                currentSpeaker = 'B';
                result.push({ speaker: 'B', text: line.substring(2).trim() });
            } else {
                // Inherit previous speaker
                result.push({ speaker: currentSpeaker, text: line });
            }
        }
        return result;
    };

    const getBestVoice = (config: SpeakerConfig) => {
        // Attempt to find a voice that matches Locale first
        let possible = availableVoices.filter(v => v.lang.toLowerCase().startsWith(config.accentPreset.toLowerCase()));
        if (possible.length === 0) possible = availableVoices; // fallback

        // Sort logic to specifically guess gender based on voice name identifiers (Windows & Mac heuristics)
        let best = possible.find(v => {
            const name = v.name.toLowerCase();
            if (config.gender === 'female' && (name.includes('female') || name.includes('girl') || name.includes('samantha') || name.includes('zira') || name.includes('hazel'))) return true;
            if (config.gender === 'male' && (name.includes('male') || name.includes('boy') || name.includes('david') || name.includes('mark') || name.includes('george'))) return true;
            return false;
        });

        return best || possible[0] || availableVoices[0];
    };

    const generateAudio = async () => {
        if (!script.trim()) return alert("Please enter a script.");
        setIsGenerating(true);
        setAudioUrl(null);

        // Hit our Backend `/api/tts` which uses local Windows OS TTS without external AI APIs!
        // This perfectly allows true high-quality downloadable MP3/WAV generations entirely offline.
        try {
            const parsedLines = parseScript(script);
            if (parsedLines.length === 0) throw new Error("No lines found.");

            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    script,
                    speakers: { A: speakerA, B: speakerB }
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || await response.text());
            }

            // Convert response into object URL for HTML audio element
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            setAudioUrl(url);
        } catch (e: any) {
            alert("Error generating Native Audio: " + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const playLivePreview = () => {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            return;
        }
        const parsedLines = parseScript(script);

        parsedLines.forEach((line) => {
            const config = line.speaker === 'A' ? speakerA : speakerB;
            const utterance = new SpeechSynthesisUtterance(line.text);
            utterance.voice = getBestVoice(config);
            utterance.rate = config.speed;

            // Basic pitch heuristic to further force gender distinction if voices are limited
            if (config.gender === 'male' && utterance.voice?.name.toLowerCase().includes('zira')) {
                utterance.pitch = 0.5; // Artificial fix if constrained to female 
            } else if (config.gender === 'female' && utterance.voice?.name.toLowerCase().includes('david')) {
                utterance.pitch = 1.5; // Artificial fix if constrained to male
            }

            window.speechSynthesis.speak(utterance);
        });
    };

    return (
        <div className="app-container">
            <header className="header">
                <div className="logo">
                    🎙️ AccentTalk <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'normal' }}>(Native Offline MVP)</span>
                </div>
                <button className="btn" style={{ border: '1px solid var(--border-color)', background: 'white' }}>
                    My Projects
                </button>
            </header>

            <main className="main-content">
                <section className="workspace">
                    <h2>Script Workspace</h2>
                    <div className="editor-container">
                        <div className="editor-toolbar">
                            <span>{script.length} characters (Max 5000)</span>
                            <span className="status-badge">Auto-format Active</span>
                        </div>
                        <textarea
                            className="script-input"
                            value={script}
                            onChange={e => setScript(e.target.value)}
                            placeholder="A: Hello&#10;B: Hi there!"
                        ></textarea>
                    </div>
                </section>

                <section className="sidebar">
                    <h2>Speaker Configuration</h2>

                    <div className="card">
                        <h3>Speaker A</h3>
                        <div className="form-group">
                            <label>Gender</label>
                            <select value={speakerA.gender} onChange={e => setSpeakerA({ ...speakerA, gender: e.target.value as 'male' | 'female' })}>
                                <option value="female">Female</option>
                                <option value="male">Male</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Accent Preset</label>
                            <select value={speakerA.accentPreset} onChange={e => setSpeakerA({ ...speakerA, accentPreset: e.target.value })}>
                                {ACCENT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Speed ({speakerA.speed}x)</label>
                            <input type="range" min="0.5" max="1.5" step="0.1" value={speakerA.speed} onChange={e => setSpeakerA({ ...speakerA, speed: parseFloat(e.target.value) })} />
                        </div>
                    </div>

                    <div className="card">
                        <h3>Speaker B</h3>
                        <div className="form-group">
                            <label>Gender</label>
                            <select value={speakerB.gender} onChange={e => setSpeakerB({ ...speakerB, gender: e.target.value as 'male' | 'female' })}>
                                <option value="female">Female</option>
                                <option value="male">Male</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Accent Preset</label>
                            <select value={speakerB.accentPreset} onChange={e => setSpeakerB({ ...speakerB, accentPreset: e.target.value })}>
                                {ACCENT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Speed ({speakerB.speed}x)</label>
                            <input type="range" min="0.5" max="1.5" step="0.1" value={speakerB.speed} onChange={e => setSpeakerB({ ...speakerB, speed: parseFloat(e.target.value) })} />
                        </div>
                    </div>

                    <button
                        className="btn btn-primary"
                        onClick={generateAudio}
                        disabled={isGenerating || availableVoices.length === 0}
                    >
                        {isGenerating ? 'Processing Generation...' : 'Generate & Download Audio'}
                    </button>

                    {availableVoices.length === 0 && (
                        <p style={{ fontSize: '0.8rem', color: 'red', marginTop: '0.5rem' }}>Warning: No browser voices detected. This feature requires Web Speech API support.</p>
                    )}

                </section>
            </main>

            {audioUrl && (
                <footer className="player-bar">
                    <div className="audio-controls">
                        <audio controls src={audioUrl}>
                            Your browser does not support the audio element.
                        </audio>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <button className="btn" style={{ border: '1px solid #64748b', background: 'transparent' }} onClick={playLivePreview}>
                            ▶ Web Speech Preview
                        </button>
                        <a href={audioUrl} download="AccentTalk_Offline.wav">
                            <button className="btn btn-primary" style={{ margin: 0, padding: '0.5rem 1rem', width: 'auto' }}>
                                ⬇ Download WAV
                            </button>
                        </a>
                    </div>
                </footer>
            )}
        </div>
    );
}
