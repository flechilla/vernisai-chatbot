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

The proposed Prompt Management System would implement a flexible, maintainable architecture:

```
┌─────────────────────────────────────┐
│         Prompt Registry              │
├─────────────────────────────────────┤
│ - Store prompt templates            │
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

#### 1. Prompt Registry

A central storage system for managing all prompt templates:

```typescript
// lib/prompts/registry.ts
export interface PromptVersion {
  version: string;
  template: string;
  createdAt: Date;
  author?: string;
  description?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  currentVersion: string;
  versions: Record<string, PromptVersion>;
  variables: string[];
  modelCompatibility?: string[];
  isExperimental?: boolean;
}

class PromptRegistry {
  private templates: Map<string, PromptTemplate> = new Map();
  
  register(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }
  
  getTemplate(id: string, version?: string): PromptVersion | null {
    const template = this.templates.get(id);
    if (!template) return null;
    
    const targetVersion = version || template.currentVersion;
    return template.versions[targetVersion] || null;
  }
  
  listTemplates(category?: string): PromptTemplate[] {
    const allTemplates = Array.from(this.templates.values());
    return category 
      ? allTemplates.filter(t => t.category === category)
      : allTemplates;
  }
  
  addVersion(
    templateId: string, 
    version: string, 
    template: string,
    description?: string
  ): void {
    const existing = this.templates.get(templateId);
    if (!existing) throw new Error(`Template ${templateId} not found`);
    
    existing.versions[version] = {
      version,
      template,
      createdAt: new Date(),
      description
    };
  }
  
  setCurrentVersion(templateId: string, version: string): void {
    const template = this.templates.get(templateId);
    if (!template) throw new Error(`Template ${templateId} not found`);
    if (!template.versions[version]) {
      throw new Error(`Version ${version} not found for template ${templateId}`);
    }
    
    template.currentVersion = version;
  }
}

export const promptRegistry = new PromptRegistry();
```

#### 2. Template Engine

A system for processing templates with variables and conditional sections:

```typescript
// lib/prompts/template-engine.ts
interface TemplateContext {
  [key: string]: any;
}

interface TemplateOptions {
  escapeHTML?: boolean;
  trimBlankLines?: boolean;
}

class PromptTemplateEngine {
  /**
   * Process a template string by substituting variables
   * and evaluating conditional sections
   */
  process(
    template: string,
    context: TemplateContext = {},
    options: TemplateOptions = {}
  ): string {
    let result = template;
    
    // Process conditional sections first
    result = this.processConditionals(result, context);
    
    // Then substitute variables
    result = this.substituteVariables(result, context);
    
    // Apply postprocessing options
    if (options.trimBlankLines) {
      result = result.replace(/^\s*[\r\n]/gm, '');
    }
    
    return result;
  }
  
  /**
   * Process conditional sections in the format:
   * {{#if condition}}content{{/if}}
   * {{#if condition}}content{{else}}alternative{{/if}}
   */
  private processConditionals(template: string, context: TemplateContext): string {
    const conditionalRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
    
    return template.replace(conditionalRegex, (match, condition, content, alternative = '') => {
      // Evaluate the condition expression
      let isTrue = false;
      try {
        const expr = this.parseCondition(condition, context);
        isTrue = !!expr;
      } catch (e) {
        console.warn(`Error evaluating condition "${condition}":`, e);
      }
      
      return isTrue ? content : alternative;
    });
  }
  
