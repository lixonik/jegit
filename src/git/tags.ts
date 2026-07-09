import { parseTagList } from './parsers';

type RawRunner = (args: string[]) => Promise<string>;

/** Tag operations, grouped behind Git.tag. */
export class GitTags {
  constructor(private readonly raw: RawRunner) {}

  /** Tag names, newest first. */
  async list(limit = 100): Promise<string[]> {
    try {
      return parseTagList(await this.raw(['tag', '--sort=-creatordate'])).slice(0, limit);
    } catch {
      return [];
    }
  }

  /** Tags that contain the given commit (`git tag --contains`), newest first. */
  async containing(hash: string): Promise<string[]> {
    try {
      return parseTagList(await this.raw(['tag', '--contains', hash, '--sort=-creatordate']));
    } catch {
      return [];
    }
  }

  async delete(name: string): Promise<void> {
    await this.raw(['tag', '-d', name]);
  }

  async create(name: string, ref: string, message?: string): Promise<void> {
    const args = ['tag'];
    if (message) args.push('-a', name, '-m', message);
    else args.push(name);
    if (ref) args.push(ref);
    await this.raw(args);
  }
}
