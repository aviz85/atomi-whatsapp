---
name: whatsapp
description: Send and read WhatsApp messages via the Green API. Use when the user wants to send a WhatsApp message, a reminder, a notification, or to read recent incoming WhatsApp messages.
version: "1.1.1"
author: atomi
tags: [whatsapp, green-api, messaging]
allowed-tools: Bash, Read
---

# WhatsApp (Green API)

Send and read WhatsApp from Codex through the [Green API](https://green-api.com).

## Commands (run + params, that's it)

Each capability is a single command. No install, no config files to hand-edit.

```bash
node scripts/wa.mjs check                                          # credentials present? (call this FIRST, always)
node scripts/wa.mjs where                                          # print this project's .env path
node scripts/wa.mjs send --self "..."                              # message yourself
node scripts/wa.mjs send --to <num> "..."                          # message someone
node scripts/wa.mjs send --group <id>@g.us "..."                   # message a group
node scripts/wa.mjs send --to <num> --file <path> --caption "..."  # send image / pdf / audio
node scripts/wa.mjs send --to <num> --quote <msgId> "..."          # reply to a message
node scripts/wa.mjs read --count 10 [--json]                       # recent incoming
node scripts/wa.mjs read --group <id>@g.us --count 15              # one group
node scripts/wa.mjs send --self --voice ./voice.mp3                # send a voice note
node scripts/wa.mjs download --url "<downloadUrl>" --out ./file    # save incoming media in this project
```

Details for each are below.

## Requirement

**Node.js 18 or newer** (uses the built-in `fetch`, no packages to install). Check with `node --version`. If missing, install from https://nodejs.org (LTS).

## Credentials are local to THIS project - `.env` at the repo root

The keys live in **`.env` at the root of the current project** (the folder the user has open). Every `check` / `send` / `read` looks there again. The script never writes outside the project: many environments have no write permission in the home directory or in the plugin cache.

- Path to tell the user: `.env` (relative). Do not quote a home-directory path.
- The script adds `.env` to `.gitignore` so the keys never go to GitHub.
- Each project has its own `.env`. A new folder needs its own keys file.
- Node.js only. No Python.

## Before ANY send/read: run `check` first — never guess, never open the document yourself

`check` is a 100%-deterministic script gate. No network call, no judgment call — it only looks at whether the required keys are present:

```bash
node scripts/wa.mjs check
```

- **Exit 0, prints `OK`:** credentials are present. Proceed straight to `send`/`read` — do not open or read the .env file yourself, do not ask the user anything.
- **Exit non-zero:** credentials are missing. The script *itself* already created `.env` in this project (and added it to `.gitignore`) and opened it in the user's editor. Just tell the user: the file `.env` opened in the project folder, paste `idInstance` / `apiTokenInstance` / their own WhatsApp number from the Green API console (console.green-api.com → their instance) into the matching fields, save (Cmd+S / Ctrl+S), and say "סיימתי". **Then run `check` again** before retrying the action — do not call `send`/`read` directly.

**Never ask the user to paste the token into the chat** — it is a secret and must not sit in the conversation; the document flow above is the only path.

Once `check` passes, `send`/`read` themselves also re-verify before doing anything (defense in depth), so calling them directly after a passing `check` is always safe.

**First-time live verification (optional but recommended right after setup):** `check` only confirms the keys are *present*, not that they actually work. After a fresh `check` passes for the first time, send a real test message to confirm the connection itself is good:
```bash
node scripts/wa.mjs send --self "בדיקה: החיבור עובד ✅"
```

**Critical — enable webhook notifications so `read` works.** Before reading can pull any messages, the user MUST turn ON the incoming-message notifications in the Green API instance settings. In the console (console.green-api.com → their instance) open the **"וובהוק"** (webhook) section and turn on:
   - **"קבל התראת וובהוק בעת קבלת הודעות נכנסות (כולל קבצים)"** (receive incoming messages, including files) → ON
   - **"קבל וובהוק על הודעות שנשלחו ממכשיר הפלאפון"** (messages sent from the phone) → ON

   No webhook URL is needed — the plugin polls, it does not receive pushes. But without the incoming-message notification turned ON, Green API never queues incoming messages and `read` will always come back empty. The outgoing (from-phone) toggle lets self/sent messages be tracked too. Tell the user to save after flipping the toggles.

Advanced fallback (only if the user explicitly prefers passing values directly instead of the document):
- `node scripts/wa.mjs set --instance <idInstance> --token <apiTokenInstance> --phone <their number>`
- or from a full example-request URL: `node scripts/wa.mjs set --from-url "https://7103.api.greenapi.com/waInstance7103.../getSettings/TOKEN"`
- The script also reads `GREEN_API_URL` / `GREEN_API_INSTANCE` / `GREEN_API_TOKEN` from the environment if set.

## Send a message

```bash
node scripts/wa.mjs send --to 972501234567 "ההודעה כאן"
# group:
node scripts/wa.mjs send --group 1203630000000000@g.us "הודעה לקבוצה"
```

- `--to` accepts Israeli formats (`0501234567`, `972501234567`) and is normalized.
- Returns the Green API `idMessage` on success.

**Send to the user themselves.** When the user says "send me…" / "שלח לי…" / "remind me", use their saved number:

```bash
node scripts/wa.mjs send --self "ההודעה כאן"
```

`--self` always uses `MY_PHONE` from this project's `.env`. `check` fails until that number is filled. To set only the number: `node scripts/wa.mjs set --phone 972501234567`.

The Green API instance *is* the user's own WhatsApp account (they authorized it by scanning the QR with their personal phone), so every message goes out **as them**. Sending to their own number therefore lands in their own "הודעה לעצמי" (note-to-self) chat, shown as sent by them — WhatsApp marks it with a single tick (`sent`) since sender and recipient are the same account.

## Send a file (image / PDF / audio / recording / document)

```bash
node scripts/wa.mjs send --to 972501234567 --file ./invoice.pdf --caption "החשבונית שלך"
```

Works with `--group` and `--self` too. Any file type via Green API `sendFileByUpload`: images arrive as images, audio (e.g. a recording `.mp3`/`.ogg`) as playable audio, PDF and others as documents.

## Reply to a specific message (quoted-message style)

To reply *to* a particular message (so it shows as a quote/reply in WhatsApp), pass its message id with `--quote`:

```bash
node scripts/wa.mjs send --to 972501234567 --quote <messageId> "התשובה שלי"
```

The `<messageId>` is the `id=` shown by `read`. Works with `--file` too.

## Read recent incoming messages

```bash
node scripts/wa.mjs read --count 10
# full structured records (quoted bodies, media urls, everything):
node scripts/wa.mjs read --count 10 --json
```

Each line shows the message id.

- **Images / PDF / audio / video:** the line shows `downloadUrl=<url>` plus type and caption. To actually *see* an incoming image or read a document, download it and open the local file:

  ```bash
  node scripts/wa.mjs download --url "<the downloadUrl>" --out ./incoming.jpg
  ```

  Then read `./incoming.jpg` - you (the model) can view the image directly. Same for PDFs/audio. Download into the project, not into `/tmp` or the home directory.
- **Quote-replies:** if a message is a reply, the line also shows the quoted message id (`stanzaId`) and the quoted text, so you have the full context of what it replied to:

  ```
  - דנה [reply id=3EB0... →quoted=3EB0AA...]: כן מאשר ⟶ בתגובה ל: "בקשת אישור · משימה T1 ..."
  ```

  For the complete quoted body and all fields, use `read --json`. This is also how approvals are matched to requests (see the HITL plugin, which automates it).

**Nothing comes back?** If `read` returns nothing / incoming messages are never seen, the incoming-message webhook notification is almost certainly OFF in Green API. Have the user enable it in the console under the "וובהוק" section (see Setup above) - without it Green API does not queue incoming messages at all.

**Not real-time.** `read` pulls whatever is in the Green API incoming queue at the moment it runs. There is no push/webhook here, so the agent does not reply the instant a message arrives. Replies happen when something runs `read` — on demand, or on a **scheduled task** that periodically reads new messages and answers them. Set expectations accordingly: this is a polling model, not a live chatbot.

## Rules

- Hebrew messages: keep it natural, no markdown. Start lines with a Hebrew letter where possible (a leading digit/dash/emoji can break RTL).
- Never use an em-dash (—); use a plain hyphen.
- Sending to anyone other than the user is sensitive: show the draft and get approval first (Human-in-the-Loop).
