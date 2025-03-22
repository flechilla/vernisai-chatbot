import { Redis } from '@upstash/redis'
import { getRedisClient } from '../redis/config'

// Using type as preferred in the codebase
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
  private cache: Map<string, PromptTemplate> = new Map()

  /**
   * Registers a new template or updates an existing one
   */
  async register(template: PromptTemplate): Promise<void> {
    const key = PROMPT_KEY_PREFIX + template.id

    // Update last modified time
    template.lastModified = new Date().toISOString()

    try {
      const redis = await getRedisClient()
      
      // Convert template to a string for storage
      const templateStr = JSON.stringify(template)

      // Store template in Redis
      const pipeline = redis.pipeline()
      
      // Set the template
      // Using hmset to store the template as a hash
      pipeline.hmset(key, {
        data: templateStr
      })

      // Add to global list if it's new
      pipeline.zadd(PROMPT_LIST_KEY, Date.now(), template.id)

      // Add to category set
      pipeline.zadd(
        PROMPT_CATEGORY_PREFIX + template.category,
        Date.now(),
        template.id
      )

      await pipeline.exec()

      // Update local cache
      this.cache.set(template.id, template)
    } catch (error) {
      console.error('Error registering prompt template:', error)
      throw new Error(`Failed to register template ${template.id}`)
    }
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
      try {
        const redis = await getRedisClient()
        const data = await redis.hgetall<{ data: string }>(PROMPT_KEY_PREFIX + id)
        
        if (!data || !data.data) return null

        template = JSON.parse(data.data) as PromptTemplate
        this.cache.set(id, template)
      } catch (error) {
        console.error(`Error retrieving template ${id}:`, error)
        return null
      }
    }

    if (!template) return null

    const targetVersion = version || template.currentVersion
    return template.versions[targetVersion] || null
  }

  /**
   * Retrieves a full template
   */
  async getFullTemplate(id: string): Promise<PromptTemplate | null> {
    // Try cache first
    let template = this.cache.get(id)

    // If not in cache, try Redis
    if (!template) {
      try {
        const redis = await getRedisClient()
        const data = await redis.hgetall<{ data: string }>(PROMPT_KEY_PREFIX + id)
        
        if (!data || !data.data) return null

        template = JSON.parse(data.data) as PromptTemplate
        this.cache.set(id, template)
      } catch (error) {
        console.error(`Error retrieving full template ${id}:`, error)
        return null
      }
    }

    return template || null
  }

  /**
   * Lists all templates, optionally filtered by category
   */
  async listTemplates(category?: string): Promise<PromptTemplate[]> {
    try {
      const redis = await getRedisClient()
      let templateIds: string[]

      if (category) {
        // Get templates for specific category
        templateIds = await redis.zrange(
          PROMPT_CATEGORY_PREFIX + category,
          0,
          -1
        )
      } else {
        // Get all templates
        templateIds = await redis.zrange(PROMPT_LIST_KEY, 0, -1)
      }

      if (!templateIds || templateIds.length === 0) {
        return []
      }

      // Load templates in sequence
      const templates: PromptTemplate[] = []
      
      for (const id of templateIds) {
        // Check cache first
        if (this.cache.has(id)) {
          const cachedTemplate = this.cache.get(id)
          if (cachedTemplate) {
            templates.push(cachedTemplate)
            continue
          }
        }
        
        // Get from Redis
        const data = await redis.hgetall<{ data: string }>(PROMPT_KEY_PREFIX + id)
        if (data && data.data) {
          const template = JSON.parse(data.data) as PromptTemplate
          templates.push(template)
          this.cache.set(id, template)
        }
      }

      return templates
    } catch (error) {
      console.error('Error listing templates:', error)
      return []
    }
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
    try {
      // Get the full template first
      const existingTemplate = await this.getFullTemplate(templateId)

      if (!existingTemplate) {
        throw new Error(`Template ${templateId} not found`)
      }

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

      // Register the updated template
      await this.register(existingTemplate)

    } catch (error) {
      console.error(`Error adding version ${version} to template ${templateId}:`, error)
      throw new Error(`Failed to add version ${version} to template ${templateId}`)
    }
  }

  /**
   * Sets the current version for a template
   */
  async setCurrentVersion(templateId: string, version: string): Promise<void> {
    try {
      // Get the full template first
      const existingTemplate = await this.getFullTemplate(templateId)

      if (!existingTemplate) {
        throw new Error(`Template ${templateId} not found`)
      }

      if (!existingTemplate.versions[version]) {
        throw new Error(`Version ${version} not found for template ${templateId}`)
      }

      // Update the current version
      existingTemplate.currentVersion = version
      existingTemplate.lastModified = new Date().toISOString()

      // Register the updated template
      await this.register(existingTemplate)

    } catch (error) {
      console.error(`Error setting current version for template ${templateId}:`, error)
      throw new Error(`Failed to set current version for template ${templateId}`)
    }
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