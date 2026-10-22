import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_STUDYMATE_STATE,
  STUDYMATE_STORAGE_KEY,
  exportStudyMateState,
  importStudyMateState,
  readStudyMateState,
  saveStudyMateState,
} from "./storage.ts";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test("app state survives save and read", () => {
  const storage = memoryStorage();
  const state = {
    ...EMPTY_STUDYMATE_STATE,
    profile: { name: "Amina", examName: "Finals", examDate: "2026-11-20" },
    onboardingComplete: true,
    subjects: [{
      id: "biology",
      name: "Biology",
      topics: [{
        id: "cells",
        name: "Cells",
        confidence: "weak" as const,
        difficulty: 4,
        importance: 5,
        practiceScore: 48,
        completed: false,
        notes: "Revise diagrams",
      }],
    }],
  };

  assert.equal(saveStudyMateState(state, storage), null);
  assert.deepEqual(readStudyMateState(storage), { state, error: null });
  assert.ok(storage.getItem(STUDYMATE_STORAGE_KEY));
});

test("JSON export and import preserve the complete state", () => {
  const state = {
    ...EMPTY_STUDYMATE_STATE,
    profile: { name: "Amina", examName: "Finals", examDate: "2026-11-20" },
    onboardingComplete: true,
  };
  assert.deepEqual(importStudyMateState(exportStudyMateState(state)), state);
});

test("invalid JSON and unsupported files produce actionable errors", () => {
  assert.throws(() => importStudyMateState("{"), /valid JSON/i);
  assert.throws(() => importStudyMateState(JSON.stringify({ version: 99 })), /supported StudyMate backup/i);
});

test("corrupted local data is reported and left untouched", () => {
  const damaged = "{bad";
  const storage = memoryStorage({ [STUDYMATE_STORAGE_KEY]: damaged });
  const result = readStudyMateState(storage);
  assert.equal(result.state, null);
  assert.match(result.error ?? "", /read saved StudyMate data/i);
  assert.equal(storage.getItem(STUDYMATE_STORAGE_KEY), damaged);
});
