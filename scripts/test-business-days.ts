/**
 * Simple test script to demonstrate business day calculation
 * Run with: npx ts-node scripts/test-business-days.ts
 */

import {
  calculateBusinessDays,
  isWeekend,
  isArgentineHoliday,
  parseDate,
  formatDate,
} from '../src/utils/dateUtils';

console.log('=== Business Day Calculator Test ===\n');

// Test cases
const testCases = [
  {
    name: 'Monday to Friday (same week)',
    start: '25/11/2025',
    end: '28/11/2025',
    expected: 4,
  },
  {
    name: 'Monday to Monday (next week)',
    start: '01/12/2025',
    end: '08/12/2025',
    expected: 6, // Excludes weekend
  },
  {
    name: 'Including Christmas (holiday)',
    start: '22/12/2025',
    end: '29/12/2025',
    expected: 5, // 8 days - 2 weekend days - 1 holiday (Dec 25)
  },
  {
    name: 'Single day (Friday)',
    start: '28/11/2025',
    end: '28/11/2025',
    expected: 1,
  },
  {
    name: 'Weekend only',
    start: '29/11/2025',
    end: '30/11/2025',
    expected: 0, // Both Saturday and Sunday
  },
  {
    name: 'Carnaval 2025 (2 holidays)',
    start: '24/02/2025',
    end: '28/02/2025',
    expected: 3, // 5 days - 2 holidays
  },
];

console.log('Testing business day calculations:\n');

testCases.forEach((testCase) => {
  const result = calculateBusinessDays(testCase.start, testCase.end);
  const passed = result === testCase.expected;
  const status = passed ? '✅' : '❌';
  
  console.log(`${status} ${testCase.name}`);
  console.log(`   ${testCase.start} to ${testCase.end}`);
  console.log(`   Expected: ${testCase.expected} days, Got: ${result} days`);
  
  if (!passed) {
    console.log(`   ⚠️  TEST FAILED!`);
  }
  console.log();
});

// Show holidays and weekends in a range
console.log('\n=== December 2025 Analysis ===\n');
console.log('Checking each day from Dec 22 to Dec 29:\n');

const startDate = parseDate('22/12/2025');
const endDate = parseDate('29/12/2025');
const currentDate = new Date(startDate);

while (currentDate <= endDate) {
  const dateStr = formatDate(currentDate);
  const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
  const isWE = isWeekend(currentDate);
  const isHoliday = isArgentineHoliday(currentDate);
  
  let status = '✅ Business Day';
  if (isWE) status = '🏖️  Weekend';
  if (isHoliday) status = '🎉 Holiday (Christmas)';
  
  console.log(`${dateStr} (${dayName}): ${status}`);
  
  currentDate.setDate(currentDate.getDate() + 1);
}

console.log('\n=== Total Business Days: 5 ===');
console.log('(Mon 22, Tue 23, Wed 24, Fri 26, Mon 29)');
console.log('Excluded: Sat 27, Sun 28, Thu 25 (Christmas)\n');

console.log('=== Test Complete ===');
