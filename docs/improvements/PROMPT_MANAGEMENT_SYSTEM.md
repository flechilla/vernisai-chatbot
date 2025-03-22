# Prompt Management System

## Current Implementation Analysis

The VernisAI Chatbot currently manages prompts using a basic approach with several limitations:

### Existing Architecture

1. **Prompt Definition**

   - System prompts are defined as string constants directly in agent files
   - Different variants exist in `researcher.ts` and `manual-researcher.ts`
   - Prompts mix instructions, formatting guidance, and contextual information

2. **Prompt Selection**

   - Prompt selection is determined by agent type and a binary `searchMode` flag
   - No dynamic prompt adjustment based on query complexity or user preferences
   - Limited ability to maintain prompt consistency across different components

3. **Prompt Composition**
   - Current date information is appended at runtime
   - Some hard-coded content (e.g., citation format) is duplicated across prompts
   - No structured approach to conditional content based on model capabilities

### Current Limitations

1. **Maintenance Challenges**

   - Updating prompts requires modifying code in multiple places
   - No version control for prompt iterations
   - Difficult to track which prompt versions perform better
   - No persistence layer for storing prompts outside of code

2. **Inconsistent Behavior**

   - Slight variations in prompts can lead to inconsistent assistant behavior
   - No guarantee that all models receive appropriate instructions
   - Manual synchronization required when updating prompt content

3. **Limited Customization**

   - No ability to tailor prompts for specific domains or user needs
   - Cannot easily A/B test prompt variations
   - Difficult to optimize prompts for different models

4. **Poor Separation of Concerns**
   - Mixing of formatting instructions with functional directives
   - Business logic entangled with presentation guidance
   - No clear organization of prompt components by purpose

## Enhanced Prompt Management System Design

### Core Architecture

The proposed Prompt Management System would implement a flexible, maintainable architecture with persistent storage:

```
┌─────────────────────────────────────┐
│         Prompt Repository           │
├─────────────────────────────────────┤
│ - Redis/Upstash storage             │
│ - Version management                │
│ - Category organization             │
└───────────────┬─────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│         Template Engine             │
├─────────────────────────────────────┤
│ - Variable substitution             │
│ - Conditional sections              │
│ - Component composition             │
└───────────────┬─────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│         Prompt Selector             │
├─────────────────────────────────────┤
│ - Context-based selection           │
│ - Model capability adaptation       │
│ - A/B testing support               │
└───────────────┬─────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│         Prompt Analytics            │
├─────────────────────────────────────┤
│ - Performance tracking              │
│ - Usage statistics                  │
│ - Effectiveness measurement         │
└─────────────────────────────────────┘
```

### Key Components

#### 1. Prompt Repository with Redis/Upstash

A central storage system for managing all prompt templates with persistent storage:

