/**
 * Tool name/input normalization for non-standard session log variants.
 *
 * Some Claude Code-compatible runtimes (e.g. ".asa" / Agentic Stack Assistant)
 * emit different tool names and input shapes than stock Claude Code:
 *
 * | .asa name   | standard name | input remap            |
 * |-------------|---------------|------------------------|
 * | subagent    | Task          | task -> description    |
 * | exec        | Bash          | (already {command,description}) |
 * | read_file   | Read          | path -> file_path      |
 * | skill       | Skill         | skill -> name          |
 *
 * Normalizing here (in the main process, at extraction time) lets the entire
 * downstream rendering pipeline — icons, viewers, summaries (toolSummaryHelpers),
 * and Task/subagent de-duplication (displayItemBuilder) — work unchanged, since
 * they all key off the standard tool names.
 */

/** Map of non-standard tool names to their Claude Code standard equivalents. */
const TOOL_NAME_ALIASES: Record<string, string> = {
  subagent: 'Task',
  exec: 'Bash',
  read_file: 'Read',
  skill: 'Skill',
};

/**
 * Normalize a raw tool name to its Claude Code standard name.
 * Unknown names are returned unchanged.
 */
export function normalizeToolName(rawName: string): string {
  return TOOL_NAME_ALIASES[rawName] ?? rawName;
}

/**
 * Whether a tool call (by its raw name) spawns a subagent and should be treated
 * as a Task. Covers stock Claude Code ("Task") and .asa ("subagent").
 */
export function isTaskTool(rawName: string): boolean {
  return rawName === 'Task' || rawName === 'subagent';
}

/**
 * Backfill standard input keys for non-standard tools, preserving original keys.
 * Additive: never removes fields, only adds the standard key when missing so the
 * existing summary/viewer logic can read it.
 */
export function normalizeToolInput(
  rawName: string,
  input: Record<string, unknown>
): Record<string, unknown> {
  switch (rawName) {
    case 'subagent': {
      // Task summary reads input.description (falls back to input.prompt).
      if (input.description === undefined && input.task !== undefined) {
        return { ...input, description: input.task };
      }
      return input;
    }
    case 'read_file': {
      // Read summary/viewer reads input.file_path.
      if (input.file_path === undefined && input.path !== undefined) {
        return { ...input, file_path: input.path };
      }
      return input;
    }
    case 'skill': {
      // Skill has no dedicated summary case; the default reads input.name.
      if (input.name === undefined && input.skill !== undefined) {
        return { ...input, name: input.skill };
      }
      return input;
    }
    case 'exec':
    default:
      // exec already uses {command, description}, matching Bash.
      return input;
  }
}
