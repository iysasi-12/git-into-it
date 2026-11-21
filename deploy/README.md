# Deploying to Vultr

Every PR merged into `main` deploys automatically:
GitHub Actions ([.github/workflows/deploy.yml](../.github/workflows/deploy.yml)) builds and tests the commit,
then SSHes to the server, which runs [update.sh](update.sh) for exactly that commit.
PRs get the build + tests too, but never deploy.

On the server, one Node process serves the API and the built client (`NODE_ENV=production`),
and Caddy sits in front for HTTPS. No Docker.

## One-time setup

### 1. Create the instance (Vultr dashboard)

- **Deploy New Server → Cloud Compute (Shared CPU)**, a region near Ohio (Chicago or New Jersey).
- **Image:** Ubuntu 24.04 LTS x64. **Plan:** 1 GB is enough (the setup script adds swap for the build).
- **SSH key:** add your personal key.
- Leave the Vultr Firewall off, or allow TCP 22, 80 and 443 if you turn it on.

### 2. Make a deploy key and run the setup script (from your laptop)

```bash
ssh-keygen -t ed25519 -N '' -C github-actions-deploy -f ~/.ssh/travel-planner-deploy
IP=<server-ip>
ssh root@$IP "curl -fsSL https://raw.githubusercontent.com/iysasi-12/git-into-it/main/deploy/setup.sh \
  | DEPLOY_PUBKEY='$(cat ~/.ssh/travel-planner-deploy.pub)' bash"
```

The deploy key is added to root's `authorized_keys` with `restrict,command="bash .../update.sh"`,
so even if the secret leaked it could only redeploy commits that are already on `main`.

The script ends by printing the site URL (`https://<ip-with-dashes>.sslip.io` unless you passed
`DOMAIN=...`) and the values for step 3.

### 3. Give GitHub the secrets

```bash
gh variable set DEPLOY_HOST --body "$IP"
gh variable set DEPLOY_URL  --body "https://${IP//./-}.sslip.io"
gh secret set DEPLOY_SSH_KEY < ~/.ssh/travel-planner-deploy
ssh-keyscan -t ed25519 $IP | gh secret set DEPLOY_KNOWN_HOSTS
```

Compare the `ssh-keyscan` key with the `DEPLOY_KNOWN_HOSTS` line the setup script printed.
Then delete the local private key if you like; GitHub has the only copy it needs.

Until `DEPLOY_HOST` is set, the deploy job is skipped (tests still run).

### 4. Turn on live Aivana

The app starts in mock mode. On the server:

```bash
nano /opt/travel-planner/.env        # set AIVANA_API_KEY=... and AIVANA_MOCK=false
systemctl restart travel-planner
journalctl -u travel-planner -n 5    # should say "Aivana mode: LIVE"
```

Don't set `AIVANA_TIMEOUT_MS` below the defaults (30 s / 60 s); shorter timeouts cause fallbacks.
`.env` is not in git, so deploys never touch it.

## Day to day

- **Deploy:** merge a PR. Watch it under the repo's **Actions** tab.
- **Redeploy without a code change:** Actions → *Test and deploy* → **Run workflow** on `main`.
- **Roll back:** revert the bad PR on GitHub; the revert merge deploys like any other.
- **Deploy by hand:** `ssh root@$IP bash /opt/travel-planner/deploy/update.sh [sha]`
  (use your personal key; the deploy key can't do anything but deploy).

Changes to `update.sh` itself take effect on the *next* deploy, because the old copy runs the fetch.

## Troubleshooting

| Symptom | Check |
|---|---|
| Deploy job fails at ssh | `DEPLOY_KNOWN_HOSTS` / `DEPLOY_SSH_KEY` secrets; did you rebuild the server (new host key)? |
| Deploy job fails after "Restarting" | the job log includes the last 30 lines of `journalctl -u travel-planner` |
| Site doesn't load | `systemctl status travel-planner caddy` |
| HTTPS certificate error | `journalctl -u caddy -n 50` (ports 80 and 443 must be open) |
| Every AI answer says "Rules fallback" | key or `AIVANA_MOCK` in `/opt/travel-planner/.env` |
