# Development Guide

## Project Overview

This is a TypeScript-based REST API built with Express.js that reads employee holiday data from Google Sheets and serves it through authenticated endpoints.

## Architecture

### Layers

```
┌─────────────────────────────────────────────┐
│            Client (Frontend)                 │
│         (Google Sign-In + Fetch)             │
└─────────────────┬───────────────────────────┘
                  │ Bearer Token (Google ID)
┌─────────────────▼───────────────────────────┐
│           Express Middleware                 │
│  (CORS, JSON Parser, Pino Logger, Auth)     │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│               Routes                         │
│  (/api/health, /api/holidays/*)             │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│            Controllers                       │
│  (Request handling, Access Control)         │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│             Services                         │
│  (Business Logic, Google Sheets API)        │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│          Google Sheets API                   │
│  (Service Account Authentication)           │
└─────────────────────────────────────────────┘
```

## Key Components

### 1. Authentication (`src/middleware/auth.ts`)

- Verifies Google OAuth ID tokens from frontend
- Uses `google-auth-library` OAuth2Client
- Attaches user info to request object

### 2. Google Sheets Service (`src/services/googleSheets.service.ts`)

- Authenticates with service account
- Reads employee data from "Empleados" tab
- Provides helper methods for access control

### 3. Access Control (in controllers)

- **Employee**: Can only view own data
- **Approver**: Can view data of employees they approve (appears in Aprobador 1/2/3)
- **RRHH**: Can view all employees (has "RRHH" as Aprobador 3)

### 4. Logging (`src/utils/logger.ts`)

- Pino logger with pretty printing in dev
- Structured JSON logs in production
- Automatic request/response logging

## Code Style

- **TypeScript**: Strict mode enabled
- **Async/Await**: Used throughout (no callbacks)
- **Error Handling**: Try-catch in controllers, error middleware
- **Naming**:
  - camelCase for variables/functions
  - PascalCase for types/interfaces
  - kebab-case for file names

## Adding New Features

### Adding a New Endpoint

1. **Define types** in `src/types/index.ts`:

```typescript
export interface NewDataType {
  field1: string;
  field2: number;
}
```

2. **Create service method** in appropriate service file:

```typescript
async getNewData(): Promise<NewDataType> {
  // Implementation
}
```

3. **Create controller** in `src/controllers/`:

```typescript
export async function getNewData(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await service.getNewData();
    res.json(data);
  } catch (error) {
    logger.error({ error }, 'Error in getNewData');
    res.status(500).json({ error: 'Failed to retrieve data' });
  }
}
```

4. **Add route** in `src/routes/`:

```typescript
router.get('/newdata', authenticateToken, getNewData);
```

### Adding a New Google Sheet Tab

1. **Update config** in `src/config/index.ts`:

```typescript
googleSheetsTabName2: process.env.GOOGLE_SHEETS_TAB_NAME_2 || 'NewTab',
```

2. **Update service** to read from new tab:

```typescript
async getDataFromNewTab(): Promise<any[]> {
  const range = `${config.googleSheetsTabName2}!A2:Z`;
  // ... rest of implementation
}
```

### Adding Caching

For better performance, add caching to reduce Google Sheets API calls:

```typescript
// Simple in-memory cache
class GoogleSheetsService {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getEmployeesData(): Promise<EmployeeHoliday[]> {
    const cached = this.cache.get('employees');
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const data = await this.fetchFromSheets();
    this.cache.set('employees', { data, timestamp: Date.now() });
    return data;
  }
}
```

For production, use Redis:

```bash
npm install redis
```

## Environment Variables

| Variable                          | Required | Default                      | Description                    |
| --------------------------------- | -------- | ---------------------------- | ------------------------------ |
| `NODE_ENV`                        | No       | `development`                | Environment mode               |
| `PORT`                            | No       | `3000`                       | Server port                    |
| `GOOGLE_CLIENT_ID`                | Yes      | -                            | OAuth 2.0 Client ID            |
| `GOOGLE_SHEETS_ID`                | Yes      | -                            | Google Sheets document ID      |
| `GOOGLE_SHEETS_TAB_NAME`          | No       | `Empleados`                  | Sheet tab name                 |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Yes      | `./service-account-key.json` | Path to service account key    |
| `ALLOWED_ORIGINS`                 | No       | `http://localhost:3000`      | CORS origins (comma-separated) |
| `LOG_LEVEL`                       | No       | `info`                       | Logging level                  |

