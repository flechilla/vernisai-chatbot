import { relatedSchema } from '@/lib/schema/related'
import { CoreMessage, generateObject } from 'ai'
import { promptRepository } from '../prompts/repository'
import { templateEngine } from '../prompts/template-engine'
import {
  getModel,
  getToolCallModel,
  isToolCallSupported
} from '../utils/registry'

export async function generateRelatedQuestions(
  messages: CoreMessage[],
  model: string
) {
  const lastMessages = messages.slice(-1).map(message => ({
    ...message,
    role: 'user'
  })) as CoreMessage[]

  const supportedModel = isToolCallSupported(model)
  const currentModel = supportedModel
    ? getModel(model)
    : getToolCallModel(model)

  // Get the related questions template from repository
  const relatedQuestionsTemplate =
    await promptRepository.getTemplate('related-questions')

  if (!relatedQuestionsTemplate) {
    console.error('Related questions template not found, using fallback')
    return generateWithFallbackPrompt(currentModel, lastMessages)
  }

  // Process the template with the template engine
  const processedPrompt = await templateEngine.process(
    relatedQuestionsTemplate.template,
    {} // No variables needed for this template
  )

  const result = await generateObject({
    model: currentModel,
    system: processedPrompt,
    messages: lastMessages,
    schema: relatedSchema
  })

  return result
}

// Fallback function in case the template is not available
async function generateWithFallbackPrompt(
  currentModel: any,
  lastMessages: CoreMessage[]
) {
  const fallbackPrompt = `As a professional web researcher, your task is to generate a set of three queries that explore the subject matter more deeply, building upon the initial query and the information uncovered in its search results.

  For instance, if the original query was "Starship's third test flight key milestones", your output should follow this format:

  Aim to create queries that progressively delve into more specific aspects, implications, or adjacent topics related to the initial query. The goal is to anticipate the user's potential information needs and guide them towards a more comprehensive understanding of the subject matter.
  Please match the language of the response to the user's language.`

  return generateObject({
    model: currentModel,
    system: fallbackPrompt,
    messages: lastMessages,
    schema: relatedSchema
  })
}
