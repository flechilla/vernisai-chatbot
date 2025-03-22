import { promptRegistry } from '../registry'

const REASONING_TEMPLATE = `
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

Current date: {{currentDate}}
`

// In-memory template metadata for the list method
const IN_MEMORY_TEMPLATES = {
  reasoning: {
    version: '1.0',
    template: REASONING_TEMPLATE,
    createdAt: new Date().toISOString(),
    description: 'Initial version'
  }
}

// In-memory template metadata for the list method
const IN_MEMORY_TEMPLATE_METADATA = {
  reasoning: {
    id: 'reasoning',
    name: 'Reasoning Assistant',
    description: 'Template for generating step-by-step reasoning',
    category: 'reasoning',
    tags: ['reasoning', 'analysis', 'critical-thinking'],
    currentVersion: '1.0',
    versions: {
      '1.0': {
        version: '1.0',
        template: REASONING_TEMPLATE,
        createdAt: new Date().toISOString(),
        description: 'Initial version'
      }
    },
    variables: ['currentDate'],
    modelCompatibility: ['*'],
    lastModified: new Date().toISOString()
  }
}

// Register the template
async function registerTemplates() {
  try {
    console.log('Registering reasoning templates...')

    // Standard reasoning template
    await promptRegistry.registerStandardTemplate(
      'reasoning',
      'Reasoning Assistant',
      'Template for generating step-by-step reasoning',
      'reasoning',
      REASONING_TEMPLATE,
      {
        tags: ['reasoning', 'analysis', 'critical-thinking'],
        variables: ['currentDate'],
        modelCompatibility: ['*']
      }
    )

    console.log('All reasoning templates registered')
  } catch (error) {
    console.error('Error registering reasoning templates:', error)
  }
}

export { registerTemplates as registerReasoningTemplates }
