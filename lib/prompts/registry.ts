import { promptRepository, PromptTemplate } from './repository'

/**
 * Registry for prompt templates with utility methods for registration
 * and template management
 */
export class PromptRegistry {
  /**
   * Register a new template
   */
  async register(template: PromptTemplate): Promise<void> {
    await promptRepository.register(template)
  }

  /**
   * Add a new version to an existing template
   */
  async addVersion(
    templateId: string,
    version: string,
    template: string,
    description?: string,
    author?: string
  ): Promise<void> {
    await promptRepository.addVersion(
      templateId,
      version,
      template,
      description,
      author
    )
  }

  /**
   * Set the current version for a template
   */
  async setCurrentVersion(templateId: string, version: string): Promise<void> {
    await promptRepository.setCurrentVersion(templateId, version)
  }

  /**
   * List all templates, optionally filtered by category
   */
  async listTemplates(category?: string): Promise<PromptTemplate[]> {
    return promptRepository.listTemplates(category)
  }

  /**
   * Create a template object with required fields
   */
  createTemplate({
    id,
    name,
    description,
    category,
    template,
    tags = [],
    variables = [],
    modelCompatibility,
    version = '1.0',
    isExperimental = false
  }: {
    id: string
    name: string
    description: string
    category: string
    template: string
    tags?: string[]
    variables?: string[]
    modelCompatibility?: string[]
    version?: string
    isExperimental?: boolean
  }): PromptTemplate {
    return {
      id,
      name,
      description,
      category,
      tags,
      currentVersion: version,
      versions: {
        [version]: {
          version,
          template,
          createdAt: new Date().toISOString(),
          description: `Initial version of ${name}`
        }
      },
      variables,
      modelCompatibility,
      isExperimental,
      lastModified: new Date().toISOString()
    }
  }

  /**
   * Register a standard template with a single version
   */
  async registerStandardTemplate(
    id: string,
    name: string,
    description: string,
    category: string,
    template: string,
    options?: {
      tags?: string[]
      variables?: string[]
      modelCompatibility?: string[]
      version?: string
      isExperimental?: boolean
    }
  ): Promise<void> {
    const templateObj = this.createTemplate({
      id,
      name,
      description,
      category,
      template,
      ...options
    })

    await this.register(templateObj)
  }
}

// Singleton instance
export const promptRegistry = new PromptRegistry()