  /**
   * Substitute variables in the format {{variableName}}
   */
  private substituteVariables(template: string, context: TemplateContext): string {
    const variableRegex = /\{\{([^#\/][^}]*?)\}\}/g;
    
    return template.replace(variableRegex, (match, varName) => {
      const trimmedName = varName.trim();
      const value = this.getNestedProperty(context, trimmedName);
      return value !== undefined ? String(value) : match;
    });
  }
  
  /**
   * Parse a conditional expression within the template
   */
  private parseCondition(condition: string, context: TemplateContext): any {
    // Handle simple variable checks
    if (!condition.includes('==') && !condition.includes('!=') && 
        !condition.includes('>') && !condition.includes('<')) {
      return this.getNestedProperty(context, condition.trim());
    }
    
    // Basic comparison operations
    if (condition.includes('==')) {
      const [left, right] = condition.split('==').map(s => s.trim());
      const leftVal = this.getNestedProperty(context, left);
      const rightVal = right.startsWith('"') && right.endsWith('"') 
        ? right.slice(1, -1) 
        : this.getNestedProperty(context, right);
      return leftVal == rightVal;
    }
    
    if (condition.includes('!=')) {
      const [left, right] = condition.split('!=').map(s => s.trim());
      const leftVal = this.getNestedProperty(context, left);
      const rightVal = right.startsWith('"') && right.endsWith('"') 
        ? right.slice(1, -1) 
        : this.getNestedProperty(context, right);
      return leftVal != rightVal;
    }
    
    // Handle additional operators as needed
    
    return false;
  }
  
  /**
   * Get a potentially nested property from an object using dot notation
   */
  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((prev, curr) => {
      return prev && prev[curr] !== undefined ? prev[curr] : undefined;
    }, obj);
  }
}

export const templateEngine = new PromptTemplateEngine();
```

#### 3. Prompt Selector

A component to intelligently select the appropriate prompt:

```typescript
// lib/prompts/selector.ts
import { CoreMessage } from 'ai';
import { Model } from '@/lib/types/models';
import { promptRegistry } from './registry';
import { templateEngine } from './template-engine';

interface PromptSelectionCriteria {
  modelId: string;
  model?: Model;
  messages?: CoreMessage[];
  isSearchEnabled?: boolean;
  taskType?: 'chat' | 'search' | 'reasoning' | 'related-questions';
  experimentGroup?: string;
}

interface SelectedPrompt {
  promptId: string;
  version: string;
  processedPrompt: string;
  templateId: string;
}

class PromptSelector {
  /**
   * Select the most appropriate prompt based on criteria
   */
  selectPrompt(
    criteria: PromptSelectionCriteria,
    context: Record<string, any> = {}
  ): SelectedPrompt {
    // 1. Determine the base template category
    const category = this.determineCategory(criteria);
    
    // 2. Get candidate templates from that category
    const candidates = promptRegistry.listTemplates(category)
      .filter(template => this.isCompatible(template, criteria));
    
    if (candidates.length === 0) {
      throw new Error(`No compatible prompt templates found for ${category}`);
    }
    
    // 3. Select the most appropriate template (could be A/B testing here)
    const selectedTemplate = this.rankTemplates(candidates, criteria)[0];
    
    // 4. Process the template with the provided context
    const templateVersion = promptRegistry.getTemplate(
      selectedTemplate.id, 
      selectedTemplate.currentVersion
    );
    
    if (!templateVersion) {
      throw new Error(`Failed to get template version for ${selectedTemplate.id}`);
    }
    
    // 5. Add standard context variables
    const enhancedContext = {
      ...context,
      currentDate: new Date().toISOString().split('T')[0],
      modelName: criteria.model?.name || criteria.modelId,
      isNativeToolCalling: criteria.model?.toolCallType === 'native',
      searchEnabled: criteria.isSearchEnabled
    };
    
    const processedPrompt = templateEngine.process(
      templateVersion.template,
      enhancedContext,
      { trimBlankLines: true }
    );
    
    return {
      promptId: selectedTemplate.id,
      version: selectedTemplate.currentVersion,
      processedPrompt,
      templateId: selectedTemplate.id
    };
  }
  
  /**
   * Determine which category of prompts to use
   */
  private determineCategory(criteria: PromptSelectionCriteria): string {
    if (criteria.taskType === 'related-questions') {
      return 'related-questions';
    }
    
    if (criteria.taskType === 'reasoning') {
      return 'reasoning';
    }
    
    if (criteria.isSearchEnabled) {
      return criteria.model?.toolCallType === 'native' 
        ? 'search-native-tools' 
        : 'search-manual';
    }
    
    return 'general-chat';
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
      const modelId = criteria.modelId.split(':')[1]; // Extract model ID without provider
      if (!template.modelCompatibility.some(
        pattern => this.matchesPattern(modelId, pattern)
      )) {
        return false;
      }
    }
    
    // Add additional compatibility checks as needed
    
    return true;
  }
  
  /**
   * Match a model ID against a pattern (supports * wildcards)
   */
  private matchesPattern(id: string, pattern: string): boolean {
    if (pattern === '*') return true;
    
    const regexPattern = pattern
      .replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&')
      .replace(/\*/g, '.*');
      
    return new RegExp(`^${regexPattern}$`).test(id);
  }
  
  /**
   * Rank templates by appropriateness for the criteria
   */
  private rankTemplates(
    templates: PromptTemplate[], 
    criteria: PromptSelectionCriteria
  ): PromptTemplate[] {
    // Use A/B testing group if available
    if (criteria.experimentGroup && templates.length > 1) {
      const experimentalTemplates = templates.filter(t => t.isExperimental);
      if (experimentalTemplates.length > 0) {
        // Use hash of experiment group to consistently select a template
        const groupHash = this.hashString(criteria.experimentGroup);
        return [experimentalTemplates[groupHash % experimentalTemplates.length]];
      }
    }
    
    // For now just return the templates in order, but could implement
    // more sophisticated ranking logic here
    return templates;
  }
  
  /**
   * Simple string hash function for A/B group assignment
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

export const promptSelector = new PromptSelector();
```

#### 4. Prompt Analytics

A system to track prompt performance:

```typescript
// lib/prompts/analytics.ts
interface PromptUsageRecord {
  promptId: string;
  version: string;
  modelId: string;
  useTimestamp: Date;
  executionTimeMs: number;
  tokensUsed?: number;
  success: boolean;
}

interface PromptPerformanceMetrics {
  promptId: string;
  version: string;
  usageCount: number;
  averageExecutionTime: number;
  successRate: number;
  estimatedCost: number;
  lastUsed: Date;
}

class PromptAnalytics {
  private usageRecords: PromptUsageRecord[] = [];
  
  /**
   * Record a prompt usage event
   */
  recordUsage(record: PromptUsageRecord): void {
    this.usageRecords.push(record);
    
    // In a production system, you might want to
    // persist this data to a database or analytics service
    
    // This could also trigger immediate reporting for
    // experiment tracking or performance monitoring
  }
  
  /**
   * Get performance metrics for a specific prompt
   */
  getPromptMetrics(
    promptId: string,
    version?: string,
    timeframe?: { start: Date; end: Date }
  ): PromptPerformanceMetrics | null {
    let records = this.usageRecords.filter(r => r.promptId === promptId);
    
    if (version) {
      records = records.filter(r => r.version === version);
    }
    
    if (timeframe) {
      records = records.filter(r => 
        r.useTimestamp >= timeframe.start && 
        r.useTimestamp <= timeframe.end
      );
    }
    
    if (records.length === 0) return null;
    
    const totalExecutionTime = records.reduce((sum, r) => sum + r.executionTimeMs, 0);
    const successCount = records.filter(r => r.success).length;
    const tokenUsage = records.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);
    
    // Assuming a cost of $0.002 per 1000 tokens (approximation)
    const estimatedCost = tokenUsage * 0.000002;
    
    return {
      promptId,
      version: version || 'all',
      usageCount: records.length,
      averageExecutionTime: totalExecutionTime / records.length,
      successRate: successCount / records.length,
      estimatedCost,
      lastUsed: new Date(Math.max(...records.map(r => r.useTimestamp.getTime())))
    };
  }
  
  /**
   * Compare performance between prompt versions
   */
  compareVersions(
    promptId: string,
    timeframe?: { start: Date; end: Date }
  ): Record<string, PromptPerformanceMetrics> {
    const records = this.usageRecords.filter(r => r.promptId === promptId);
    
    if (timeframe) {
      records.filter(r => 
        r.useTimestamp >= timeframe.start && 
        r.useTimestamp <= timeframe.end
      );
    }
    
    const versionGroups: Record<string, PromptUsageRecord[]> = {};
    
    // Group records by version
    records.forEach(record => {
      if (!versionGroups[record.version]) {
        versionGroups[record.version] = [];
      }
      versionGroups[record.version].push(record);
    });
    
    // Calculate metrics for each version
    const results: Record<string, PromptPerformanceMetrics> = {};
    
    Object.entries(versionGroups).forEach(([version, versionRecords]) => {
      const totalExecutionTime = versionRecords.reduce((sum, r) => sum + r.executionTimeMs, 0);
      const successCount = versionRecords.filter(r => r.success).length;
      const tokenUsage = versionRecords.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);
      
      results[version] = {
        promptId,
        version,
        usageCount: versionRecords.length,
        averageExecutionTime: totalExecutionTime / versionRecords.length,
        successRate: successCount / versionRecords.length,
        estimatedCost: tokenUsage * 0.000002,
        lastUsed: new Date(Math.max(...versionRecords.map(r => r.useTimestamp.getTime())))
      };
    });
    
    return results;
  }
}

