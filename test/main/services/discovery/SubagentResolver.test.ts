/**
 * Integration tests for SubagentResolver against the .asa nested subagent layout.
 *
 * Builds a real temp project tree:
 *   {proj}/{sess}/subagents/agent-sub-T1.jsonl                 (L1, spawns T2)
 *   {proj}/{sess}/subagents/run-1/subagents/agent-sub-T2.jsonl (L2, nested)
 *
 * and verifies:
 *  - naming-convention linking (agentId "sub-{toolUseId}" -> parent tool_use id)
 *    works for both the top-level subagent (parent call in the session) and the
 *    nested subagent (parent call inside L1's own transcript)
 *  - nested subagents are grouped under their spawning parent
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ProjectScanner } from '../../../../src/main/services/discovery/ProjectScanner';
import { SubagentResolver } from '../../../../src/main/services/discovery/SubagentResolver';
import type { ToolCall } from '../../../../src/main/types';

const PROJECT_ID = 'proj';
const SESSION_ID = 'sess';
const T0 = Date.parse('2026-05-26T00:00:00.000Z');

let tmpRoot: string;
let resolver: SubagentResolver;

function ts(offsetSeconds: number): string {
  return new Date(T0 + offsetSeconds * 1000).toISOString();
}

function userLine(uuid: string, content: unknown, time: string): string {
  return JSON.stringify({
    uuid,
    type: 'user',
    isSidechain: true,
    userType: 'external',
    timestamp: time,
    message: { role: 'user', content },
  });
}

function assistantLine(
  uuid: string,
  content: unknown[],
  time: string,
  stopReason = 'end_turn'
): string {
  return JSON.stringify({
    uuid,
    type: 'assistant',
    isSidechain: true,
    userType: 'external',
    timestamp: time,
    requestId: `req-${uuid}`,
    message: {
      role: 'assistant',
      model: 'claude-haiku-4-5-20251001',
      id: `msg-${uuid}`,
      type: 'message',
      stop_reason: stopReason,
      stop_sequence: null,
      content,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  });
}

function writeJsonl(relPath: string, lines: string[]): void {
  const full = path.join(tmpRoot, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, lines.join('\n') + '\n');
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-resolver-'));
  resolver = new SubagentResolver(new ProjectScanner(tmpRoot, undefined));

  const base = `${PROJECT_ID}/${SESSION_ID}/subagents`;

  // L1: spawns a nested subagent via an .asa "subagent" tool_use (id T2)
  writeJsonl(`${base}/agent-sub-T1.jsonl`, [
    userLine('u1', 'outer task', ts(0)),
    assistantLine(
      'a1',
      [{ type: 'tool_use', id: 'T2', name: 'subagent', input: { task: 'inner task' } }],
      ts(1),
      'tool_use'
    ),
    userLine('u2', [{ type: 'tool_result', tool_use_id: 'T2', content: 'alpha' }], ts(4)),
    assistantLine('a2', [{ type: 'text', text: 'done: alpha' }], ts(5)),
  ]);

  // L2: nested under run-1/subagents, reads a file
  writeJsonl(`${base}/run-1/subagents/agent-sub-T2.jsonl`, [
    userLine('v1', 'inner task', ts(2)),
    assistantLine(
      'b1',
      [{ type: 'tool_use', id: 'R1', name: 'read_file', input: { path: '/x.txt' } }],
      ts(2),
      'tool_use'
    ),
    userLine('v2', [{ type: 'tool_result', tool_use_id: 'R1', content: 'alpha' }], ts(3)),
    assistantLine('b2', [{ type: 'text', text: 'alpha' }], ts(3)),
  ]);
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('SubagentResolver nested (.asa) resolution', () => {
  it('links both levels by naming convention and nests L2 under L1', async () => {
    // The parent session's only Task call is the top-level subagent spawn (T1).
    const mainTaskCalls: ToolCall[] = [
      {
        id: 'T1',
        name: 'Task',
        input: { description: 'outer' },
        isTask: true,
        taskDescription: 'outer',
      },
    ];

    const subagents = await resolver.resolveSubagents(PROJECT_ID, SESSION_ID, mainTaskCalls);

    expect(subagents).toHaveLength(2);

    const l1 = resolver.findSubagentById(subagents, 'sub-T1');
    const l2 = resolver.findSubagentById(subagents, 'sub-T2');
    expect(l1).toBeDefined();
    expect(l2).toBeDefined();

    // Top-level subagent linked to the session's Task call
    expect(l1!.parentTaskId).toBe('T1');
    expect(l1!.description).toBe('outer');

    // Nested subagent linked to the tool_use inside L1's transcript (augmented lookup)
    expect(l2!.parentTaskId).toBe('T2');

    // L2 grouped under L1
    expect(l1!.nestedSubagents?.map((s) => s.id)).toEqual(['sub-T2']);
    expect(l2!.nestedSubagents ?? []).toHaveLength(0);

    // The .asa "subagent" tool_use was normalized to a Task call inside L1's messages
    const l1ToolCalls = l1!.messages.flatMap((m) => m.toolCalls);
    const taskCall = l1ToolCalls.find((tc) => tc.id === 'T2');
    expect(taskCall?.name).toBe('Task');
    expect(taskCall?.isTask).toBe(true);
  });
});
