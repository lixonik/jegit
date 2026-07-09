import { parseWorktrees } from './parsers';
import type { Worktree } from '../model/git';

type RawRunner = (args: string[]) => Promise<string>;

/** Worktree operations, grouped behind Git.worktree. */
export class GitWorktrees {
  constructor(private readonly raw: RawRunner) {}

  async list(): Promise<Worktree[]> {
    try {
      return parseWorktrees(await this.raw(['worktree', 'list', '--porcelain']));
    } catch {
      return [];
    }
  }

  async add(dir: string, ref: string): Promise<void> {
    await this.raw(['worktree', 'add', dir, ref]);
  }

  async addNewBranch(dir: string, newBranch: string, base: string): Promise<void> {
    await this.raw(['worktree', 'add', '-b', newBranch, dir, base]);
  }

  async remove(dir: string): Promise<void> {
    await this.raw(['worktree', 'remove', dir]);
  }

  async prune(): Promise<void> {
    await this.raw(['worktree', 'prune']);
  }
}
