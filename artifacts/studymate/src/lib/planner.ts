export type Confidence = "weak" | "average" | "strong";
export type SessionStatus = "planned" | "completed" | "skipped";

export interface StudyTopic {
  id: string;
  name: string;
  confidence: Confidence;
  difficulty: number;
  importance: number;
  practiceScore: number | null;
  completed: boolean;
  notes: string;
  lastStudied?: string;
}

export interface StudySubject {
  id: string;
  name: string;
  color?: string;
  topics: StudyTopic[];
}

export interface Commitment {
  day: number;
  startTime: string;
  endTime: string;
  label?: string;
}

export interface Availability {
  days: number[];
  startTime: string;
  endTime: string;
  maxHoursPerDay: number;
  sessionMinutes: number;
  breakMinutes: number;
  commitments: Commitment[];
}

export interface StudySession {
  id: string;
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicName: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  activity: string;
  status: SessionStatus;
  notes: string;
}

export interface PlannerInput {
  examDate: string;
  subjects: StudySubject[];
  availability: Availability;
  existingSessions: StudySession[];
  now?: Date;
}

export interface PlannerResult {
  sessions: StudySession[];
  warning: string | null;
  daysRemaining: number;
  availableMinutes: number;
  scheduledMinutes: number;
  uncoveredTopics: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_CHUNK = 20;

function dateOnly(value: Date | string): string {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function stableId(date: string, start: number, topicId: string, ordinal: number): string {
  return `plan-${date}-${start}-${topicId}-${ordinal}`;
}

function topicPriority(topic: StudyTopic): number {
  const confidence = topic.confidence === "weak" ? 3 : topic.confidence === "average" ? 1.65 : 0.6;
  const difficulty = clamp(topic.difficulty, 1, 5);
  const importance = clamp(topic.importance, 1, 5);
  const practiceGap = topic.practiceScore === null ? 1.35 : (100 - clamp(topic.practiceScore, 0, 100)) / 100;
  const base = confidence * 2 + difficulty * 0.8 + importance * 0.65 + practiceGap * 2.3;
  return topic.completed ? base * 0.35 : base;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function makeActivity(topic: StudyTopic, index: number, daysLeft: number): string {
  if (daysLeft <= 7 && index % 4 === 3) return "Timed past-paper practice";
  if (daysLeft <= 3 && index % 5 === 4) return "Final mock exam review";
  if (topic.completed) return "Spaced revision";
  if (topic.confidence === "weak" || (topic.practiceScore !== null && topic.practiceScore < 60)) {
    return index % 2 === 0 ? "Guided review + practice questions" : "Active recall and worked examples";
  }
  if (index % 3 === 2) return "Spaced revision";
  if (topic.confidence === "strong" && topic.practiceScore !== null && topic.practiceScore >= 80) {
    return "Exam-style questions";
  }
  return index % 2 === 0 ? "Learn and summarize" : "Practice questions";
}

/**
 * Builds a deterministic plan through the day before the exam.
 *
 * Each available day is carved into free windows after commitments and completed
 * sessions are reserved. The generator chooses the highest-priority unfinished
 * topic, then favors topics that have been scheduled least recently so revision
 * is distributed across the calendar instead of being crammed into one day.
 * Confidence, difficulty, importance, and practice scores all influence priority.
 */
export function generateStudyPlan(input: PlannerInput): PlannerResult {
  const now = input.now ?? new Date();
  const today = dateOnly(now);
  const exam = dateOnly(input.examDate);
  const todayMs = new Date(`${today}T00:00:00`).getTime();
  const examMs = new Date(`${exam}T00:00:00`).getTime();
  const dateIsValid = Number.isFinite(todayMs) && Number.isFinite(examMs);
  const daysRemaining = dateIsValid ? Math.max(0, Math.ceil((examMs - todayMs) / DAY_MS)) : 0;
  const start = parseMinutes(input.availability.startTime);
  const end = parseMinutes(input.availability.endTime);
  const dailyLimit = Math.round(clamp(input.availability.maxHoursPerDay, 0, 24) * 60);
  const sessionLength = Math.round(clamp(input.availability.sessionMinutes, MIN_CHUNK, 240));
  const breakLength = Math.round(clamp(input.availability.breakMinutes, 0, 90));
  const allowedDays = new Set(input.availability.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));
  const preserved = input.existingSessions.filter((session) => session.status === "completed");

  if (!dateIsValid || daysRemaining === 0 || start === null || end === null || end <= start || dailyLimit <= 0 || allowedDays.size === 0) {
    return {
      sessions: [...preserved],
      warning: !dateIsValid
        ? "Enter a valid examination date to generate a plan."
        : daysRemaining === 0
        ? "The exam date is today or has passed. No new sessions can be scheduled."
        : "Add valid study days, hours, and a daily study limit to generate a plan.",
      daysRemaining,
      availableMinutes: 0,
      scheduledMinutes: 0,
      uncoveredTopics: [],
    };
  }

  const topics = input.subjects.flatMap((subject) =>
    subject.topics
      .map((topic) => ({ subject, topic, priority: topicPriority(topic) })),
  );
  if (topics.length === 0) {
    return {
      sessions: [...preserved],
      warning: null,
      daysRemaining,
      availableMinutes: 0,
      scheduledMinutes: 0,
      uncoveredTopics: [],
    };
  }

  const planned: StudySession[] = [];
  const topicScheduledAt = new Map<string, number>();
  const topicCount = new Map<string, number>();
  const completionReservations = preserved.filter((session) => session.date >= today && session.date < exam);
  let availableMinutes = 0;
  let scheduledMinutes = 0;
  let ordinal = 0;

  for (let offset = 0; offset < daysRemaining; offset += 1) {
    const dayDate = new Date(todayMs + offset * DAY_MS);
    const dayKey = dateOnly(dayDate);
    const weekday = dayDate.getDay();
    if (!allowedDays.has(weekday)) continue;

    const effectiveStart = offset === 0
      ? Math.max(start, now.getHours() * 60 + now.getMinutes())
      : start;
    if (effectiveStart >= end) continue;
    const dayCompletions = completionReservations.filter((session) => session.date === dayKey);
    const reservedMinutes = dayCompletions.reduce((sum, session) => sum + session.durationMinutes, 0);
    const dayBudget = Math.max(0, Math.min(dailyLimit - reservedMinutes, end - effectiveStart));
    const freeWindows: Array<[number, number]> = [[effectiveStart, end]];
    const dayCommitments = input.availability.commitments
      .filter((commitment) => commitment.day === weekday)
      .map((commitment) => [parseMinutes(commitment.startTime), parseMinutes(commitment.endTime)] as const)
      .filter((range): range is readonly [number, number] => range[0] !== null && range[1] !== null && range[1] > range[0])
      .concat(dayCompletions.map((session) => [parseMinutes(session.startTime), parseMinutes(session.endTime)] as const)
        .filter((range): range is readonly [number, number] => range[0] !== null && range[1] !== null && range[1] > range[0]));

    const blocked = [...dayCommitments]
      .map(([from, to]) => [Math.max(effectiveStart, from), Math.min(end, to)] as [number, number])
      .filter(([from, to]) => to > from)
      .sort((a, b) => a[0] - b[0]);
    let windows: Array<[number, number]> = freeWindows;
    for (const [blockStart, blockEnd] of blocked) {
      windows = windows.flatMap(([windowStart, windowEnd]) => {
        if (!overlaps(windowStart, windowEnd, blockStart, blockEnd)) return [[windowStart, windowEnd]];
        return [
          ...(blockStart > windowStart ? [[windowStart, blockStart] as [number, number]] : []),
          ...(blockEnd < windowEnd ? [[blockEnd, windowEnd] as [number, number]] : []),
        ];
      });
    }
    const freeMinutes = windows.reduce((sum, [from, to]) => sum + to - from, 0);
    availableMinutes += Math.min(freeMinutes, dayBudget);

    let usedToday = 0;
    for (const [windowStart, windowEnd] of windows) {
      let cursor = windowStart;
      while (cursor + MIN_CHUNK <= windowEnd && usedToday < dayBudget) {
        const remainingWindow = windowEnd - cursor;
        const remainingBudget = dayBudget - usedToday;
        const length = Math.min(sessionLength, remainingWindow, remainingBudget);
        if (length < MIN_CHUNK) break;

        const notCoveredToday = topics.filter(({ topic }) => topicScheduledAt.get(topic.id) !== offset);
        const candidates = (notCoveredToday.length > 0 ? notCoveredToday : topics)
          .map((item) => {
            const lastDay = topicScheduledAt.get(item.topic.id) ?? -Infinity;
            const count = topicCount.get(item.topic.id) ?? 0;
            const sinceLast = offset - lastDay;
            // A gentle cooldown spreads repetitions over time where the deadline allows it.
            const spacingBoost = Math.min(2, Math.max(0, sinceLast - 1) * 0.15);
            const scheduledPenalty = count * 0.12;
            return { ...item, score: item.priority + spacingBoost - scheduledPenalty };
          })
          .sort((a, b) => b.score - a.score || a.topic.name.localeCompare(b.topic.name));

        const chosen = candidates[0];
        if (!chosen) break;
        ordinal += 1;
        const count = topicCount.get(chosen.topic.id) ?? 0;
        const session: StudySession = {
          id: stableId(dayKey, cursor, chosen.topic.id, ordinal),
          subjectId: chosen.subject.id,
          subjectName: chosen.subject.name,
          topicId: chosen.topic.id,
          topicName: chosen.topic.name,
          date: dayKey,
          startTime: formatTime(cursor),
          endTime: formatTime(cursor + length),
          durationMinutes: length,
          activity: makeActivity(chosen.topic, count, daysRemaining - offset),
          status: "planned",
          notes: "",
        };
        planned.push(session);
        scheduledMinutes += length;
        usedToday += length;
        topicScheduledAt.set(chosen.topic.id, offset);
        topicCount.set(chosen.topic.id, count + 1);
        cursor += length + breakLength;
      }
    }
  }

  const scheduledTopicIds = new Set([...topicScheduledAt.keys()]);
  const uncoveredTopics = topics
    .filter(({ topic }) => !topic.completed && !scheduledTopicIds.has(topic.id))
    .map(({ subject, topic }) => `${subject.name}: ${topic.name}`);
  const warning = uncoveredTopics.length > 0
    ? `There isn't enough available time to schedule every topic. ${uncoveredTopics.length} topic${uncoveredTopics.length === 1 ? " is" : "s are"} not covered: ${uncoveredTopics.join(", ")}.`
    : null;

  return {
    sessions: [...preserved, ...planned].sort((a, b) =>
      a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
    ),
    warning,
    daysRemaining,
    availableMinutes,
    scheduledMinutes,
    uncoveredTopics,
  };
}

export function rescheduleMissedSessions(
  sessions: StudySession[],
  input: Omit<PlannerInput, "existingSessions">,
): PlannerResult {
  // Rescheduling rebuilds only the unfinished portion of the plan. Completed
  // work remains as a record; skipped and past-due work is reconsidered through
  // its still-incomplete topic instead of being copied into a potentially
  // overlapping time slot.
  return generateStudyPlan({
    ...input,
    existingSessions: sessions.filter((session) => session.status === "completed"),
  });
}

/**
 * Validates a manually added or edited planned session against the same exam,
 * availability, commitment, overlap, break, and daily-cap rules as generation.
 * Completed and skipped entries remain historical records and are not rejected
 * for being outside the current plan.
 */
export function validateSessionPlacement(
  candidate: StudySession,
  existingSessions: StudySession[],
  examDate: string,
  availability: Availability,
): string | null {
  if (candidate.status !== "planned") return null;
  const candidateDate = new Date(`${candidate.date}T00:00:00`);
  const exam = new Date(`${examDate}T00:00:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(candidate.date) ||
    !Number.isFinite(candidateDate.getTime()) ||
    dateOnly(candidateDate) !== candidate.date
  ) {
    return "Choose a valid session date.";
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(examDate) ||
    !Number.isFinite(exam.getTime()) ||
    dateOnly(exam) !== examDate
  ) {
    return "Add a valid exam date before scheduling sessions.";
  }
  if (candidate.date >= examDate) return "Study sessions must finish before exam day.";
  if (candidate.date < dateOnly(new Date())) return "Planned sessions need to be today or a future date.";

  const start = parseMinutes(candidate.startTime);
  const end = parseMinutes(candidate.endTime);
  if (start === null || end === null || end <= start || end - start !== candidate.durationMinutes) {
    return "Check the session start time, end time, and duration.";
  }

  const weekday = candidateDate.getDay();
  if (!availability.days.includes(weekday)) {
    return "Choose one of your selected study days.";
  }
  const windowStart = parseMinutes(availability.startTime);
  const windowEnd = parseMinutes(availability.endTime);
  if (windowStart === null || windowEnd === null || end <= windowStart || start < windowStart || end > windowEnd) {
    return "Keep the session inside your available study hours.";
  }

  const commitment = availability.commitments.find((item) => {
    if (item.day !== weekday) return false;
    const blockedStart = parseMinutes(item.startTime);
    const blockedEnd = parseMinutes(item.endTime);
    return blockedStart !== null && blockedEnd !== null && blockedEnd > blockedStart &&
      overlaps(start, end, blockedStart, blockedEnd);
  });
  if (commitment) return `This overlaps with ${commitment.label || "an existing commitment"}.`;

  const sameDay = existingSessions.filter((session) =>
    session.id !== candidate.id && session.date === candidate.date && session.status !== "skipped",
  );
  const conflict = sameDay.find((session) => {
    const otherStart = parseMinutes(session.startTime);
    const otherEnd = parseMinutes(session.endTime);
    return otherStart !== null && otherEnd !== null && overlaps(start, end, otherStart, otherEnd);
  });
  if (conflict) return `This overlaps with ${conflict.topicName} at ${conflict.startTime}.`;

  const breakMinutes = Math.max(0, clamp(availability.breakMinutes, 0, 90));
  if (breakMinutes > 0) {
    const tooClose = sameDay.find((session) => {
      const otherStart = parseMinutes(session.startTime);
      const otherEnd = parseMinutes(session.endTime);
      if (otherStart === null || otherEnd === null) return false;
      return end <= otherStart
        ? otherStart - end < breakMinutes
        : start >= otherEnd && start - otherEnd < breakMinutes;
    });
    if (tooClose) return `Leave a ${breakMinutes}-minute break between study sessions.`;
  }

  const plannedMinutes = sameDay.reduce((sum, session) => sum + session.durationMinutes, candidate.durationMinutes);
  if (plannedMinutes > clamp(availability.maxHoursPerDay, 0, 24) * 60) {
    return "This would exceed your daily study-hour limit.";
  }
  return null;
}