```typescript
// lib/prompts/repository.ts
import { Redis } from '@upstash/redis'

// Using type instead of interface as preferred in the codebase
export type PromptVersion = {
  version: string
  template: string
  createdAt: string // ISO string for better Redis serialization
  author?: string
  description?: string
}

export type PromptTemplate = {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  currentVersion: string
  versions: Record<string, PromptVersion>
  variables: string[]
  modelCompatibility?: string[]
  isExperimental?: boolean
  lastModified: string // ISO string
}

// Redis key patterns
const PROMPT_KEY_PREFIX = 'prompt:template:'
const PROMPT_LIST_KEY = 'prompts:list'
const PROMPT_CATEGORY_PREFIX = 'prompts:category:'

export class PromptRepository {
  private redis: Redis
  private cache: Map<string, PromptTemplate> = new Map()

  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || ''
    })
  }

  /**
   * Registers a new template or updates an existing one
   */
  async register(template: PromptTemplate): Promise<void> {
    const key = PROMPT_KEY_PREFIX + template.id

    // Update last modified time
    template.lastModified = new Date().toISOString()

    // Store template in Redis
    await this.redis.set(key, JSON.stringify(template))

    // Add to global list if it's new
    await this.redis.sadd(PROMPT_LIST_KEY, template.id)

    // Add to category set
    await this.redis.sadd(
      PROMPT_CATEGORY_PREFIX + template.category,
      template.id
    )

    // Update local cache
    this.cache.set(template.id, template)
  }

  /**
   * Retrieves a template and specific version
   */
  async getTemplate(
    id: string,
    version?: string
  ): Promise<PromptVersion | null> {
    // Try cache first
    let template = this.cache.get(id)

    // If not in cache, try Redis
    if (!template) {
      const data = await this.redis.get<string>(PROMPT_KEY_PREFIX + id)
      if (!data) return null

      template = JSON.parse(data) as PromptTemplate
      this.cache.set(id, template)
    }

    const targetVersion = version || template.currentVersion
    return template.versions[targetVersion] || null
  }

  /**
   * Lists all templates, optionally filtered by category
   */
  async listTemplates(category?: string): Promise<PromptTemplate[]> {
    let templateIds: string[]

    if (category) {
      // Get templates for specific category
      templateIds = await this.redis.smembers(PROMPT_CATEGORY_PREFIX + category)
    } else {
      // Get all templates
      templateIds = await this.redis.smembers(PROMPT_LIST_KEY)
    }

    // Load templates in parallel
    const templates = await Promise.all(
      templateIds.map(async id => {
        const data = await this.redis.get<string>(PROMPT_KEY_PREFIX + id)
        return data ? (JSON.parse(data) as PromptTemplate) : null
      })
    )

    // Update cache with fetched templates
    templates.forEach(t => {
      if (t) this.cache.set(t.id, t)
    })

    return templates.filter(Boolean) as PromptTemplate[]
  }

  /**
   * Adds a new version to an existing template
   */
  async addVersion(
    templateId: string,
    version: string,
    template: string,
    description?: string,
    author?: string
  ): Promise<void> {
    // Get the full template first
    const key = PROMPT_KEY_PREFIX + templateId
    const data = await this.redis.get<string>(key)

    if (!data) {
      throw new Error(`Template ${templateId} not found`)
    }

    const existingTemplate = JSON.parse(data) as PromptTemplate

    // Add the new version
    existingTemplate.versions[version] = {
      version,
      template,
      createdAt: new Date().toISOString(),
      description,
      author
    }

    // Update modified time
    existingTemplate.lastModified = new Date().toISOString()

    // Write back to Redis
    await this.redis.set(key, JSON.stringify(existingTemplate))

    // Update cache
    this.cache.set(templateId, existingTemplate)
  }

  /**
   * Sets the current version for a template
   */
  async setCurrentVersion(templateId: string, version: string): Promise<void> {
    // Get the full template first
    const key = PROMPT_KEY_PREFIX + templateId
    const data = await this.redis.get<string>(key)

    if (!data) {
      throw new Error(`Template ${templateId} not found`)
    }

    const existingTemplate = JSON.parse(data) as PromptTemplate

    if (!existingTemplate.versions[version]) {
      throw new Error(`Version ${version} not found for template ${templateId}`)
    }

    // Update the current version
    existingTemplate.currentVersion = version
    existingTemplate.lastModified = new Date().toISOString()

    // Write back to Redis
    await this.redis.set(key, JSON.stringify(existingTemplate))

    // Update cache
    this.cache.set(templateId, existingTemplate)
  }

  /**
   * Clear cache for a specific template or all templates
   */
  clearCache(templateId?: string): void {
    if (templateId) {
      this.cache.delete(templateId)
    } else {
      this.cache.clear()
    }
  }
}

// Singleton instance
export const promptRepository = new PromptRepository()
```

#### 2. Template Engine

A system for processing templates with variables and conditional sections:

