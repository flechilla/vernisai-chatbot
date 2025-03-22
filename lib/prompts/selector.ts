import { CoreMessage } from 'ai'
import { Model } from '@/lib/types/models'
import { promptRepository } from './repository'
import { templateEngine, TemplateContext } from './template-engine'
import { PromptTemplate } from './repository'

// Using type instead of interface
export type PromptSelectionCriteria = {
  modelId: string
  model?: Model
  messages?: CoreMessage[]
  isSearchEnabled?: boolean
  taskType?: 'chat' | 'search' | 'reasoning' | 'related-questions'
  experimentGroup?: string
  userId?: string
}

export type SelectedPrompt = {
  promptId: string
  version: string
  processedPrompt: string
  templateId: string
  processingTime: number
}

export class PromptSelector {
  /**
   * Select the most appropriate prompt based on criteria
   */
  async selectPrompt(
    criteria: PromptSelectionCriteria,
    context: Record<string, any> = {}
  ): Promise<SelectedPrompt> {
    const startTime = Date.now()
    try {
      // 1. Determine the base template category
      const category = this.determineCategory(criteria)

      // 2. Get candidate templates from that category
      console.log('Getting templates for category:', category)
      const templates = await promptRepository.listTemplates(category)
      console.log(`Found ${templates.length} templates for category ${category}`)
      
      if (templates.length === 0) {
        // No templates found for this category, return default prompt
        throw new Error(`No templates found for category ${category}`)
      }
      
      const candidates = templates.filter(template =>
        this.isCompatible(template, criteria)
      )

      if (candidates.length === 0) {
        throw new Error(`No compatible prompt templates found for ${category}`)
      }

      // 3. Select the most appropriate template (could be A/B testing here)
      const selectedTemplate = await this.rankTemplates(candidates, criteria)
      console.log('Selected template ID:', selectedTemplate.id)

      // 4. Process the template with the provided context
      const templateVersion = await promptRepository.getTemplate(
        selectedTemplate.id,
        selectedTemplate.currentVersion
      )

      if (!templateVersion) {
        throw new Error(
          `Failed to get template version for ${selectedTemplate.id}`
        )
      }

      // 5. Add standard context variables
      const enhancedContext: TemplateContext = {
        ...context,
        currentDate: new Date().toISOString().split('T')[0],
        modelName: criteria.model?.name || criteria.modelId,
        isNativeToolCalling: criteria.model?.toolCallType === 'native',
        searchEnabled: criteria.isSearchEnabled,
        // Add additional system variables
        _system: {
          timestamp: Date.now(),
          modelProvider: criteria.modelId.split(':')[0],
          modelId: criteria.modelId.split(':')[1] || criteria.modelId
        }
      }

      // Include user information if available
      if (criteria.userId) {
        enhancedContext._user = {
          id: criteria.userId
        }
      }

      // Process the template with caching enabled
      const processedPrompt = await templateEngine.process(
        templateVersion.template,
        enhancedContext,
        {
          trimBlankLines: true,
          cacheTTL: 300 // Cache for 5 minutes
        }
      )

      return {
        promptId: selectedTemplate.id,
        version: selectedTemplate.currentVersion,
        processedPrompt,
        templateId: selectedTemplate.id,
        processingTime: Date.now() - startTime
      }
    } catch (error) {
      console.error('Error in selectPrompt:', error)

      // Generate a default prompt based on the search mode
      let defaultPrompt = `You are a helpful AI assistant. `
      
      if (criteria.isSearchEnabled) {
        defaultPrompt += `
You have access to real-time web search, content retrieval, and video search capabilities.
When asked a question, you should:
1. Search for relevant information using the search tool when needed
2. Use the retrieve tool to get detailed content from specific URLs
3. Use the video search tool when looking for video content
4. Analyze all search results to provide accurate, up-to-date information
5. Always cite sources using the [number](url) format
6. If results are not relevant or helpful, rely on your general knowledge

Citation Format:
[number](url)
`
      } else {
        defaultPrompt += `
When asked a question, you should:
1. Draw on your general knowledge to provide accurate information
2. Acknowledge limitations in your knowledge when appropriate
3. Suggest specific topics that might benefit from search when relevant
`
      }
      
      defaultPrompt += `\nCurrent date: ${new Date().toISOString().split('T')[0]}`

      return {
        promptId: 'default-fallback',
        version: '1.0',
        processedPrompt: defaultPrompt,
        templateId: 'default-fallback',
        processingTime: Date.now() - startTime
      }
    }
  }

  /**
   * Determine which category of prompts to use
   */
  private determineCategory(criteria: PromptSelectionCriteria): string {
    if (criteria.taskType === 'related-questions') {
      return 'related-questions'
    }

    if (criteria.taskType === 'reasoning') {
      return 'reasoning'
    }

    if (criteria.isSearchEnabled) {
      return criteria.model?.toolCallType === 'native'
        ? 'search-native-tools'
        : 'search-manual'
    }

    return 'general-chat'
  }

  /**
   * Check if a template is compatible with the given criteria
   */
  private isCompatible(
    template: PromptTemplate,
    criteria: PromptSelectionCriteria
  ): boolean {
    // Check model compatibility if specified
    if (template.modelCompatibility && template.modelCompatibility.length > 0) {
      const modelId = criteria.modelId.includes(':') 
        ? criteria.modelId.split(':')[1] 
        : criteria.modelId // Extract model ID without provider if present
      
      if (
        !template.modelCompatibility.some(pattern =>
          this.matchesPattern(modelId, pattern)
        )
      ) {
        return false
      }
    }

    // Add additional compatibility checks as needed

    return true
  }

  /**
   * Match a model ID against a pattern (supports * wildcards)
   */
  private matchesPattern(id: string, pattern: string): boolean {
    if (pattern === '*') return true

    const regexPattern = pattern
      .replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&')
      .replace(/\*/g, '.*')

    return new RegExp(`^${regexPattern}$`).test(id)
  }

  /**
   * Rank templates by appropriateness for the criteria
   * Returns the best template for the given criteria
   */
  private async rankTemplates(
    templates: PromptTemplate[],
    criteria: PromptSelectionCriteria
  ): Promise<PromptTemplate> {
    // Use A/B testing group if available
    if (criteria.experimentGroup && templates.length > 1) {
      // Check if we have experimental templates
      const experimentalTemplates = templates.filter(t => t.isExperimental)

      if (experimentalTemplates.length > 0) {
        // Use hash of experiment group to consistently select a template
        const groupHash = this.hashString(criteria.experimentGroup)
        return experimentalTemplates[groupHash % experimentalTemplates.length]
      }
    }

    // Default: return first template
    return templates[0]
  }

  /**
   * Simple string hash function for A/B group assignment
   */
  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i)
      hash |= 0 // Convert to 32bit integer
    }
    return Math.abs(hash)
  }
}

// Singleton instance
export const promptSelector = new PromptSelector()