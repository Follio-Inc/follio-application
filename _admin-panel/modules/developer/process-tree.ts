import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';

/**
 * Stopping a spawned test runner and everything it started
 * (PLATFORM_TODO item 15).
 *
 * Lives beside `guard.ts` because both runners need it: the Vitest runner in
 * `platform/tests/runner.ts` and the Live QA runner in `live-qa/runner.ts`.
 * Platform code already imports the gate from this directory, so the dependency
 * runs the same way round and there is one implementation rather than two.
 *
 * Why a tree and not `child.kill()`. Neither runner is a single process.
 * Vitest's default pool forks a worker per file, and Playwright launches a
 * browser — each a child of the child. On Windows there are no process groups
 * and `child.kill()` terminates only the process we hold, leaving the workers
 * and the browser running and the port they hold open. So:
 *
 * - **Windows**: `taskkill /PID <pid> /T /F`, which walks the tree. `taskkill`
 *   ships with Windows, so this adds no dependency.
 * - **Everything else**: the child is spawned into its own process group
 *   (`detached`), and a signal to the negative pid reaches that group — *and*
 *   the real parent/child tree is read from `ps` and signalled pid by pid,
 *   because a group is not a tree. `detached` works by calling `setsid()`, so
 *   any descendant spawned detached in turn leaves the child's group for one
 *   of its own, and the group signal never reaches it. Playwright's browser
 *   launcher and a re-forked worker both do this. Without the tree walk such a
 *   descendant survives the cancel and keeps holding its port.
 *
 * No pid ever leaves the server. The browser cancels a run by its opaque run
 * id; the id is matched against the owned run, and the pid is read from the
 * `ChildProcess` object this module was handed.
 */

/**
 * A way to stop one owned execution, with no pid and no command in sight.
 *
 * The seam between the registry that owns the lock and the runner that owns the
 * child: the runner hands one of these over when its child exists, and the
 * registry can then stop that child and nothing else.
 */
export type ProcessControl = {
  /** Terminates the child and its descendants. Rejects if it cannot. */
  stop: () => Promise<void>;
};

/** How long a POSIX group gets to exit on SIGTERM before SIGKILL. */
const SIGKILL_GRACE_MS = 3_000;

/**
 * Spawn options that make a child killable as a tree.
 *
 * `detached` only on POSIX: there it creates the process group the group kill
 * needs, and on Windows it would open a console window for a process that has
 * no business having one — `taskkill /T` walks the tree there regardless.
 */
export function treeKillableSpawnOptions(
  platform: NodeJS.Platform = process.platform
): Pick<SpawnOptions, 'detached' | 'windowsHide'> {
  return { detached: platform !== 'win32', windowsHide: true };
}

