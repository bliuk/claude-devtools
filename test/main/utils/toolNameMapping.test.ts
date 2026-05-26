/**
 * Tests for tool name/input normalization (.asa and other non-standard log variants).
 */

import { describe, expect, it } from 'vitest';

import {
  isTaskTool,
  normalizeToolInput,
  normalizeToolName,
} from '../../../src/main/utils/toolNameMapping';

describe('normalizeToolName', () => {
  it('maps .asa tool names to Claude Code standard names', () => {
    expect(normalizeToolName('subagent')).toBe('Task');
    expect(normalizeToolName('exec')).toBe('Bash');
    expect(normalizeToolName('read_file')).toBe('Read');
    expect(normalizeToolName('skill')).toBe('Skill');
  });

  it('passes through already-standard or unknown names unchanged', () => {
    expect(normalizeToolName('Task')).toBe('Task');
    expect(normalizeToolName('Bash')).toBe('Bash');
    expect(normalizeToolName('Glob')).toBe('Glob');
    expect(normalizeToolName('SomeCustomTool')).toBe('SomeCustomTool');
  });
});

describe('isTaskTool', () => {
  it('treats both Task and subagent as task-spawning tools', () => {
    expect(isTaskTool('Task')).toBe(true);
    expect(isTaskTool('subagent')).toBe(true);
  });

  it('returns false for non-task tools', () => {
    expect(isTaskTool('exec')).toBe(false);
    expect(isTaskTool('read_file')).toBe(false);
    expect(isTaskTool('Bash')).toBe(false);
  });
});

describe('normalizeToolInput', () => {
  it('backfills Task description from subagent.task, preserving original keys', () => {
    const result = normalizeToolInput('subagent', { task: 'do the thing', type: 'execute' });
    expect(result.description).toBe('do the thing');
    expect(result.task).toBe('do the thing');
    expect(result.type).toBe('execute');
  });

  it('does not overwrite an existing description', () => {
    const result = normalizeToolInput('subagent', { task: 'a', description: 'b' });
    expect(result.description).toBe('b');
  });

  it('backfills Read file_path from read_file.path', () => {
    const result = normalizeToolInput('read_file', { path: '/tmp/x.txt', offset: 10 });
    expect(result.file_path).toBe('/tmp/x.txt');
    expect(result.path).toBe('/tmp/x.txt');
    expect(result.offset).toBe(10);
  });

  it('backfills name from skill.skill so the default summary shows it', () => {
    const result = normalizeToolInput('skill', { skill: 'builtin-x', args: 'nested' });
    expect(result.name).toBe('builtin-x');
    expect(result.skill).toBe('builtin-x');
  });

  it('leaves exec input untouched (already {command, description})', () => {
    const input = { command: 'ls -la', description: 'list' };
    expect(normalizeToolInput('exec', input)).toEqual(input);
  });
});