export const promptAnalytics = new PromptAnalytics();
```

### Example Prompt Templates

Here's how the prompt templates would be defined:

```typescript
// lib/prompts/templates/researcher.ts
import { promptRegistry } from '../registry';

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
`;

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
});

// Version with explicit reasoning instructions
const REASONING_RESEARCHER_TEMPLATE = `
${BASE_RESEARCHER_TEMPLATE}

When analyzing information, please:
1. Break down complex questions into smaller components
2. Explicitly state your reasoning process step by step
3. Distinguish between factual information and your own inferences
4. Consider alternative viewpoints before reaching conclusions
5. Identify any assumptions you're making in your analysis
`;

// Register the reasoning template as a separate version
promptRegistry.addVersion(
  'researcher',
  '1.1-reasoning',
  REASONING_RESEARCHER_TEMPLATE,
  'Enhanced version with explicit reasoning instructions'
);

// Register a version optimized for specific models
const GPT4_RESEARCHER_TEMPLATE = `
${BASE_RESEARCHER_TEMPLATE}

Additional capabilities:
1. When summarizing long content, extract the key points while preserving nuance
2. For technical questions, include relevant code examples when appropriate
3. When analyzing data, consider statistical significance and potential biases
`;

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
});
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
    const startTime = Date.now();
    
    // Select the appropriate prompt based on model and context
    const selectedPrompt = promptSelector.selectPrompt({
      modelId: model,
      isSearchEnabled: searchMode,
      taskType: 'search',
      messages
    });
    
    // Record prompt usage (will be completed after execution)
    const usageRecord = {
      promptId: selectedPrompt.promptId,
      version: selectedPrompt.version,
      modelId: model,
      useTimestamp: new Date(),
      executionTimeMs: 0,
      success: true
    };
    
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
        usageRecord.executionTimeMs = Date.now() - startTime;
        usageRecord.tokensUsed = result.usage?.totalTokens;
        promptAnalytics.recordUsage(usageRecord);
        
        // Call original onFinish if provided
        if (originalOnFinish) {
          return originalOnFinish(result);
        }
      },
      onError: (error: any) => {
        // Record failure in analytics
        usageRecord.executionTimeMs = Date.now() - startTime;
        usageRecord.success = false;
        promptAnalytics.recordUsage(usageRecord);
        
        // Call original onError if provided
        if (originalOnError) {
          return originalOnError(error);
        }
      }
    };
    
    // Store original callbacks if they exist
    const originalOnFinish = researcherConfig.onFinish;
    const originalOnError = researcherConfig.onError;
    
    return researcherConfig;
  } catch (error) {
    console.error('Error in enhancedResearcher:', error);
    throw error;
  }
}
```

