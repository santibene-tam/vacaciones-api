# PM2 Deployment Guide

## Overview

This guide will help you deploy and manage the Vacaciones API using PM2, a production-ready process manager for Node.js applications.

## Prerequisites

- Node.js v22.13.1 installed
- PM2 installed globally
- Project built and ready to run

## Installation

### 1. Install PM2 Globally

```bash
npm install pm2 -g
```

### 2. Verify Installation

```bash
pm2 --version
```

## Configuration

The project includes an `ecosystem.config.js` file with the following settings:

- **App Name**: `vacaciones-api`
- **Script**: `./dist/index.js` (compiled TypeScript)
- **Instances**: 1 (can be changed to `'max'` for all CPU cores)
- **Execution Mode**: cluster
- **Max Memory**: 500MB restart threshold
- **Auto Restart**: Enabled
- **Log Files**: Stored in `./logs/` directory

## Deployment Steps

### Step 1: Build the Application

```bash
# Build TypeScript to JavaScript
npm run build
```

This creates the `dist/` directory with compiled code.

### Step 2: Ensure Environment Variables

Make sure your `.env` file is configured:

```bash
# Check if .env exists
ls -la .env

# If not, copy from example
cp .env.example .env

# Edit with your values
nano .env
```

Required environment variables:

- `NODE_ENV=production`
- `PORT=3000`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_SHEETS_ID`
- `GOOGLE_SHEETS_TAB_NAME`
- `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`
- `ALLOWED_ORIGINS`
- `API_KEYS`

### Step 3: Create Logs Directory

```bash
mkdir -p logs
```

### Step 4: Start with PM2

```bash
# Start the application
pm2 start ecosystem.config.js
```

## PM2 Commands

### Basic Commands

```bash
# Start the app
pm2 start ecosystem.config.js

# Stop the app
pm2 stop vacaciones-api

# Restart the app
pm2 restart vacaciones-api

# Delete the app from PM2
pm2 delete vacaciones-api

# Reload the app (zero-downtime restart)
pm2 reload vacaciones-api
```

### Monitoring Commands

```bash
# Show app status
pm2 status

# Monitor in real-time
pm2 monit

# Show app info
pm2 info vacaciones-api

# Show logs
pm2 logs vacaciones-api

# Show only error logs
pm2 logs vacaciones-api --err

# Show only output logs
pm2 logs vacaciones-api --out

# Clear all logs
pm2 flush
```

### Process Management

```bash
# List all processes
pm2 list

# Show detailed process info
pm2 describe vacaciones-api

# Scale to multiple instances
pm2 scale vacaciones-api 4

# Update PM2
pm2 update
```

## Auto-Start on Server Reboot

### Step 1: Generate Startup Script

```bash
# For systemd (Ubuntu, CentOS 7+, etc.)
pm2 startup systemd

# This will output a command to run as sudo
# Copy and execute that command
```

### Step 2: Save Process List

```bash
# Save current PM2 process list
pm2 save
```

### Step 3: Test Auto-Start

```bash
# Reboot server
sudo reboot

# After reboot, check if app is running
pm2 list
```

### Disable Auto-Start (if needed)

```bash
pm2 unstartup systemd
```

## Updating the Application

### Method 1: Zero-Downtime Reload

```bash
# Pull latest code
git pull

# Install dependencies
npm install

# Build
npm run build

# Reload app (zero downtime)
pm2 reload vacaciones-api
```

### Method 2: Restart

```bash
# Pull latest code
git pull

# Install dependencies
npm install

# Build
npm run build

# Restart app
pm2 restart vacaciones-api
```

## Log Management

### View Logs

```bash
# View all logs
pm2 logs vacaciones-api

# View last 100 lines
pm2 logs vacaciones-api --lines 100

# Stream logs
pm2 logs vacaciones-api --raw
```

### Log Rotation

Install PM2 log rotate module:

```bash
pm2 install pm2-logrotate

# Configure rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

## Monitoring with PM2 Plus (Optional)

PM2 Plus provides advanced monitoring features:

### Step 1: Create Account

