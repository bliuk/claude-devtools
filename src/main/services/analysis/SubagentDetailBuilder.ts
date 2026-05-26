/**
 * SubagentDetailBuilder - Builds detailed information for subagent drill-down.
 *
 * Loads subagent JSONL files, resolves nested subagents, and builds
 * complete SubagentDetail objects for the drill-down modal.
 */

import {
  type EnhancedAIChunk,
  type EnhancedChunk,
  isEnhancedAIChunk,
  type ParsedMessage,
  type Process,
  type SemanticStepGroup,
  type SubagentDetail,
} from '@main/types';
import { countTokens } from '@main/utils/tokenizer';
import { createLogger } from '@shared/utils/logger';

const logger = createLogger('Service:SubagentDetailBuilder');

import { buildSemanticStepGroups } from './SemanticStepGrouper';

import type { SubagentResolver } from '../discovery/SubagentResolver';
import type { FileSystemProvider } from '../infrastructure/FileSystemProvider';
import type { SessionParser } from '../parsing/SessionParser';

/**
 * Build detailed information for a specific subagent.
 * Used for drill-down modal to show subagent's internal execution.
 *
 * @param projectId - Project ID
 * @param _sessionId - Parent session ID (currently unused, kept for API consistency)
 * @param subagentId - Subagent ID to load
 * @param sessionParser - SessionParser instance for parsing subagent file
 * @param subagentResolver - SubagentResolver instance for nested subagents
 * @param buildChunksFn - Function to build chunks from messages and subagents
 * @param fsProvider - FileSystemProvider for file existence checks
 * @param projectsDir - Projects directory path
 * @returns SubagentDetail or null if not found
 */
export async function buildSubagentDetail(
  projectId: string,
  sessionId: string,
  subagentId: string,
  _sessionParser: SessionParser, // Kept for API consistency; resolver now supplies parsed messages
  subagentResolver: SubagentResolver,
  buildChunksFn: (messages: ParsedMessage[], subagents: Process[]) => EnhancedChunk[],
  _fsProvider: FileSystemProvider, // Kept for API consistency; path handling moved into resolver
  _projectsDir: string
): Promise<SubagentDetail | null> {
  try {
    // Resolve every subagent for the session (all nesting levels via the recursive locator),
    // then locate the requested one by id. This uses the resolver's path handling instead of
    // manually constructing a path, so it works for both .claude ({sessionId}/subagents/) and
    // .asa nested ({sessionId}/subagents/run-N/subagents/) layouts.
    const allSubagents = await subagentResolver.resolveSubagents(projectId, sessionId, []);
    const target = subagentResolver.findSubagentById(allSubagents, subagentId);

    if (!target) {
      logger.warn(`Subagent not found: ${subagentId} in session ${sessionId}`);
      return null;
    }

    const messages = target.messages;

    // Build chunks with semantic steps; nested subagents are rendered within this subagent.
    const chunks = buildChunksFn(messages, target.nestedSubagents ?? []);

    // Prefer the description linked from the parent Task call; fall back to first user message.
    let description = target.description ?? 'Subagent';
    if (!target.description && messages.length > 0) {
      const firstUserMsg = messages.find((m) => m.type === 'user' && typeof m.content === 'string');
      if (firstUserMsg && typeof firstUserMsg.content === 'string') {
        description = firstUserMsg.content.substring(0, 100);
        if (firstUserMsg.content.length > 100) {
          description += '...';
        }
      }
    }

    // Calculate timing
    const times = messages.map((m) => m.timestamp.getTime());
    const startTime = new Date(Math.min(...times));
    const endTime = new Date(Math.max(...times));
    const duration = endTime.getTime() - startTime.getTime();

    // Calculate thinking tokens
    let thinkingTokens = 0;
    for (const msg of messages) {
      if (msg.type === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'thinking' && block.thinking) {
            thinkingTokens += countTokens(block.thinking);
          }
        }
      }
    }

    // Build semantic step groups from AI chunks only (UserChunks don't have semanticSteps)
    const allSemanticSteps = chunks
      .filter((c): c is EnhancedAIChunk => isEnhancedAIChunk(c))
      .flatMap((c) => c.semanticSteps);
    const semanticStepGroups: SemanticStepGroup[] | undefined =
      allSemanticSteps.length > 0 ? buildSemanticStepGroups(allSemanticSteps) : undefined;

    return {
      id: subagentId,
      description,
      chunks,
      semanticStepGroups,
      startTime,
      endTime,
      duration,
      metrics: {
        inputTokens: target.metrics.inputTokens,
        outputTokens: target.metrics.outputTokens,
        thinkingTokens,
        messageCount: target.metrics.messageCount,
      },
    };
  } catch (error) {
    logger.error(`Error building subagent detail for ${subagentId}:`, error);
    return null;
  }
}
