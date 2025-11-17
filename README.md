# Vacaciones API

A Node.js + Express + TypeScript API for managing employee holiday information from Google Sheets. The API integrates with Google Sign-In for authentication and enforces role-based access control (RBAC).

## Features

- 🔐 **Google OAuth Authentication**: Validates tokens from frontend Google Sign-In
- 📊 **Google Sheets Integration**: Reads employee data directly from Google Sheets
- 🛡️ **Role-Based Access Control**:
  - Employees can view their own data
  - Approvers can view data of employees they approve
  - RRHH can view all employee data
- 📝 **Structured Logging**: Using Pino for efficient logging
- 🚀 **TypeScript**: Full type safety
- 🔄 **Scalable Architecture**: Organized for future expansion

## Prerequisites

- Node.js v22.13.1 (use `nvm` to manage Node versions)
- A Google Cloud Project with:
  - Google Sheets API enabled
  - OAuth 2.0 credentials for your frontend
  - Service Account for server-side Sheets access
- Access to the Google Sheet with employee data

## Project Structure

```
vacaciones-api/
├── src/
│   ├── config/           # Configuration management
│   │   └── index.ts
│   ├── controllers/      # Request handlers
│   │   └── holidays.controller.ts
│   ├── middleware/       # Express middleware
│   │   ├── auth.ts
│   │   └── errorHandler.ts
│   ├── routes/           # API routes
│   │   ├── index.ts
│   │   └── holidays.routes.ts
│   ├── services/         # Business logic
│   │   └── googleSheets.service.ts
│   ├── types/            # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/            # Utility functions
│   │   └── logger.ts
│   └── index.ts          # Application entry point
├── .env.example          # Environment variables template
├── .nvmrc                # Node version
├── package.json
├── tsconfig.json
└── README.md
```

## Setup Instructions

### 1. Install Node.js

```bash
# If you have nvm installed
nvm install
nvm use

# Verify Node version
node --version  # Should output v22.13.1
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Google Cloud Setup

#### A. Enable Google Sheets API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select or create a project
3. Navigate to **APIs & Services** > **Library**
4. Search for "Google Sheets API" and enable it

#### B. Create OAuth 2.0 Credentials (Frontend)

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth 2.0 Client ID**
3. Configure the consent screen if prompted
4. Select **Web application** as the application type
5. Add your frontend URL to **Authorized JavaScript origins** (e.g., `http://localhost:3000`)
6. Copy the **Client ID** - you'll need this for:
   - Your frontend Google Sign-In configuration
   - The `GOOGLE_CLIENT_ID` environment variable in this API

#### C. Create Service Account (Backend)

The API needs a service account to read from Google Sheets:

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **Service Account**
3. Fill in the details:
   - **Service account name**: `vacaciones-api-sheets-reader`
   - **Service account ID**: (auto-generated)
   - Click **Create and Continue**
4. Grant the service account a role (optional, can skip)
5. Click **Done**
6. Find your new service account in the list and click on it
7. Go to the **Keys** tab
8. Click **Add Key** > **Create new key**
9. Choose **JSON** format
10. Download the JSON file
11. Save it as `service-account-key.json` in your project root

- ⚠️ **Important**: This file is already in `.gitignore` - never commit it to version control!

#### D. Share Google Sheet with Service Account

1. Open your Google Sheet (`1Gq2KAQNmeiVHFGWSWzs1L95OxKqNhQ3AfhOwMyd0Gwk`)
2. Click the **Share** button
3. Add the service account email (found in the JSON file as `client_email`)
   - It looks like: `vacaciones-api-sheets-reader@your-project.iam.gserviceaccount.com`
4. Give it **Viewer** permissions
5. Click **Done**

### 4. Environment Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
NODE_ENV=development
PORT=3000

# Your OAuth 2.0 Client ID from step 3B
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Google Sheets configuration
GOOGLE_SHEETS_ID=1Gq2KAQNmeiVHFGWSWzs1L95OxKqNhQ3AfhOwMyd0Gwk
GOOGLE_SHEETS_TAB_NAME=Empleados

# Path to your service account JSON file from step 3C
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./service-account-key.json

# Frontend URLs (comma-separated, no spaces)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Logging level (trace, debug, info, warn, error, fatal)
LOG_LEVEL=info
```

### 5. Run the Application

#### Development Mode (with auto-reload)

```bash
npm run dev
```

#### Production Mode

```bash
# Build the TypeScript code
npm run build

# Start the server
npm start
```

The API will be available at `http://localhost:3000`

## API Endpoints

All endpoints require authentication via Bearer token (Google OAuth ID token from frontend).

