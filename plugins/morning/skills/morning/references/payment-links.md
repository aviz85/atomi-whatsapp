# Payment links reference

Payment links are separate from invoices. Creating or editing one changes Morning, but it does not send anything to a customer and does not issue an accounting document. Show the intended values before changing a link.

## Status codes

| Code | Meaning |
|---|---|
| 10 | Active |
| 20 | Inactive |

Morning does not support deleting a payment link through this flow. Deactivate it instead so transaction history remains intact.

## First-link requirement

Creating a link requires the account's `plugins` terminal array. Morning exposes it inside existing links rather than through a dedicated terminal-list endpoint. The plugin therefore reads one active link and reuses its terminal configuration.

For a brand-new account, create one payment link manually in Morning first. Then verify discovery:

```bash
node scripts/morning.mjs links terminal
```

## Commands

```bash
node scripts/morning.mjs links search --status 10
node scripts/morning.mjs links search --query "סדנה"
node scripts/morning.mjs links create 500 "קורס מלא" --max-payments 3
node scripts/morning.mjs links update <link_id> --price 550
node scripts/morning.mjs links deactivate <link_id>
node scripts/morning.mjs links duplicate <link_id> --price 600 --description "מחזור חדש"
```

Changing a live link affects future payers only. Existing transaction history remains in Morning.
