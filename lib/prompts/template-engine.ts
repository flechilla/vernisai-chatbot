import { promptRepository } from './repository'

// Using types instead of interfaces as per codebase convention
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
    if (!template || typeof template !== 'string') {
      console.error('Invalid template provided:', template)
      throw new Error(`Invalid template provided: ${typeof template}`)
    }
    
    try {
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
    } catch (error) {
      console.error('Error processing template:', error)
      // Return a default template as fallback in case of processing errors
      return `You are a helpful AI assistant.\nCurrent date: ${new Date().toISOString().split('T')[0]}`
    }
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