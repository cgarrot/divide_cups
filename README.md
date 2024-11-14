# Divide Cup Discord Bot for Spectre Divide

<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" />
</p>

A Discord bot built with NestJS for managing esports tournaments and team competitions on Spectre Divide.

## Features

- **Tournament Management**
  - Create and manage tournaments
  - Automatic bracket generation
  - Match scheduling and results tracking
  - Real-time leaderboard updates

- **Team Management**
  - Create and manage teams
  - Player invitations system
  - Team statistics tracking
  - Role-based permissions

- **Match System**
  - Automated match creation
  - AI-powered match result validation and analysis
  - Score submission and verification
  - Match history tracking
  - ELO rating system

- **Server Management**
  - Automated channel creation
  - Role management
  - Region-based categories
  - Welcome system with rules

## Technology Stack

- NestJS
- Discord.js v14
- PostgreSQL with Drizzle ORM
- Redis for caching
- Docker for deployment
- OpenAI API for match result analysis
- Steam API integration

## Getting Started

### Prerequisites

- Node.js v18+
- PNPM
- PostgreSQL
- Redis
- Discord Bot Token
- OpenAI API Key
- Steam API Key

### Installation

1. Clone the repository
```bash
git clone https://github.com/cgarrot/divide_cups.git
cd divide_cups
```

2. Install dependencies
```bash
pnpm install
```

3. Create .env file with required environment variables:
```bash
env
DISCORD_TOKEN=your_discord_token
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_db_password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=divide_cup
REDIS_HOST=localhost
REDIS_PORT=6379
GUILD_ID=your_discord_server_id
OPENAI_API_KEY=your_openai_api_key
STEAM_API_KEY=your_steam_api_key
```


4. Run database migrations
```bash
pnpm migrate
```

# Docker

## Deploy database and redis

```bash
docker-compose up -d
```


## Bot Commands

### User Commands
- `!help` - Display available commands
- `!profile` - Show user profile
- `!team create "Team Name"` - Create a new team
- `!team add @Player` - Invite player to team
- `!steam url` - Link Steam profile
- `!region [NA|EU|ASIA|OCEA]` - Set region

### Admin Commands
- `!admin init` - Initialize server setup
- `!sync-users` - Synchronize users
- `!force-cleanup` - Clean up roles/channels

## Related Projects

- [Tournament Bracket Frontend](https://github.com/cgarrot/divide_cups_front) - React-based tournament bracket visualization system