### Admin Interface for Prompt Management

A simple UI could be created for managing prompts:

```typescript
// app/admin/prompts/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { promptRegistry } from '@/lib/prompts/registry'
import { templateEngine } from '@/lib/prompts/template-engine'
import { promptAnalytics } from '@/lib/prompts/analytics'

export default function PromptManagementPage() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [previewContext, setPreviewContext] = useState({
    searchEnabled: true,
    currentDate: new Date().toISOString().split('T')[0]
  });
  const [previewResult, setPreviewResult] = useState('');
  
  useEffect(() => {
    // Load templates from registry
    setTemplates(promptRegistry.listTemplates());
  }, []);
  
  useEffect(() => {
    // Update preview when template, version or context changes
    if (selectedTemplate && selectedVersion) {
      const templateVersion = promptRegistry.getTemplate(
        selectedTemplate.id,
        selectedVersion
      );
      
      if (templateVersion) {
        try {
          const processed = templateEngine.process(
            templateVersion.template,
            previewContext
          );
          setPreviewResult(processed);
        } catch (error) {
          setPreviewResult(`Error: ${error.message}`);
        }
      }
    }
  }, [selectedTemplate, selectedVersion, previewContext]);
  
  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setSelectedVersion(template.currentVersion);
  };
  
  const handleVersionSelect = (version) => {
    setSelectedVersion(version);
  };
  
  const handleContextChange = (key, value) => {
    setPreviewContext({
      ...previewContext,
      [key]: value
    });
  };
  
  const handleSetDefaultVersion = () => {
    if (selectedTemplate && selectedVersion) {
      promptRegistry.setCurrentVersion(selectedTemplate.id, selectedVersion);
      // Refresh templates list
      setTemplates(promptRegistry.listTemplates());
    }
  };
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Prompt Management</h1>
      
      <div className="grid grid-cols-3 gap-4">
        {/* Templates list */}
        <div className="border p-4">
          <h2 className="text-xl mb-2">Templates</h2>
          <ul>
            {templates.map(template => (
              <li 
                key={template.id}
                className={`p-2 cursor-pointer ${selectedTemplate?.id === template.id ? 'bg-blue-100' : ''}`}
                onClick={() => handleTemplateSelect(template)}
              >
                {template.name}
              </li>
            ))}
          </ul>
        </div>
        
        {/* Template details and versions */}
        <div className="border p-4">
          {selectedTemplate ? (
            <>
              <h2 className="text-xl mb-2">{selectedTemplate.name}</h2>
              <p className="text-sm mb-4">{selectedTemplate.description}</p>
              
              <h3 className="font-bold mt-4">Variables</h3>
              <ul className="text-sm mb-4">
                {selectedTemplate.variables.map(variable => (
                  <li key={variable} className="py-1">
                    <span className="font-mono">{variable}</span>
                    
                    {/* Simple controls for common variable types */}
                    {variable === 'searchEnabled' && (
                      <select 
                        className="ml-2 border"
                        value={previewContext[variable] ? 'true' : 'false'}
                        onChange={e => handleContextChange(
                          variable, 
                          e.target.value === 'true'
                        )}
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    )}
                  </li>
                ))}
              </ul>
              
              <h3 className="font-bold mt-4">Versions</h3>
              <ul>
                {Object.keys(selectedTemplate.versions).map(version => (
                  <li 
                    key={version}
                    className={`py-1 flex justify-between ${version === selectedTemplate.currentVersion ? 'font-bold' : ''}`}
                  >
                    <span 
                      className={`cursor-pointer ${selectedVersion === version ? 'text-blue-500' : ''}`}
                      onClick={() => handleVersionSelect(version)}
                    >
                      {version} {version === selectedTemplate.currentVersion ? '(current)' : ''}
                    </span>
                    
                    {version !== selectedTemplate.currentVersion && selectedVersion === version && (
                      <button 
                        className="text-xs bg-blue-500 text-white px-2 py-1 rounded"
                        onClick={handleSetDefaultVersion}
                      >
                        Set as default
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Select a template from the list</p>
          )}
        </div>
        
        {/* Preview */}
        <div className="border p-4">
          <h2 className="text-xl mb-2">Preview</h2>
          {previewResult ? (
            <pre className="text-xs whitespace-pre-wrap bg-gray-100 p-2 rounded">
              {previewResult}
            </pre>
          ) : (
            <p>Select a template and version to preview</p>
          )}
        </div>
      </div>
    </div>
  );
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