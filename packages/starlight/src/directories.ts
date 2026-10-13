import { mkdir, writeFile, readFile, rename, rm } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

async function waitForDirectoryChange(
  directory: string,
  signal?: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const watcher = watch(directory, () => finish());
    watcher.once("error", finish);
    const timer = setTimeout(() => finish(), 100);
    const aborted = () => finish(signal?.reason);
    function finish(error?: unknown): void {
      clearTimeout(timer);
      watcher.close();
      signal?.removeEventListener("abort", aborted);
      if (error) reject(error);
      else resolve();
    }
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}

export async function promoteDirectory(
  staging: string,
  target: string,
  signal?: AbortSignal,
): Promise<void> {
  const lock = target + ".lock";
  const candidate = lock + "-" + randomUUID();
  await mkdir(candidate, { recursive: true });
  await writeFile(
    path.join(candidate, "owner.json"),
    JSON.stringify({ pid: process.pid }),
  );
  const deadline = Date.now() + 60000;
  let acquired = false;
  try {
    while (!acquired) {
      signal?.throwIfAborted();
      try {
        await rename(candidate, lock);
        acquired = true;
      } catch (error) {
        if (
          !["EEXIST", "ENOTEMPTY"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        )
          throw error;
        try {
          const owner = JSON.parse(
            await readFile(path.join(lock, "owner.json"), "utf8"),
          ) as { pid: number };
          try {
            process.kill(owner.pid, 0);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ESRCH")
              await rm(lock, { recursive: true, force: true });
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (Date.now() > deadline)
          throw new Error(`Timed out acquiring directory lock: ${target}`, {
            cause: error,
          });
        await waitForDirectoryChange(path.dirname(target), signal);
      }
    }
    const backup = target + "-previous-" + randomUUID();
    let previous = false;
    try {
      await rename(target, backup);
      previous = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await rename(staging, target);
    } catch (error) {
      if (previous) await rename(backup, target);
      throw error;
    }
    if (previous) await rm(backup, { recursive: true, force: true });
  } finally {
    if (acquired) await rm(lock, { recursive: true, force: true });
    else await rm(candidate, { recursive: true, force: true });
  }
}
