import { CoreMessage, smoothStream, streamText } from 'ai'
import { promptRepository } from '../prompts/repository'
import { templateEngine } from '../prompts/template-engine'
import { getModel } from '../utils/registry'

type ReasoningReturn = Parameters<typeof streamText>[0]

/**
 * Enhanced reasoning agent using the registered reasoning template
 */
export async function enhancedReasoning({
  messages,
  model
}: {
  messages: CoreMessage[]
  model: string
}): Promise<ReasoningReturn> {
  try {
    // Get the reasoning template from repository
    const reasoningTemplate = await promptRepository.getTemplate('reasoning')

    if (!reasoningTemplate) {
      console.error('Reasoning template not found, using fallback')
      return createFallbackReasoningConfig(messages, model)
    }

    // Process the template with the template engine, substituting variables
    const currentDate = new Date().toISOString().split('T')[0]
    const processedPrompt = await templateEngine.process(
      reasoningTemplate.template,
      { currentDate } // Variables defined in template
    )

    // Return the configuration with the processed prompt
    return {
      model: getModel(model),
      system: processedPrompt,
      messages,
      experimental_transform: smoothStream({ chunking: 'word' })
    }
  } catch (error) {
    console.error('Error in enhancedReasoning:', error)
    return createFallbackReasoningConfig(messages, model)
  }
}

/**
 * Create a fallback configuration in case the template is not available
 */
function createFallbackReasoningConfig(
  messages: CoreMessage[],
  model: string
): ReasoningReturn {
  const currentDate = new Date().toISOString().split('T')[0]
  const fallbackPrompt = `
Instructions:

You are a helpful AI assistant with strong reasoning capabilities.

When analyzing information, please:
1. Break down complex questions into smaller components
2. Explicitly state your reasoning process step by step
3. Distinguish between factual information and your own inferences
4. Consider alternative viewpoints before reaching conclusions
5. Identify any assumptions you're making in your analysis
6. Provide intermediate conclusions during longer reasoning chains
7. Acknowledge uncertainty when appropriate

Current date: ${currentDate}
`

  return {
    model: getModel(model),
    system: fallbackPrompt,
    messages,
    experimental_transform: smoothStream({ chunking: 'word' })
  }
}
