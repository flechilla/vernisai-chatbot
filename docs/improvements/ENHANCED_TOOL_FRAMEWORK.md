# Enhanced Tool Framework

## Current Implementation Analysis

The VernisAI Chatbot currently implements a basic tool framework with several limitations:

### Existing Architecture

1. **Tool Definition**
   - Tools are defined using Vercel AI SDK's `tool` function
   - Tools specify parameters using Zod schemas for validation
   - Implementation is found in `/lib/tools/` (search.ts, retrieve.ts, video-search.ts)

2. **Tool Registration**
   - Tools are statically registered in the researcher agent (researcher.ts)
   - Tool availability is controlled via the `experimental_activeTools` array based on a binary `searchMode` flag

3. **Tool Execution**
   - Native tool calling relies on the AI model's built-in capabilities
   - Manual tool calling uses a custom XML parsing approach in `parse-tool-call.ts`
   - Only the search tool is fully supported in the manual execution path

4. **Tool Result Handling**
   - Results are streamed back to the client through data annotations
   - Results are displayed using dedicated UI components (e.g., SearchSection)

### Current Limitations

1. **Limited Extensibility**
   - Adding new tools requires code changes in multiple places
   - No plugin architecture for third-party tool integration

2. **Fixed Tool Selection**
   - Tools are enabled/disabled as a group rather than individually
   - No dynamic selection based on query intent

3. **No Tool Composition**
   - Tools cannot be chained or composed together
   - Each tool call is treated as an independent operation

4. **Inconsistent Implementation**
   - Different execution paths for native vs. manual tool calling
   - Search-specific hardcoding limits general-purpose tool support

5. **Limited Monitoring**
   - No metrics to track tool effectiveness or usage patterns
   - Difficult to identify which tools need improvement

## Enhanced Tool Framework Design

### Core Architecture

The proposed Enhanced Tool Framework would implement a flexible, extensible architecture for tool management:

```
┌─────────────────────────────────────┐
│           Tool Registry              │
├─────────────────────────────────────┤
│ - Register/unregister tools         │
│ - Tool discovery and metadata       │
│ - Permission and capability mgmt    │
└───────────────┬─────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│          Tool Resolver               │
├─────────────────────────────────────┤
│ - Match intent to appropriate tools │
│ - Determine tool execution order    │
│ - Handle tool dependencies          │
└───────────────┬─────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│         Execution Engine            │
├─────────────────────────────────────┤
│ - Standardized execution interface  │
│ - Parameter validation and mapping  │
│ - Error handling and retries        │
└───────────────┬─────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│        Result Processor              │
├─────────────────────────────────────┤
│ - Standardize result format         │
│ - Transform results for UI display  │
│ - Cache results when appropriate    │
└─────────────────────────────────────┘
```

### Key Components

#### 1. Tool Registry

A central registry for managing available tools:

```typescript
// lib/tools/registry.ts
export interface ToolDefinition<T = any, R = any> {
  id: string;
  name: string;
  description: string;
  schema: z.ZodType<T>;
  categories: string[];
  execute: (params: T) => Promise<R>;
  resultComponent?: React.ComponentType<{ result: R }>;
  examples?: { input: T; output: R }[];
  cacheTTL?: number; // Time in seconds to cache results
}

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  
  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }
  
  unregister(toolId: string): void {
    this.tools.delete(toolId);
  }
  
  getTool(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }
  
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
  
  getToolsByCategory(category: string): ToolDefinition[] {
    return this.getAllTools().filter(tool => 
      tool.categories.includes(category)
    );
  }
}

export const toolRegistry = new ToolRegistry();
```

#### 2. Tool Resolver

A component to determine which tools to use for a given query:

```typescript
// lib/tools/resolver.ts
interface ResolverResult {
  recommendedTools: string[];
  confidence: number;
  reasoning: string;
}

class ToolResolver {
  async resolveTools(
    query: string,
    context: CoreMessage[],
    excludedTools: string[] = []
  ): Promise<ResolverResult> {
    // Use a lightweight model to classify the query
    const classification = await generateObject({
      model: getModel('classifier-model'),
      system: 'Classify the user query to determine which tools would be useful.',
      messages: [{ role: 'user', content: query }],
      schema: z.object({
        recommendedTools: z.array(z.string()),
        confidence: z.number().min(0).max(1),
        reasoning: z.string()
      })
    });
    
    // Filter out excluded tools
    const filteredTools = classification.object.recommendedTools
      .filter(tool => !excludedTools.includes(tool));
    
    return {
      recommendedTools: filteredTools,
      confidence: classification.object.confidence,
      reasoning: classification.object.reasoning
    };
  }
}

export const toolResolver = new ToolResolver();
```

