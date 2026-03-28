---
description: After editing any live Nginx config, always sync it to the repo and include in the commit
---

# Nginx Config Sync Workflow

Whenever you edit a **live** Nginx config file, you MUST sync it to the repo before committing.

## File mappings

| Live path | Repo path |
|-----------|-----------|
| `/etc/nginx/sites-available/cloud-browser.conf` | `/root/apps/webtop/cloud-browser/nginx/cloud-browser.conf` |

## Steps

After editing any live Nginx config:

// turbo
1. Test the config: `nginx -t`
2. Reload Nginx: `nginx -s reload`
// turbo
3. Copy to repo: `cp /etc/nginx/sites-available/cloud-browser.conf /root/apps/webtop/cloud-browser/nginx/cloud-browser.conf`
// turbo
4. Stage it: `cd /root/apps/webtop && git add cloud-browser/nginx/cloud-browser.conf`
5. Include it in the same `git commit` and `git push` with your other changes

## Rules

- **NEVER** commit other changes without also syncing the Nginx config if it was edited in the same session.
- If you only edited the Nginx config (no other files), still commit and push it separately.
- Always use `nginx -t` before `nginx -s reload` to avoid breaking the running config.