```typescript
// lib/prompts/template-engine.ts
// Using types instead of interfaces
export type TemplateContext = {
  [key: string]: any
}

export type TemplateOptions = {
  escapeHTML?: boolean
  trimBlankLines?: boolean
  cacheTTL?: number
}

// Track cached templates to avoid repeated processing
type CachedTemplate = {
  result: string
  timestamp: number
  contextHash: string
}

export class PromptTemplateEngine {
  // Cache for processed templates
  private templateCache: Map<string, CachedTemplate> = new Map()

  /**
   * Process a template string by substituting variables
   * and evaluating conditional sections
   */
  async process(
    template: string,
    context: TemplateContext = {},
    options: TemplateOptions = {}
  ): Promise<string> {
    // Generate a cache key if caching is enabled
    const cacheTTL = options.cacheTTL || 0
    if (cacheTTL > 0) {
      const contextHash = this.hashObject(context)
      const cacheKey = `${this.hashString(template)}_${contextHash}`

      // Check cache
      const cached = this.templateCache.get(cacheKey)
      if (cached && (Date.now() - cached.timestamp) / 1000 < cacheTTL) {
        return cached.result
      }

      // Process template
      const result = await this.processTemplate(template, context, options)

      // Cache result
      this.templateCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
        contextHash
      })

      return result
    }

    // If no caching, just process
    return this.processTemplate(template, context, options)
  }

  /**
   * Clear the template cache
   */
  clearCache(): void {
    this.templateCache.clear()
  }

  /**
   * Internal method to process a template
   */
  private async processTemplate(
    template: string,
    context: TemplateContext,
    options: TemplateOptions
  ): Promise<string> {
    let result = template

    // Process conditional sections first
    result = this.processConditionals(result, context)

    // Then substitute variables
    result = this.substituteVariables(result, context)

    // Process includes if any (asynchronous operation)
    result = await this.processIncludes(result, context, options)

    // Apply postprocessing options
    if (options.trimBlankLines) {
      result = result.replace(/^\s*[\r\n]/gm, '')
    }

    return result
  }

  /**
   * Process conditional sections in the format:
   * {{#if condition}}content{{/if}}
   * {{#if condition}}content{{else}}alternative{{/if}}
   */
  private processConditionals(
    template: string,
    context: TemplateContext
  ): string {
    const conditionalRegex =
      /\{\{#if\s+([^}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g

    return template.replace(
      conditionalRegex,
      (match, condition, content, alternative = '') => {
        // Evaluate the condition expression
        let isTrue = false
        try {
          const expr = this.parseCondition(condition, context)
          isTrue = !!expr
        } catch (e) {
          console.warn(`Error evaluating condition "${condition}":`, e)
        }

        return isTrue ? content : alternative
      }
    )
  }

  /**
   * Substitute variables in the format {{variableName}}
   */
  private substituteVariables(
    template: string,
    context: TemplateContext
  ): string {
    const variableRegex = /\{\{([^#\/][^}]*?)\}\}/g

    return template.replace(variableRegex, (match, varName) => {
      const trimmedName = varName.trim()
      const value = this.getNestedProperty(context, trimmedName)
      return value !== undefined ? String(value) : match
    })
  }

  /**
   * Process include directives that include other templates
   * Format: {{> templateName context=variableName}}
   */
  private async processIncludes(
    template: string,
    parentContext: TemplateContext,
    options: TemplateOptions
  ): Promise<string> {
    const includeRegex = /\{\{>\s+([^}\s]+)(?:\s+context=([^}\s]+))?\s*\}\}/g

    // Find all includes
    const includes: Array<{
      match: string
      templateId: string
      contextVar?: string
    }> = []

    let match
    while ((match = includeRegex.exec(template)) !== null) {
      includes.push({
        match: match[0],
        templateId: match[1],
        contextVar: match[2]
      })
    }

    // If no includes, return template as is
    if (includes.length === 0) {
      return template
    }

    // Process each include
    let result = template
    for (const include of includes) {
      try {
        // Get the template from repository
        const { templateId, contextVar } = include
        const templateVersion = await promptRepository.getTemplate(templateId)

        if (!templateVersion) {
          console.error(`Template not found: ${templateId}`)
          continue
        }

        // Get context for the included template
        let includeContext = parentContext
        if (contextVar) {
          const contextValue = this.getNestedProperty(parentContext, contextVar)
          if (contextValue) {
            includeContext = {
              ...parentContext,
              ...contextValue
            }
          }
        }

        // Process the included template
        const processedInclude = await this.process(
          templateVersion.template,
          includeContext,
          options
        )

        // Replace the include directive with the processed template
        result = result.replace(include.match, processedInclude)
      } catch (e) {
        console.error(`Error processing include: ${include.templateId}`, e)
      }
    }

    return result
  }

  /**
   * Parse a conditional expression within the template
   */
  private parseCondition(condition: string, context: TemplateContext): any {
    // Handle simple variable checks
    if (
      !condition.includes('==') &&
      !condition.includes('!=') &&
      !condition.includes('>') &&
      !condition.includes('<')
    ) {
      return this.getNestedProperty(context, condition.trim())
    }

    // Basic comparison operations
    if (condition.includes('==')) {
      const [left, right] = condition.split('==').map(s => s.trim())
      const leftVal = this.getNestedProperty(context, left)
      const rightVal =
        right.startsWith('"') && right.endsWith('"')
          ? right.slice(1, -1)
          : this.getNestedProperty(context, right)
      return leftVal == rightVal
    }

    if (condition.includes('!=')) {
      const [left, right] = condition.split('!=').map(s => s.trim())
      const leftVal = this.getNestedProperty(context, left)
      const rightVal =
        right.startsWith('"') && right.endsWith('"')
          ? right.slice(1, -1)
          : this.getNestedProperty(context, right)
      return leftVal != rightVal
    }

    // Handle additional operators as needed

    return false
  }

  /**
   * Get a potentially nested property from an object using dot notation
   */
  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((prev, curr) => {
      return prev && prev[curr] !== undefined ? prev[curr] : undefined
    }, obj)
  }

  /**
   * Create a simple hash of an object for caching
   */
  private hashObject(obj: any): string {
    return this.hashString(JSON.stringify(obj))
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32bit integer
    }
    return hash.toString(36)
  }
}

// Singleton instance
export const templateEngine = new PromptTemplateEngine()
```

