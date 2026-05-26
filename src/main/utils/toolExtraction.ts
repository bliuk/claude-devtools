/**
 * Tool extraction utilities for parsing tool calls and results from JSONL content blocks.
 */

import { isTaskTool, normalizeToolInput, normalizeToolName } from './toolNameMapping';

import type { ContentBlock, ToolCall, ToolResult } from '../types';

/**
 * Extract tool calls from content blocks.
 */
export function extractToolCalls(content: ContentBlock[] | string): ToolCall[] {
  if (typeof content === 'string') {
    return [];
  }

  const toolCalls: ToolCall[] = [];

  for (const block of content) {
    if (block.type === 'tool_use' && block.id && block.name) {
      const rawName = block.name;
      const input = normalizeToolInput(rawName, block.input ?? {});
      const isTask = isTaskTool(rawName);
      const name = normalizeToolName(rawName);

      const toolCall: ToolCall = {
        id: block.id,
        name,
        input,
        isTask,
      };

      // Preserve the original name when normalization changed it (e.g. .asa "subagent")
      if (name !== rawName) {
        toolCall.rawName = rawName;
      }

      // Extract Task-specific info
      if (isTask) {
        // .asa subagent uses input.task; Claude Code Task uses input.description.
        // normalizeToolInput backfills description from task, so reading description covers both.
        toolCall.taskDescription = (input.description ?? input.task) as string | undefined;
        toolCall.taskSubagentType = input.subagent_type as string | undefined;
      }

      toolCalls.push(toolCall);
    }
  }

  return toolCalls;
}

/**
 * Extract tool results from content blocks.
 */
export function extractToolResults(content: ContentBlock[] | string): ToolResult[] {
  if (typeof content === 'string') {
    return [];
  }

  const toolResults: ToolResult[] = [];

  for (const block of content) {
    if (block.type === 'tool_result' && block.tool_use_id) {
      toolResults.push({
        toolUseId: block.tool_use_id,
        content: block.content ?? '',
        isError: block.is_error ?? false,
      });
    }
  }

  return toolResults;
}
