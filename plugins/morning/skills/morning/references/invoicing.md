# Invoicing reference

## Safety boundary

An invoice or receipt is a real legal document. Use only:

```bash
node "<morning-script>" invoice preview --payload ./invoice-payload.json
# inspect the rendered PDF and receive explicit approval
node "<morning-script>" invoice issue --token <token> --approved
```

Never call `POST /documents` with `curl`, an inline script, or any path outside the locked command. A preview is not approval.

The issue command checks all of the following before any write reaches Morning:

1. `--approved` is present after explicit approval.
2. The token exists in `pending/` and has never been issued or failed.
3. The state still says `pending` and names the same token.
4. The preview is not older than 30 minutes.
5. The exact payload still hashes to the payload rendered in the preview.

## Payload example

```json
{
  "type": 320,
  "description": "תיאור קצר",
  "lang": "he",
  "currency": "ILS",
  "vatType": 0,
  "signed": true,
  "client": {
    "name": "Client Ltd",
    "taxId": "123456789",
    "emails": ["billing@example.com"],
    "country": "IL",
    "add": true
  },
  "income": [{
    "description": "שירות",
    "quantity": 1,
    "price": 4000,
    "currency": "ILS",
    "vatType": 1,
    "vatRate": 0.18,
    "vatIncluded": true
  }],
  "payment": [{
    "date": "2026-08-24",
    "type": 4,
    "price": 4000,
    "currency": "ILS"
  }]
}
```

The VAT rate in the example is not a timeless default. Confirm the current rate and the business's tax status. Always verify the VAT line in the rendered PDF; the API response only describes what was requested.

Run client search first to reuse an existing client instead of creating a near-duplicate.

## Common document types

| Code | Document |
|---|---|
| 300 | חשבונית מס |
| 305 | חשבונית מס זיכוי |
| 320 | חשבונית מס קבלה |
| 400 | קבלה |

## Payment types

| Code | Method |
|---|---|
| 1 | Cash |
| 2 | Cheque |
| 3 | Credit card |
| 4 | Bank transfer |
| 5 | PayPal |

## State and audit

All files stay inside the project under the gitignored `.atomi/morning-state/`:

```text
pending/<token>.json
issued/<token>.json
failed/<token>.json
previews/invoice-preview-<token>.pdf
audit.log
```

There is no force or extend flag. If a token expires, create and inspect a new preview.
