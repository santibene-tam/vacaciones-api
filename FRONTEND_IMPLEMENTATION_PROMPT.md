# Frontend Implementation Prompt: Holiday Period Management

## Context

The backend API has been updated to support **dual-period vacation management**. The system now tracks vacation days across two periods:
- **Current Period**: October 1 - September 30
- **Next Period**: October 1 (next year) - September 30 (following year)

When users create vacation requests, the system automatically splits days across periods if the request spans multiple periods.

## Current Date Reference
Today is **November 17, 2025**, which means:
- **Current Period**: October 1, 2025 - September 30, 2026
- **Next Period**: October 1, 2026 - September 30, 2027

## Backend Changes Summary

### 1. Updated Employee Data Structure

The employee object now includes fields for both periods:

```typescript
interface EmployeeHoliday {
  email: string;
  emailRaw: string;
  lastName: string;
  firstName: string;
  startDate: string;
  carriedOverDays: number;
  
  // Current period (Oct 1, 2025 - Sep 30, 2026)
  correspondingDays: number;
  daysTaken: number;
  daysRemaining: number;
  
  // Next period (Oct 1, 2026 - Sep 30, 2027)
  correspondingDaysNextPeriod: number;
  daysTakenNextPeriod: number;
  daysRemainingNextPeriod: number;
  
  approver1: string;
  approver2: string;
  approver3: string;
}
```

### 2. Updated Holiday Request Structure

Holiday requests now track which period(s) the days come from:

```typescript
interface HolidayRequest {
  id: string;
  employeeEmail: string;
  employeeName: string;
  startDate: string; // Format: DD/MM/YYYY
  endDate: string; // Format: DD/MM/YYYY
  totalDays: number;
  
  // NEW: Period breakdown
  currentPeriodDays: number; // Days taken from current period
  nextPeriodDays: number; // Days taken from next period
  
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  currentApprover: string;
  approver1: ApproverInfo;
  approver2: ApproverInfo;
  approver3: ApproverInfo;
  createdAt: string;
  updatedAt: string;
}
```

### 3. Backend Validation Logic

When creating a request, the backend:
1. **Automatically splits** the requested days across periods based on the dates
2. **Validates** that the employee has sufficient days in **each period**
3. **Returns specific errors** if there aren't enough days in a particular period
4. **Rejects requests** that include days outside current/next periods

### 4. Error Messages

The backend returns these specific error messages:
- `"Insufficient holiday days for current period. Requested: X, Available: Y"`
- `"Insufficient holiday days for next period. Requested: X, Available: Y"`
- `"Request contains days outside the current and next holiday periods. Please adjust your request."`

## Frontend Implementation Requirements

### 1. Update Employee Display UI

**Task**: Show both period balances in the employee dashboard/profile

**Required Changes**:
- Display current period days prominently (this is the main focus)
- Add a section for next period days (can be collapsible or in a separate card)
- Use visual indicators (progress bars, charts) to show days taken vs. remaining for each period
- Add labels indicating which period is which (e.g., "Current Period: Oct 2024 - Sep 2025")

**Example UI Structure**:
```
Current Period (Oct 2025 - Sep 2026)
┌─────────────────────────────────────┐
│ Days Allocated: 15                  │
│ Days Taken: 7                       │
│ Days Remaining: 8                   │
│ [████████░░░░░░░] 47%              │
└─────────────────────────────────────┘

Next Period (Oct 2026 - Sep 2027)
┌─────────────────────────────────────┐
│ Days Allocated: 14                  │
│ Days Taken: 0                       │
│ Days Remaining: 14                  │
│ [░░░░░░░░░░░░░░░] 0%               │
└─────────────────────────────────────┘
```

### 2. Update Request Creation Form

**Task**: Add real-time feedback showing which period(s) will be affected

**Required Changes**:

a. **Date Selection Validation**:
   - As users select dates, calculate and display which period(s) the request falls into
   - Show a breakdown of days per period in real-time

b. **Period Breakdown Display**:
```
You are requesting vacation from 25/09/2026 to 05/10/2026

Breakdown by Period:
┌──────────────────────────────────────┐
│ Current Period (Sep 2026): 5 days   │
│ Next Period (Oct 2026): 3 days      │
│ ─────────────────────────            │
│ Total Business Days: 8 days         │
└──────────────────────────────────────┘

Available Days:
✓ Current Period: 8 days available (requesting 5)
✓ Next Period: 14 days available (requesting 3)
```

c. **Validation Feedback**:
   - Show checkmarks (✓) when there are enough days in each period
   - Show warnings (⚠️) or errors (✗) when insufficient days
   - Disable submit button if validation fails
   - Display clear error messages matching backend responses

### 3. Update Request List/History View

**Task**: Show period breakdown for each request

