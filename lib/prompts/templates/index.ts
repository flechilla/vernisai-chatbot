import { registerResearcherTemplates } from './researcher'

export async function registerAllTemplates() {
  try {
    // Register the researcher templates
    await registerResearcherTemplates()
    
    // Register other template types as they're added
    // await registerRelatedQuestionsTemplates()
    // await registerReasoningTemplates()
    
    console.log('All prompt templates registered successfully')
  } catch (error) {
    console.error('Error registering prompt templates:', error)
    throw error
  }
}
