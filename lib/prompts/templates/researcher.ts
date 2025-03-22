import { promptRegistry } from '../registry'
import { promptRepository } from '../repository'

// Base researcher prompt with shared components
const BASE_RESEARCHER_TEMPLATE = `
Instructions:

You are a helpful AI assistant {{#if searchEnabled}}with access to real-time web search, content retrieval, and video search capabilities{{/if}}.
{{#if searchEnabled}}When asked a question, you should:
1. Search for relevant information using the search tool when needed
2. Use the retrieve tool to get detailed content from specific URLs
3. Use the video search tool when looking for video content
4. Analyze all search results to provide accurate, up-to-date information
5. Always cite sources using the [number](url) format, matching the order of search results. If multiple sources are relevant, include all of them, and comma separate them. Only use information that has a URL available for citation.
6. If results are not relevant or helpful, rely on your general knowledge{{else}}
When asked a question, you should:
1. Draw on your general knowledge to provide accurate information
2. Acknowledge limitations in your knowledge when appropriate
3. Suggest specific topics that might benefit from search when relevant{{/if}}
7. Provide comprehensive and detailed responses based on {{#if searchEnabled}}search results{{else}}your knowledge{{/if}}, ensuring thorough coverage of the user's question
8. Use markdown to structure your responses. Use headings to break up the content into sections.
{{#if searchEnabled}}9. **Use the retrieve tool only with user-provided URLs.**{{/if}}

{{#if searchEnabled}}
Citation Format:
[number](url)
{{/if}}

Current date: {{currentDate}}
`

// Manual in-memory registration for testing/fallback
const IN_MEMORY_TEMPLATES = {
  'researcher-native': {
    version: '1.0',
    template: BASE_RESEARCHER_TEMPLATE,
    createdAt: new Date().toISOString(),
    description: 'Initial version'
  },
  'researcher-manual': {
    version: '1.0',
    template: BASE_RESEARCHER_TEMPLATE,
    createdAt: new Date().toISOString(),
    description: 'Initial version for manual tool calling'
  }
}

// In-memory template metadata for the list method
const IN_MEMORY_TEMPLATE_METADATA = {
  'researcher-native': {
    id: 'researcher-native',
    name: 'Researcher Assistant (Native Tool Calling)',
    description: 'Template for the researcher agent with native tool calling',
    category: 'search-native-tools',
    tags: ['search', 'citation', 'research', 'native-tools'],
    currentVersion: '1.0',
    versions: {
      '1.0': {
        version: '1.0',
        template: BASE_RESEARCHER_TEMPLATE,
        createdAt: new Date().toISOString(),
        description: 'Initial version'
      }
    },
    variables: ['searchEnabled', 'currentDate'],
    modelCompatibility: ['*'],
    lastModified: new Date().toISOString()
  },
  'researcher-manual': {
    id: 'researcher-manual',
    name: 'Researcher Assistant (Manual Tool Calling)',
    description: 'Template for the researcher agent with manual tool calling',
    category: 'search-manual',
    tags: ['search', 'citation', 'research', 'manual-tools'],
    currentVersion: '1.0',
    versions: {
      '1.0': {
        version: '1.0',
        template: BASE_RESEARCHER_TEMPLATE,
        createdAt: new Date().toISOString(),
        description: 'Initial version'
      }
    },
    variables: ['searchEnabled', 'currentDate'],
    modelCompatibility: ['*'],
    lastModified: new Date().toISOString()
  }
}

// Add a method to the repository to directly access the in-memory templates
const originalGetTemplate = promptRepository.getTemplate
promptRepository.getTemplate = async function (id, version) {
  try {
    // Try the normal Redis-based method first
    const template = await originalGetTemplate.call(this, id, version)
    if (template) return template

    // Fall back to in-memory templates if Redis fails or returns nothing
    console.log('Falling back to in-memory template for', id)
    const inMemoryTemplate =
      IN_MEMORY_TEMPLATES[id as keyof typeof IN_MEMORY_TEMPLATES]
    if (inMemoryTemplate) return inMemoryTemplate

    // Nothing found
    return null
  } catch (error) {
    console.error('Error in getTemplate, using fallback:', error)
    return IN_MEMORY_TEMPLATES[id as keyof typeof IN_MEMORY_TEMPLATES] || null
  }
}

// Add fallback for listing templates too
const originalListTemplates = promptRepository.listTemplates
promptRepository.listTemplates = async function (category?: string) {
  try {
    // Try the normal Redis-based method first
    const templates = await originalListTemplates.call(this, category)
    if (templates && templates.length > 0) return templates

    // Fall back to in-memory templates if Redis fails or returns nothing
    console.log('Falling back to in-memory templates for category:', category)

    // Filter templates by category if needed
    const inMemoryTemplates = Object.values(IN_MEMORY_TEMPLATE_METADATA)

    if (category) {
      return inMemoryTemplates.filter(t => t.category === category)
    }

    return inMemoryTemplates
  } catch (error) {
    console.error('Error in listTemplates, using fallback:', error)
    const inMemoryTemplates = Object.values(IN_MEMORY_TEMPLATE_METADATA)

    if (category) {
      return inMemoryTemplates.filter(t => t.category === category)
    }

    return inMemoryTemplates
  }
}

// Register the template
async function registerTemplates() {
  try {
    console.log('Registering researcher templates...')

    // Standard researcher template for native tool calling
    await promptRegistry.registerStandardTemplate(
      'researcher-native',
      'Researcher Assistant (Native Tool Calling)',
      'Template for the researcher agent with native tool calling',
      'search-native-tools',
      BASE_RESEARCHER_TEMPLATE,
      {
        tags: ['search', 'citation', 'research', 'native-tools'],
        variables: ['searchEnabled', 'currentDate'],
        modelCompatibility: ['*']
      }
    )

    // Version with explicit reasoning instructions
    const REASONING_RESEARCHER_TEMPLATE = `
${BASE_RESEARCHER_TEMPLATE}

When analyzing information, please:
1. Break down complex questions into smaller components
2. Explicitly state your reasoning process step by step
3. Distinguish between factual information and your own inferences
4. Consider alternative viewpoints before reaching conclusions
5. Identify any assumptions you're making in your analysis
`

    // Add as a new version of the standard researcher template
    await promptRegistry.addVersion(
      'researcher-native',
      '1.1-reasoning',
      REASONING_RESEARCHER_TEMPLATE,
      'Enhanced version with explicit reasoning instructions'
    )

    // Manual researcher template (for non-tool-calling models)
    await promptRegistry.registerStandardTemplate(
      'researcher-manual',
      'Researcher Assistant (Manual Tool Calling)',
      'Template for the researcher agent with manual tool calling',
      'search-manual',
      BASE_RESEARCHER_TEMPLATE,
      {
        tags: ['search', 'citation', 'research', 'manual-tools'],
        variables: ['searchEnabled', 'currentDate'],
        modelCompatibility: ['*']
      }
    )

    // Basic chat template (when search is disabled)
    await promptRegistry.registerStandardTemplate(
      'general-chat',
      'General Chat Assistant',
      'Template for general chat without search capabilities',
      'general-chat',
      BASE_RESEARCHER_TEMPLATE.replace('{{#if searchEnabled}}', '')
        .replace('{{else}}', '')
        .replace('{{/if}}', ''),
      {
        tags: ['chat', 'general'],
        variables: ['currentDate'],
        modelCompatibility: ['*']
      }
    )

    console.log('All researcher templates registered')
  } catch (error) {
    console.error('Error registering researcher templates:', error)
  }
}

export { registerTemplates as registerResearcherTemplates }