**Required Changes**:
- Add columns or expand details to show `currentPeriodDays` and `nextPeriodDays`
- Use badges or chips to indicate which period(s) a request affects
- Example: 
  ```
  Request #123 | Sep 25 - Oct 5 | 8 days
  [Current: 5] [Next: 3]
  ```

### 4. Calculate Period Split on Frontend (Optional but Recommended)

**Task**: Implement frontend logic to preview period splits before submitting

This provides better UX by showing immediate feedback without waiting for backend validation.

**Implementation Notes**:
- You'll need to replicate the period calculation logic from the backend
- Calculate business days excluding weekends and Argentine holidays
- Determine which period each day falls into
- Show this as a preview before submitting

**Pseudo-code**:
```javascript
function calculatePeriodSplit(startDate, endDate) {
  let currentPeriodDays = 0;
  let nextPeriodDays = 0;
  
  // Get current period boundaries
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  
  // If Oct-Dec, current period started this year
  // If Jan-Sep, current period started last year
  const periodStartYear = currentMonth >= 9 ? currentYear : currentYear - 1;
  
  const currentPeriodStart = new Date(periodStartYear, 9, 1); // Oct 1
  const currentPeriodEnd = new Date(periodStartYear + 1, 8, 30); // Sep 30
  const nextPeriodStart = new Date(periodStartYear + 1, 9, 1); // Oct 1
  const nextPeriodEnd = new Date(periodStartYear + 2, 8, 30); // Sep 30
  
  // Iterate through each day in the range
  let currentDate = new Date(startDate);
  const endDateObj = new Date(endDate);
  
  while (currentDate <= endDateObj) {
    if (isBusinessDay(currentDate)) {
      if (currentDate >= currentPeriodStart && currentDate <= currentPeriodEnd) {
        currentPeriodDays++;
      } else if (currentDate >= nextPeriodStart && currentDate <= nextPeriodEnd) {
        nextPeriodDays++;
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return { currentPeriodDays, nextPeriodDays };
}

function isBusinessDay(date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // Weekend
  
  // Check against Argentine holidays
  const holidays = getArgentineHolidays(date.getFullYear());
  const dateStr = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  
  return !holidays.includes(dateStr);
}
```

### 5. Update API Integration

**Task**: Update API calls to handle new response structure

**Endpoints to Update**:

a. **GET `/api/holidays/me`** - Returns employee data with new period fields
b. **GET `/api/holidays/:email`** - Returns employee data with new period fields
c. **GET `/api/holidays/team`** - Returns array of employees with new period fields
d. **POST `/api/requests`** - Request creation now returns period breakdown
e. **GET `/api/requests/employee/:email`** - Returns requests with period breakdown
f. **GET `/api/requests/approver`** - Returns requests with period breakdown

**Example API Call Update**:
```typescript
// OLD: Only had single period
interface OldEmployeeResponse {
  daysRemaining: number;
}

// NEW: Has both periods
interface NewEmployeeResponse {
  daysRemaining: number; // Current period
  daysRemainingNextPeriod: number; // Next period
}

// Usage
const employee = await fetchEmployeeData();
console.log(`Current period: ${employee.daysRemaining} days`);
console.log(`Next period: ${employee.daysRemainingNextPeriod} days`);
```

### 6. Handle Error Messages

**Task**: Display backend validation errors in a user-friendly way

**Error Handling Strategy**:
```typescript
try {
  const response = await createHolidayRequest(requestData);
  // Show success message
} catch (error) {
  if (error.message.includes('Insufficient holiday days for current period')) {
    // Show specific error for current period
    showError('Not enough days in current period (Oct 2025 - Sep 2026)');
  } else if (error.message.includes('Insufficient holiday days for next period')) {
    // Show specific error for next period
    showError('Not enough days in next period (Oct 2026 - Sep 2027)');
  } else if (error.message.includes('outside the current and next holiday periods')) {
    // Show error for invalid date range
    showError('Your request includes dates too far in the future. Please select dates within the next period.');
  } else {
    // Generic error
    showError(error.message);
  }
}
```

### 7. Visual Design Recommendations

**Color Coding**:
- Current Period: Primary color (e.g., blue)
- Next Period: Secondary/accent color (e.g., purple or teal)
- Use consistent colors throughout the app

**Icons**:
- 📅 Calendar icon for periods
- ✓ Checkmark for sufficient days
- ⚠️ Warning for low days
- ✗ Error for insufficient days

**Typography**:
- Use bold for period labels
- Use subtle text for period date ranges
- Highlight remaining days prominently

## Testing Scenarios

### Test Case 1: Request in Current Period Only
- **Date Range**: November 20, 2025 - November 25, 2025
- **Expected**: All days from current period
- **Expected Response**: `currentPeriodDays: 4, nextPeriodDays: 0`

