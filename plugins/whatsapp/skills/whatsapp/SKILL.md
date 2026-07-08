---
name: whatsapp
description: Send and read WhatsApp messages via the Green API. Use when the user wants to send a WhatsApp message, a reminder, a notification, or to read recent incoming WhatsApp messages.
version: "1.0.0"
author: atomi
tags: [whatsapp, green-api, messaging]
allowed-tools: Bash, Read
---

# WhatsApp (Green API)

Send and read WhatsApp from Codex through the [Green API](https://green-api.com).

## Requirement

**Node.js 18 or newer** (uses the built-in `fetch`, no packages to install). Check with `node --version`. If missing, install from https://nodejs.org (LTS).

## Setup (once) — connect the keys FOR the user, in chat

The credentials live in `scripts/.env`. **Do not make the user edit that file.** On first use (or whenever the script reports keys are missing), onboard them conversationally:

1. Tell them: open the Green API console (console.green-api.com), select their instance. It shows labeled fields.
2. Ask for **`idInstance`** (a number). Wait for their paste.
3. Ask for **`apiTokenInstance`** (a long token). Wait for their paste.
4. Ask for **their own WhatsApp number** (so they can send messages to themselves). Wait for their answer.
5. Write everything with the script (the `apiUrl` is derived automatically from the instance number):

```bash
node scripts/wa.mjs set --instance <idInstance> --token <apiTokenInstance> --phone <their own number>
```

That writes `scripts/.env` (keys + `MY_PHONE`). Then send a test message to the user to confirm it works.

- If the user prefers to paste a whole example-request URL from the console instead of two fields:
  `node scripts/wa.mjs set --from-url "https://7103.api.greenapi.com/waInstance7103.../getSettings/TOKEN"`
- If the user would rather fill the file by hand: `node scripts/wa.mjs setup` creates `scripts/.env` and opens it in a text editor.
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

`--self` uses `MY_PHONE` from `scripts/.env` (set during setup). If it isn't saved yet, ask the user for their number and re-run `set … --phone <number>`.

The Green API instance *is* the user's own WhatsApp account (they authorized it by scanning the QR with their personal phone), so every message goes out **as them**. Sending to their own number therefore lands in their own "הודעה לעצמי" (note-to-self) chat, shown as sent by them — WhatsApp marks it with a single tick (`sent`) since sender and recipient are the same account.

## Send a file (image / PDF / audio / recording / document)

```bash
node scripts/wa.mjs send --to 972501234567 --file /tmp/invoice.pdf --caption "החשבונית שלך"
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
  node scripts/wa.mjs download --url "<the downloadUrl>" --out /tmp/incoming.jpg
  ```

  Then read `/tmp/incoming.jpg` — you (the model) can view the image directly. Same for PDFs/audio.
- **Quote-replies:** if a message is a reply, the line also shows the quoted message id (`stanzaId`) and the quoted text, so you have the full context of what it replied to:

  ```
  - דנה [reply id=3EB0... →quoted=3EB0AA...]: כן מאשר ⟶ בתגובה ל: "בקשת אישור · משימה T1 ..."
  ```

  For the complete quoted body and all fields, use `read --json`. This is also how approvals are matched to requests (see the HITL plugin, which automates it).

**Not real-time.** `read` pulls whatever is in the Green API incoming queue at the moment it runs. There is no push/webhook here, so the agent does not reply the instant a message arrives. Replies happen when something runs `read` — on demand, or on a **scheduled task** that periodically reads new messages and answers them. Set expectations accordingly: this is a polling model, not a live chatbot.

## Rules

- Hebrew messages: keep it natural, no markdown. Start lines with a Hebrew letter where possible (a leading digit/dash/emoji can break RTL).
- Never use an em-dash (—); use a plain hyphen.
- Sending to anyone other than the user is sensitive: show the draft and get approval first (Human-in-the-Loop).