#### 3. Execution Engine

A standardized interface for executing tools:

```typescript
// lib/tools/executor.ts
interface ExecutionOptions {
  toolCallId?: string;
  timeout?: number;
  retries?: number;
  cacheResults?: boolean;
}

interface ExecutionResult<T> {
  result: T;
  status: 'success' | 'error' | 'timeout';
  error?: Error;
  duration: number;
  fromCache?: boolean;
}

class ToolExecutor {
  private cache = new Map<string, { result: any; timestamp: number }>();
  
  async execute<T, R>(
    toolId: string,
    params: T,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult<R>> {
    const tool = toolRegistry.getTool(toolId);
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }
    
    // Generate cache key if caching is enabled
    const cacheKey = options.cacheResults 
      ? `${toolId}:${JSON.stringify(params)}`
      : null;
      
    // Check cache
    if (cacheKey && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (tool.cacheTTL && (Date.now() - cached.timestamp) / 1000 < tool.cacheTTL) {
        return {
          result: cached.result,
          status: 'success',
          duration: 0,
          fromCache: true
        };
      }
    }
    
    // Execute tool with retry logic
    const startTime = Date.now();
    let attempts = 0;
    const maxRetries = options.retries ?? 2;
    
    while (attempts <= maxRetries) {
      try {
        // Validate parameters using the tool's schema
        const validatedParams = tool.schema.parse(params);
        
        // Execute the tool
        const result = await Promise.race([
          tool.execute(validatedParams),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Tool execution timed out')), 
              options.timeout ?? 30000);
          })
        ]);
        
        // Cache successful result if requested
        if (cacheKey && options.cacheResults) {
          this.cache.set(cacheKey, {
            result,
            timestamp: Date.now()
          });
        }
        
        return {
          result,
          status: 'success',
          duration: Date.now() - startTime
        };
      } catch (error) {
        attempts++;
        if (attempts > maxRetries) {
          return {
            result: null as any,
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
            duration: Date.now() - startTime
          };
        }
      }
    }
    
    // This should never be reached due to the returns above
    throw new Error('Unexpected execution flow');
  }
  
  clearCache(toolId?: string): void {
    if (toolId) {
      // Clear cache for specific tool
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${toolId}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear entire cache
      this.cache.clear();
    }
  }
}

export const toolExecutor = new ToolExecutor();
```

#### 4. Result Processor

A component to standardize and transform tool results:

```typescript
// lib/tools/result-processor.ts
interface ProcessedResult {
  data: any;
  metadata: {
    toolId: string;
    executionTime: number;
    timestamp: number;
    fromCache: boolean;
  };
  displayComponent: string;
}

class ResultProcessor {
  processResult(
    toolId: string,
    executionResult: ExecutionResult<any>
  ): ProcessedResult {
    const tool = toolRegistry.getTool(toolId);
    
    return {
      data: executionResult.result,
      metadata: {
        toolId,
        executionTime: executionResult.duration,
        timestamp: Date.now(),
        fromCache: !!executionResult.fromCache
      },
      displayComponent: tool?.resultComponent 
        ? tool.resultComponent.name
        : 'DefaultResultDisplay'
    };
  }
}

export const resultProcessor = new ResultProcessor();
```

### Tool Definition Example

Example of how to define a tool using the enhanced framework:

```typescript
// lib/tools/enhanced-search.ts
import { toolRegistry } from './registry';
import { searchSchema } from '@/lib/schema/search';
import { SearchResults } from '@/lib/types';
import { SearchResultsDisplay } from '@/components/search-results-display';

// Tool implementation
async function executeSearch(params: z.infer<typeof searchSchema>): Promise<SearchResults> {
  // Implementation similar to existing search.ts
  const searchAPI = (process.env.SEARCH_API as 'tavily' | 'exa' | 'searxng') || 'tavily';
  
  // Existing search logic...
  return searchResults;
}

// Register the tool
toolRegistry.register({
  id: 'search',
  name: 'Web Search',
  description: 'Search the web for information about a topic',
  schema: searchSchema,
  categories: ['information', 'research'],
  execute: executeSearch,
  resultComponent: SearchResultsDisplay,
  examples: [
    {
      input: {
        query: 'latest COVID-19 statistics',
        max_results: 5,
        search_depth: 'basic'
      },
      output: {/* example search results */}
    }
  ],
  cacheTTL: 300 // Cache search results for 5 minutes
});

// For compatibility with AI SDK
export const searchTool = tool({
  description: 'Search the web for information',
  parameters: searchSchema,
  execute: executeSearch
});
```

