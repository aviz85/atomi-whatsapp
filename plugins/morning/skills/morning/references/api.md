# Morning API reference

## Authentication

The supported flow is OAuth2 `client_credentials`:

```http
POST https://api.morning.co/idp/v1/oauth/token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "<MORNING_API_KEY>",
  "client_secret": "<MORNING_API_SECRET>"
}
```

The response contains `accessToken` and usually `expiresAt`. The plugin keeps the bearer token in memory only, refreshes shortly before expiry, and refreshes once after HTTP 401.

Resource requests use:

```text
https://api.greeninvoice.co.il/api/v1
Authorization: Bearer <accessToken>
```

Do not use the legacy `/account/token` flow.

## Endpoints used by the plugin

| Endpoint | Method | Purpose |
|---|---|---|
| `/businesses/me` | GET | Read-only connection check |
| `/clients/search` | POST | Search clients |
| `/documents/search` | POST | Documents and income reports |
| `/expenses/search` | POST | Expense reports |
| `/payments/links/search` | POST | Search payment links |
| `/payments/links/{id}` | GET / PUT | Read or update a link |
| `/payments/links` | POST | Create a payment link |
| `/documents/preview` | POST | Render PDF without issuing |
| `/documents` | POST | Issue a legal document; locked behind the plugin's approval flow |

Morning search pages are 1-based. Document and expense searches use a maximum page size of 25 in this plugin.

## Errors

| Status | Meaning | Action |
|---|---|---|
| 401 | Token rejected | Refresh once, retry once |
| 403 | Key lacks permission | Check API-key permissions |
| 429 | Rate limited | Back off and retry later |
| 5xx | Morning service error | Retry later; do not bypass invoice gates |
