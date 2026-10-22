import type { Availability, StudySession, StudySubject } from "./planner";

export const STUDYMATE_STORAGE_KEY = "studymate-state-v1";
export const STUDYMATE_DATA_VERSION = 1 as const;

export interface LearnerProfile {
  name: string;
  examName: string;
  examDate: string;
}

export interface StudyMateState {
  version: typeof STUDYMATE_DATA_VERSION;
  profile: LearnerProfile;
  subjects: StudySubject[];
  availability: Availability;
  sessions: StudySession[];
  onboardingComplete: boolean;
}

export const DEFAULT_AVAILABILITY: Availability = {
  days: [1, 2, 3, 4, 5, 6],
  startTime: "16:00",
  endTime: "20:00",
  maxHoursPerDay: 2,
  sessionMinutes: 45,
  breakMinutes: 10,
  commitments: [],
};

export const EMPTY_STUDYMATE_STATE: StudyMateState = {
  version: STUDYMATE_DATA_VERSION,
  profile: { name: "", examName: "", examDate: "" },
  subjects: [],
  availability: DEFAULT_AVAILABILITY,
  sessions: [],
  onboardingComplete: false,
};

export type StoredStateResult =
  | { state: StudyMateState; error: null }
  | { state: null; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): value is string {
  return typeof value === "string";
}

function validConfidence(value: unknown): value is "weak" | "average" | "strong" {
  return value === "weak" || value === "average" || value === "strong";
}

function validStatus(value: unknown): value is "planned" | "completed" | "skipped" {
  return value === "planned" || value === "completed" || value === "skipped";
}

function isValidTopic(value: unknown): boolean {
  if (!isObject(value)) return false;
  return stringValue(value.id) &&
    stringValue(value.name) &&
    validConfidence(value.confidence) &&
    typeof value.difficulty === "number" &&
    Number.isFinite(value.difficulty) &&
    typeof value.importance === "number" &&
    Number.isFinite(value.importance) &&
    (value.practiceScore === null ||
      (typeof value.practiceScore === "number" && Number.isFinite(value.practiceScore))) &&
    typeof value.completed === "boolean" &&
    stringValue(value.notes) &&
    (value.lastStudied === undefined || stringValue(value.lastStudied));
}

function isValidSubject(value: unknown): value is StudySubject {
  return isObject(value) &&
    stringValue(value.id) &&
    stringValue(value.name) &&
    (value.color === undefined || stringValue(value.color)) &&
    Array.isArray(value.topics) &&
    value.topics.every(isValidTopic);
}

function isValidAvailability(value: unknown): value is Availability {
  return isObject(value) &&
    Array.isArray(value.days) &&
    value.days.every((day) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6) &&
    stringValue(value.startTime) &&
    stringValue(value.endTime) &&
    typeof value.maxHoursPerDay === "number" &&
    Number.isFinite(value.maxHoursPerDay) &&
    typeof value.sessionMinutes === "number" &&
    Number.isFinite(value.sessionMinutes) &&
    typeof value.breakMinutes === "number" &&
    Number.isFinite(value.breakMinutes) &&
    Array.isArray(value.commitments) &&
    value.commitments.every((commitment) =>
      isObject(commitment) &&
      Number.isInteger(commitment.day) &&
      Number(commitment.day) >= 0 &&
      Number(commitment.day) <= 6 &&
      stringValue(commitment.startTime) &&
      stringValue(commitment.endTime) &&
      (commitment.label === undefined || stringValue(commitment.label)),
    );
}

function isValidSession(value: unknown): value is StudySession {
  return isObject(value) &&
    stringValue(value.id) &&
    stringValue(value.subjectId) &&
    stringValue(value.subjectName) &&
    stringValue(value.topicId) &&
    stringValue(value.topicName) &&
    stringValue(value.date) &&
    stringValue(value.startTime) &&
    stringValue(value.endTime) &&
    typeof value.durationMinutes === "number" &&
    Number.isFinite(value.durationMinutes) &&
    stringValue(value.activity) &&
    validStatus(value.status) &&
    stringValue(value.notes);
}

export function validateStudyMateState(value: unknown): StudyMateState | null {
  if (
    !isObject(value) ||
    value.version !== STUDYMATE_DATA_VERSION ||
    !isObject(value.profile) ||
    !stringValue(value.profile.name) ||
    !stringValue(value.profile.examName) ||
    !stringValue(value.profile.examDate) ||
    !Array.isArray(value.subjects) ||
    !value.subjects.every(isValidSubject) ||
    !isValidAvailability(value.availability) ||
    !Array.isArray(value.sessions) ||
    !value.sessions.every(isValidSession) ||
    typeof value.onboardingComplete !== "boolean"
  ) {
    return null;
  }
  return value as unknown as StudyMateState;
}

function browserStorage(): Storage {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("Browser storage is not available in this environment.");
  }
  return window.localStorage;
}

export function readStudyMateState(storage?: Storage): StoredStateResult {
  try {
    const raw = (storage ?? browserStorage()).getItem(STUDYMATE_STORAGE_KEY);
    if (raw === null) return { state: EMPTY_STUDYMATE_STATE, error: null };
    const parsed: unknown = JSON.parse(raw);
    const state = validateStudyMateState(parsed);
    if (!state) {
      return {
        state: null,
        error: "Saved StudyMate data is damaged or from an unsupported version. Your original browser data is still untouched; import a backup or start with a fresh plan.",
      };
    }
    return { state, error: null };
  } catch (error) {
    return {
      state: null,
      error: error instanceof Error
        ? `Could not read saved StudyMate data: ${error.message}`
        : "Could not read saved StudyMate data.",
    };
  }
}

export function saveStudyMateState(state: StudyMateState, storage?: Storage): string | null {
  const validated = validateStudyMateState(state);
  if (!validated) return "StudyMate couldn't save this data because it is incomplete or invalid.";
  try {
    (storage ?? browserStorage()).setItem(STUDYMATE_STORAGE_KEY, JSON.stringify(validated));
    return null;
  } catch (error) {
    return error instanceof Error
      ? `Could not save to this browser: ${error.message}`
      : "Could not save to this browser.";
  }
}

export function exportStudyMateState(state: StudyMateState): string {
  const validated = validateStudyMateState(state);
  if (!validated) throw new Error("StudyMate data is incomplete or invalid and cannot be exported.");
  return JSON.stringify(validated, null, 2);
}

export function importStudyMateState(json: string): StudyMateState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error("This file isn't valid JSON. Choose a StudyMate backup file.");
  }
  const validated = validateStudyMateState(parsed);
  if (!validated) {
    throw new Error("This file doesn't contain a supported StudyMate backup.");
  }
  return validated;
}
