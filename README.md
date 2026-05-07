# Server Update Manager

A comprehensive web-based tool for managing Ubuntu/Debian server updates and Docker Compose projects with automatic scheduling capabilities.

## Features

### Server Management
- **Automatic Updates**: Schedule periodic updates for server groups with flexible intervals
- **Manual Updates**: Trigger updates on-demand for individual servers or groups
- **Authentication**: Support for both SSH key and password authentication
- **Sudo Support**: Configurable sudo passwords for systems requiring elevated permissions
- **Reboot Management**: Automatic reboot detection and optional auto-reboot after updates
- **Update Logging**: Detailed logs showing exactly what packages were upgraded
- **Connection Testing**: Test SSH connectivity before adding servers

### Docker Management
- **Docker Compose Updates**: Automatically pull latest images and recreate containers
- **Project Organization**: Manage multiple Docker Compose projects per host
- **Group Scheduling**: Schedule automatic updates for Docker groups
- **Update Details**: View which images were pulled and containers were affected
- **Multi-Host Support**: Manage Docker hosts across your infrastructure

### Scheduling System
- **Flexible Intervals**: Schedule updates by hours, days, weeks, or months
- **Start Date Control**: Set specific date and time when automatic updates should begin
- **Timezone Support**: All times displayed in Europe/Amsterdam timezone (configurable)
- **Automatic Execution**: Updates run automatically via cron scheduler (checks every minute)
- **Manual Override**: Can trigger updates manually at any time

### Logging & History
- **Update Logs**: Complete history of all updates (manual and automatic)
- **Detailed Information**:
  - Packages upgraded for server updates
  - Images pulled and containers affected for Docker updates
  - Full command output logs for troubleshooting
- **Filterable View**: Filter logs by entity type (server/docker) and update type (manual/automatic)
- **Expandable Details**: Click "Show Details" to see complete update information
- **Pagination**: Navigate through historical logs

### User Interface
- **Modern Design**: Dark-themed UI with Tailwind CSS
- **Real-time Updates**: Live progress feedback during update operations
- **Responsive Layout**: Works on desktop, tablet, and mobile devices
- **Tab-based Navigation**: Easy access to all features
- **Modal Dialogs**: Clean forms for adding and editing resources

## Quick Start

See [INSTALL.md](INSTALL.md) for complete production installation instructions.

```bash
git clone https://github.com/FunkyMonkey412/update-manager.git
cd update-manager
docker compose build
docker compose up -d

# Access at http://your-server-ip:3000
```

## Configuration

### Authentication Methods

**Password Authentication:**
- Enter the username and password for the server
- Passwords are base64 encoded and stored
- Sudo password can be configured separately

**SSH Key Authentication:**
- Upload your private key file (.pem, .key, id_rsa, etc.)
- Keys are stored securely in the ssh-keys volume
- Unencrypted keys only (encrypted keys not supported)

### Server Groups

- Organize servers by environment, function, or location
- Perform batch updates on all servers in a group
- Configure auto-update schedules per group:
  - Set interval (e.g., 1 week, 2 days, 6 hours)
  - Set start date and time
  - Enable automatic reboot if required

### Docker Groups

- Organize Docker hosts into logical groups
- Schedule automatic updates for all projects in a group
- Configure update frequency independently from server groups

### Persistent Data

All data is stored in mounted volumes:
- `./data/` - SQLite database + encryption key
- `./ssh-keys/` - Uploaded SSH private keys
- `./logs/` - Application logs

Data survives container restarts and updates.

## Technology Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite 3
- **SSH**: node-ssh for remote command execution
- **Scheduling**: node-cron for automatic updates
- **Frontend**: Vanilla JavaScript + Tailwind CSS
- **Deployment**: Docker + Docker Compose

## API Endpoints

### Servers
- `GET /api/servers` - List all servers
- `POST /api/servers` - Add new server
- `PUT /api/servers/:id` - Update server
- `DELETE /api/servers/:id` - Delete server
- `POST /api/servers/:id/update` - Update specific server
- `POST /api/servers/:id/reboot` - Reboot specific server
- `GET /api/servers/:id/update-stream` - SSE stream for update progress

### Server Groups
- `GET /api/groups` - List all groups
- `POST /api/groups` - Create new group
- `PUT /api/groups/:id` - Update group
- `DELETE /api/groups/:id` - Delete group
- `POST /api/groups/:id/update` - Update all servers in group

### Docker Hosts
- `GET /api/docker/hosts` - List all Docker hosts
- `POST /api/docker/hosts` - Add Docker host
- `PUT /api/docker/hosts/:id` - Update Docker host
- `DELETE /api/docker/hosts/:id` - Delete Docker host
- `POST /api/docker/hosts/:id/update` - Update all projects on host

### Docker Projects
- `GET /api/docker/projects` - List all Docker projects
- `POST /api/docker/projects` - Add Docker project
- `PUT /api/docker/projects/:id` - Update Docker project
- `DELETE /api/docker/projects/:id` - Delete Docker project
- `POST /api/docker/projects/:id/update` - Update specific project

### Docker Groups
- `GET /api/docker/groups` - List all Docker groups
- `POST /api/docker/groups` - Create Docker group
- `PUT /api/docker/groups/:id` - Update Docker group
- `DELETE /api/docker/groups/:id` - Delete Docker group
- `POST /api/docker/groups/:id/update` - Update all hosts in group

### Logs
- `GET /api/logs` - Get update logs (with pagination and filters)
- `GET /api/schedule-status` - Check auto-update schedule status

## Security Notes

- **Firewall**: Restrict access to port 3000 to trusted IPs only
- **Reverse Proxy**: Use Nginx/Apache with SSL in production
- **SSH Keys**: Ensure proper permissions (chmod 600) on uploaded keys
- **Credentials**: Encrypted — encryption key stored in `./data/`
- **Backups**: Regular backups of ./data directory are essential
- **Updates**: Keep Docker and the host system updated

## Environment Variables

Configured in `docker-compose.yml`:
- `NODE_ENV=production` - Application environment
- `PORT=3000` - Server port
- `TZ=Europe/Amsterdam` - Timezone for scheduling

## Directory Structure

```
update-manager/
├── server.js              # Main application server
├── package.json           # Node.js dependencies
├── package-lock.json      # Locked dependency versions
├── Dockerfile             # Docker image configuration
├── docker-compose.yml     # Docker Compose configuration
├── .dockerignore          # Files to exclude from Docker build
├── public/                # Frontend files
│   ├── index.html        # Main UI
│   └── script.js         # Frontend JavaScript
├── data/                  # SQLite database (created at runtime)
├── ssh-keys/             # Uploaded SSH keys (created at runtime)
├── logs/                 # Application logs (created at runtime)
├── INSTALL.md            # Production installation guide
└── README.md             # This file
```

## Scheduled Updates

The auto-update scheduler runs every minute and checks if any groups are due for updates based on their configured schedule. Updates are considered due when:

1. Current time is past the configured start date
2. Enough time has elapsed since the last update (based on interval)
3. The group has auto-update configured

## Credits

Built with assistance from Claude Code AI.

## Version

1.0.0 - Production Release

## License

Proprietary - All rights reserved