/** True once the child has exited, by either route. */
function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function taskkill(pid: number, spawner: typeof spawn): Promise<void> {
  return new Promise((resolve, reject) => {
    const killer = spawner('taskkill', ['/pid', String(pid), '/t', '/f'], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    killer.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    killer.on('error', (error) => {
      reject(new Error(`taskkill could not run: ${error.message}`));
    });

    killer.on('close', (code) => {
      // A process that has already gone is the outcome that was asked for, not
      // a failure: taskkill exits non-zero and says so when the pid is gone.
      if (code === 0 || /not found|no running instance/i.test(stderr)) {
        resolve();
        return;
      }
      reject(new Error(`taskkill exited ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

function killGroup(pid: number, signal: NodeJS.Signals, kill = process.kill): void {
  // The negative pid is the group, which is why the child is spawned detached.
  kill(-pid, signal);
}

/**
 * Every descendant of `pid`, deepest first, from a `ps -A -o pid=,ppid=` table.
 *
 * Pure so the parsing and the walk can be asserted without a process tree:
 * `killProcessTree` supplies the real table.
 */
export function descendantsFromProcessTable(table: string, pid: number): number[] {
  const childrenOf = new Map<number, number[]>();

  for (const line of table.split('\n')) {
    const row = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!row) continue;

    const child = Number(row[1]);
    const parent = Number(row[2]);
    // A process is not its own child; `ps` reports ppid 0 for the roots, and
    // treating that as an edge would make every root a descendant of pid 0.
    if (child === parent) continue;

    const siblings = childrenOf.get(parent);
    if (siblings) siblings.push(child);
    else childrenOf.set(parent, [child]);
  }

  // Breadth-first from the child. `seen` carries the root so a table captured
  // while processes were exiting cannot send the walk round a cycle.
  const seen = new Set<number>([pid]);
  const found: number[] = [];
  const queue: number[] = [pid];

  while (queue.length > 0) {
    const current = queue.shift() as number;
    for (const child of childrenOf.get(current) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      found.push(child);
      queue.push(child);
    }
  }

  // Deepest first, so a process cannot outlive the signal by being handed a
  // replacement child from a parent that has not been signalled yet.
  return found.reverse();
}

/**
 * The process table, or an empty string when it cannot be read.
 *
 * `ps -A -o pid=,ppid=` is the one spelling POSIX, Linux procps and BSD/macOS
 * all accept. A missing or refusing `ps` is not a failure: the group signal
 * below still runs, so the tree walk only ever adds reach, never removes it.
 */
function readProcessTable(spawner: typeof spawn): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (table: string) => {
      if (settled) return;
      settled = true;
      resolve(table);
    };

    try {
      const ps = spawner('ps', ['-A', '-o', 'pid=,ppid='], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      let out = '';
      ps.stdout?.on('data', (chunk: Buffer) => {
        out += chunk.toString('utf8');
      });
      ps.on('error', () => finish(''));
      ps.on('close', () => finish(out));
    } catch {
      finish('');
    }
  });
}

/**
 * Signals each pid, ignoring the ones already gone.
 *
 * The pids come from a table read moments earlier, so one may have exited
 * since. `ESRCH` is then the outcome that was asked for. (A pid could in
 * principle have been reused by then; that window is sub-second and wrapping
 * the pid space inside it is not a reachable state for a cancel.)
 */
function signalEach(pids: readonly number[], signal: NodeJS.Signals, kill: typeof process.kill) {
  for (const target of pids) {
    try {
      kill(target, signal);
    } catch {
      // Already gone, or not ours to signal. Nothing to do either way.
    }
  }
}

/**
 * Terminates a spawned child and every process it started.
 *
 * Resolves when the kill has been issued and accepted; rejects when the
 * platform refused it, which is what lets a cancel report `cancel-failed`
 * rather than claim a process died that is still running.
 *
 * The injectable arguments are the platform, the spawner and the signaller, so
 * a test can assert the Windows and POSIX behaviour from either host without
 * starting a real process tree.
 */
export async function killProcessTree(
  child: ChildProcess,
  {
    platform = process.platform,
    spawner = spawn,
    kill = process.kill,
    graceMs = SIGKILL_GRACE_MS,
    readTree = readProcessTable,
  }: {
    platform?: NodeJS.Platform;
    spawner?: typeof spawn;
    kill?: typeof process.kill;
    graceMs?: number;
    /** The POSIX process table, injectable so a test needs no real tree. */
    readTree?: (spawner: typeof spawn) => Promise<string>;
  } = {}
): Promise<void> {
  const pid = child.pid;

  // No pid means the spawn itself failed, and an exited child needs nothing.
  if (pid === undefined || hasExited(child)) return;

  if (platform === 'win32') {
    await taskkill(pid, spawner);
    return;
  }

  // Read the tree *before* anything is signalled. Once the child dies its own
  // children are reparented to init, and the ppid links that identify them as
  // this run's processes are gone with it.
  const descendants = descendantsFromProcessTable(await readTree(spawner), pid);

  let groupLeader = true;
  try {
    killGroup(pid, 'SIGTERM', kill);
  } catch {
    // Not a group leader after all — the child alone is better than nothing.
    groupLeader = false;
    child.kill('SIGTERM');
  }

  // The descendants that stayed in the group have already had the signal; the
  // ones that called `setsid()` are reached only here, and signalling a
  // process twice costs nothing.
  signalEach(descendants, 'SIGTERM', kill);

  // Escalate whatever is still there. The timer is unref'd so a pending
  // escalation can never hold the server process open.
  const escalation = setTimeout(() => {
    // A descendant in its own session outlives the child, so its escalation
    // cannot be conditioned on the child having exited.
    signalEach(descendants, 'SIGKILL', kill);

    if (hasExited(child)) return;
    try {
      if (groupLeader) killGroup(pid, 'SIGKILL', kill);
      else child.kill('SIGKILL');
    } catch {
      // Already gone between the check and the signal.
    }
  }, graceMs);
  escalation.unref?.();
}
