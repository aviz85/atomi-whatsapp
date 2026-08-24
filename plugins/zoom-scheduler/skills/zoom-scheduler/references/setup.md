# Zoom setup — current Server-to-Server OAuth flow

Use an account-owned **Server-to-Server OAuth** app. This is the simplest model for a user connecting their own Zoom account to a local Codex project: no callback URL and no browser consent flow on every use.

## Create the app

1. Sign in at `https://marketplace.zoom.us/`.
2. In the lower-left navigation choose **Developer**.
3. Open **Created apps**, choose **Develop**, then **Build an app**.
4. Choose **Server-to-Server OAuth app** and select **Create**.
5. Give it a clear name such as `Codex Zoom Scheduler`.
6. On **App Credentials**, copy Account ID, Client ID, and Client Secret into the project's `.env`. Do not paste them into chat or screenshots.
7. On **Information**, fill the short description, company name, and developer contact name/email. These are required for activation.
8. On **Feature**, leave event subscriptions off for this plugin. Webhooks are not required for creating and managing meetings.
9. On **Scopes**, choose **Add Scopes** and add only the required scopes below.
10. Open **Activation** and activate the app. Tokens cannot be generated while the app is inactive.

If **Developer** is missing, the account admin must enable View/Edit for Server-to-Server OAuth apps under **User Management → Roles → Role Settings → Advanced features**. Available admin scopes also depend on the app owner's role permissions.

## Required scopes

Core scheduling:

```text
meeting:write:meeting:admin
meeting:read:list_meetings:admin
meeting:read:meeting:admin
meeting:update:meeting:admin
meeting:delete:meeting:admin
```

Useful additions:

```text
user:read:user:admin
meeting:read:invitation:admin
meeting:write:invite_links:admin
meeting:read:list_past_participants:admin
cloud_recording:read:list_recording_files:admin
```

Only if using the account-level participant report endpoint:

```text
report:read:list_meeting_participants:admin
```

The Zoom UI may show human-readable labels rather than scope strings. Search by the API action name, such as **Create a meeting**, **List meetings**, or **Get meeting recordings**, and verify the resulting scope string before activation.

## Project `.env`

```dotenv
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_USER_ID=me
ZOOM_TIMEZONE=Asia/Jerusalem
```

`ZOOM_USER_ID` can be `me`, the host's email, or a Zoom user ID. If the S2S account rejects `me`, use the host email. Credentials stay project-local and `.env` is gitignored.

Official references:

- `https://developers.zoom.us/docs/internal-apps/create/`
- `https://developers.zoom.us/docs/internal-apps/s2s-oauth/`
- `https://developers.zoom.us/docs/integrations/oauth-scopes-granular/`
- `https://developers.zoom.us/docs/api/meetings/`