### Test Case 2: Request in Next Period Only
- **Date Range**: December 15, 2026 - December 20, 2026
- **Expected**: All days from next period (Dec 2026 is in next period since it's after Oct 1, 2026)
- **Expected Response**: `currentPeriodDays: 0, nextPeriodDays: 5`

### Test Case 3: Request Spanning Both Periods
- **Date Range**: September 25, 2026 - October 5, 2026
- **Expected**: Days split between both periods
- **Expected Response**: `currentPeriodDays: ~5, nextPeriodDays: ~3` (depending on business days)

### Test Case 4: Insufficient Days in Current Period
- **Setup**: Employee has 3 days remaining in current period
- **Request**: 5 days in current period
- **Expected**: Error message about current period

### Test Case 5: Insufficient Days in Next Period
- **Setup**: Employee has 2 days remaining in next period
- **Request**: 5 days in next period
- **Expected**: Error message about next period

### Test Case 6: Request Too Far in Future
- **Date Range**: November 1, 2027 - November 5, 2027 (beyond next period)
- **Expected**: Error about dates outside valid periods

## Google Sheets Structure

### "Solicitudes" Tab (Requests)

The requests are stored in the "Solicitudes" sheet with the following columns:

| Column | Field Name               | Type   | Description                                      |
| ------ | ------------------------ | ------ | ------------------------------------------------ |
| A      | Request ID               | string | Unique request identifier (e.g., REQ-123456-789) |
| B      | Employee Email           | string | Email of employee making the request             |
| C      | Employee Name            | string | Full name of employee                            |
| D      | Start Date               | string | Request start date (DD/MM/YYYY)                  |
| E      | End Date                 | string | Request end date (DD/MM/YYYY)                    |
| F      | Total Days               | number | Total business days requested                    |
| G      | Current Period Days      | number | Days taken from current period                   |
| H      | Next Period Days         | number | Days taken from next period                      |
| I      | Status                   | string | PENDING, APPROVED, or REJECTED                   |
| J      | Current Approver         | string | Email of current approver (empty if done)        |
| K      | Approver 1 Email         | string | First approver email                             |
| L      | Approver 1 Status        | string | PENDING, APPROVED, REJECTED, or NOT_REQUIRED     |
| M      | Approver 1 Date          | string | Date/time of approval (ISO format)               |
| N      | Approver 2 Email         | string | Second approver email                            |
| O      | Approver 2 Status        | string | PENDING, APPROVED, REJECTED, or NOT_REQUIRED     |
| P      | Approver 2 Date          | string | Date/time of approval (ISO format)               |
| Q      | Approver 3 Email         | string | Third approver email                             |
| R      | Approver 3 Status        | string | PENDING, APPROVED, REJECTED, or NOT_REQUIRED     |
| S      | Approver 3 Date          | string | Date/time of approval (ISO format)               |
| T      | Created At               | string | Request creation timestamp (ISO format)          |
| U      | Updated At               | string | Last update timestamp (ISO format)               |

**Note**: Columns G and H (Current Period Days and Next Period Days) were added to track the period split for each request.

## API Endpoints Reference

All endpoints remain the same, but response structures now include period fields:

- `GET /api/holidays/me` - Get own data
- `GET /api/holidays/:email` - Get specific employee
- `GET /api/holidays/team` - Get team data
- `POST /api/requests` - Create new request
- `GET /api/requests/employee/:email` - Get employee's requests
- `GET /api/requests/approver` - Get requests pending approval
- `GET /api/requests/:id` - Get specific request
- `PUT /api/requests/:id/approve` - Approve/reject request
- `DELETE /api/requests/:id` - Delete request

## Implementation Priority

### Phase 1 (Must Have):
1. Update API integration to handle new response fields
2. Display both period balances in employee dashboard
3. Show period breakdown in request history
4. Handle backend validation errors properly

### Phase 2 (Should Have):
5. Add real-time period calculation in request form
6. Show visual indicators (progress bars, charts)
7. Add tooltips explaining periods

### Phase 3 (Nice to Have):
8. Add animations for period transitions
9. Show predictions for future periods
10. Add bulk request creation with period awareness

## Questions to Consider

1. **Current Framework**: What frontend framework are you using? (React, Vue, Angular, etc.)
2. **State Management**: Do you use Redux, Zustand, or other state management?
3. **UI Library**: Are you using Material-UI, Chakra, Tailwind, or custom components?
4. **Date Library**: Do you use date-fns, moment, dayjs, or native Date?
5. **Form Library**: React Hook Form, Formik, or custom forms?

## Additional Notes

- The backend automatically handles all period calculations and validations
- You don't need to replicate all backend logic, but showing a preview improves UX
- Always validate on the backend; frontend validation is just for better UX
- Consider adding loading states when calculating period splits
- Think about mobile responsiveness for period displays

---

**Ready to implement?** Start with Phase 1, update your API types, and then progressively enhance the UI. The backend is ready and will handle all the complex logic!
