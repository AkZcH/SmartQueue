import { Pool } from "pg";
import { PriorityQueue, Job } from "./queue";

const pool = new Pool({
  connectionString:
    process.env.DB_URL || "postgresql://sq:anything@127.0.0.1:5433/smartqueue",
});

export class Dispatcher {
  private queue: PriorityQueue;
  private prevSize: number = 0;

  constructor(queue: PriorityQueue) {
    this.queue = queue;
  }

  async loadNewJobs() {
    const res = await pool.query<Job>(
      `SELECT id, name, type, payload, priority, created_at
       FROM jobs WHERE status = 'queued'
       ORDER BY priority DESC, created_at ASC`,
    );

    this.queue.rebuildFrom(res.rows);

    const newSize = this.queue.size();
    if (newSize > this.prevSize) {
      console.log(
        `[Dispatcher] ${newSize - this.prevSize} new job(s) added. Queue size: ${newSize}`,
      );
    }
    this.prevSize = newSize;
  }

  async updatePriority(jobId: string, priority: number) {
    await pool.query("UPDATE jobs SET priority = $1 WHERE id = $2", [
      priority,
      jobId,
    ]);
  }

  getQueue(): PriorityQueue {
    return this.queue;
  }
}
