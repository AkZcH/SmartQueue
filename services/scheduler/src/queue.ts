export interface Job {
  id: string;
  name: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  created_at: string;
}

export class PriorityQueue {
  private heap: Job[] = [];

  private parent(i: number) {
    return Math.floor((i - 1) / 2);
  }
  private left(i: number) {
    return 2 * i + 1;
  }
  private right(i: number) {
    return 2 * i + 2;
  }

  private swap(i: number, j: number) {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }

  private bubbleUp(i: number) {
    while (
      i > 0 &&
      this.heap[i].priority > this.heap[this.parent(i)].priority
    ) {
      this.swap(i, this.parent(i));
      i = this.parent(i);
    }
  }

  private bubbleDown(i: number) {
    let max = i;
    const l = this.left(i),
      r = this.right(i);
    if (l < this.heap.length && this.heap[l].priority > this.heap[max].priority)
      max = l;
    if (r < this.heap.length && this.heap[r].priority > this.heap[max].priority)
      max = r;
    if (max !== i) {
      this.swap(i, max);
      this.bubbleDown(max);
    }
  }

  push(job: Job) {
    this.heap.push(job);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): Job | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  peek(): Job | undefined {
    return this.heap[0];
  }
  size(): number {
    return this.heap.length;
  }

  rebuildFrom(jobs: Job[]) {
    this.heap = [];
    for (const job of jobs) {
      this.heap.push(job);
    }
    for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
      this.bubbleDown(i);
    }
  }
}
