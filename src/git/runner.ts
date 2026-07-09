import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface GitExecOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

/** The single choke point that spawns the git executable. */
export async function execGit(args: string[], options: GitExecOptions): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: options.cwd,
    env: options.env,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}
