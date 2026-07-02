/**
 * Unit tests for attendance.ts
 * Run with: npx tsx src/lib/attendance.test.ts
 */

import { computeAttendanceCalendar } from "./attendance";

function assertEqual<T>(actual: T, expected: T, message: string) {
  const strActual = JSON.stringify(actual);
  const strExpected = JSON.stringify(expected);
  if (strActual !== strExpected) {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${strExpected}`);
    console.error(`   Actual:   ${strActual}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

function assertArraysEqual<T>(actual: T[], expected: T[], message: string) {
  if (actual.length !== expected.length) {
    console.error(`❌ ${message}`);
    console.error(`   Expected length: ${expected.length}, got: ${actual.length}`);
    process.exit(1);
  }
  for (let i = 0; i < actual.length; i++) {
    assertEqual(actual[i], expected[i], `${message} [index ${i}]`);
  }
}

// Test 1: Basic present/absent logic
function testBasicPresentAbsent() {
  // Use known dates: 2024-07-01 is Monday
  const sessionDates = ["2024-07-01", "2024-07-03"]; 
  const enrollmentDate = "2024-07-01";
  const today = "2024-07-04"; 

  const result = computeAttendanceCalendar(sessionDates, enrollmentDate, today);

  // 2024-07-01 (Mon) -> present (session)
  // 2024-07-02 (Tue) -> absent
  // 2024-07-03 (Wed) -> present (session)
  // 2024-07-04 (Thu) -> absent
  
  const expected = [
    { date: "2024-07-01", status: "present" },
    { date: "2024-07-02", status: "absent" },
    { date: "2024-07-03", status: "present" },
    { date: "2024-07-04", status: "absent" },
  ];

  assertArraysEqual(result, expected, "Basic present/absent logic");
}

// Test 2: Friday exclusion
function testFridayExclusion() {
  // 2024-07-05 is Friday
  const sessionDates = ["2024-07-06"]; // Saturday
  const enrollmentDate = "2024-07-01"; // Monday
  const today = "2024-07-10"; // Wednesday

  const result = computeAttendanceCalendar(sessionDates, enrollmentDate, today);

  // Expected: 
  // 2024-07-01 (Mon) -> absent
  // 2024-07-02 (Tue) -> absent
  // 2024-07-03 (Wed) -> absent
  // 2024-07-04 (Thu) -> absent
  // 2024-07-05 (Fri) -> EXCLUDED
  // 2024-07-06 (Sat) -> present (session)
  // 2024-07-07 (Sun) -> absent
  // 2024-07-08 (Mon) -> absent
  // 2024-07-09 (Tue) -> absent
  // 2024-07-10 (Wed) -> absent
  
  const expected = [
    { date: "2024-07-01", status: "absent" },
    { date: "2024-07-02", status: "absent" },
    { date: "2024-07-03", status: "absent" },
    { date: "2024-07-04", status: "absent" },
    { date: "2024-07-06", status: "present" },
    { date: "2024-07-07", status: "absent" },
    { date: "2024-07-08", status: "absent" },
    { date: "2024-07-09", status: "absent" },
    { date: "2024-07-10", status: "absent" },
  ];

  assertArraysEqual(result, expected, "Friday exclusion");
}

// Test 3: Empty session dates (all absent)
function testEmptySessionDates() {
  const sessionDates: string[] = [];
  const enrollmentDate = "2024-07-01"; // Monday
  const today = "2024-07-03"; // Wednesday

  const result = computeAttendanceCalendar(sessionDates, enrollmentDate, today);

  const expected = [
    { date: "2024-07-01", status: "absent" },
    { date: "2024-07-02", status: "absent" },
    { date: "2024-07-03", status: "absent" },
  ];

  assertArraysEqual(result, expected, "Empty session dates (all absent)");
}

// Test 4: Single day range
function testSingleDayRange() {
  const sessionDates = ["2024-07-01"];
  const enrollmentDate = "2024-07-01";
  const today = "2024-07-01";

  const result = computeAttendanceCalendar(sessionDates, enrollmentDate, today);

  const expected = [
    { date: "2024-07-01", status: "present" },
  ];

  assertArraysEqual(result, expected, "Single day range");
}

// Test 5: Multiple sessions on same day (should still be present)
function testMultipleSessionsSameDay() {
  const sessionDates = ["2024-07-01", "2024-07-01", "2024-07-02"];
  const enrollmentDate = "2024-07-01";
  const today = "2024-07-03";

  const result = computeAttendanceCalendar(sessionDates, enrollmentDate, today);

  const expected = [
    { date: "2024-07-01", status: "present" },
    { date: "2024-07-02", status: "present" },
    { date: "2024-07-03", status: "absent" },
  ];

  assertArraysEqual(result, expected, "Multiple sessions same day");
}

// Run all tests
console.log("Running attendance tests...\n");

testBasicPresentAbsent();
testFridayExclusion();
testEmptySessionDates();
testSingleDayRange();
testMultipleSessionsSameDay();

console.log("\n✅ All tests passed!");
