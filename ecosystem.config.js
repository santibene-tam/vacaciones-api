export const apps = [
  {
    name: 'vacaciones-api',
    script: './dist/index.js',
    instances: 1, // or 'max' to use all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 7001,
    },
    // Advanced features
    max_memory_restart: '500M',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    // Auto restart on file changes (disable in production)
    watch: false,
    // Exponential backoff restart delay
    exp_backoff_restart_delay: 100,
    // Maximum number of restart retries
    max_restarts: 10,
    // Minimum uptime before considering the app stable
    min_uptime: '10s',
    // Auto restart if app crashes
    autorestart: true,
    // Delay between restart
    restart_delay: 4000,
    // Environment variables file
    env_file: '.env',
  },
];
