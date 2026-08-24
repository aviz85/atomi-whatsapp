---
name: zoom-scheduler
description: Create, list, inspect, update, and delete Zoom meetings with Server-to-Server OAuth. Use for scheduling calls, generating Zoom links, inviting guests through Google Calendar, sending links through WhatsApp, retrieving participants or recordings, and Hebrew requests such as פגישת זום, ניפגש מחר, תזמן פגישה, זימון ליומן, or שלח קישור לזום.
allowed-tools: Bash, Read
---

# Zoom Scheduler

Use Zoom's REST API from the current project. Node.js 18+ only; there are no packages to install and no MCP server.

This skill complements Zoom's official Codex connector. Use the official connector for searching meeting content, summaries, transcripts, and recordings when available. Use this skill for creating and managing meetings through the user's own Zoom account.

## Credentials — same rule as WhatsApp

Credentials live in **`.env` at the root of the current project**. Never ask the user to paste a credential into chat. Never store a Zoom access token on disk.

```dotenv
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_USER_ID=me
ZOOM_TIMEZONE=Asia/Jerusalem
```

Start every first use with:

```bash
node scripts/zoom.mjs check
```

- Exit `0`: credentials passed a live, read-only OAuth/API check.
- Exit `2`: `.env` was created or extended and opened. Ask the user to fill it, save, and say `סיימתי`; then run `check` again.
- The script adds `.env` and `.atomi/` to `.gitignore`.

Read [references/setup.md](references/setup.md) before guiding a first-time Zoom setup. Scopes must match the actions requested.

## Read operations

```bash
node scripts/zoom.mjs me
node scripts/zoom.mjs meetings list --type upcoming
node scripts/zoom.mjs meetings get <meeting_id>
node scripts/zoom.mjs participants <meeting_id>
node scripts/zoom.mjs recordings <meeting_id>
node scripts/zoom.mjs invitation <meeting_id>
```

## Controlled write operations

Before creating, changing, deleting, or sending anything, show a compact plan containing:

- contact name and the exact email/WhatsApp destination;
- explicit calendar date, local time, timezone, and duration;
- meeting title;
- which external actions will occur: Zoom, Google Calendar/email, WhatsApp.

Resolve relative time from the current date. If a date, timezone, email, or recipient is ambiguous, ask. Check Google Calendar for a conflict and for an existing event with the same person before creating a duplicate. Then wait for explicit approval.

Create a preview without touching Zoom:

```bash
node scripts/zoom.mjs meetings create --topic "פגישה עם דנה" --start "2026-08-25T10:00:00" --duration 60 --timezone "Asia/Jerusalem" --invitee "dana@example.com" --dry-run
```

After approval, run the same command with `--approved` instead of `--dry-run`:

```bash
node scripts/zoom.mjs meetings create --topic "פגישה עם דנה" --start "2026-08-25T10:00:00" --duration 60 --timezone "Asia/Jerusalem" --invitee "dana@example.com" --approved
```

The output is sanitized: it returns `join_url` but never prints or saves Zoom's privileged `start_url`.

Update and delete also require approval:

```bash
node scripts/zoom.mjs meetings update <meeting_id> --topic "כותרת חדשה" --start "2026-08-25T11:00:00" --timezone "Asia/Jerusalem" --approved
node scripts/zoom.mjs meetings delete <meeting_id> --approved
```

## Complete Zoom → Calendar → WhatsApp workflow

For a request such as “ניפגש מחר ב-10”:

1. Resolve the person to one contact. If there are multiple matches, ask which one. Obtain both email and WhatsApp number if invitations are requested.
2. Resolve “tomorrow” to an explicit date in the user's timezone and confirm duration if unknown.
3. Check Google Calendar for conflicts and duplicates.
4. Show the full plan and wait for approval.
5. Create the Zoom meeting with the approved details.
6. Create a Google Calendar event using the installed official `google-calendar@openai-curated` connector. Add the guest email, the `join_url` as location and in the description, and the same start/end/timezone. The Google Calendar event—not Zoom's `calendar_type` field—is the reliable source of the email invitation. If the connector is missing, explain that it comes from the already-configured built-in OpenAI marketplace and can be installed with `codex plugin add google-calendar@openai-curated`; do not add another marketplace.
7. If Google Calendar is unavailable, generate an `.ics` file inside the project. Explain that creating an ICS file does not email it automatically:

```bash
node scripts/zoom.mjs ics --topic "פגישה עם דנה" --start "2026-08-25T10:00:00" --duration 60 --timezone "Asia/Jerusalem" --url "https://zoom.us/j/..." --attendee "dana@example.com" --out "./meeting.ics"
```

8. Use `$whatsapp` to show the exact message and destination, obtain/send under the WhatsApp skill's approval rules, and include the Zoom join link.
9. Report each result separately: Zoom created, calendar invite sent (or ICS only), WhatsApp sent. Never claim all three succeeded when one failed.

Do not assume that adding `meeting_invitees` or `calendar_type: 2` to a Zoom API payload creates a Google Calendar event or sends a Google invitation.

## Safety

- `--approved` is a mechanical gate, not a substitute for approval in the current conversation.
- Never send a calendar invite or WhatsApp message to a guessed contact.
- Never expose `ZOOM_CLIENT_SECRET`, an access token, or `start_url`.
- Never create duplicates silently. Search first when the person/time is known.
- Never delete a meeting without explicit approval naming the meeting.
- Do not download recordings unless the user explicitly asks; retrieval can expose sensitive meeting content.

Read [references/api.md](references/api.md) for endpoints, required scopes, and account limitations.
