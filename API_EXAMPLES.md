# API Request Examples

This file contains example requests you can use to test the API with tools like curl, Postman, or Thunder Client.

## Prerequisites

Replace `YOUR_GOOGLE_ID_TOKEN` with an actual Google ID token from your frontend's Google Sign-In.

## 1. Health Check (No Authentication)

### curl

```bash
curl -X GET http://localhost:3000/api/health
```

### Expected Response

```json
{
  "status": "ok",
  "timestamp": "2025-10-16T12:00:00.000Z"
}
```

---

## 2. Get My Holidays

### curl

```bash
curl -X GET http://localhost:3000/api/holidays/me \
  -H "Authorization: Bearer YOUR_GOOGLE_ID_TOKEN" \
  -H "Content-Type: application/json"
```

### JavaScript (Fetch)

```javascript
const token = 'YOUR_GOOGLE_ID_TOKEN';

const response = await fetch('http://localhost:3000/api/holidays/me', {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
console.log(data);
```

### Expected Response

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

---

## 3. Get Specific Employee's Holidays

### curl

```bash
curl -X GET http://localhost:3000/api/holidays/employee@theappmaster.com \
  -H "Authorization: Bearer YOUR_GOOGLE_ID_TOKEN" \
  -H "Content-Type: application/json"
```

### JavaScript (Fetch)

```javascript
const token = 'YOUR_GOOGLE_ID_TOKEN';
const employeeEmail = 'employee@theappmaster.com';

const response = await fetch(`http://localhost:3000/api/holidays/${employeeEmail}`, {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
console.log(data);
```

### Expected Response (Success)

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

### Expected Response (Unauthorized)

```json
{
  "error": "You are not authorized to view this employee data"
}
```

---

## 4. Get Team/All Holidays

### curl

```bash
curl -X GET http://localhost:3000/api/holidays/team \
  -H "Authorization: Bearer YOUR_GOOGLE_ID_TOKEN" \
  -H "Content-Type: application/json"
```

### JavaScript (Fetch)

```javascript
const token = 'YOUR_GOOGLE_ID_TOKEN';

const response = await fetch('http://localhost:3000/api/holidays/team', {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
console.log(data);
```

### Expected Response (Approver)

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
    "approver1": "your-email@theappmaster.com",
    "approver2": "other@theappmaster.com",
    "approver3": "RRHH"
  },
  {
    "email": "employee2@theappmaster.com",
    ...
  }
]
```

### Expected Response (Regular Employee)

```json
[]
```

---

## Error Responses

### 401 Unauthorized

```json
{
  "error": "Missing or invalid authorization header"
}
```

### 403 Forbidden

```json
{
  "error": "You are not authorized to view this employee data"
}
```

### 404 Not Found

```json
{
  "error": "Employee data not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal server error",
  "message": "Detailed error message (only in development)"
}
```

---

## Postman/Thunder Client Collection

If you're using Postman or Thunder Client, create a collection with these settings:

### Collection Variables

- `baseUrl`: `http://localhost:3000`
- `token`: `YOUR_GOOGLE_ID_TOKEN`

### Requests

1. **Health Check**
   - Method: GET
   - URL: `{{baseUrl}}/api/health`

2. **Get My Holidays**
   - Method: GET
   - URL: `{{baseUrl}}/api/holidays/me`
   - Headers: `Authorization: Bearer {{token}}`

3. **Get Employee Holidays**
   - Method: GET
   - URL: `{{baseUrl}}/api/holidays/:email`
   - Path Variable: `email`
   - Headers: `Authorization: Bearer {{token}}`

4. **Get Team Holidays**
   - Method: GET
   - URL: `{{baseUrl}}/api/holidays/team`
   - Headers: `Authorization: Bearer {{token}}`

---

## Getting a Test Token

To get a Google ID token for testing:

1. **From your frontend**: After Google Sign-In, log the token:

   ```javascript
   const credential = response.credential; // Google Sign-In response
   console.log('Token:', credential);
   ```

2. **Using Google OAuth Playground**:
   - Go to https://developers.google.com/oauthplayground/
   - Not recommended for production testing

3. **From browser DevTools**:
   - After signing in to your frontend
   - Open DevTools > Network tab
   - Find API request
   - Copy the Authorization header value

---

## Testing with Different Roles

### As Employee

- Use a token for an email that exists in the sheet
- You'll only be able to access your own data

### As Approver

- Use a token for an email that appears in `Aprobador 1`, `Aprobador 2`, or `Aprobador 3` columns
- You'll be able to access data for employees you approve

### As RRHH

- Use a token for an email whose row has `"RRHH"` in the `Aprobador 3` column
- You'll be able to access all employee data
