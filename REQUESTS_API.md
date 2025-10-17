# Holiday Requests API Documentation

This document describes the new holiday request endpoints added to the Vacaciones API.

## Overview

The holiday request system allows employees to:
- Submit vacation requests with start and end dates
- Track the approval status of their requests
- See business days calculated automatically (excluding weekends and Argentine holidays)

Approvers can:
- View requests pending their approval
- Approve or reject requests
- See the full approval chain

RRHH can:
- View all requests across the organization
- Monitor the approval workflow

## Business Day Calculation

The system automatically calculates **business days only**, excluding:
- **Weekends** (Saturday and Sunday)
- **Argentine National Holidays** for 2025-2026

**Example**: 
- Request from Monday Nov 1 to Monday Nov 8 = **6 business days** (excludes 2 weekend days)

## Approval Workflow

Requests follow a **sequential approval chain** based on the employee's configured approvers:

1. **Employee with 3 approvers:**
   - Approver1 approves → Request moves to Approver2
   - Approver2 approves → Request moves to Approver3
   - Approver3 approves → Request APPROVED ✅

2. **Employee with 2 approvers:**
   - Approver1 approves → Request moves to Approver2
   - Approver2 approves → Request APPROVED ✅

3. **Employee with 1 approver:**
   - Approver1 approves → Request APPROVED ✅

4. **Rejection:**
   - Any approver can reject → Request immediately becomes REJECTED ❌
   - Process stops, no further approvals needed

## API Endpoints

### 1. Create Holiday Request

Create a new vacation request.

**Endpoint:** `POST /api/requests`

**Authentication:** Required

**Request Body:**
```json
{
  "startDate": "01/11/2025",
  "endDate": "05/11/2025"
}
```

**Response (201 Created):**
```json
{
  "id": "REQ-1729123456789-123",
  "employeeEmail": "john.doe@company.com",
  "employeeName": "John Doe",
  "startDate": "01/11/2025",
  "endDate": "05/11/2025",
  "totalDays": 5,
  "status": "PENDING",
  "currentApprover": "manager@company.com",
  "approver1": {
    "email": "manager@company.com",
    "status": "PENDING",
    "date": ""
  },
  "approver2": {
    "email": "director@company.com",
    "status": "PENDING",
    "date": ""
  },
  "approver3": {
    "email": "",
    "status": "NOT_REQUIRED",
    "date": ""
  },
  "createdAt": "2025-10-17T10:30:00.000Z",
  "updatedAt": "2025-10-17T10:30:00.000Z"
}
```

**Validations:**
- ✅ Dates must be in DD/MM/YYYY format
- ✅ End date must be after or equal to start date
- ✅ Dates cannot be in the past
- ✅ Employee must have sufficient remaining days
- ✅ Request cannot overlap with existing requests
- ✅ Must include at least one business day

---

### 2. Get My Requests

Retrieve all holiday requests for the authenticated employee.

