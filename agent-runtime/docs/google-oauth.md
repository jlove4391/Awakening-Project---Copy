# Google OAuth Local Runtime Verification

Use this checklist to connect a local Google account to the agent runtime and verify that the runtime can see the stored OAuth state. This is intended for local development only.

## Required configuration

Set these environment variables before starting `agent-runtime`:

| Variable | Required | Notes |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes | OAuth client ID from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret for the same OAuth client. |
| `GOOGLE_REDIRECT_URI` | Yes | Local callback URL registered on the OAuth client. Use `http://localhost:4317/api/auth/google/callback` unless you changed the runtime port. |
| `GOOGLE_TOKEN_STORE_KEY` or `MASTER_KEY` | Yes | Encryption key for the local token store. At least one must be set and must be 32 or more characters. |
| `GOOGLE_TOKEN_STORE_PATH` | Optional | Overrides the encrypted token file path. Defaults to `google-tokens.enc.json` under `AGENT_RUNTIME_DATA_DIR`, normally `agent-runtime/.runtime-data/google-tokens.enc.json`. |

Example local values:

```bash
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:4317/api/auth/google/callback"
GOOGLE_TOKEN_STORE_KEY="replace-with-at-least-32-characters"
# Optional:
# GOOGLE_TOKEN_STORE_PATH="/tmp/awakening-google-tokens.enc.json"
```

## Browser authorization flow

1. Start the runtime from the repository root:

   ```bash
   npm run dev:agent-runtime
   ```

2. Request the Google consent URL:

   ```bash
   curl http://localhost:4317/api/auth/google/start
   ```

3. Open the returned `url` in a browser, complete Google consent, and allow Google to redirect back to `GOOGLE_REDIRECT_URI`.

4. Confirm the callback page says the Google connection completed. The runtime stores encrypted tokens locally and returns only sanitized token metadata.

## Verify connected status

Call the status endpoint after completing the browser flow:

```bash
curl http://localhost:4317/api/auth/google/status
```

A connected local account should return a response shaped like:

```json
{
  "ok": true,
  "google": {
    "linked": true,
    "scope": "...",
    "expiry_date": 1760000000000,
    "token_type": "Bearer"
  }
}
```

If no account is connected, the response is:

```json
{
  "ok": true,
  "google": {
    "linked": false
  }
}
```

## Troubleshooting

### Token store key is missing or too short

`agent-runtime/src/providers/google/auth.ts` requires `GOOGLE_TOKEN_STORE_KEY` or `MASTER_KEY` to be at least 32 characters before tokens can be encrypted or decrypted. If the key is missing or shorter than 32 characters, requests that touch the token store can fail with:

```text
GOOGLE_TOKEN_STORE_KEY or MASTER_KEY must be at least 32 characters to store Google OAuth tokens.
```

Fix:

1. Stop the runtime.
2. Set `GOOGLE_TOKEN_STORE_KEY` or `MASTER_KEY` to a stable 32+ character value.
3. Restart the runtime.
4. Repeat the `/api/auth/google/start` browser flow.

Use the same key between restarts for the same token file. If you intentionally change the key, delete the old encrypted token file or point `GOOGLE_TOKEN_STORE_PATH` at a new file and reconnect Google.

### Google account is disconnected

Google tool calls that need an access token fail closed when no local token is available. The error is:

```text
Google account is not connected. Visit /api/auth/google/start to authorize the runtime.
```

Fix:

1. Confirm the runtime has `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and a valid token store key.
2. Open `/api/auth/google/start`, complete consent, and return through the callback.
3. Verify `curl http://localhost:4317/api/auth/google/status` reports `google.linked: true`.
4. Retry the local Google runtime check or smoke command.

If `google.linked` remains `false`, make sure `GOOGLE_TOKEN_STORE_PATH` points at the same file used during authorization and that the runtime process can write to that path.