### Tool Composition

Enabling tool composition would allow for chaining tools together:

```typescript
// lib/tools/composer.ts
interface CompositionStep {
  toolId: string;
  paramsFromPrevious: (prevResult: any) => any;
}

class ToolComposer {
  async compose(
    initialParams: any,
    steps: CompositionStep[]
  ): Promise<any[]> {
    const results = [];
    let currentParams = initialParams;
    
    for (const step of steps) {
      const result = await toolExecutor.execute(
        step.toolId,
        currentParams,
        { cacheResults: true }
      );
      
      results.push(result);
      currentParams = step.paramsFromPrevious(result.result);
    }
    
    return results;
  }
}

export const toolComposer = new ToolComposer();
```

Example of tool composition usage:

```typescript
// Example - Search followed by detailed content retrieval
const results = await toolComposer.compose(
  { query: 'climate change latest research', max_results: 5, search_depth: 'basic' },
  [
    {
      toolId: 'search',
      paramsFromPrevious: (prevResult) => prevResult // Initial params
    },
    {
      toolId: 'retrieve',
      paramsFromPrevious: (searchResults) => ({ 
        url: searchResults.results[0].url 
      })
    }
  ]
);
```

### Monitoring and Metrics

To track tool effectiveness and usage patterns:

```typescript
// lib/tools/metrics.ts
interface ToolMetric {
  toolId: string;
  executions: number;
  successRate: number;
  averageExecutionTime: number;
  cacheHitRate: number;
  lastExecuted: Date;
}

class ToolMetricsCollector {
  private metrics: Map<string, ToolMetric> = new Map();
  
  recordExecution(
    toolId: string,
    result: ExecutionResult<any>
  ): void {
    const current = this.metrics.get(toolId) || {
      toolId,
      executions: 0,
      successRate: 1,
      averageExecutionTime: 0,
      cacheHitRate: 0,
      lastExecuted: new Date()
    };
    
    // Update metrics
    const newExecutions = current.executions + 1;
    const newSuccessCount = current.successRate * current.executions + 
      (result.status === 'success' ? 1 : 0);
    const newCacheHits = current.cacheHitRate * current.executions + 
      (result.fromCache ? 1 : 0);
    
    this.metrics.set(toolId, {
      toolId,
      executions: newExecutions,
      successRate: newSuccessCount / newExecutions,
      averageExecutionTime: result.fromCache 
        ? current.averageExecutionTime 
        : (current.averageExecutionTime * current.executions + result.duration) / newExecutions,
      cacheHitRate: newCacheHits / newExecutions,
      lastExecuted: new Date()
    });
  }
  
  getMetrics(toolId?: string): ToolMetric[] {
    if (toolId) {
      const metric = this.metrics.get(toolId);
      return metric ? [metric] : [];
    }
    return Array.from(this.metrics.values());
  }
}

export const toolMetrics = new ToolMetricsCollector();
```

### Integration with Streaming System

Updated tool integration with the streaming system:

