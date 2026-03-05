import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";

export const JOB_NAMES = {
  RESOLVE_SITUATIONS: "resolve-situations",
  DECAY_SEVERITY: "decay-severity",
  SYNC_WIKIPEDIA: "sync-wikipedia",
  SYNC_RELIEFWEB: "sync-reliefweb",
  SYNC_ADVISORIES: "sync-advisories",
  SITUATION_AUDIT: "situation-audit",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

interface JobSchedule {
  name: JobName;
  every: number; // ms
}

export const JOB_SCHEDULES: JobSchedule[] = [
  { name: JOB_NAMES.RESOLVE_SITUATIONS, every: 60 * 60 * 1000 },       // 1h
  { name: JOB_NAMES.DECAY_SEVERITY, every: 60 * 60 * 1000 },           // 1h
  { name: JOB_NAMES.SYNC_WIKIPEDIA, every: 24 * 60 * 60 * 1000 },      // 24h
  { name: JOB_NAMES.SYNC_RELIEFWEB, every: 6 * 60 * 60 * 1000 },       // 6h
  { name: JOB_NAMES.SYNC_ADVISORIES, every: 12 * 60 * 60 * 1000 },     // 12h
  { name: JOB_NAMES.SITUATION_AUDIT, every: 6 * 60 * 60 * 1000 },       // 6h
];

const QUEUE_NAME = "collector-jobs";

export function createJobQueue(connection: ConnectionOptions): Queue {
  return new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
}

export function createJobWorker(
  connection: ConnectionOptions,
  handler: (job: Job) => Promise<void>,
): Worker {
  return new Worker(QUEUE_NAME, handler, {
    connection,
    concurrency: 1,
  });
}

export async function registerRepeatableJobs(
  queue: Queue,
  enableAdvisories: boolean,
): Promise<void> {
  for (const schedule of JOB_SCHEDULES) {
    if (schedule.name === JOB_NAMES.SYNC_ADVISORIES && !enableAdvisories) {
      continue;
    }

    await queue.add(schedule.name, {}, {
      repeat: { every: schedule.every },
    });
  }
}

export async function runAllJobsImmediately(
  queue: Queue,
  enableAdvisories: boolean,
): Promise<void> {
  for (const schedule of JOB_SCHEDULES) {
    if (schedule.name === JOB_NAMES.SYNC_ADVISORIES && !enableAdvisories) {
      continue;
    }

    await queue.add(schedule.name, {});
  }
}