### Authentication

Include the Google ID token in the Authorization header:

```
Authorization: Bearer <google_id_token>
```

### Endpoints

#### `GET /api/health`

Health check endpoint (no authentication required).

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-10-16T12:00:00.000Z"
}
```

---

#### `GET /api/holidays/me`

Get holiday information for the authenticated user.

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "email": "santiago.benedetti@theappmaster.com",
  "emailRaw": "santiago.benedetti@theappmaster.com",
  "lastName": "Benedetti",
  "firstName": "Santiago",
  "startDate": "11/05/2022",
  "carriedOverDays": 0,
  "correspondingDays": 15,
  "daysTaken": 7,
  "daysRemaining": 8,
  "approver1": "augusto.correa@theappmaster.com",
  "approver2": "sebastian.rodriguez@theappmaster.com",
  "approver3": "RRHH"
}
```

**Errors:**

- `401`: Not authenticated or invalid token
- `404`: Employee not found in sheet
- `500`: Server error

---

#### `GET /api/holidays/:email`

Get holiday information for a specific employee.

**Access Control:**

- Employees can only view their own data
- Approvers can view data for employees they approve for
- RRHH can view all employees

**Parameters:**

- `email` (path): Email of the employee to retrieve

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "email": "employee@theappmaster.com",
  "emailRaw": "employee@theappmaster.com",
  "lastName": "Doe",
  "firstName": "John",
  "startDate": "01/01/2023",
  "carriedOverDays": 2,
  "correspondingDays": 15,
  "daysTaken": 5,
  "daysRemaining": 12,
  "approver1": "manager@theappmaster.com",
  "approver2": "director@theappmaster.com",
  "approver3": "RRHH"
}
```

**Errors:**

- `401`: Not authenticated
- `403`: Not authorized to view this employee's data
- `404`: Employee not found
- `500`: Server error

---

#### `GET /api/holidays/team`

Get holiday information for all employees the authenticated user can approve.

**Access Control:**

- Approvers see only employees they approve for
- RRHH sees all employees
- Regular employees see an empty array

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
[
  {
    "email": "employee1@theappmaster.com",
    "emailRaw": "employee1@theappmaster.com",
    "lastName": "Doe",
    "firstName": "John",
    "startDate": "01/01/2023",
    "carriedOverDays": 2,
    "correspondingDays": 15,
    "daysTaken": 5,
    "daysRemaining": 12,
    "approver1": "manager@theappmaster.com",
    "approver2": "director@theappmaster.com",
    "approver3": "RRHH"
  },
  {
    "email": "employee2@theappmaster.com",
    ...
  }
]
```

**Errors:**

- `401`: Not authenticated
- `500`: Server error

## Frontend Integration Example

Here's how to call the API from your frontend after Google Sign-In:

```javascript
// After successful Google Sign-In
const googleUser = await googleSignIn();
const idToken = googleUser.credential; // or getAuthResponse().id_token

// Call the API
const response = await fetch('http://localhost:3000/api/holidays/me', {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  },
});

const holidayData = await response.json();
console.log(holidayData);
```

## Google Sheets Structure

### "Empleados" Tab

The API expects the following column structure in the "Empleados" tab:

| Column | Field Name                                 | Type   | Description                                 |
| ------ | ------------------------------------------ | ------ | ------------------------------------------- |
| A      | Email                                      | string | Employee email                              |
| B      | Email raw                                  | string | Raw email (usually same as Email)           |
| C      | Apellido                                   | string | Last name                                   |
| D      | Nombre                                     | string | First name                                  |
| E      | Fecha Ingreso                              | string | Start date                                  |
| F      | Dias arrastrados año anterior              | number | Carried over days from previous year        |
| G      | Días Correspondientes                      | number | Days allocated for current period           |
| H      | Días Tomados                               | number | Days already taken in current period        |
| I      | Días Restantes                             | number | Days remaining in current period            |
| J      | Días Correspondientes Siguiente Período    | number | Days allocated for next period              |
| K      | Días Tomados Siguiente Período             | number | Days already taken in next period           |
| L      | Días Restantes Siguiente Período           | number | Days remaining in next period               |
| M      | Aprobador 1                                | string | First approver email                        |
| N      | Aprobador 2                                | string | Second approver email                       |
| O      | Aprobador 3                                | string | Third approver (or "RRHH")                  |

**Note**: The first row should contain headers and will be skipped by the API.

### Holiday Periods

The system operates on **October to September** holiday periods:
- **Current Period**: October 1 - September 30
- **Next Period**: October 1 (next year) - September 30 (year after)

