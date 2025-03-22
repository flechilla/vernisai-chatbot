import {
  convertToCoreMessages,
  createDataStreamResponse,
  DataStreamWriter,
  JSONValue,
  streamText
} from 'ai'
import { enhancedReasoning } from '../agents/enhanced-reasoning'
import { enhancedResearcher } from '../agents/enhanced-researcher'
import { manualResearcher } from '../agents/manual-researcher'
import { ExtendedCoreMessage } from '../types'
import { getMaxAllowedTokens, truncateMessages } from '../utils/context-window'
import { isReasoningModel } from '../utils/registry'
import { handleStreamFinish } from './handle-stream-finish'
import { executeToolCall } from './tool-execution'
import { BaseStreamConfig } from './types'

// Feature flag for using the enhanced researcher
const USE_ENHANCED_RESEARCHER = true

export function createManualToolStreamResponse(config: BaseStreamConfig) {
  return createDataStreamResponse({
    execute: async (dataStream: DataStreamWriter) => {
      const { messages, model, chatId, searchMode } = config
      const modelId = `${model.providerId}:${model.id}`
      let toolCallModelId = model.toolCallModel
        ? `${model.providerId}:${model.toolCallModel}`
        : modelId

      try {
        const coreMessages = convertToCoreMessages(messages)
        const truncatedMessages = truncateMessages(
          coreMessages,
          getMaxAllowedTokens(model)
        )

        const { toolCallDataAnnotation, toolCallMessages } =
          await executeToolCall(
            truncatedMessages,
            dataStream,
            toolCallModelId,
            searchMode
          )

        // Determine if we should use the reasoning agent
        const isReasoning = isReasoningModel(modelId)

        // Choose the appropriate agent based on model capabilities and features
        let researcherConfig

        if (isReasoning) {
          // Use enhanced reasoning for reasoning models
          console.log('Using enhanced reasoning agent (manual mode)')
          researcherConfig = await enhancedReasoning({
            messages: [...truncatedMessages, ...toolCallMessages],
            model: modelId
          })
        } else if (USE_ENHANCED_RESEARCHER) {
          // Use enhanced researcher for search-capable models
          console.log('Using enhanced researcher agent (manual mode)')
          researcherConfig = await enhancedResearcher({
            messages: [...truncatedMessages, ...toolCallMessages],
            model: modelId,
            searchMode
          })
        } else {
          // Fall back to manual researcher
          console.log('Using legacy manual researcher agent')
          researcherConfig = manualResearcher({
            messages: [...truncatedMessages, ...toolCallMessages],
            model: modelId,
            isSearchEnabled: searchMode
          })
        }

        // Variables to track the reasoning timing.
        let reasoningStartTime: number | null = null
        let reasoningDuration: number | null = null

        const result = streamText({
          ...researcherConfig,
          onFinish: async result => {
            const annotations: ExtendedCoreMessage[] = [
              ...(toolCallDataAnnotation ? [toolCallDataAnnotation] : []),
              {
                role: 'data',
                content: {
                  type: 'reasoning',
                  data: {
                    time: reasoningDuration ?? 0,
                    reasoning: result.reasoning
                  }
                } as JSONValue
              }
            ]

            await handleStreamFinish({
              responseMessages: result.response.messages,
              originalMessages: messages,
              model: modelId,
              chatId,
              dataStream,
              skipRelatedQuestions: isReasoning, // Skip related questions for reasoning models
              annotations
            })
          },
          onChunk(event) {
            const chunkType = event.chunk?.type

            if (chunkType === 'reasoning') {
              if (reasoningStartTime === null) {
                reasoningStartTime = Date.now()
              }
            } else {
              if (reasoningStartTime !== null) {
                const elapsedTime = Date.now() - reasoningStartTime
                reasoningDuration = elapsedTime
                dataStream.writeMessageAnnotation({
                  type: 'reasoning',
                  data: { time: elapsedTime }
                } as JSONValue)
                reasoningStartTime = null
              }
            }
          }
        })

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true
        })
      } catch (error) {
        console.error('Stream execution error:', error)
      }
    },
    onError: error => {
      console.error('Stream error:', error)
      return error instanceof Error ? error.message : String(error)
    }
  })
}
