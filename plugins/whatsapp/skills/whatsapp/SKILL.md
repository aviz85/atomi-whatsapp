---
name: whatsapp
description: Send and read WhatsApp messages via the Green API. Use when the user wants to send a WhatsApp message, a reminder, a notification, or to read recent incoming WhatsApp messages.
version: "1.0.0"
author: aviz85
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
4. Write the keys with the script (the `apiUrl` is derived automatically from the instance number):

```bash
node scripts/wa.mjs set --instance <idInstance> --token <apiTokenInstance>
```

That writes `scripts/.env`. Then send a test message to the user to confirm it works.

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

## Send a file (PDF / image / document)

```bash
node scripts/wa.mjs send --to 972501234567 --file /tmp/invoice.pdf --caption "החשבונית שלך"
```

Works with `--group` too. Any file type (PDF, image, doc) via Green API `sendFileByUpload`.

## Read recent incoming messages

```bash
node scripts/wa.mjs read --count 10
```

Each line shows the message id. If a message is a **quote-reply** (the user used Reply), it also shows the quoted message id (`stanzaId`) and a snippet of what it replied to:

```
- אביץ [reply id=3EB0... →quoted=3EB0AA...]: כן מאשר ⟶ בתגובה ל: "בקשת אישור · משימה T1 ..."
```

So you can tell which message an answer is replying to. This is how approvals are matched to requests (see the HITL plugin, which automates it).

**Not real-time.** `read` pulls whatever is in the Green API incoming queue at the moment it runs. There is no push/webhook here, so the agent does not reply the instant a message arrives. Replies happen when something runs `read` — on demand, or on a **scheduled task** that periodically reads new messages and answers them. Set expectations accordingly: this is a polling model, not a live chatbot.

## Rules

- Hebrew messages: keep it natural, no markdown. Start lines with a Hebrew letter where possible (a leading digit/dash/emoji can break RTL).
- Never use an em-dash (—); use a plain hyphen.
- Sending to anyone other than the user is sensitive: show the draft and get approval first (Human-in-the-Loop).
