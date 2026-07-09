import { parseStashList } from './parsers';

type RawRunner = (args: string[]) => Promise<string>;

/** Stash operations, grouped behind Git.stash. */
export class GitStash {
  constructor(private readonly raw: RawRunner) {}

  async push(message: string): Promise<void> {
    const args = ['stash', 'push'];
    if (message) args.push('-m', message);
    await this.raw(args);
  }

  async list(): Promise<{ ref: string; subject: string }[]> {
    try {
      return parseStashList(await this.raw(['stash', 'list', '--format=%gd%x1f%gs']));
    } catch {
      return [];
    }
  }

  async apply(ref: string): Promise<void> {
    await this.raw(['stash', 'apply', ref]);
  }

  async pop(ref: string): Promise<void> {
    await this.raw(['stash', 'pop', ref]);
  }

  async drop(ref: string): Promise<void> {
    await this.raw(['stash', 'drop', ref]);
  }

  async clear(): Promise<void> {
    await this.raw(['stash', 'clear']);
  }

  /** Create a new branch from the stash base and apply the stash onto it (git stash branch). */
  async branch(name: string, ref: string): Promise<void> {
    await this.raw(['stash', 'branch', name, ref]);
  }
}
