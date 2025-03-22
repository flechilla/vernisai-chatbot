#### 4. Prompt Analytics with Redis

A system to track prompt performance with persistent storage in Redis:

```typescript
// lib/prompts/analytics.ts
import { Redis } from '@upstash/redis'

// Using types instead of interfaces
export type PromptUsageRecord = {
  promptId: string
  version: string
  modelId: string
  useTimestamp: string // ISO string for better Redis serialization
  executionTimeMs: number
  tokensUsed?: number
  success: boolean
  userId?: string
  feedbackScore?: number // User feedback rating (1-5)
}

export type PromptPerformanceMetrics = {
  promptId: string
  version: string
  usageCount: number
  averageExecutionTime: number
  successRate: number
  estimatedCost: number
  lastUsed: string // ISO string
  feedbackScore?: number
}

// Redis key patterns
const PROMPT_USAGE_PREFIX = 'prompt:usage:'
const PROMPT_USAGE_STREAM = 'prompt:usage:stream'
const PROMPT_METRICS_PREFIX = 'prompt:metrics:'
const USER_TEMPLATE_SCORE_PREFIX = 'user:'

export class PromptAnalytics {
  private redis: Redis
  private metricsCache: Map<string, PromptPerformanceMetrics> = new Map()

  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || ''
    })
  }

  /**
   * Record a prompt usage event in Redis
   */
  async recordUsage(record: PromptUsageRecord): Promise<void> {
    try {
      // Generate a unique ID for this usage record
      const usageId = `${record.promptId}:${record.version}:${Date.now()}:${Math.random().toString(36).substring(2, 10)}`

      // Save the full record
      await this.redis.set(
        `${PROMPT_USAGE_PREFIX}${usageId}`,
        JSON.stringify(record)
      )

      // Add to time series stream for time-based queries
      await this.redis.xadd(PROMPT_USAGE_STREAM, '*', {
        id: usageId,
        prompt_id: record.promptId,
        version: record.version,
        model_id: record.modelId,
        timestamp: record.useTimestamp,
        execution_time: record.executionTimeMs.toString(),
        tokens: (record.tokensUsed || 0).toString(),
        success: record.success ? '1' : '0'
      })

      // Update metrics counters
      const metricsKey = `${PROMPT_METRICS_PREFIX}${record.promptId}:${record.version}`

      // Use Redis transactions to atomically update metrics
      const pipeline = this.redis.pipeline()

      pipeline.hincrby(metricsKey, 'usage_count', 1)
      pipeline.hincrby(
        metricsKey,
        'execution_time_total',
        record.executionTimeMs
      )

      if (record.success) {
        pipeline.hincrby(metricsKey, 'success_count', 1)
      }

      if (record.tokensUsed) {
        pipeline.hincrby(metricsKey, 'tokens_total', record.tokensUsed)
      }

      pipeline.hset(metricsKey, 'last_used', record.useTimestamp)

      await pipeline.exec()

      // If user feedback is provided, update user-specific template scores
      if (record.userId && record.feedbackScore) {
        const userKey = `${USER_TEMPLATE_SCORE_PREFIX}${record.userId}:template:scores`

        // Get the current score
        const currentScore = parseFloat(
          (await this.redis.hget(userKey, record.promptId)) || '0'
        )

        // Update with exponential moving average (give more weight to recent scores)
        const alpha = 0.3 // Weight for new score (0.0-1.0)
        const newScore =
          alpha * record.feedbackScore + (1 - alpha) * currentScore

        // Store the updated score
        await this.redis.hset(userKey, record.promptId, newScore.toString())
      }

      // Invalidate cache
      this.metricsCache.delete(`${record.promptId}:${record.version}`)
      this.metricsCache.delete(`${record.promptId}:all`)
    } catch (error) {
      console.error('Error recording prompt usage in Redis:', error)
    }
  }

  /**
   * Get performance metrics for a specific prompt from Redis
   */
  async getPromptMetrics(
    promptId: string,
    version?: string,
    timeframe?: { start: string; end: string }
  ): Promise<PromptPerformanceMetrics | null> {
    try {
      // Generate cache key
      const cacheKey = `${promptId}:${version || 'all'}`

      // Check cache first (if not using timeframe)
      if (!timeframe && this.metricsCache.has(cacheKey)) {
        return this.metricsCache.get(cacheKey) || null
      }

      // If specific version requested
      if (version) {
        // Direct metrics lookup
        const metricsKey = `${PROMPT_METRICS_PREFIX}${promptId}:${version}`
        const metrics = await this.redis.hgetall(metricsKey)

        if (!metrics || Object.keys(metrics).length === 0) {
          return null
        }

        const result: PromptPerformanceMetrics = {
          promptId,
          version,
          usageCount: parseInt(metrics.usage_count as string) || 0,
          averageExecutionTime:
            parseInt(metrics.execution_time_total as string) /
              parseInt(metrics.usage_count as string) || 0,
          successRate:
            parseInt(metrics.success_count as string) /
              parseInt(metrics.usage_count as string) || 0,
          estimatedCost:
            (parseInt(metrics.tokens_total as string) || 0) * 0.000002,
          lastUsed: (metrics.last_used as string) || new Date().toISOString()
        }

        // Cache result if not using timeframe
        if (!timeframe) {
          this.metricsCache.set(cacheKey, result)
        }

        return result
      } else {
        // For all versions or with timeframe, we need to aggregate data
        // This implementation uses Redis streams to efficiently query by time
        const streamFilter = timeframe
          ? {
              start: timeframe.start,
              end: timeframe.end,
              filter: { prompt_id: promptId }
            }
          : { filter: { prompt_id: promptId } }

        // Read from the stream
        const records = await this.redis.xread({
          stream: PROMPT_USAGE_STREAM,
          ...streamFilter
        })

        if (!records || records.length === 0) {
          return null
        }

        // Process the records
        let usageCount = 0
        let totalExecutionTime = 0
        let successCount = 0
        let tokenUsage = 0
        let lastUsed: string | null = null

        records.forEach(record => {
          usageCount++
          totalExecutionTime += parseInt(record.execution_time) || 0
          successCount += record.success === '1' ? 1 : 0
          tokenUsage += parseInt(record.tokens) || 0

          if (!lastUsed || record.timestamp > lastUsed) {
            lastUsed = record.timestamp
          }
        })

        const result: PromptPerformanceMetrics = {
          promptId,
          version: 'all',
          usageCount,
          averageExecutionTime: totalExecutionTime / usageCount,
          successRate: successCount / usageCount,
          estimatedCost: tokenUsage * 0.000002,
          lastUsed: lastUsed || new Date().toISOString()
        }

        // Cache result if not using timeframe
        if (!timeframe) {
          this.metricsCache.set(cacheKey, result)
        }

        return result
      }
    } catch (error) {
      console.error('Error getting prompt metrics from Redis:', error)
      return null
    }
  }

  /**
   * Compare performance between prompt versions using Redis data
   */
  async compareVersions(
    promptId: string,
    timeframe?: { start: string; end: string }
  ): Promise<Record<string, PromptPerformanceMetrics>> {
    try {
      // Get all versions of this prompt from Redis
      const pattern = `${PROMPT_METRICS_PREFIX}${promptId}:*`
      const keys = await this.redis.keys(pattern)

      // If no versions found, return empty object
      if (!keys || keys.length === 0) {
        return {}
      }

      // Get metrics for each version
      const results: Record<string, PromptPerformanceMetrics> = {}

      for (const key of keys) {
        // Extract version from key
        const version = key.split(':').pop() || ''

        // Get metrics for this version
        const metrics = await this.getPromptMetrics(
          promptId,
          version,
          timeframe
        )

        if (metrics) {
          results[version] = metrics
        }
      }

      return results
    } catch (error) {
      console.error('Error comparing prompt versions in Redis:', error)
      return {}
    }
  }

  /**
   * Update user feedback for a specific prompt usage
   */
  async updateFeedback(
    usageId: string,
    userId: string,
    feedbackScore: number
  ): Promise<boolean> {
    try {
      // Validate feedback score
      if (feedbackScore < 1 || feedbackScore > 5) {
        throw new Error('Feedback score must be between 1 and 5')
      }

      // Get the usage record
      const usageKey = `${PROMPT_USAGE_PREFIX}${usageId}`
      const recordData = await this.redis.get<string>(usageKey)

      if (!recordData) {
        return false
      }

      const record = JSON.parse(recordData) as PromptUsageRecord

      // Update the record with feedback
      record.feedbackScore = feedbackScore

      // Save back to Redis
      await this.redis.set(usageKey, JSON.stringify(record))

      // Update user template score
      const userKey = `${USER_TEMPLATE_SCORE_PREFIX}${userId}:template:scores`
      const currentScore = parseFloat(
        (await this.redis.hget(userKey, record.promptId)) || '0'
      )

      // Use exponential moving average
      const alpha = 0.3
      const newScore = alpha * feedbackScore + (1 - alpha) * currentScore

      await this.redis.hset(userKey, record.promptId, newScore.toString())

      return true
    } catch (error) {
      console.error('Error updating feedback in Redis:', error)
      return false
    }
  }

  /**
   * Clear metrics cache
   */
  clearCache(): void {
    this.metricsCache.clear()
  }
}

// Singleton instance
export const promptAnalytics = new PromptAnalytics()
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
