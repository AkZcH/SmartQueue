import { PriorityQueue } from "./queue";
import { Dispatcher } from "./dispatcher";

const queue = new PriorityQueue();
const dispatcher = new Dispatcher(queue);

async function schedulerLoop() {
  console.log("[Scheduler] Starting...");

  setInterval(async () => {
    await dispatcher.loadNewJobs();
    const size = queue.size();
    if (size > 0) {
      const top = queue.peek()!;
      console.log(
        `[Scheduler] Queue size: ${size} | Top job: ${top.name} (priority: ${top.priority})`,
      );
    }
  }, 2000);
}

schedulerLoop().catch(console.error);