**Endpoint:** `GET /api/requests/me`

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "REQ-1729123456789-123",
    "employeeEmail": "john.doe@company.com",
    "employeeName": "John Doe",
    "startDate": "01/11/2025",
    "endDate": "05/11/2025",
    "totalDays": 5,
    "status": "APPROVED",
    "currentApprover": "",
    "approver1": {
      "email": "manager@company.com",
      "status": "APPROVED",
      "date": "2025-10-15T09:00:00.000Z"
    },
    "approver2": {
      "email": "director@company.com",
      "status": "APPROVED",
      "date": "2025-10-16T14:30:00.000Z"
    },
    "approver3": {
      "email": "",
      "status": "NOT_REQUIRED",
      "date": ""
    },
    "createdAt": "2025-10-14T10:30:00.000Z",
    "updatedAt": "2025-10-16T14:30:00.000Z"
  }
]
```

---

### 3. Get Pending Requests (For Approvers)

Get all requests where the authenticated user is the current approver.

**Endpoint:** `GET /api/requests/pending`

**Authentication:** Required

**Response (200 OK):**
```json
[
  {
    "id": "REQ-1729123456789-456",
    "employeeEmail": "jane.smith@company.com",
    "employeeName": "Jane Smith",
    "startDate": "10/11/2025",
    "endDate": "15/11/2025",
    "totalDays": 6,
    "status": "PENDING",
    "currentApprover": "manager@company.com",
    "approver1": {
      "email": "manager@company.com",
      "status": "PENDING",
      "date": ""
    },
    "approver2": {
      "email": "director@company.com",
      "status": "PENDING",
      "date": ""
    },
    "approver3": {
      "email": "rrhh@company.com",
      "status": "PENDING",
      "date": ""
    },
    "createdAt": "2025-10-17T08:00:00.000Z",
    "updatedAt": "2025-10-17T08:00:00.000Z"
  }
]
```

---

### 4. Get All Requests (RRHH Only)

Retrieve all holiday requests across the organization.

**Endpoint:** `GET /api/requests/all`

**Authentication:** Required (RRHH role only)

**Response (200 OK):**
```json
[
  {
    "id": "REQ-1729123456789-123",
    "employeeEmail": "john.doe@company.com",
    "employeeName": "John Doe",
    "startDate": "01/11/2025",
    "endDate": "05/11/2025",
    "totalDays": 5,
    "status": "APPROVED",
    "currentApprover": "",
    ...
  },
  {
    "id": "REQ-1729123456789-456",
    "employeeEmail": "jane.smith@company.com",
    "employeeName": "Jane Smith",
    "startDate": "10/11/2025",
    "endDate": "15/11/2025",
    "totalDays": 6,
    "status": "PENDING",
    "currentApprover": "manager@company.com",
    ...
  }
]
```

**Error (403 Forbidden):**
```json
{
  "error": "Only RRHH can view all requests"
}
```

---

### 5. Get Request by ID

Retrieve a specific holiday request.

**Endpoint:** `GET /api/requests/:id`

**Authentication:** Required

**URL Parameters:**
- `id` - Request ID (e.g., `REQ-1729123456789-123`)

**Response (200 OK):**
```json
{
  "id": "REQ-1729123456789-123",
  "employeeEmail": "john.doe@company.com",
  "employeeName": "John Doe",
  "startDate": "01/11/2025",
  "endDate": "05/11/2025",
  "totalDays": 5,
  "status": "PENDING",
  "currentApprover": "manager@company.com",
  ...
}
```

**Access Control:**
- ✅ Employee can view their own requests
- ✅ Approvers can view requests they need to approve
- ✅ RRHH can view all requests

**Error (403 Forbidden):**
```json
{
  "error": "You are not authorized to view this request"
}
```

**Error (404 Not Found):**
```json
{
  "error": "Request not found"
}
```

---

### 6. Approve Request

Approve a holiday request (moves to next approver or fully approves).

**Endpoint:** `PUT /api/requests/:id/approve`

**Authentication:** Required

**URL Parameters:**
- `id` - Request ID

**Response (200 OK) - Moved to Next Approver:**
```json
{
  "id": "REQ-1729123456789-123",
  "employeeEmail": "john.doe@company.com",
  "employeeName": "John Doe",
  "startDate": "01/11/2025",
  "endDate": "05/11/2025",
  "totalDays": 5,
  "status": "PENDING",
  "currentApprover": "director@company.com",
  "approver1": {
    "email": "manager@company.com",
    "status": "APPROVED",
    "date": "2025-10-17T10:00:00.000Z"
  },
  "approver2": {
    "email": "director@company.com",
    "status": "PENDING",
    "date": ""
  },
  "approver3": {
    "email": "",
    "status": "NOT_REQUIRED",
    "date": ""
  },
  ...
}
```

**Response (200 OK) - Fully Approved:**
```json
{
  "id": "REQ-1729123456789-123",
  "employeeEmail": "john.doe@company.com",
  "employeeName": "John Doe",
  "startDate": "01/11/2025",
  "endDate": "05/11/2025",
  "totalDays": 5,
  "status": "APPROVED",
  "currentApprover": "",
  "approver1": {
    "email": "manager@company.com",
    "status": "APPROVED",
    "date": "2025-10-15T10:00:00.000Z"
  },
  "approver2": {
    "email": "director@company.com",
    "status": "APPROVED",
    "date": "2025-10-17T11:00:00.000Z"
  },
  "approver3": {
    "email": "",
    "status": "NOT_REQUIRED",
    "date": ""
  },
  ...
}
```

**Note:** When fully approved, the employee's `daysTaken` and `daysRemaining` are automatically updated in the main employee sheet.

**Error (400 Bad Request):**
```json
{
  "error": "You are not authorized to approve this request at this stage"
}
```

```json
{
  "error": "Request is already approved"
}
```

---

### 7. Reject Request

Reject a holiday request (immediately sets status to REJECTED).

**Endpoint:** `PUT /api/requests/:id/reject`

**Authentication:** Required

**URL Parameters:**
- `id` - Request ID

**Response (200 OK):**
```json
{
  "id": "REQ-1729123456789-123",
  "employeeEmail": "john.doe@company.com",
  "employeeName": "John Doe",
  "startDate": "01/11/2025",
  "endDate": "05/11/2025",
  "totalDays": 5,
  "status": "REJECTED",
  "currentApprover": "",
  "approver1": {
    "email": "manager@company.com",
    "status": "REJECTED",
    "date": "2025-10-17T10:00:00.000Z"
  },
  "approver2": {
    "email": "director@company.com",
    "status": "PENDING",
    "date": ""
  },
  "approver3": {
    "email": "",
    "status": "NOT_REQUIRED",
    "date": ""
  },
  ...
}
```

**Error (400 Bad Request):**
```json
{
  "error": "You are not authorized to approve this request at this stage"
}
```

```json
{
  "error": "Request is already rejected"
}
```

---

## Request Status Values

- `PENDING` - Awaiting approval
- `APPROVED` - Fully approved by all required approvers
- `REJECTED` - Rejected by an approver

## Approval Status Values

- `PENDING` - Awaiting this approver's decision
- `APPROVED` - Approved by this approver
- `REJECTED` - Rejected by this approver
- `NOT_REQUIRED` - This approver level is not configured for this employee

---

## Google Sheets Setup

### Required Sheet: "Solicitudes"

Create a new tab named **"Solicitudes"** in your Google Sheets with the following columns:

| Column | Header | Description |
|--------|--------|-------------|
| A | ID | Unique request ID (auto-generated) |
| B | Employee Email | Email of the requesting employee |
| C | Employee Name | Full name of the employee |
| D | Start Date | Start date (DD/MM/YYYY) |
| E | End Date | End date (DD/MM/YYYY) |
| F | Total Days | Number of business days |
| G | Status | PENDING, APPROVED, or REJECTED |
| H | Current Approver | Email of current approver |
| I | Approver1 Email | First approver's email |
| J | Approver1 Status | First approver's decision |
| K | Approver1 Date | Timestamp of first approval |
| L | Approver2 Email | Second approver's email |
| M | Approver2 Status | Second approver's decision |
| N | Approver2 Date | Timestamp of second approval |
| O | Approver3 Email | Third approver's email |
| P | Approver3 Status | Third approver's decision |
| Q | Approver3 Date | Timestamp of third approval |
| R | Created At | Request creation timestamp |
| S | Updated At | Last update timestamp |

---

## Example Usage Scenarios

### Scenario 1: Employee Creates Request

```bash
# Employee creates a 5-day vacation request
curl -X POST https://your-api.com/api/requests \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "20/11/2025",
    "endDate": "26/11/2025"
  }'
```

### Scenario 2: First Approver Reviews

```bash
# Manager checks pending requests
curl -X GET https://your-api.com/api/requests/pending \
  -H "Authorization: Bearer <manager-token>"

# Manager approves
curl -X PUT https://your-api.com/api/requests/REQ-123/approve \
  -H "Authorization: Bearer <manager-token>"
```

### Scenario 3: Second Approver Reviews

```bash
# Director checks pending requests
curl -X GET https://your-api.com/api/requests/pending \
  -H "Authorization: Bearer <director-token>"

# Director approves (request now fully approved)
curl -X PUT https://your-api.com/api/requests/REQ-123/approve \
  -H "Authorization: Bearer <director-token>"
```

### Scenario 4: RRHH Monitors All Requests

```bash
# RRHH views all organization requests
curl -X GET https://your-api.com/api/requests/all \
  -H "Authorization: Bearer <rrhh-token>"
```

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK` - Success
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid input or business logic violation
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

Error responses include a descriptive message:
```json
{
  "error": "Descriptive error message"
}
```
