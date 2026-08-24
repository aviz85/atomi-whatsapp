---
name: morning
description: Connect to Morning (Green Invoice) with OAuth2 API key and secret. Use for clients, documents, income or expense reports, payment links, invoice previews, invoices, receipts, and Hebrew requests such as חשבונית, קבלה, לקוח במורנינג, דוח הכנסות, or לינק לתשלום.
allowed-tools: Bash, Read
---

# Morning — Green Invoice

Use the Morning API from the current project. Node.js 18+ only; there are no packages to install and no MCP server.

Run the bundled helper directly from this skill. Its exact location is `scripts/morning.mjs` inside the same directory as this `SKILL.md`. For example, if this file is `/A/skills/morning/SKILL.md`, run `/A/skills/morning/scripts/morning.mjs` — never `/A/scripts/morning.mjs`. Invoke the resolved absolute path while keeping the project root as the working directory, and do not copy the helper into the project. In the examples below, replace `<morning-script>` with that exact path.

## Credentials — same rule as WhatsApp

Credentials live in **`.env` at the root of the current project**. This plugin never asks for secrets in chat and never writes credentials into the plugin cache or the home directory.

Required:

```dotenv
MORNING_API_KEY=
MORNING_API_SECRET=
```

Get both values from Morning → Settings → Developer Tools → API Keys. The script exchanges them through OAuth2 `client_credentials`; the short-lived bearer token stays only in memory and is never written to disk.

Always begin with:

```bash
node "<morning-script>" check
```

- Exit `0` means the keys passed a live, read-only OAuth check.
- Exit `2` means `.env` was created or extended and opened for the user. Never ask the user to paste a key into chat. Ask them to save the file and say “סיימתי”, then run `check` again.
- The script adds `.env` and `.atomi/` to `.gitignore`.

### Setup completion handshake

When the user says `סיימתי` after filling the file, immediately run `node "<morning-script>" check` again. The command rereads `.env`; do not repeat setup and do not ask for the credentials in chat.

Only announce that Morning is connected and continue to Morning work when the fresh result contains both `ready: true` and `configuration_updated: true`. A successful check updates the secret-free project state at `.atomi/connections/morning.json`, so a later chat can inspect it with `node "<morning-script>" status`. If the live check fails, report the error and keep the connection unready.

## Safe read commands

```bash
node "<morning-script>" me
node "<morning-script>" clients search --query "שם לקוח"
node "<morning-script>" income --from 2026-08-01 --to 2026-08-31
node "<morning-script>" expenses --from 2026-08-01 --to 2026-08-31
node "<morning-script>" links search --status 10
node "<morning-script>" links get <link_id>
node "<morning-script>" links terminal
```

Read [references/api.md](references/api.md) for endpoints and current auth details.

## Payment links

Payment links can be created, updated, deactivated, and duplicated. These calls change Morning, so show the intended values before running them. They do not send anything to a customer or issue an accounting document.

```bash
node "<morning-script>" links create 500 "קורס מלא" --max-payments 3
node "<morning-script>" links update <link_id> --price 550 --description "קורס מלא"
node "<morning-script>" links deactivate <link_id>
node "<morning-script>" links duplicate <link_id> --price 600 --description "מחזור חדש"
```

Read [references/payment-links.md](references/payment-links.md) before creating the first link.

## Invoices — locked preview → approval → issue

Issuing an invoice or receipt creates a real legal document. Never call Morning's `/documents` endpoint directly and never bypass this flow.

1. Build the payload in a JSON file inside the project. Read [references/invoicing.md](references/invoicing.md) first.
2. Preview it:

```bash
node "<morning-script>" invoice preview --payload ./invoice-payload.json
```

3. Open and inspect the rendered PDF. Verify total, VAT, payment method, client name and tax ID, line descriptions, and date. Show it to the account owner and wait for explicit approval.
4. Only after explicit approval in the current conversation:

```bash
node "<morning-script>" invoice issue --token <token> --approved
```

The token is one-time, tied to the exact previewed payload hash, and expires after 30 minutes. Pending, issued, failed, preview, and append-only audit files live under the gitignored project path `.atomi/morning-state/`, so plugin updates cannot erase them and sandboxed sessions do not need home-directory access.

Never treat “preview created” as approval. Never issue automatically.
