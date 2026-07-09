import { parseRemotes } from './parsers';

type RawRunner = (args: string[]) => Promise<string>;

/** Remote management, grouped behind Git.remote. */
export class GitRemotes {
  constructor(private readonly raw: RawRunner) {}

  async list(): Promise<{ name: string; url: string }[]> {
    try {
      return parseRemotes(await this.raw(['remote', '-v']));
    } catch {
      return [];
    }
  }

  async add(name: string, url: string): Promise<void> {
    await this.raw(['remote', 'add', name, url]);
  }

  async remove(name: string): Promise<void> {
    await this.raw(['remote', 'remove', name]);
  }

  async rename(oldName: string, newName: string): Promise<void> {
    await this.raw(['remote', 'rename', oldName, newName]);
  }

  async setUrl(name: string, url: string): Promise<void> {
    await this.raw(['remote', 'set-url', name, url]);
  }
}
