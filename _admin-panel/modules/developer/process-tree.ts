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
 *   (`detached`), and a signal to the negative pid reaches the whole group.
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
  }: {
    platform?: NodeJS.Platform;
    spawner?: typeof spawn;
    kill?: typeof process.kill;
    graceMs?: number;
  } = {}
): Promise<void> {
  const pid = child.pid;

  // No pid means the spawn itself failed, and an exited child needs nothing.
  if (pid === undefined || hasExited(child)) return;

  if (platform === 'win32') {
    await taskkill(pid, spawner);
    return;
  }

  try {
    killGroup(pid, 'SIGTERM', kill);
  } catch {
    // Not a group leader after all — the child alone is better than nothing.
    child.kill('SIGTERM');
    return;
  }

  // Escalate only if the group is still there. The timer is unref'd so a
  // pending escalation can never hold the server process open.
  const escalation = setTimeout(() => {
    if (hasExited(child)) return;
    try {
      killGroup(pid, 'SIGKILL', kill);
    } catch {
      // Already gone between the check and the signal.
    }
  }, graceMs);
  escalation.unref?.();
}