#### 3. Prompt Selector

A component to intelligently select the appropriate prompt:

```typescript
// lib/prompts/selector.ts
import { CoreMessage } from 'ai'
import { Model } from '@/lib/types/models'
import { promptRepository } from './repository'
import { templateEngine, TemplateContext } from './template-engine'

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
      const templates = await promptRepository.listTemplates(category)
      const candidates = templates.filter(template =>
        this.isCompatible(template, criteria)
      )

      if (candidates.length === 0) {
        throw new Error(`No compatible prompt templates found for ${category}`)
      }

      // 3. Select the most appropriate template (could be A/B testing here)
      const selectedTemplate = await this.rankTemplates(candidates, criteria)

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
          modelId: criteria.modelId.split(':')[1]
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

      // Fall back to a default prompt as a last resort
      const defaultPrompt = `You are a helpful AI assistant. 
Current date: ${new Date().toISOString().split('T')[0]}`

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
      const modelId = criteria.modelId.split(':')[1] // Extract model ID without provider
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

    // Check for personalized templates if userId is provided
    if (criteria.userId && templates.length > 1) {
      // In a real implementation, you might fetch user preferences from Redis
      // and use them to prioritize templates

      // Example: Get user's template performance data
      try {
        const userTemplateScore = await this.getUserTemplateScores(
          criteria.userId
        )

        if (userTemplateScore) {
          // Sort templates by user-specific performance
          const scoredTemplates = templates
            .map(template => ({
              template,
              score: userTemplateScore[template.id] || 0
            }))
            .sort((a, b) => b.score - a.score)

          // Return best performing template for this user
          if (scoredTemplates.length > 0 && scoredTemplates[0].score > 0) {
            return scoredTemplates[0].template
          }
        }
      } catch (error) {
        console.error('Error fetching user template scores:', error)
      }
    }

    // Default: return first template
    return templates[0]
  }

  /**
   * Get user-specific template performance scores from Redis
   */
  private async getUserTemplateScores(
    userId: string
  ): Promise<Record<string, number>> {
    try {
      // Get Redis client
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL || '',
        token: process.env.UPSTASH_REDIS_REST_TOKEN || ''
      })

      // Get user template scores from Redis
      const scores = await redis.hgetall(`user:${userId}:template:scores`)

      // Convert string values to numbers
      const numericScores: Record<string, number> = {}
      for (const [key, value] of Object.entries(scores)) {
        numericScores[key] = parseFloat(value as string) || 0
      }

      return numericScores
    } catch (error) {
      console.error('Error fetching template scores from Redis:', error)
      return {}
    }
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
```

}

// Singleton instance

```
export const promptSelector = new PromptSelector();
```

### Example Prompt Templates

Here's how the prompt templates would be defined:

```typescript
// lib/prompts/templates/researcher.ts
import { promptRegistry } from '../registry'

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

Current date and time: {{currentDate}}
`

// Register the template
promptRegistry.register({
  id: 'researcher',
  name: 'Researcher Assistant',
  description: 'Base template for the researcher agent',
  category: 'search-native-tools',
  tags: ['search', 'citation', 'research'],
  currentVersion: '1.0',
  versions: {
    '1.0': {
      version: '1.0',
      template: BASE_RESEARCHER_TEMPLATE,
      createdAt: new Date('2023-01-01'),
      description: 'Initial version'
    }
  },
  variables: ['searchEnabled', 'currentDate'],
  modelCompatibility: ['*']
})

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

// Register the reasoning template as a separate version
promptRegistry.addVersion(
  'researcher',
  '1.1-reasoning',
  REASONING_RESEARCHER_TEMPLATE,
  'Enhanced version with explicit reasoning instructions'
)

// Register a version optimized for specific models
const GPT4_RESEARCHER_TEMPLATE = `
${BASE_RESEARCHER_TEMPLATE}

Additional capabilities:
1. When summarizing long content, extract the key points while preserving nuance
2. For technical questions, include relevant code examples when appropriate
3. When analyzing data, consider statistical significance and potential biases
`

