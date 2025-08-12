# Cookies from Browser (Firefox sidecar) and Operator Flow

This setup lets AudioDeck use your Firefox login session to access YouTube via `yt-dlp --cookies-from-browser`, improving reliability. It's optional and controlled via Docker Compose profiles.

## Quick Start

1. Ensure `.env` has:
```
AUDIODECK_PORT=4000
USE_BROWSER_COOKIES=true
BROWSER_PROFILE_MOUNT_PATH=/browser_profile
FIREFOX_NOVNC_PORT=6901
PUID=1000
PGID=1000
TZ=UTC
COMPOSE_PROFILES=firefox
```

2. Start services:
```
docker compose up -d
```

3. Visit the Firefox sidecar (noVNC):
```
http://<server>:${FIREFOX_NOVNC_PORT}
```
Log in to YouTube with a throwaway Google account (2FA OK). The Firefox profile is persisted in the shared named volume `browser_profile`.

4. AudioDeck will automatically attempt cookies-from-browser for YouTube requests and fallback automatically if cookies are unavailable or cause auth/rate-limit errors.

## Disabling the sidecar

To disable the Firefox sidecar, clear the compose profiles:
```
COMPOSE_PROFILES=
```
Then redeploy:
```
docker compose up -d
```

AudioDeck continues to function. YouTube requests will use anonymous mode and may fail more often. The app will surface a clear error when YouTube is unavailable.

## Notes

- The AudioDeck container mounts the `browser_profile` volume at `${BROWSER_PROFILE_MOUNT_PATH}` (read-only). It discovers the default Firefox profile via `profiles.ini`.
- File permissions: Both containers use `PUID` and `PGID` (default 1000:1000). Adjust if your environment requires different IDs.
- Health log: If `USE_BROWSER_COOKIES=true` but no profile is detected, the backend logs a warning and falls back automatically.
- Only YouTube uses cookies-from-browser. Other sites (TikTok, Twitch, etc.) continue unaffected.