```typescript
// lib/streaming/enhanced-tool-execution.ts
export async function executeEnhancedTools(
  coreMessages: CoreMessage[],
  dataStream: DataStreamWriter,
  model: string
): Promise<ToolExecutionResult> {
  // If search mode is disabled, return empty tool call
  if (!isFeatureEnabled('tools')) {
    return { toolCallDataAnnotation: null, toolCallMessages: [] };
  }

  // Resolve which tools to use based on the query
  const lastUserMessage = coreMessages
    .filter(m => m.role === 'user')
    .pop();
    
  if (!lastUserMessage) {
    return { toolCallDataAnnotation: null, toolCallMessages: [] };
  }
  
  const resolvedTools = await toolResolver.resolveTools(
    lastUserMessage.content as string,
    coreMessages
  );
  
  if (resolvedTools.recommendedTools.length === 0) {
    return { toolCallDataAnnotation: null, toolCallMessages: [] };
  }
  
  // Generate tool call parameters using model
  const toolSelectionPrompt = generateToolSelectionPrompt(
    resolvedTools.recommendedTools
  );
  
  const toolSelectionResponse = await generateText({
    model: getModel(model),
    system: toolSelectionPrompt,
    messages: coreMessages
  });
  
  // Parse the tool selection and parameters
  const parsedToolCalls = parseToolCalls(
    toolSelectionResponse.text,
    resolvedTools.recommendedTools
  );
  
  if (!parsedToolCalls.length) {
    return { toolCallDataAnnotation: null, toolCallMessages: [] };
  }
  
  // Execute each tool
  const toolResults = [];
  const toolAnnotations = [];
  
  for (const toolCall of parsedToolCalls) {
    const toolCallId = `call_${generateId()}`;
    
    // Notify client of tool call
    const toolCallAnnotation = {
      type: 'tool_call',
      data: {
        state: 'call',
        toolCallId,
        toolName: toolCall.tool,
        args: JSON.stringify(toolCall.parameters)
      }
    };
    dataStream.writeData(toolCallAnnotation);
    
    // Execute the tool
    const result = await toolExecutor.execute(
      toolCall.tool,
      toolCall.parameters,
      { toolCallId, cacheResults: true }
    );
    
    // Record metrics
    toolMetrics.recordExecution(toolCall.tool, result);
    
    // Process result
    const processedResult = resultProcessor.processResult(
      toolCall.tool,
      result
    );
    
    // Update annotation with result
    const updatedToolCallAnnotation = {
      ...toolCallAnnotation,
      data: {
        ...toolCallAnnotation.data,
        result: JSON.stringify(processedResult.data),
        state: 'result'
      }
    };
    dataStream.writeData(updatedToolCallAnnotation);
    
    toolResults.push(result);
    toolAnnotations.push(updatedToolCallAnnotation);
  }
  
  // Create tool call messages for context
  const toolCallMessages = toolResults.map(result => ({
    role: 'assistant',
    content: `Tool call result: ${JSON.stringify(result.result)}`
  }));
  
  toolCallMessages.push({
    role: 'user',
    content: 'Now answer the user question.'
  });
  
  // Create data annotation
  const toolCallDataAnnotation = {
    role: 'data',
    content: {
      type: 'tool_calls',
      data: toolAnnotations.map(a => a.data)
    }
  };
  
  return { 
    toolCallDataAnnotation, 
    toolCallMessages: toolCallMessages as CoreMessage[] 
  };
}
```

## Implementation Plan

### Phase 1: Tool Registry and Basic Framework

1. Implement the Tool Registry
2. Convert existing tools to use the new registry
3. Create the Tool Executor with basic functionality
4. Update the streaming system to use the new framework
5. Implement basic result processing

### Phase 2: Tool Resolution and Composition

1. Implement the Tool Resolver for intelligent tool selection
2. Add support for tool composition
3. Enhance the parser to handle multiple tool calls
4. Update UI components to handle composed tool results

### Phase 3: Metrics and Optimization

1. Implement the metrics collection system
2. Add caching support
3. Create admin dashboard for tool performance insights
4. Optimize based on collected metrics

## Best Practices for Tool Development

1. **Focused Functionality**
   - Each tool should do one thing well
   - Avoid overlap between tool capabilities

2. **Clear Documentation**
   - Document parameters and return values thoroughly
   - Provide usage examples

3. **Error Handling**
   - Include comprehensive error handling
   - Return useful error messages

4. **Performance Awareness**
   - Optimize for speed and resource usage
   - Use caching when appropriate

5. **UI Integration**
   - Design tools with UI display in mind
   - Include custom components for result visualization

## Conclusion

The Enhanced Tool Framework would transform VernisAI's capability system from a static, limited implementation to a dynamic, extensible architecture that can grow with the application. This framework would enable:

1. Easy addition of new tools without significant code changes
2. Intelligent selection of appropriate tools based on user queries
3. Powerful tool composition for complex operations
4. Metrics-driven optimization of tool performance
5. Better user experience through appropriate tool selection

The implementation can be phased to gradually replace the current system while maintaining backward compatibility, allowing for continuous improvement without disrupting the existing functionality.