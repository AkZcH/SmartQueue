import { Pool, Client } from "pg";
import { PriorityQueue, Job } from "./queue";

const DB_URL =
  process.env.DB_URL || "postgresql://sq:anything@127.0.0.1:5433/smartqueue";

const pool = new Pool({ connectionString: DB_URL });

export class Dispatcher {
  private queue: PriorityQueue;
  private prevSize: number = 0;
  private listenClient: Client | null = null;

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
        `[Dispatcher] ${newSize - this.prevSize} new job(s). Queue size: ${newSize}`,
      );
    }
    this.prevSize = newSize;
  }

  async startListening() {
    // Dedicated client for LISTEN — pool connections can't hold listeners
    this.listenClient = new Client({ connectionString: DB_URL });
    await this.listenClient.connect();

    await this.listenClient.query("LISTEN new_job");
    console.log("[Dispatcher] Listening for new_job notifications...");

    this.listenClient.on("notification", async (msg) => {
      console.log(
        `[Dispatcher] NOTIFY received — job ${msg.payload} — rebuilding heap`,
      );
      await this.loadNewJobs();
    });

    this.listenClient.on("error", (err) => {
      console.error("[Dispatcher] Listen client error:", err);
      this.listenClient = null;
      // Reconnect after 2s
      setTimeout(() => this.startListening(), 2000);
    });
  }

  async stopListening() {
    if (this.listenClient) {
      await this.listenClient.end();
      this.listenClient = null;
    }
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
