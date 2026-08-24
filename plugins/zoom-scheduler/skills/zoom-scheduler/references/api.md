# Zoom REST API reference

## Authentication

The script requests a short-lived account token and keeps it in memory only:

```http
POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id=...
Authorization: Basic base64(client_id:client_secret)
```

Tokens normally expire in about one hour. The script obtains a fresh token after HTTP 401 and never writes a token to disk.

## Endpoints used

| Operation | Method and endpoint | Granular admin scope |
|---|---|---|
| Connection check / list meetings | `GET /users/{userId}/meetings` | `meeting:read:list_meetings:admin` |
| Create meeting | `POST /users/{userId}/meetings` | `meeting:write:meeting:admin` |
| Get meeting | `GET /meetings/{meetingId}` | `meeting:read:meeting:admin` |
| Update meeting | `PATCH /meetings/{meetingId}` | `meeting:update:meeting:admin` |
| Delete meeting | `DELETE /meetings/{meetingId}` | `meeting:delete:meeting:admin` |
| Invitation text | `GET /meetings/{meetingId}/invitation` | `meeting:read:invitation:admin` |
| Past participants | `GET /past_meetings/{meetingId}/participants` | `meeting:read:list_past_participants:admin` |
| Recording files | `GET /meetings/{meetingId}/recordings` | `cloud_recording:read:list_recording_files:admin` |

API base: `https://api.zoom.us/v2`.

## Limits and important behavior

- Zoom applies a limit of 100 create-meeting requests per day per host.
- `start_url` is privileged and short-lived. The plugin removes it from output.
- Cloud recordings require an eligible paid plan and cloud recording enabled.
- Past-participant/report availability depends on plan, role, meeting state, and scopes.
- `meeting_invitees` records invitee metadata but does not replace a Google Calendar guest invitation.
- `calendar_type: 2` identifies the Zoom for Google Workspace add-on path; it is not proof that a Calendar event was created by this REST request.
- Some past-meeting and recording endpoints require a meeting UUID rather than the numeric meeting ID. Double-encode a UUID that begins with `/` or contains `//`; the script handles URL encoding of the provided identifier.
