Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.GetInstalledVoices() | ForEach-Object { Write-Output $_.VoiceInfo.Name }
$synth.SetOutputToWaveFile("test.wav")
$synth.Speak("Testing 1 2 3")
$synth.Dispose()
