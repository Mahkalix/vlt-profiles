# VLT Profiles

VLT Profiles saves synced VALORANT settings so you can reuse them on another Riot account. The web app works with a local Windows connector.

[Open VLT Profiles](https://vlt-profiles-mahkalix.vercel.app)

## Getting started

1. Download the Windows connector from the site and extract the ZIP.
2. Install Node.js 22 or later and PowerShell 7, then run `Demarrer.cmd`.
3. The connector opens the Vercel site with a temporary pairing for that browser tab. Select **Connect my PC** and allow local network access if your browser prompts you. Later visits can reconnect automatically if the browser already has permission.
4. Sign in to the source account in Riot Client, refresh the account in VLT Profiles, and save a profile.
5. Switch to the destination account in Riot Client, close VALORANT, refresh the account in VLT Profiles, and apply the profile.

The app displays the destination account and asks for confirmation before replacing its settings. The connector backs up the current settings before each transfer or restore. A backup can only be restored to the account it came from.

## Storage and privacy

Profiles and backups are stored in `%LOCALAPPDATA%\VLTProfiles` and persist after the connector closes. Keep a copy of this folder on another drive if you want to preserve your profiles after a drive failure or Windows reinstall.

Riot stores the settings once the connector applies them. Later changes in the game leave previously saved profiles intact.

Riot tokens stay in the connector's memory. The connector listens only on `127.0.0.1` and checks the site's exact origin, the request hostname, and a random pairing token. The token travels in the URL fragment, which the browser removes from the address and stores in the tab session. Restart the connector to create a new pairing. Profile data stays on your PC.

## How it works

The static site talks directly to the Windows connector. The hosted interface opens by default. The connector also serves a fallback interface at `http://127.0.0.1:43187/launch?local=1`.

The connector uses the active Riot Client session and Riot's private preferences API. It saves the complete encoded `Ares.PlayerSettings` block, including fields it does not recognize. After applying a profile, it reads the settings back from Riot and checks that they match.

Transfers cover synced preferences in that block. Local-only and hardware-specific settings may fall outside it. Account data, progression, and items are outside the scope of the transfer. VLT Profiles is an independent project. Changes to Riot's private API could make transfers unavailable.

Transfers were tested on the creator's accounts. Compatibility across other machines and browsers remains unverified, particularly local network access from an HTTPS page.

## Development

```sh
npm install
npm test
npm run test:engine
npm run build
```

`public` contains the static frontend deployed to Vercel. `connector` contains the dependency-free Node.js server and the PowerShell code. For self-hosting, set `SITE` in `connector/server.mjs` to match your production origin exactly.

After changing the connector, rebuild its downloadable ZIP in PowerShell. Keep personal profiles, aliases, and tokens out of the archive.

```powershell
Compress-Archive -Path connector/* -DestinationPath public/downloads/vlt-connector.zip -Force
```

## Credits

The settings transfer approach was verified against the public [ValoUtils source code](https://github.com/windowsedd/ValoUtils/blob/master/src-tauri/src/riot/settings.rs). VLT Profiles has its own interface and connector.

The visual design draws inspiration from the [official VALORANT website](https://playvalorant.com/fr-fr/).

## Artwork attribution

Artwork in `public/assets/riot` comes from Riot Games' official VALORANT Public Content Catalog (release 08.09). See `provenance.json` for the original archive entries and source links. Copyright remains with Riot Games, Inc.; these assets are not public domain or CC0. Riot usage policies apply. The VLT Profiles logo remains original. The catalog does not constitute approval of this application's private API integration.

## PWA and security boundaries

The manifest provides standalone installation and original 192/512 px icons. A content-versioned service worker precaches only an explicit list of public interface files, Docs, images and self-hosted fonts. `/api`, `/launch`, authenticated requests, downloads and external origins are never intercepted or queued. Updates require a user action and the update button is disabled during profile operations. Transfers still require the Windows connector and internet access.

The deployment and local server use a restrictive CSP (no inline scripts or third-party scripts), deny framing, suppress referrers and disable unused browser permissions. The connector binds only to 127.0.0.1, verifies its exact Host/port and permitted origins, uses a random per-process pairing token with constant-time comparison, validates requests and exposes an explicit static-file allowlist. Pairing is restricted to top-level browser navigation; profile data is not published or cached by the PWA. Google Fonts are self-hosted with their OFL licenses.

Limits: profiles and backups are local JSON files, not encrypted at rest. Another process or person with access to the same Windows account can read them. A compromised PC, browser extension, GitHub/Vercel account or supply chain is outside these application-level controls. This is not an independent penetration test or a guarantee of zero vulnerabilities. The private Riot API remains unofficial.
