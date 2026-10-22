# StudyMate

StudyMate is a personal study planner. It keeps a learner's profile, exam date,
subjects, topics, availability, timetable, practice results, and progress in
browser localStorage. It does not require an account, paid AI service, or
third-party API.

## Scheduling rules

The timetable generator is deterministic: the same inputs and current date
produce the same plan.

For each topic, the generator calculates a priority from:

- Confidence: weak = 3, average = 1.65, strong = 0.6; multiplied by 2.
- Difficulty: a 1–5 rating multiplied by 0.8.
- Importance: a 1–5 rating multiplied by 0.65.
- Practice gap: unknown scores use 1.35; otherwise `(100 - score) / 100`,
  multiplied by 2.3.
- Topics marked complete receive 35% of their normal priority, so they can
  still appear as spaced-revision sessions.

The scheduler visits the learner's selected days up to—but not including—the
exam date. It limits each day to the chosen study window and daily hour cap,
subtracts existing commitments, preserves and reserves completed sessions, and
inserts the configured break between generated sessions. It schedules each
available topic once per day before repeating topics. The highest-priority
topics are favored; less recently scheduled topics get a small spacing boost,
while repeated topics get a small penalty. Weak or low-scoring topics receive
practice and active-recall activities. Past-paper and mock-exam activities are
included near the exam.

Regenerating the remaining plan keeps completed sessions and rebuilds the
unfinished schedule. Rescheduling missed work also rebuilds the unfinished
schedule so missed topics can be allocated into available time without copying
sessions into possibly overlapping time slots. When an incomplete topic cannot
be allocated at least one session before the exam, the app lists it in a warning.
The timetable is a planning estimate, not a guarantee of exam performance.

## Data and backups

StudyMate saves data in localStorage in the current browser. It does not
synchronize between devices, and browser data can be lost if site data is
cleared. Use Settings to download a JSON backup or restore one. Imported data
must match the supported StudyMate backup format. There is no fake sign-in and
local browser storage is not a secure multi-user account system.

## Run and check

- `pnpm --filter @workspace/studymate run dev` starts the app.
- `pnpm --filter @workspace/studymate test` runs the scheduler and storage tests.
- `pnpm --filter @workspace/studymate run typecheck` checks TypeScript.
