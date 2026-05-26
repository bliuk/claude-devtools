/**
 * Tests for SubagentLocator, focused on recursive discovery of nested subagent
 * files under run-N/subagents/ (the .asa nested subagent layout).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SubagentLocator } from '../../../../src/main/services/discovery/SubagentLocator';
import { LocalFileSystemProvider } from '../../../../src/main/services/infrastructure/LocalFileSystemProvider';

const PROJECT_ID = 'proj';
const SESSION_ID = 'sess';

let tmpRoot: string;
let locator: SubagentLocator;

function write(relPath: string, content = '{"uuid":"x","type":"user"}\n'): string {
  const full = path.join(tmpRoot, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

function subagentsDir(): string {
  return path.join(tmpRoot, PROJECT_ID, SESSION_ID, 'subagents');
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-locator-'));
  locator = new SubagentLocator(tmpRoot, new LocalFileSystemProvider());
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('SubagentLocator.listSubagentFiles', () => {
  it('recurses into run-N/subagents/ to collect nested subagent files (.asa)', async () => {
    const top = write(`${PROJECT_ID}/${SESSION_ID}/subagents/agent-sub-A.jsonl`);
    const l2 = write(`${PROJECT_ID}/${SESSION_ID}/subagents/run-1/subagents/agent-sub-B.jsonl`);
    const l3 = write(
      `${PROJECT_ID}/${SESSION_ID}/subagents/run-1/subagents/run-1/subagents/agent-sub-C.jsonl`
    );

    const files = await locator.listSubagentFiles(PROJECT_ID, SESSION_ID);

    expect(files.sort()).toEqual([top, l2, l3].sort());
  });

  it('returns only top-level files when there are no run-N directories (.claude regression)', async () => {
    const a = write(`${PROJECT_ID}/${SESSION_ID}/subagents/agent-uuid-1.jsonl`);
    const b = write(`${PROJECT_ID}/${SESSION_ID}/subagents/agent-uuid-2.jsonl`);
    // A non-agent file and a non-run directory must be ignored
    write(`${PROJECT_ID}/${SESSION_ID}/subagents/notes.txt`);
    fs.mkdirSync(path.join(subagentsDir(), 'other'), { recursive: true });

    const files = await locator.listSubagentFiles(PROJECT_ID, SESSION_ID);

    expect(files.sort()).toEqual([a, b].sort());
  });

  it('returns an empty array when the subagents directory does not exist', async () => {
    const files = await locator.listSubagentFiles(PROJECT_ID, SESSION_ID);
    expect(files).toEqual([]);
  });
});
