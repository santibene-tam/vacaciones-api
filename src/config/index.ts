import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

interface Config {
  nodeEnv: string;
  port: number;
  // Slack incoming webhook URL for notifications
  slackWebhookUrl: string;
  // Optional Slack bot token for sending DMs via Slack Web API
  slackBotToken: string;
  // Frontend URL for linking to vacaciones website
  frontendUrl: string;
  googleClientId: string;
  googleSheetsId: string;
  googleSheetsTabName: string;
  googleRequestsTabName: string;
  googleServiceAccountKeyPath: string;
  allowedOrigins: string[];
  logLevel: string;
  // API keys for AI agents (comma-separated)
  apiKeys: string[];
}

const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
  slackBotToken: process.env.SLACK_BOT_TOKEN || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleSheetsId: process.env.GOOGLE_SHEETS_ID || '',
  googleSheetsTabName: process.env.GOOGLE_SHEETS_TAB_NAME || 'Empleados',
  googleRequestsTabName: process.env.GOOGLE_REQUESTS_TAB_NAME || 'Solicitudes',
  googleServiceAccountKeyPath:
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ||
    path.join(__dirname, '../../service-account-key.json'),
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000'],
  logLevel: process.env.LOG_LEVEL || 'info',
  apiKeys: process.env.API_KEYS ? process.env.API_KEYS.split(',').map((key) => key.trim()) : [],
};

export default config;