promptRegistry.register({
  id: 'researcher-gpt4',
  name: 'GPT-4 Optimized Researcher',
  description: 'Researcher template optimized for GPT-4 capabilities',
  category: 'search-native-tools',
  tags: ['search', 'citation', 'research', 'gpt4'],
  currentVersion: '1.0',
  versions: {
    '1.0': {
      version: '1.0',
      template: GPT4_RESEARCHER_TEMPLATE,
      createdAt: new Date('2023-02-15'),
      description: 'GPT-4 optimized version'
    }
  },
  variables: ['searchEnabled', 'currentDate'],
  modelCompatibility: ['gpt-4*']
})
```

### Integration with Agent System

Here's how the prompt system would be integrated with the agent system:

```typescript
// lib/agents/enhanced-researcher.ts
import { CoreMessage, smoothStream, streamText } from 'ai'
import { retrieveTool } from '../tools/retrieve'
import { searchTool } from '../tools/search'
import { videoSearchTool } from '../tools/video-search'
import { getModel } from '../utils/registry'
import { promptSelector } from '../prompts/selector'
import { promptAnalytics } from '../prompts/analytics'

type ResearcherReturn = Parameters<typeof streamText>[0]

export function enhancedResearcher({
  messages,
  model,
  searchMode
}: {
  messages: CoreMessage[]
  model: string
  searchMode: boolean
}): ResearcherReturn {
  try {
    const startTime = Date.now()

    // Select the appropriate prompt based on model and context
    const selectedPrompt = promptSelector.selectPrompt({
      modelId: model,
      isSearchEnabled: searchMode,
      taskType: 'search',
      messages
    })

    // Record prompt usage (will be completed after execution)
    const usageRecord = {
      promptId: selectedPrompt.promptId,
      version: selectedPrompt.version,
      modelId: model,
      useTimestamp: new Date(),
      executionTimeMs: 0,
      success: true
    }

    // Configure researcher with selected prompt
    const researcherConfig = {
      model: getModel(model),
      system: selectedPrompt.processedPrompt,
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
      experimental_transform: smoothStream({ chunking: 'word' }),
      onFinish: (result: any) => {
        // Complete analytics record with execution time
        usageRecord.executionTimeMs = Date.now() - startTime
        usageRecord.tokensUsed = result.usage?.totalTokens
        promptAnalytics.recordUsage(usageRecord)

        // Call original onFinish if provided
        if (originalOnFinish) {
          return originalOnFinish(result)
        }
      },
      onError: (error: any) => {
        // Record failure in analytics
        usageRecord.executionTimeMs = Date.now() - startTime
        usageRecord.success = false
        promptAnalytics.recordUsage(usageRecord)

        // Call original onError if provided
        if (originalOnError) {
          return originalOnError(error)
        }
      }
    }

    // Store original callbacks if they exist
    const originalOnFinish = researcherConfig.onFinish
    const originalOnError = researcherConfig.onError

    return researcherConfig
  } catch (error) {
    console.error('Error in enhancedResearcher:', error)
    throw error
  }
}
```

## Implementation Plan

### Phase 1: Core Framework

1. Implement the Prompt Registry
2. Create the Template Engine with variable substitution
3. Extract existing prompts into the registry
4. Create a basic version of the Prompt Selector

### Phase 2: Templating Enhancements

1. Add conditional sections to the Template Engine
2. Implement model-specific template variations
3. Create additional prompt templates with shared components
4. Integrate with the streaming system

### Phase 3: Analytics and Optimization

1. Implement the Prompt Analytics system
2. Create the admin interface for prompt management
3. Add A/B testing capabilities
4. Implement performance tracking and reporting

## Best Practices for Prompt Engineering

1. **Structural Consistency**

   - Maintain consistent structure across similar prompt types
   - Use numbered lists for instructions wherever possible
   - Separate functional directives from formatting guidance

2. **Versioning**

   - Use semantic versioning for prompt templates
   - Document changes between versions
   - Test new versions before deployment

3. **Modularity**

   - Break prompts into reusable components
   - Use conditional sections for model-specific instructions
   - Minimize duplication of common directives

4. **Testing**

   - Test prompts with different model versions
   - Verify results with various inputs
   - Compare performance metrics between versions

5. **Documentation**
   - Document the purpose of each template
   - Specify required variables
   - Include examples of expected outputs

## Conclusion

The Enhanced Prompt Management System would transform VernisAI's approach to prompt engineering from a static, code-embedded system to a dynamic, configurable framework. This system would enable:

1. Consistent prompt management across different components
2. Version control and A/B testing of prompts
3. Model-specific optimization without code changes
4. Performance tracking and analytics
5. Easy prompt updates without developer intervention

By separating prompt content from code and providing tools for non-developers to manage prompts, the system would improve both development efficiency and the quality of AI responses. The modular approach also enables continuous optimization based on usage data, leading to better user experiences over time.
