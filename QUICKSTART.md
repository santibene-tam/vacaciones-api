# Quick Start Guide

## Step-by-Step Setup (5 minutes)

### 1. Install Dependencies

```bash
nvm use
npm install
```

### 2. Google Cloud Setup

#### Create Service Account

1. Go to https://console.cloud.google.com/
2. Navigate to **APIs & Services** > **Credentials**
3. Click **Create Credentials** > **Service Account**
4. Name it `vacaciones-api-sheets-reader`
5. Go to **Keys** tab > **Add Key** > **Create new key** (JSON)
6. Download and save as `service-account-key.json` in project root

#### Share Google Sheet

1. Open your Google Sheet
2. Click **Share**
3. Add the service account email (from the JSON file: `client_email`)
4. Give it **Viewer** access

#### Get OAuth Client ID

1. In Google Cloud Console: **APIs & Services** > **Credentials**
2. Find your OAuth 2.0 Client ID (or create one if needed)
3. Copy the Client ID (looks like: `xxx.apps.googleusercontent.com`)

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set:

- `GOOGLE_CLIENT_ID` = Your OAuth 2.0 Client ID
- `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` = `./service-account-key.json`
- `ALLOWED_ORIGINS` = Your frontend URL(s)

### 4. Run

```bash
npm run dev
```

API will be at `http://localhost:3000`

## Test the API

### 1. Health Check (No Auth)

```bash
curl http://localhost:3000/api/health
```

### 2. Get Your Holidays (With Auth)

```bash
curl -H "Authorization: Bearer YOUR_GOOGLE_ID_TOKEN" \
     http://localhost:3000/api/holidays/me
```

### 3. Frontend Integration

```javascript
const response = await fetch('http://localhost:3000/api/holidays/me', {
  headers: {
    Authorization: `Bearer ${googleIdToken}`,
  },
});
const data = await response.json();
```

## Common Issues

**"Invalid token"**

- Check that `GOOGLE_CLIENT_ID` matches your frontend's OAuth Client ID

**"Employee data not found"**

- Verify the user's email exists in the Google Sheet

**"Permission denied" on Google Sheets**

- Make sure you shared the sheet with the service account email

**CORS errors**

- Add your frontend URL to `ALLOWED_ORIGINS` in `.env`

## API Endpoints

| Endpoint                   | Description                | Access                             |
| -------------------------- | -------------------------- | ---------------------------------- |
| `GET /api/health`          | Health check               | Public                             |
| `GET /api/holidays/me`     | Your holiday data          | All users                          |
| `GET /api/holidays/:email` | Specific employee          | Employee, their approvers, or RRHH |
| `GET /api/holidays/team`   | Your team or all (if RRHH) | Approvers, RRHH                    |

## Next Steps

1. Set up your frontend to call these endpoints
2. Add caching (Redis) for better performance
3. Add request validation
4. Add tests
5. Deploy to production

See full README.md for detailed documentation.
