# API Key Authentication for AI Agents

## Overview

The API now supports two authentication methods:

1. **JWT Authentication** (for human users via Google Sign-In)
2. **API Key Authentication** (for AI agents and automated systems)

## Setting Up API Keys

### 1. Generate Secure API Keys

For production, generate cryptographically secure random keys:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32

# Using Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 2. Add Keys to Environment

Add your API keys to `.env`:

```bash
# Add one or multiple API keys (comma-separated)
API_KEYS=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz,another-key-here
```

⚠️ **Security Notes:**

- Never commit API keys to version control
- Use different keys for different environments (dev, staging, production)
- Rotate keys periodically
- Keep keys secret and share them securely

## Using API Keys

### Method 1: x-api-key Header (Recommended)

```bash
curl -X GET http://localhost:3000/api/holidays/me \
  -H "x-api-key: your-secret-api-key"
```

### Method 2: Authorization Bearer Header

```bash
curl -X GET http://localhost:3000/api/holidays/me \
  -H "Authorization: Bearer your-secret-api-key"
```

**Note:** The system automatically detects if the Bearer token is an API key (no dots) or a JWT (contains dots).

## Differences Between JWT and API Key Authentication

| Feature           | JWT Authentication              | API Key Authentication           |
| ----------------- | ------------------------------- | -------------------------------- |
| **User Identity** | Specific user email from Google | Generic "ai-agent@system"        |
| **Expires**       | Yes (typically 1 hour)          | No expiration                    |
| **Use Case**      | Human users                     | AI agents, scripts, integrations |
| **Permissions**   | Based on employee record        | Full access (RRHH equivalent)    |
| **Rotation**      | Automatic (Google handles)      | Manual (you manage keys)         |

## API Key User Context

When authenticated with an API key, the request will have:

```typescript
req.user = {
  email: 'ai-agent@system',
  name: 'AI Agent',
  sub: 'api-key',
  isApiKey: true,
};
```

## Access Control with API Keys

### Default Behavior

By default, API keys have **RRHH-level access** (can view all employees and requests).

### Checking Authentication Type

In your code, you can check if a request is from an API key:

```typescript
if (req.user?.isApiKey) {
  // This is an AI agent
  // Apply specific logic if needed
}
```

## Creating API-Key-Only Endpoints

If you want certain endpoints to ONLY accept API keys (not JWT):

```typescript
import { authenticateApiKeyOnly } from '../middleware/auth';

// This endpoint only accepts API keys
router.get('/admin/bulk-import', authenticateApiKeyOnly, async (req, res) => {
  // Only AI agents can access this
});
```

## Example Usage with AI Agents

### Example 1: Get Employee Data

```bash
curl -X GET http://localhost:3000/api/holidays/team \
  -H "x-api-key: your-secret-api-key" \
  -H "Content-Type: application/json"
```

### Example 2: Create Holiday Request

```bash
curl -X POST http://localhost:3000/api/requests \
  -H "x-api-key: your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeEmail": "employee@theappmaster.com",
    "startDate": "20/11/2025",
    "endDate": "22/11/2025"
  }'
```

### Example 3: Approve Request

```bash
curl -X PUT http://localhost:3000/api/requests/REQ-123456-789/approve \
  -H "x-api-key: your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "approverEmail": "manager@theappmaster.com",
    "action": "APPROVE"
  }'
```

## Python Example

```python
import requests

API_KEY = "your-secret-api-key"
BASE_URL = "http://localhost:3000/api"

headers = {
    "x-api-key": API_KEY,
    "Content-Type": "application/json"
}

# Get all employees
response = requests.get(f"{BASE_URL}/holidays/team", headers=headers)
employees = response.json()

print(f"Found {len(employees)} employees")

# Create a holiday request
request_data = {
    "employeeEmail": "employee@theappmaster.com",
    "startDate": "20/11/2025",
    "endDate": "22/11/2025"
}

response = requests.post(f"{BASE_URL}/requests", json=request_data, headers=headers)
new_request = response.json()

print(f"Created request: {new_request['id']}")
```

## JavaScript/Node.js Example

```javascript
const axios = require('axios');

const API_KEY = 'your-secret-api-key';
const BASE_URL = 'http://localhost:3000/api';

const headers = {
  'x-api-key': API_KEY,
  'Content-Type': 'application/json',
};

// Get all employees
async function getEmployees() {
  const response = await axios.get(`${BASE_URL}/holidays/team`, { headers });
  return response.data;
}

// Create holiday request
async function createRequest(employeeEmail, startDate, endDate) {
  const response = await axios.post(
    `${BASE_URL}/requests`,
    {
      employeeEmail,
      startDate,
      endDate,
    },
    { headers }
  );
  return response.data;
}

// Usage
getEmployees().then((employees) => {
  console.log(`Found ${employees.length} employees`);
});

createRequest('employee@theappmaster.com', '20/11/2025', '22/11/2025')
  .then((request) => console.log(`Created request: ${request.id}`))
  .catch((error) => console.error('Error:', error.response?.data));
```

## Security Best Practices

### 1. Rate Limiting

Consider adding rate limiting for API key endpoints:

```typescript
import rateLimit from 'express-rate-limit';

const apiKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each API key to 100 requests per windowMs
  message: 'Too many requests from this API key',
});

router.use('/api', apiKeyLimiter);
```

### 2. IP Whitelisting

Restrict API keys to specific IP addresses:

```typescript
const ALLOWED_IPS = ['192.168.1.100', '10.0.0.50'];

function checkIPWhitelist(req: Request, res: Response, next: NextFunction) {
  if (req.user?.isApiKey) {
    const clientIP = req.ip || req.socket.remoteAddress;
    if (!ALLOWED_IPS.includes(clientIP)) {
      return res.status(403).json({ error: 'IP not whitelisted' });
    }
  }
  next();
}
```

### 3. Audit Logging

Log all API key usage:

```typescript
logger.info(
  {
    type: 'api-key-usage',
    endpoint: req.path,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  },
  'API key request'
);
```

### 4. Key Rotation

Regularly rotate your API keys:

1. Generate a new key
2. Add it to `API_KEYS` alongside the old one
3. Update all AI agents to use the new key
4. After confirming all agents are updated, remove the old key

## Troubleshooting

### Error: "Invalid API key"

- Check that your key is correctly set in `.env`
- Ensure there are no extra spaces in the `API_KEYS` variable
- Verify you're using the correct key in your requests

### Error: "Missing or invalid authorization header"

- Make sure you're including either `x-api-key` header or `Authorization: Bearer <key>`
- Check for typos in the header name

### Error: "Valid API key required"

- You're trying to access an API-key-only endpoint with a JWT token
- Use an API key instead

## Monitoring

Monitor API key usage in your logs:

```bash
# See all API key authentications
grep "api-key" logs/app.log

# Count API key requests
grep "api-key-usage" logs/app.log | wc -l
```

## FAQ

**Q: Can I use both JWT and API key in the same request?**
A: No, use one or the other. API key is checked first.

**Q: Do API keys expire?**
A: No, they don't expire automatically. You must rotate them manually.

**Q: Can I have different API keys with different permissions?**
A: Not in the current implementation. All API keys have the same RRHH-level access. You would need to implement custom logic for this.

**Q: How many API keys can I have?**
A: As many as you want. Just add them to the comma-separated list.

**Q: What happens if I delete an API key?**
A: Any requests using that key will immediately start failing with "Invalid API key" errors.

---

For more information, see the main [README.md](./README.md) or contact the development team.
