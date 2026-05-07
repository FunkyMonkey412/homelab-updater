# Installation

## Requirements

- Docker Engine 20.10+
- Docker Compose V2

## Install

```bash
git clone https://github.com/FunkyMonkey412/update-manager.git
cd update-manager
docker compose build
docker compose up -d
```

Open `http://your-server-ip:3000` in your browser.

## Configuration

Edit `docker-compose.yml` before starting if you need to change the port or timezone:

```yaml
ports:
  - "3000:3000"       # change left number to use a different port
environment:
  - TZ=Europe/Amsterdam
```

## Data

All persistent data is in bind-mounted directories next to docker-compose.yml:

| Directory | Contents |
|-----------|----------|
| `./data/` | SQLite database + encryption key |
| `./ssh-keys/` | Uploaded SSH private keys |
| `./logs/` | Application logs |

Back these up before updating.

## Update

```bash
git pull
docker compose build
docker compose up -d
```

## Useful commands

```bash
docker compose logs -f       # live logs
docker compose ps            # container status
docker compose restart       # restart
docker compose down          # stop and remove container
```