When creating holiday requests:
- Days are automatically split across periods if the request spans multiple periods
- The system validates available days in each period separately
- Updates to days taken are applied to the correct period columns

## Role-Based Access Control (RBAC)

### Employee Role

- Can only view their own holiday data via `/api/holidays/me` or `/api/holidays/:email` (with their own email)

### Approver Role

- Can view their own data
- Can view data for employees where they appear in the `Aprobador 1`, `Aprobador 2`, or `Aprobador 3` columns
- Can use `/api/holidays/team` to get all employees they approve

### RRHH Role

- Identified by having `"RRHH"` in the `Aprobador 3` column of their employee record
- Can view all employees in the system
- `/api/holidays/team` returns all employees

## Logging

The API uses [Pino](https://getpino.io/) for fast, structured logging.

In development mode, logs are pretty-printed to the console.
In production mode, logs are output as JSON for easy parsing by log aggregation tools.

**Log Levels**: trace, debug, info, warn, error, fatal

Configure via the `LOG_LEVEL` environment variable.

## Security Best Practices

1. ✅ **Never commit** `service-account-key.json` or `.env` files
2. ✅ **Use HTTPS** in production (not HTTP)
3. ✅ **Rotate service account keys** periodically
4. ✅ **Limit CORS origins** to only your frontend domains
5. ✅ **Set NODE_ENV=production** in production environments
6. ✅ **Use environment-specific** `.env` files
7. ✅ **Monitor logs** for unauthorized access attempts

## Troubleshooting

### "Cannot find module" errors after running `npm run dev`

Run `npm install` to ensure all dependencies are installed.

### "Invalid token" errors

- Verify that `GOOGLE_CLIENT_ID` matches the OAuth 2.0 Client ID used in your frontend
- Ensure the token being sent is a valid Google ID token (not an access token)
- Check that the token hasn't expired (tokens typically last 1 hour)

### "Employee data not found"

- Verify the user's email exists in the Google Sheet
- Check that the sheet ID and tab name are correct in `.env`
- Ensure the service account has access to the sheet

### "Permission denied" errors when accessing Google Sheets

- Confirm the service account email has been shared with the Google Sheet
- Verify the service account has at least "Viewer" permissions
- Check that `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` points to the correct JSON file

### CORS errors from frontend

- Add your frontend URL to `ALLOWED_ORIGINS` in `.env`
- Ensure there are no spaces in the comma-separated list
- Include the protocol (`http://` or `https://`)

## Scaling Considerations

This API is designed with scalability in mind:

### Current Features

- ✅ Modular architecture (controllers, services, middleware)
- ✅ TypeScript for type safety
- ✅ Structured logging
- ✅ Environment-based configuration
- ✅ Error handling middleware

### Future Enhancements

- **Caching**: Add Redis to cache Google Sheets data (reduce API calls)
- **Database**: Migrate to PostgreSQL/MongoDB for better performance at scale
- **Rate Limiting**: Add rate limiting middleware to prevent abuse
- **Request Validation**: Add validation middleware (e.g., Zod, Joi)
- **Testing**: Add unit and integration tests (Jest, Supertest)
- **API Versioning**: Implement `/api/v1/` prefix for backward compatibility
- **Webhooks**: Subscribe to Google Sheets changes for real-time updates
- **Pagination**: Add pagination for large team/employee lists
- **Monitoring**: Integrate with APM tools (DataDog, New Relic)
- **Docker**: Containerize the application
- **CI/CD**: Set up automated testing and deployment pipelines

## Deployment

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3000
GOOGLE_CLIENT_ID=<your-prod-client-id>
GOOGLE_SHEETS_ID=1Gq2KAQNmeiVHFGWSWzs1L95OxKqNhQ3AfhOwMyd0Gwk
GOOGLE_SHEETS_TAB_NAME=Empleados
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/app/service-account-key.json
ALLOWED_ORIGINS=https://your-frontend-domain.com
LOG_LEVEL=info
```

### Deployment Platforms

This API can be deployed to:

- **Vercel**: Serverless deployment
- **Railway**: Easy container deployment
- **Render**: Automatic deployments from Git
- **Google Cloud Run**: Serverless containers
- **AWS ECS/EKS**: For larger scale deployments
- **DigitalOcean App Platform**: Simple container hosting

### Build and Deploy

```bash
# Build the application
npm run build

# The built files will be in the `dist/` directory
# Deploy the dist/ folder along with:
# - package.json
# - node_modules/ (or run npm install --production on server)
# - service-account-key.json (securely!)
# - .env (with production values)
```

## License

ISC

## Support

For issues or questions, please contact the development team or open an issue in the repository.
