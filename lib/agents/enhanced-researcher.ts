import { CoreMessage, smoothStream, streamText } from 'ai'
import { promptSelector } from '../prompts/selector'
import { retrieveTool } from '../tools/retrieve'
import { searchTool } from '../tools/search'
import { videoSearchTool } from '../tools/video-search'
import { getModel } from '../utils/registry'

type ResearcherReturn = Parameters<typeof streamText>[0]

/**
 * Helper function to adapt LanguageModelV1 to our Model interface
 */
function adaptModelForSelector(modelId: string) {
  return {
    id: modelId,
    name: modelId.split(':').pop() || modelId,
    provider: modelId.split(':')[0] || 'unknown',
    providerId: modelId.split(':')[0] || 'unknown',
    enabled: true,
    toolCallType: 'native' as const
  }
}

/**
 * Enhanced researcher agent using the prompt management system
 */
export async function enhancedResearcher({
  messages,
  model,
  searchMode
}: {
  messages: CoreMessage[]
  model: string
  searchMode: boolean
}): Promise<ResearcherReturn> {
  try {
    // Select the appropriate prompt based on model and context
    const selectedPrompt = await promptSelector.selectPrompt({
      modelId: model,
      model: adaptModelForSelector(model),
      isSearchEnabled: searchMode,
      taskType: 'search',
      messages
    })

    console.log('Selected prompt:', selectedPrompt)

    // Return the configuration with the processed prompt as a string
    return {
      model: getModel(model),
      system: selectedPrompt.processedPrompt, // Now it's a string, not a Promise
      messages,
      tools: {
        search: searchTool,
        retrieve: retrieveTool,
        videoSearch: videoSearchTool
      },
      experimental_activeTools: searchMode
        ? ['search', 'retrieve', 'videoSearch']
        : [],
      maxSteps: searchMode ? 5 : 1,
      experimental_transform: smoothStream({ chunking: 'word' })
    }
  } catch (error) {
    console.error('Error in enhancedResearcher:', error)
    throw error
  }
}
