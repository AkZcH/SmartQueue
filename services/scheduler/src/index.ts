import { Pool } from "pg";
import { PriorityQueue } from "./queue";
import { Dispatcher } from "./dispatcher";

const SCHEDULER_ID = `scheduler-${process.env.HOSTNAME || require("os").hostname()}`;
const ADVISORY_LOCK_KEY = 12345;
const ELECTION_INTERVAL = 2000; // retry election every 2s
const HEARTBEAT_INTERVAL = 5000; // heartbeat every 5s
const DISPATCH_INTERVAL = 2000; // dispatch loop every 2s

const pool = new Pool({
  connectionString:
    process.env.DB_URL || "postgresql://sq:anything@127.0.0.1:5433/smartqueue",
});

const queue = new PriorityQueue();
const dispatcher = new Dispatcher(queue);

let isLeader = false;
let leaderClient: any = null; // holds the dedicated connection for advisory lock

async function tryBecomeLeader(): Promise<boolean> {
  try {
    // Advisory lock must be held on a single dedicated connection
    // If the connection dies, PostgreSQL auto-releases the lock
    if (!leaderClient) {
      leaderClient = await pool.connect();
    }
    const res = await leaderClient.query(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [ADVISORY_LOCK_KEY],
    );
    return res.rows[0].acquired === true;
  } catch (err) {
    console.error("[Election] Failed to try advisory lock:", err);
    leaderClient = null;
    return false;
  }
}

async function releaseLeader(): Promise<void> {
  if (leaderClient) {
    try {
      await leaderClient.query("SELECT pg_advisory_unlock($1)", [
        ADVISORY_LOCK_KEY,
      ]);
      leaderClient.release();
    } catch {}
    leaderClient = null;
  }
}

async function updateLeaderRegistry(): Promise<void> {
  try {
    await pool.query(
      `
      INSERT INTO scheduler_leader (id, worker_id, elected_at, last_seen)
      VALUES (1, $1, now(), now())
      ON CONFLICT (id) DO UPDATE
        SET worker_id = $1,
            last_seen = now(),
            elected_at = CASE
              WHEN scheduler_leader.worker_id != $1 THEN now()
              ELSE scheduler_leader.elected_at
            END
    `,
      [SCHEDULER_ID],
    );
  } catch (err) {
    console.error("[Leader] Failed to update registry:", err);
  }
}

async function dispatchLoop(): Promise<void> {
  try {
    await dispatcher.loadNewJobs();
    const size = queue.size();
    if (size > 0) {
      const top = queue.peek()!;
      console.log(
        `[Leader] Queue size: ${size} | Top: ${top.name} (priority: ${top.priority.toFixed(3)})`,
      );
    }
  } catch (err) {
    console.error("[Leader] Dispatch error:", err);
  }
}

async function main(): Promise<void> {
  console.log(`[Scheduler] ${SCHEDULER_ID} starting...`);

  // Election loop — runs on all instances
  setInterval(async () => {
    if (isLeader) return; // already leader, skip

    const acquired = await tryBecomeLeader();
    if (acquired) {
      isLeader = true;
      console.log(`[Election] ${SCHEDULER_ID} became LEADER`);
      await updateLeaderRegistry();
    } else {
      console.log(`[Standby] ${SCHEDULER_ID} waiting for leadership...`);
    }
  }, ELECTION_INTERVAL);

  // Heartbeat loop — only runs if leader
  setInterval(async () => {
    if (!isLeader) return;
    await updateLeaderRegistry();
  }, HEARTBEAT_INTERVAL);

  // Dispatch loop — only runs if leader
  setInterval(async () => {
    if (!isLeader) return;
    await dispatchLoop();
  }, DISPATCH_INTERVAL);

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log(`[Scheduler] ${SCHEDULER_ID} shutting down...`);
    isLeader = false;
    await releaseLeader();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log(`[Scheduler] ${SCHEDULER_ID} shutting down...`);
    isLeader = false;
    await releaseLeader();
    process.exit(0);
  });
}

main().catch(console.error);
