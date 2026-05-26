/**
 * Tests for tool call extraction, including normalization of .asa tool names.
 */

import { describe, expect, it } from 'vitest';

import type { ContentBlock } from '../../../src/main/types';
import { extractToolCalls } from '../../../src/main/utils/toolExtraction';

describe('extractToolCalls', () => {
  it('normalizes an .asa subagent tool_use into a Task call', () => {
    const content: ContentBlock[] = [
      {
        type: 'tool_use',
        id: 'toolu_1',
        name: 'subagent',
        input: { task: 'read line 1', type: 'execute' },
      },
    ];

    const [call] = extractToolCalls(content);

    expect(call.name).toBe('Task');
    expect(call.rawName).toBe('subagent');
    expect(call.isTask).toBe(true);
    expect(call.taskDescription).toBe('read line 1');
    // Original key preserved, standard key backfilled
    expect(call.input.task).toBe('read line 1');
    expect(call.input.description).toBe('read line 1');
  });

  it('normalizes exec/read_file names without setting rawName-only quirks', () => {
    const content: ContentBlock[] = [
      { type: 'tool_use', id: 't1', name: 'exec', input: { command: 'ls' } },
      { type: 'tool_use', id: 't2', name: 'read_file', input: { path: '/a.txt' } },
    ];

    const calls = extractToolCalls(content);

    expect(calls[0].name).toBe('Bash');
    expect(calls[0].rawName).toBe('exec');
    expect(calls[0].isTask).toBe(false);

    expect(calls[1].name).toBe('Read');
    expect(calls[1].rawName).toBe('read_file');
    expect(calls[1].input.file_path).toBe('/a.txt');
  });

  it('keeps standard Claude Code Task calls unchanged (no rawName)', () => {
    const content: ContentBlock[] = [
      {
        type: 'tool_use',
        id: 'toolu_2',
        name: 'Task',
        input: { description: 'explore', subagent_type: 'Explore' },
      },
    ];

    const [call] = extractToolCalls(content);

    expect(call.name).toBe('Task');
    expect(call.rawName).toBeUndefined();
    expect(call.isTask).toBe(true);
    expect(call.taskDescription).toBe('explore');
    expect(call.taskSubagentType).toBe('Explore');
  });
});
