# Chrome Kiosk on Webtop

A hardened, single-application kiosk environment running Google Chrome on KDE Plasma, accessible via browser using Selkies streaming.

## Quick Start

```bash
docker compose build --no-cache
docker compose up -d
```

Access at: `http://<server-ip>:3070`

## Features

- **Streaming:** Selkies (WebRTC/H264) - Low latency, 50fps
- **Browser:** Google Chrome in true kiosk mode
- **Security:** Locked desktop, no panels, no escape keys

## Configuration

| File | Purpose |
|------|---------|
| `Dockerfile` | Image build - Chrome installation, KDE panel removal |
| `docker-compose.yml` | Container config - Selkies settings, resources |
| `policies.json` | Chrome policies - Homepage, extensions, security |
| `01-kiosk-setup.sh` | Runtime config - KWin rules, autostart |
| `run-chrome.sh` | Chrome wrapper - Auto-restart on crash |

## Customization

### Change Startup URL

Add to `docker-compose.yml` environment:
```yaml
- CHROME_STARTUP_URL=https://your-app.com
```

### Resource Limits

Adjust in `docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      cpus: '4.0'
      memory: 8G
```

## Security Notes

- Container runs with `seccomp:unconfined` (required for Chrome)
- GPU access via `/dev/dri` for hardware acceleration
- User processes run as non-root (uid 1000)