## Testing

While we haven't implemented tests yet, here's the recommended structure:

```
tests/
├── unit/
│   ├── services/
│   │   └── googleSheets.service.test.ts
│   └── middleware/
│       └── auth.test.ts
├── integration/
│   └── holidays.test.ts
└── fixtures/
    └── mockSheetData.ts
```

### Test Tools (Future)

- **Jest**: Test runner
- **Supertest**: HTTP assertions
- **Nock**: Mock HTTP requests
- **ts-jest**: TypeScript support

## Common Development Tasks

### Running the Development Server

```bash
npm run dev
```

Auto-reloads on file changes.

### Building for Production

```bash
npm run build
```

Compiles TypeScript to JavaScript in `dist/`.

### Checking for Errors

```bash
npm run lint
```

### Formatting Code

```bash
npm run format
```

### Verifying Setup

```bash
npm run verify
```

## Debugging

### VS Code Launch Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Dev Server",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/tsx",
      "args": ["watch", "src/index.ts"],
      "cwd": "${workspaceFolder}",
      "envFile": "${workspaceFolder}/.env",
      "console": "integratedTerminal"
    }
  ]
}
```

### Logging Tips

Add detailed logs in development:

```typescript
logger.debug({ userId: req.user?.email, params: req.params }, 'Request received');
```

View only errors:

```bash
LOG_LEVEL=error npm run dev
```

## Performance Optimization

### Current Performance

- Cold start: ~500ms
- Authenticated request: ~200-500ms (depends on Sheets API)
- Health check: ~10ms

### Optimization Strategies

1. **Cache Google Sheets data** (5-10 min TTL)
2. **Use connection pooling** for databases (if added)
3. **Enable compression** middleware
4. **Add rate limiting** per user
5. **Implement pagination** for large datasets

## Security Checklist

- ✅ Token verification on all protected routes
- ✅ CORS configured
- ✅ Environment variables for secrets
- ✅ Service account with read-only access
- ✅ Access control in controllers
- ✅ Error messages don't leak sensitive info
- ⚠️ TODO: Rate limiting
- ⚠️ TODO: Input validation
- ⚠️ TODO: Request size limits
- ⚠️ TODO: Helmet.js security headers

## Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (not HTTP)
- [ ] Set production `ALLOWED_ORIGINS`
- [ ] Rotate service account keys regularly
- [ ] Set up log aggregation (e.g., CloudWatch, Datadog)
- [ ] Configure health checks
- [ ] Set up monitoring/alerts
- [ ] Document production environment variables
- [ ] Test with production OAuth client ID
- [ ] Set up CI/CD pipeline

## Useful Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Format code
npm run format

# Verify setup
npm run verify

# Check TypeScript errors
npx tsc --noEmit

# View installed packages
npm list --depth=0
```

## Resources

- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [Google Auth Library](https://github.com/googleapis/google-auth-library-nodejs)
- [Pino Logger](https://getpino.io/)
- [OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)

## Getting Help

If you encounter issues:

1. Check the logs (Pino outputs detailed error info)
2. Verify setup with `npm run verify`
3. Check environment variables are correct
4. Ensure Google Cloud APIs are enabled
5. Verify service account has access to sheet
6. Check that OAuth Client ID matches frontend

## Contributing

When adding new features:

1. Follow existing code structure
2. Add appropriate types
3. Include error handling
4. Add logging for debugging
5. Update documentation
6. Test manually with curl/Postman

## Future Roadmap

- [ ] Add request validation (Zod)
- [ ] Implement caching (Redis)
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Implement rate limiting
- [ ] Add request ID tracking
- [ ] Create API documentation (OpenAPI/Swagger)
- [ ] Add database layer
- [ ] Implement webhook for Sheet updates
- [ ] Add email notifications
- [ ] Create admin dashboard
