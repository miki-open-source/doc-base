import { execFileSync } from "node:child_process";

export function runPnpm(args, options = {}) {
  const executable = process.env.npm_execpath;
  if (!executable || !/(^|[/\\])pnpm(?:\.(?:cjs|mjs|exe))?$/.test(executable))
    throw new Error("Run repository tooling through pnpm run.");
  return /\.[cm]js$/.test(executable)
    ? execFileSync(process.execPath, [executable, ...args], options)
    : execFileSync(executable, args, options);
}
