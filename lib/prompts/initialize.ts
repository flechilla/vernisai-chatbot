import { registerAllTemplates } from './templates'

/**
 * Initialize the prompt management system
 * This should be called during application startup
 */
export async function initializePromptSystem() {
  try {
    console.log('Initializing prompt management system...')
    
    // Register all templates
    await registerAllTemplates()
    
    // After registration, let's test getting a template
    try {
      const { promptRepository } = await import('./repository')
      const researcherTemplate = await promptRepository.getTemplate('researcher-native')
      console.log('Researcher template availability:', !!researcherTemplate)
      if (researcherTemplate) {
        console.log('Template version:', researcherTemplate.version)
        console.log('Template content sample:', researcherTemplate.template.substring(0, 100) + '...')
      } else {
        console.warn('No researcher template found!')
      }
    } catch (e) {
      console.error('Error testing template availability:', e)
    }
    
    console.log('Prompt management system initialized successfully')
    return true
  } catch (error) {
    console.error('Failed to initialize prompt management system:', error)
    return false
  }
}