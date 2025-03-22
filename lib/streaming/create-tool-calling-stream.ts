import { enhancedReasoning } from '@/lib/agents/enhanced-reasoning'
import { enhancedResearcher } from '@/lib/agents/enhanced-researcher'
import { researcher } from '@/lib/agents/researcher'
import {
  convertToCoreMessages,
  createDataStreamResponse,
  DataStreamWriter,
  streamText
} from 'ai'
import { getMaxAllowedTokens, truncateMessages } from '../utils/context-window'
import { isReasoningModel } from '../utils/registry'
import { handleStreamFinish } from './handle-stream-finish'
import { BaseStreamConfig } from './types'

// Feature flag for using the enhanced researcher
const USE_ENHANCED_RESEARCHER = true

export function createToolCallingStreamResponse(config: BaseStreamConfig) {
  return createDataStreamResponse({
    execute: async (dataStream: DataStreamWriter) => {
      const { messages, model, chatId, searchMode } = config
      const modelId = `${model.providerId}:${model.id}`

      try {
        const coreMessages = convertToCoreMessages(messages)
        const truncatedMessages = truncateMessages(
          coreMessages,
          getMaxAllowedTokens(model)
        )

        // Determine if we should use the reasoning agent
        const isReasoning = isReasoningModel(modelId)

        // Choose the appropriate agent based on model capabilities and features
        let researcherConfig

        if (isReasoning) {
          // Use enhanced reasoning for reasoning models
          console.log('Using enhanced reasoning agent')
          researcherConfig = await enhancedReasoning({
            messages: truncatedMessages,
            model: modelId
          })
        } else if (USE_ENHANCED_RESEARCHER) {
          // Use enhanced researcher for search-capable models
          console.log('Using enhanced researcher agent')
          researcherConfig = await enhancedResearcher({
            messages: truncatedMessages,
            model: modelId,
            searchMode
          })
        } else {
          // Fall back to legacy researcher
          console.log('Using legacy researcher agent')
          researcherConfig = researcher({
            messages: truncatedMessages,
            model: modelId,
            searchMode
          })
        }

        const result = streamText({
          ...researcherConfig,
          onFinish: async result => {
            await handleStreamFinish({
              responseMessages: result.response.messages,
              originalMessages: messages,
              model: modelId,
              chatId,
              dataStream,
              skipRelatedQuestions: isReasoning // Skip related questions for reasoning models
            })
          }
        })

        result.mergeIntoDataStream(dataStream)
      } catch (error) {
        console.error('Stream execution error:', error)
        throw error
      }
    },
    onError: error => {
      console.error('Stream error:', error)
      return error instanceof Error ? error.message : String(error)
    }
  })
}