Visit [https://app.pm2.io](https://app.pm2.io) and create an account.

### Step 2: Link Server

```bash
pm2 link <secret_key> <public_key>
```

### Step 3: Monitor

Access your dashboard at [https://app.pm2.io](https://app.pm2.io)

Features:

- Real-time metrics
- Custom metrics
- Exception tracking
- Issue resolution
- Transaction tracing

## Environment-Specific Configurations

### Development

```bash
pm2 start ecosystem.config.js --env development
```

### Production

```bash
pm2 start ecosystem.config.js --env production
```

### Custom Environment

Create additional env blocks in `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'vacaciones-api',
      script: './dist/index.js',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 8081,
      },
    },
  ],
};
```

Then start with:

```bash
pm2 start ecosystem.config.js --env staging
```

## Clustering for High Availability

To use all CPU cores:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'vacaciones-api',
      script: './dist/index.js',
      instances: 'max', // or specific number like 4
      exec_mode: 'cluster',
    },
  ],
};
```

## Health Checks

PM2 automatically restarts your app if:

- Memory exceeds `max_memory_restart`
- App crashes
- App is unresponsive

## Troubleshooting

### App Won't Start

```bash
# Check logs
pm2 logs vacaciones-api --err

# Check app info
pm2 info vacaciones-api

# Try starting manually
node dist/index.js
```

### High Memory Usage

```bash
# Check memory
pm2 monit

# Restart to clear memory
pm2 restart vacaciones-api
```

### App Keeps Restarting

```bash
# Check error logs
pm2 logs vacaciones-api --err --lines 50

# Check if port is already in use
lsof -i :3000

# Verify environment variables
pm2 env 0
```

### Logs Not Working

```bash
# Flush logs
pm2 flush

# Check log paths
pm2 info vacaciones-api | grep log
```

## Performance Optimization

### 1. Use Cluster Mode

```javascript
instances: 'max',
exec_mode: 'cluster',
```

### 2. Enable Memory Limit

```javascript
max_memory_restart: '500M',
```

### 3. Configure Restart Delays

```javascript
exp_backoff_restart_delay: 100,
restart_delay: 4000,
```

### 4. Monitor and Adjust

```bash
pm2 monit
```

## Production Checklist

- [ ] Build application: `npm run build`
- [ ] Configure `.env` with production values
- [ ] Set `NODE_ENV=production`
- [ ] Configure proper `ALLOWED_ORIGINS`
- [ ] Set secure `API_KEYS`
- [ ] Create logs directory: `mkdir -p logs`
- [ ] Start with PM2: `pm2 start ecosystem.config.js`
- [ ] Configure auto-start: `pm2 startup` and `pm2 save`
- [ ] Install log rotation: `pm2 install pm2-logrotate`
- [ ] Set up monitoring (optional): `pm2 link`
- [ ] Configure firewall to allow port 3000
- [ ] Set up reverse proxy (Nginx/Caddy)
- [ ] Configure SSL/TLS certificate
- [ ] Test application endpoints
- [ ] Monitor logs: `pm2 logs vacaciones-api`

## Useful Scripts

Add these to `package.json`:

```json
{
  "scripts": {
    "pm2:start": "pm2 start ecosystem.config.js",
    "pm2:stop": "pm2 stop vacaciones-api",
    "pm2:restart": "pm2 restart vacaciones-api",
    "pm2:reload": "pm2 reload vacaciones-api",
    "pm2:delete": "pm2 delete vacaciones-api",
    "pm2:logs": "pm2 logs vacaciones-api",
    "pm2:monit": "pm2 monit",
    "pm2:status": "pm2 status"
  }
}
```

Then use:

```bash
npm run pm2:start
npm run pm2:logs
```

## Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [PM2 Cluster Mode](https://pm2.keymetrics.io/docs/usage/cluster-mode/)
- [PM2 Log Management](https://pm2.keymetrics.io/docs/usage/log-management/)
- [PM2 Monitoring](https://pm2.keymetrics.io/docs/usage/monitoring/)

## Support

For issues with PM2 deployment, check:

1. PM2 logs: `pm2 logs vacaciones-api --err`
2. Application logs: `tail -f logs/pm2-error.log`
3. System logs: `journalctl -u pm2-*`
4. Port availability: `lsof -i :3000`

---

**Quick Start:**

```bash
npm run build && pm2 start ecosystem.config.js && pm2 logs
```
