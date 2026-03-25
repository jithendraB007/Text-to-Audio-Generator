import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execAsync = promisify(exec);

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { script, speakers } = body;

        if (!script || !speakers) {
            return NextResponse.json({ error: 'Missing script or speakers' }, { status: 400 });
        }

        // Since AI is disallowed and browser JS can't download SpeechSynthesis directly,
        // we use a native OS-level fallback (PowerShell System.Speech) for Windows users to generate a WAV file natively.

        if (process.platform !== 'win32') {
            return NextResponse.json({ error: 'Native offline TTS generation requires Windows OS for this No-AI MVP build.' }, { status: 400 });
        }

        // Prepare temp file path
        const tempDir = os.tmpdir();
        const uniqueId = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
        const wavPath = path.join(tempDir, `accenttalk_${uniqueId}.wav`);
        const ps1Path = path.join(tempDir, `accenttalk_${uniqueId}.ps1`);

        // We generate a PowerShell script that speaks each line and saves to one WAV file
        let psScript = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile("${wavPath.replace(/\\/g, '\\\\')}")

`;

        // Function to parse the script just like frontend
        const parseScript = (text: string) => {
            const lines = text.split('\n').map(l => l.trim()).filter(l => l);
            const result = [];
            let currentSpeaker = 'A';
            for (const line of lines) {
                let textPart = line;
                const upper = line.toUpperCase();
                if (upper.startsWith('A:')) {
                    currentSpeaker = 'A';
                    textPart = line.substring(2).trim();
                } else if (upper.startsWith('B:')) {
                    currentSpeaker = 'B';
                    textPart = line.substring(2).trim();
                }
                result.push({ speaker: currentSpeaker, text: textPart });
            }
            return result;
        };

        const parsedLines = parseScript(script);

        for (const line of parsedLines) {
            const config = speakers[line.speaker];

            // Determine best local Windows voice based on gender
            // David is Male, Zira/Hazel are Female
            let voiceName = 'Microsoft Zira Desktop'; // default female US
            if (config.gender === 'male') {
                voiceName = 'Microsoft David Desktop';
            } else if (config.accentPreset === 'en-GB') {
                voiceName = 'Microsoft Hazel Desktop';
            }

            psScript += `$synth.SelectVoice("${voiceName}")\n`;
            psScript += `$synth.Rate = ${Math.round((config.speed - 1.0) * 10)}\n`; // System.Speech rate is -10 to 10
            psScript += `$synth.Speak("${line.text.replace(/"/g, '`"')}")\n`;

            // Add pause roughly using sleep
            if (config.pauseAfterLineMs > 0) {
                psScript += `Start-Sleep -Milliseconds ${config.pauseAfterLineMs}\n`;
            }
        }

        psScript += `$synth.Dispose()\n`;

        // Write PS1 and Execute
        fs.writeFileSync(ps1Path, psScript, 'utf8');

        await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1Path}"`);

        // Read generated WAV
        const wavBuffer = fs.readFileSync(wavPath);

        // Cleanup
        try {
            fs.unlinkSync(ps1Path);
            fs.unlinkSync(wavPath);
        } catch (e) { }

        // Return WAV File
        return new NextResponse(wavBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'audio/wav',
                'Content-Disposition': `attachment; filename="AccentTalk_Export_${uniqueId}.wav"`,
            },
        });

    } catch (error: any) {
        console.error("TTS Generation Error:", error);
        return NextResponse.json({ error: error.message || 'Error generating TTS' }, { status: 500 });
    }
}
