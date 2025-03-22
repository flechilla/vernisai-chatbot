import { promptRegistry } from '../registry'

const RELATED_QUESTIONS_TEMPLATE = `As a professional web researcher, your task is to generate a set of three queries that explore the subject matter more deeply, building upon the initial query and the information uncovered in its search results.

For instance, if the original query was "Starship's third test flight key milestones", your output should follow this format:

Aim to create queries that progressively delve into more specific aspects, implications, or adjacent topics related to the initial query. The goal is to anticipate the user's potential information needs and guide them towards a more comprehensive understanding of the subject matter.
Please match the language of the response to the user's language.`

// In-memory template metadata for the list method
const IN_MEMORY_TEMPLATES = {
  'related-questions': {
    version: '1.0',
    template: RELATED_QUESTIONS_TEMPLATE,
    createdAt: new Date().toISOString(),
    description: 'Initial version'
  }
}

// In-memory template metadata for the list method
const IN_MEMORY_TEMPLATE_METADATA = {
  'related-questions': {
    id: 'related-questions',
    name: 'Related Questions Generator',
    description: 'Template for generating related questions',
    category: 'related-questions',
    tags: ['related', 'questions', 'suggestions'],
    currentVersion: '1.0',
    versions: {
      '1.0': {
        version: '1.0',
        template: RELATED_QUESTIONS_TEMPLATE,
        createdAt: new Date().toISOString(),
        description: 'Initial version'
      }
    },
    variables: [],
    modelCompatibility: ['*'],
    lastModified: new Date().toISOString()
  }
}

// Register the template
async function registerTemplates() {
  try {
    console.log('Registering related questions templates...')

    // Standard related questions template
    await promptRegistry.registerStandardTemplate(
      'related-questions',
      'Related Questions Generator',
      'Template for generating related questions',
      'related-questions',
      RELATED_QUESTIONS_TEMPLATE,
      {
        tags: ['related', 'questions', 'suggestions'],
        variables: [],
        modelCompatibility: ['*']
      }
    )

    console.log('All related questions templates registered')
  } catch (error) {
    console.error('Error registering related questions templates:', error)
  }
}

export { registerTemplates as registerRelatedQuestionsTemplates }
