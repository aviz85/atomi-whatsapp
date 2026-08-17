---
name: elevenlabs
description: Generate a spoken audio file with ElevenLabs TTS and save it in the current project. Use when the user wants a voice recording, a spoken WhatsApp message, a morning briefing in their own voice, or text-to-speech.
version: "1.0.0"
author: atomi
tags: [elevenlabs, tts, voice, audio]
allowed-tools: Bash, Read
---

# ElevenLabs (TTS)

Turn text into an mp3 in **this project**. Node.js 18+ only. No Python. No packages to install.

## Credentials - same rule as WhatsApp

Keys live in **`.env` at the root of the current project**. This plugin never writes outside the repo.

- Tell the user the path `.env` (relative).
- The script adds `.env` to `.gitignore`.
- If WhatsApp already created `.env`, this plugin **appends** the ElevenLabs fields. One file, one project.

Required: `ELEVENLABS_API_KEY` from https://elevenlabs.io/app/developers/api-keys
Optional: `ELEVENLABS_VOICE_ID`. Leave empty on a free account - the script picks an existing library voice. Free accounts cannot create a new voice. A custom clone needs a paid plan: https://elevenlabs.io/app/speech-synthesis/speech-to-speech?action=create
Speak UI (existing voices): https://elevenlabs.io/app/speech-synthesis/text-to-speech
Voice library: https://elevenlabs.io/app/voices

Never ask the user to paste the key into the chat.

## Commands

```bash
node scripts/tts.mjs check
node scripts/tts.mjs where
node scripts/tts.mjs voices
node scripts/tts.mjs speak --text "בוקר טוב. זו סקירת הבוקר." --out ./voice.mp3
node scripts/tts.mjs speak --file ./second-brain/outputs/2026-08-17-voice-script.md --out ./voice.mp3
```

- **check first.** Exit 0 + `OK` means keys are present. Exit 2 means `.env` was opened for editing.
- After the user says they saved, run `check` again, then `speak`.
- Save audio **inside the project** (`./voice.mp3`). Do not write to `/tmp` or the home directory.

## Lesson loop with WhatsApp

1. `tts.mjs check` then `speak` into `./voice.mp3`
2. `$whatsapp` send that file: `node scripts/wa.mjs send --self --file ./voice.mp3`
3. For a voice-note style send, use `--voice ./voice.mp3` on the WhatsApp script.

Show the draft text and get approval before sending to anyone other than the user.
