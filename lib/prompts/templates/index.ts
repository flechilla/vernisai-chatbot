import { registerReasoningTemplates } from './reasoning'
import { registerRelatedQuestionsTemplates } from './related-questions'
import { registerResearcherTemplates } from './researcher'

export async function registerAllTemplates() {
  try {
    // Register the researcher templates
    await registerResearcherTemplates()

    // Register other template types
    await registerRelatedQuestionsTemplates()
    await registerReasoningTemplates()

    console.log('All prompt templates registered successfully')
  } catch (error) {
    console.error('Error registering prompt templates:', error)
    throw error
  }
}
