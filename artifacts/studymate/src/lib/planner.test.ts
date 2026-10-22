import assert from "node:assert/strict";
import test from "node:test";
import {
  generateStudyPlan,
  rescheduleMissedSessions,
  validateSessionPlacement,
  type Availability,
  type StudySubject,
} from "./planner.ts";

const availability: Availability = {
  days: [1, 2, 3, 4, 5, 6, 0],
  startTime: "09:00",
  endTime: "18:00",
  maxHoursPerDay: 2,
  sessionMinutes: 45,
  breakMinutes: 10,
  commitments: [],
};

function topic(
  id: string,
  confidence: "weak" | "average" | "strong" = "average",
  overrides: Partial<StudySubject["topics"][number]> = {},
): StudySubject["topics"][number] {
  return {
    id,
    name: id,
    confidence,
    difficulty: 3,
    importance: 3,
    practiceScore: null,
    completed: false,
    notes: "",
    ...overrides,
  };
}

function subject(topics: StudySubject["topics"]): StudySubject[] {
  return [{ id: "math", name: "Mathematics", topics }];
}

test("weak topics receive a higher share of a short plan", () => {
  const result = generateStudyPlan({
    examDate: "2026-10-27",
    subjects: subject([
      topic("weak-topic", "weak"),
      topic("strong-topic", "strong", { practiceScore: 95 }),
    ]),
    availability: { ...availability, days: [1], startTime: "09:00", endTime: "10:00", maxHoursPerDay: 1 },
    existingSessions: [],
    now: new Date("2026-10-26T08:00:00"),
  });
  assert.ok(result.sessions.some((session) => session.topicId === "weak-topic"));
  assert.equal(result.sessions.find((session) => session.status === "planned")?.topicId, "weak-topic");
  assert.ok(result.warning);
});

test("sessions fit study windows, commitments, and the daily limit", () => {
  const result = generateStudyPlan({
    examDate: "2026-10-28",
    subjects: subject([topic("one"), topic("two"), topic("three"), topic("four")]),
    availability: {
      ...availability,
      days: [1],
      startTime: "15:00",
      endTime: "20:00",
      maxHoursPerDay: 2,
      commitments: [{ day: 1, startTime: "16:00", endTime: "17:30", label: "Class" }],
    },
    existingSessions: [],
    now: new Date("2026-10-26T08:00:00"),
  });
  assert.ok(result.scheduledMinutes <= 120);
  for (const session of result.sessions) {
    assert.equal(session.date, "2026-10-26");
    const start = Number(session.startTime.slice(0, 2)) * 60 + Number(session.startTime.slice(3));
    const end = Number(session.endTime.slice(0, 2)) * 60 + Number(session.endTime.slice(3));
    assert.ok(start >= 900 && end <= 1200);
    assert.ok(end <= 960 || start >= 1050, "session overlaps the existing class");
  }
  const ordered = [...result.sessions].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let index = 1; index < ordered.length; index += 1) {
    assert.ok(ordered[index - 1].endTime <= ordered[index].startTime, "sessions overlap");
  }
});

test("completed sessions stay completed and are reserved when the plan is regenerated", () => {
  const completed = {
    id: "done",
    subjectId: "math",
    subjectName: "Mathematics",
    topicId: "one",
    topicName: "one",
    date: "2026-10-26",
    startTime: "09:00",
    endTime: "09:45",
    durationMinutes: 45,
    activity: "Practice questions",
    status: "completed" as const,
    notes: "finished",
  };
  const result = generateStudyPlan({
    examDate: "2026-10-27",
    subjects: subject([topic("one"), topic("two")]),
    availability,
    existingSessions: [completed],
    now: new Date("2026-10-26T08:00:00"),
  });
  assert.deepEqual(result.sessions[0], completed);
  const generated = result.sessions.filter((session) => session.status === "planned");
  assert.ok(generated.every((session) => session.startTime >= "09:45"));
});

test("the exam date itself is never used for a new session", () => {
  const result = generateStudyPlan({
    examDate: "2026-10-27",
    subjects: subject([topic("one")]),
    availability,
    existingSessions: [],
    now: new Date("2026-10-26T08:00:00"),
  });
  assert.ok(result.sessions.every((session) => session.date < "2026-10-27"));
});

test("rescheduling regenerates unfinished topics while retaining completed work", () => {
  const completed = {
    id: "done",
    subjectId: "math",
    subjectName: "Mathematics",
    topicId: "one",
    topicName: "one",
    date: "2026-10-26",
    startTime: "09:00",
    endTime: "09:45",
    durationMinutes: 45,
    activity: "Practice questions",
    status: "completed" as const,
    notes: "",
  };
  const skipped = { ...completed, id: "missed", topicId: "two", topicName: "two", status: "skipped" as const };
  const result = rescheduleMissedSessions([completed, skipped], {
    examDate: "2026-10-28",
    subjects: subject([topic("one"), topic("two")]),
    availability,
    now: new Date("2026-10-26T08:00:00"),
  });
  assert.ok(result.sessions.some((session) => session.id === "done" && session.status === "completed"));
  assert.ok(result.sessions.some((session) => session.topicId === "two" && session.status === "planned"));
  assert.ok(result.sessions.every((session) => session.id !== "missed"));
});

test("invalid exam dates return a clear warning without throwing", () => {
  const result = generateStudyPlan({
    examDate: "not-a-date",
    subjects: subject([topic("one")]),
    availability,
    existingSessions: [],
    now: new Date("2026-10-26T08:00:00"),
  });
  assert.match(result.warning ?? "", /valid examination date/i);
  assert.equal(result.sessions.length, 0);
});

test("manual planned sessions respect the exam date, study hours, breaks, and daily cap", () => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getDate()).padStart(2, "0")}`;
  const examDate = new Date(now);
  examDate.setDate(examDate.getDate() + 2);
  const exam = `${examDate.getFullYear()}-${String(examDate.getMonth() + 1).padStart(2, "0")}-${String(examDate.getDate()).padStart(2, "0")}`;
  const weekday = now.getDay();
  const candidate = {
    id: "manual",
    subjectId: "math",
    subjectName: "Mathematics",
    topicId: "one",
    topicName: "one",
    date: today,
    startTime: "10:00",
    endTime: "10:45",
    durationMinutes: 45,
    activity: "Practice",
    status: "planned" as const,
    notes: "",
  };
  const dayAvailability: Availability = {
    ...availability,
    days: [weekday],
    startTime: "09:00",
    endTime: "12:00",
    maxHoursPerDay: 2,
    breakMinutes: 15,
  };
  assert.equal(validateSessionPlacement(candidate, [], exam, dayAvailability), null);
  assert.match(validateSessionPlacement({ ...candidate, date: exam }, [], exam, dayAvailability) ?? "", /before exam day/i);
  assert.match(validateSessionPlacement(candidate, [], exam, { ...dayAvailability, maxHoursPerDay: 0.5 }) ?? "", /daily study-hour limit/i);
  assert.match(
    validateSessionPlacement({ ...candidate, startTime: "10:00", endTime: "10:45" }, [{
      ...candidate,
      id: "earlier",
      startTime: "09:00",
      endTime: "09:50",
    }], exam, dayAvailability) ?? "",
    /15-minute break/i,
  );
  assert.match(
    validateSessionPlacement(candidate, [], exam, {
      ...dayAvailability,
      commitments: [{ day: weekday, startTime: "10:15", endTime: "11:00", label: "Class" }],
    }) ?? "",
    /Class/i,
  );
  assert.ok(tomorrow < exam);
});
