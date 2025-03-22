# Enhanced Reasoning Transparency

## Current Implementation Analysis

The VernisAI Chatbot currently implements a basic approach to reasoning transparency with several limitations:

### Existing Architecture

1. **Reasoning Capture**
   - Reasoning information is captured in `create-manual-tool-stream.ts` via `onChunk` event handling
   - Timing information is tracked by comparing timestamps between reasoning start and end events
   - Reasoning content is added as part of the message annotations

2. **Data Structure**
   - Reasoning data is stored as a `data` message with type 'reasoning'
   - The annotation includes timing information and the raw reasoning text
   - This is attached to the message before being saved to history

3. **UI Presentation**
   - Limited exposure of reasoning process in the UI
   - Reasoning is not prominently displayed or easily accessible to users
   - No structured breakdown of reasoning steps

### Current Limitations

1. **Limited Visibility**
   - Reasoning information is tracked but minimally exposed to users
   - No clear indication of when reasoning is available for a message
   - Difficult for users to understand how the system arrived at answers

2. **Unstructured Format**
   - Reasoning is captured as a single block of text
   - No structured representation of reasoning steps or components
   - Difficult to associate reasoning with specific parts of the response

3. **Minimal Context**
   - No connection between reasoning and the sources used
   - No confidence indicators for different parts of the reasoning
   - No differentiation between factual statements and inferences

4. **User Control**
   - No ability for users to adjust the level of reasoning detail
   - Cannot focus on specific aspects of the reasoning
   - No way to request additional explanation for particular points

## Enhanced Reasoning Transparency Design

### Core Architecture

The proposed Enhanced Reasoning Transparency system would implement a comprehensive architecture:

```
┌─────────────────────────────────────┐
│      Reasoning Capture Engine       │
├─────────────────────────────────────┤
│ - Structured reasoning format       │
│ - Step-by-step tracking             │
│ - Source attribution                │
└───────────────┬─────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│       Reasoning Processor           │
├─────────────────────────────────────┤
│ - Analyze reasoning structure       │
│ - Identify key components           │
│ - Assign confidence scores          │
└───────────────┬─────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│       Reasoning UI Components       │
├─────────────────────────────────────┤
│ - Interactive display               │
│ - Expandable/collapsible details    │
│ - Highlighting and visualization    │
└───────────────┬─────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│       User Controls & Feedback      │
├─────────────────────────────────────┤
│ - Detail level adjustment           │
│ - Focused explanations              │
│ - User feedback collection          │
└─────────────────────────────────────┘
```

### Key Components

#### 1. Structured Reasoning Format

A data structure for capturing detailed reasoning information:

```typescript
// lib/reasoning/types.ts
export interface ReasoningSource {
  id: string;          // Source identifier (e.g., url, knowledge base)
  type: 'search' | 'retrieve' | 'knowledge' | 'inference';
  content?: string;    // Relevant excerpt from source
  confidence: number;  // 0-1 confidence score
  metadata?: Record<string, any>; // Additional source metadata
}

export interface ReasoningStep {
  id: string;
  stepNumber: number;
  description: string;  // Description of this reasoning step
  type: 'analysis' | 'inference' | 'synthesis' | 'question' | 'conclusion';
  content: string;      // The actual reasoning content for this step
  sources: ReasoningSource[]; // Sources supporting this step
  confidence: number;   // 0-1 confidence score for this step
  parentStepId?: string; // For hierarchical reasoning
  metadata?: Record<string, any>; // Additional step metadata
}

export interface ReasoningSummary {
  questionType: string; // e.g., 'factual', 'analytical', 'speculative'
  complexityLevel: 'simple' | 'moderate' | 'complex';
  keyPoints: string[];  // Main points from the reasoning
  limitations: string[]; // Limitations of the reasoning
  confidenceScore: number; // Overall confidence (0-1)
}

export interface StructuredReasoning {
  reasoningId: string;
  question: string;     // The original question
  steps: ReasoningStep[]; // Sequential reasoning steps
  summary: ReasoningSummary;
  duration: number;     // Processing time in milliseconds
  timestamp: Date;      // When this reasoning was generated
  modelId: string;      // Model that generated this reasoning
}
```

#### 2. Reasoning Capture Implementation

Enhanced approach to capturing structured reasoning:

```typescript
// lib/reasoning/capture.ts
import { StreamChunk } from 'ai';
import { generateId } from '@/lib/utils';
import { 
  StructuredReasoning, 
  ReasoningStep, 
  ReasoningSource,
  ReasoningSummary
} from './types';

interface ReasoningCaptureOptions {
  modelId: string;
  question: string;
  onUpdate?: (reasoning: StructuredReasoning) => void;
}

export class ReasoningCapture {
  private reasoning: StructuredReasoning;
  private currentStep: ReasoningStep | null = null;
  private startTime: number = Date.now();
  private options: ReasoningCaptureOptions;
  
  constructor(options: ReasoningCaptureOptions) {
    this.options = options;
    
    // Initialize reasoning structure
    this.reasoning = {
      reasoningId: generateId(),
      question: options.question,
      steps: [],
      summary: {
        questionType: '',
        complexityLevel: 'moderate',
        keyPoints: [],
        limitations: [],
        confidenceScore: 0
      },
      duration: 0,
      timestamp: new Date(),
      modelId: options.modelId
    };
  }
  
  /**
   * Process a chunk from the AI stream that contains reasoning information
   */
  processChunk(chunk: StreamChunk): void {
    if (!chunk.type?.startsWith('reasoning')) {
      return; // Not a reasoning chunk
    }
    
    // Handle different types of reasoning chunks
    if (chunk.type === 'reasoning.step.start') {
      this.handleStepStart(chunk.data);
    } else if (chunk.type === 'reasoning.step.content') {
      this.handleStepContent(chunk.data);
    } else if (chunk.type === 'reasoning.step.end') {
      this.handleStepEnd(chunk.data);
    } else if (chunk.type === 'reasoning.source') {
      this.handleSource(chunk.data);
    } else if (chunk.type === 'reasoning.summary') {
      this.handleSummary(chunk.data);
    }
    
    // Notify of updates if a handler is provided
    if (this.options.onUpdate) {
      this.options.onUpdate({...this.reasoning});
    }
  }
  
  /**
   * Handle the start of a new reasoning step
   */
  private handleStepStart(data: any): void {
    // Complete any current step
    if (this.currentStep) {
      this.handleStepEnd({});
    }
    
    // Create new step
    this.currentStep = {
      id: generateId(),
      stepNumber: this.reasoning.steps.length + 1,
      description: data.description || `Step ${this.reasoning.steps.length + 1}`,
      type: data.type || 'analysis',
      content: '',
      sources: [],
      confidence: data.confidence || 0.7,
      metadata: data.metadata || {}
    };
    
    // If this is a hierarchical step
    if (data.parentStepId) {
      this.currentStep.parentStepId = data.parentStepId;
    }
  }
  
  /**
   * Handle incoming content for the current reasoning step
   */
  private handleStepContent(data: any): void {
    if (!this.currentStep) {
      // Create a default step if none exists
      this.handleStepStart({});
    }
    
    // Append content to current step
    if (this.currentStep) {
      this.currentStep.content += data.content || '';
    }
  }
  
  /**
   * Handle the end of a reasoning step
   */
  private handleStepEnd(data: any): void {
    if (this.currentStep) {
      // Update confidence if provided
      if (data.confidence) {
        this.currentStep.confidence = data.confidence;
      }
      
      // Add step to reasoning steps
      this.reasoning.steps.push({...this.currentStep});
      this.currentStep = null;
    }
  }
  
  /**
   * Handle a source reference in the reasoning
   */
  private handleSource(data: any): void {
    if (!this.currentStep) {
      // Create a default step if none exists
      this.handleStepStart({});
    }
    
    if (this.currentStep) {
      const source: ReasoningSource = {
        id: data.id || generateId(),
        type: data.type || 'search',
        content: data.content,
        confidence: data.confidence || 0.7,
        metadata: data.metadata || {}
      };
      
      this.currentStep.sources.push(source);
    }
  }
  
  /**
   * Handle reasoning summary information
   */
  private handleSummary(data: any): void {
    this.reasoning.summary = {
      questionType: data.questionType || this.reasoning.summary.questionType,
      complexityLevel: data.complexityLevel || this.reasoning.summary.complexityLevel,
      keyPoints: data.keyPoints || this.reasoning.summary.keyPoints,
      limitations: data.limitations || this.reasoning.summary.limitations,
      confidenceScore: data.confidenceScore || this.reasoning.summary.confidenceScore
    };
  }
  
  /**
   * Complete the reasoning capture process
   */
  complete(): StructuredReasoning {
    // Complete any current step
    if (this.currentStep) {
      this.handleStepEnd({});
    }
    
    // Calculate duration
    this.reasoning.duration = Date.now() - this.startTime;
    
    // Generate overall confidence if not provided
    if (!this.reasoning.summary.confidenceScore && this.reasoning.steps.length > 0) {
      const avg = this.reasoning.steps.reduce(
        (sum, step) => sum + step.confidence, 0
      ) / this.reasoning.steps.length;
      
      this.reasoning.summary.confidenceScore = Math.round(avg * 100) / 100;
    }
    
    return {...this.reasoning};
  }
}
```

#### 3. Integration with Streaming System

Updating the streaming system to use the enhanced reasoning capture:

```typescript
// lib/streaming/enhanced-reasoning-stream.ts
import { CoreMessage, DataStreamWriter, JSONValue, streamText } from 'ai'
import { ReasoningCapture } from '../reasoning/capture'
import { StructuredReasoning } from '../reasoning/types'
import { getMaxAllowedTokens, truncateMessages } from '../utils/context-window'
import { handleStreamFinish } from './handle-stream-finish'
import { executeToolCall } from './tool-execution'
import { BaseStreamConfig } from './types'

export function createEnhancedReasoningStream(config: BaseStreamConfig) {
  return createDataStreamResponse({
    execute: async (dataStream: DataStreamWriter) => {
      const { messages, model, chatId, searchMode } = config
      const modelId = `${model.providerId}:${model.id}`
      let toolCallModelId = model.toolCallModel
        ? `${model.providerId}:${model.toolCallModel}`
        : modelId

      try {
        const coreMessages = convertToCoreMessages(messages)
        const truncatedMessages = truncateMessages(
          coreMessages,
          getMaxAllowedTokens(model)
        )
        
        // Execute tool calls if search is enabled
        const { toolCallDataAnnotation, toolCallMessages } = searchMode 
          ? await executeToolCall(truncatedMessages, dataStream, toolCallModelId, searchMode)
          : { toolCallDataAnnotation: null, toolCallMessages: [] }

        // Get last user message to use as the question
        const lastUserMessage = [...truncatedMessages, ...toolCallMessages]
          .filter(m => m.role === 'user')
          .pop();
          
        const question = lastUserMessage?.content as string || '';
        
        // Initialize reasoning capture
        const reasoningCapture = new ReasoningCapture({
          modelId,
          question,
          onUpdate: (reasoning) => {
            // Update client with reasoning progress
            dataStream.writeMessageAnnotation({
              type: 'reasoning.progress',
              data: {
                stepCount: reasoning.steps.length,
                currentStep: reasoning.steps[reasoning.steps.length - 1]?.description
              }
            } as JSONValue);
          }
        });

        // Configure the researcher with enhanced reasoning handling
        const researcherConfig = manualResearcher({
          messages: [...truncatedMessages, ...toolCallMessages],
          model: modelId,
          isSearchEnabled: searchMode
        });

        const result = streamText({
          ...researcherConfig,
          onFinish: async result => {
            // Complete reasoning capture
            const structuredReasoning = reasoningCapture.complete();
            
            // Create reasoning annotation
            const reasoningAnnotation: ExtendedCoreMessage = {
              role: 'data',
              content: {
                type: 'structured_reasoning',
                data: structuredReasoning
              } as JSONValue
            };
            
            // Send the full structured reasoning to the client
            dataStream.writeMessageAnnotation({
              type: 'structured_reasoning',
              data: structuredReasoning
            } as JSONValue);
            
            // Handle stream finish with the reasoning annotation
            const annotations = [
              ...(toolCallDataAnnotation ? [toolCallDataAnnotation] : []),
              reasoningAnnotation
            ];

            await handleStreamFinish({
              responseMessages: result.response.messages,
              originalMessages: messages,
              model: modelId,
              chatId,
              dataStream,
              skipRelatedQuestions: true,
              annotations
            });
          },
          onChunk(event) {
            // Process reasoning-related chunks
            if (event.chunk?.type?.startsWith('reasoning')) {
              reasoningCapture.processChunk(event.chunk);
            }
          }
        });

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true
        });
      } catch (error) {
        console.error('Stream execution error:', error);
      }
    },
    onError: error => {
      console.error('Stream error:', error);
      return error instanceof Error ? error.message : String(error);
    }
  });
}
```

#### 4. Enhanced Agent Prompting

The prompt system needs to be updated to generate structured reasoning:

```typescript
// lib/prompts/templates/enhanced-reasoning.ts
import { promptRegistry } from '../registry';

const ENHANCED_REASONING_PROMPT = `
Instructions:

You are a helpful AI assistant with transparent reasoning capabilities. When answering questions, you should:

1. Break down your thinking into clear, sequential steps
2. Identify the type of each reasoning step (analysis, inference, synthesis, question, or conclusion)
3. Support your statements with sources when possible
4. Distinguish between factual statements and inferences
5. Provide confidence levels for your reasoning steps
6. After completing your reasoning, provide a concise answer to the user's question

For each reasoning step, use the following format:

<reasoning.step.start>
{
  "description": "Brief description of this step",
  "type": "analysis|inference|synthesis|question|conclusion",
  "confidence": 0.8 // A number between 0 and 1
}
</reasoning.step.start>

<reasoning.step.content>
Your detailed reasoning for this step goes here. Be thorough but clear.
</reasoning.step.content>

When using a source to support your reasoning, include:

<reasoning.source>
{
  "type": "search|retrieve|knowledge|inference",
  "content": "Relevant excerpt from the source",
  "confidence": 0.9
}
</reasoning.source>

When you've completed a step:

<reasoning.step.end>
{
  "confidence": 0.85 // Updated confidence after completing the step
}
</reasoning.step.end>

After all reasoning steps, provide a summary:

<reasoning.summary>
{
  "questionType": "factual|analytical|speculative|etc",
  "complexityLevel": "simple|moderate|complex",
  "keyPoints": ["Key point 1", "Key point 2", "..."],
  "limitations": ["Limitation 1", "Limitation 2", "..."],
  "confidenceScore": 0.75
}
</reasoning.summary>

Finally, provide your answer to the user WITHOUT including any of the reasoning markers.

Current date and time: {{currentDate}}
`;

// Register the template
promptRegistry.register({
  id: 'enhanced-reasoning',
  name: 'Enhanced Reasoning Assistant',
  description: 'Template for generating structured, transparent reasoning',
  category: 'reasoning',
  tags: ['reasoning', 'transparency', 'structured'],
  currentVersion: '1.0',
  versions: {
    '1.0': {
      version: '1.0',
      template: ENHANCED_REASONING_PROMPT,
      createdAt: new Date('2023-03-01'),
      description: 'Initial version'
    }
  },
  variables: ['currentDate'],
  modelCompatibility: ['gpt-4*', 'claude-*']
});
```

#### 5. UI Components for Reasoning Display

User interface components for displaying structured reasoning:

```tsx
// components/reasoning/reasoning-viewer.tsx
'use client'

import { useState } from 'react'
import { 
  StructuredReasoning, 
  ReasoningStep,
  ReasoningSource 
} from '@/lib/reasoning/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Info, ChevronDown, ChevronRight, Lightbulb, Search, FileText, Brain } from 'lucide-react'

interface ReasoningViewerProps {
  reasoning: StructuredReasoning
  initialDetailLevel?: 'minimal' | 'moderate' | 'detailed'
}

export function ReasoningViewer({ 
  reasoning,
  initialDetailLevel = 'moderate'
}: ReasoningViewerProps) {
  const [detailLevel, setDetailLevel] = useState(initialDetailLevel);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  
  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => ({
      ...prev,
      [stepId]: !prev[stepId]
    }));
  };
  
  // Determine which steps to show based on detail level
  const visibleSteps = reasoning.steps.filter(step => {
    if (detailLevel === 'detailed') return true;
    if (detailLevel === 'moderate') {
      return step.confidence > 0.6 || step.type === 'conclusion';
    }
    return step.type === 'conclusion' || step.confidence > 0.8;
  });
  
  return (
    <Card className="w-full bg-slate-50 dark:bg-slate-900 mb-4">
      <CardHeader className="pb-2 flex flex-row justify-between items-center">
        <CardTitle className="text-md font-medium">
          <div className="flex items-center">
            <Brain className="mr-2 h-5 w-5 text-blue-500" />
            <span>Reasoning Process</span>
          </div>
        </CardTitle>
        
        <div className="flex items-center space-x-2">
          <Badge variant={detailLevel === 'minimal' ? 'default' : 'outline'}
                 className="cursor-pointer"
                 onClick={() => setDetailLevel('minimal')}>
            Basic
          </Badge>
          <Badge variant={detailLevel === 'moderate' ? 'default' : 'outline'}
                 className="cursor-pointer"
                 onClick={() => setDetailLevel('moderate')}>
            Standard
          </Badge>
          <Badge variant={detailLevel === 'detailed' ? 'default' : 'outline'}
                 className="cursor-pointer"
                 onClick={() => setDetailLevel('detailed')}>
            Detailed
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="steps">
          <TabsList className="mb-2">
            <TabsTrigger value="steps">Reasoning Steps</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
          </TabsList>
          
          <TabsContent value="steps" className="space-y-2">
            {visibleSteps.map(step => (
              <ReasoningStepCard 
                key={step.id}
                step={step}
                isExpanded={!!expandedSteps[step.id]}
                onToggle={() => toggleStep(step.id)}
                detailLevel={detailLevel}
              />
            ))}
            
            {visibleSteps.length < reasoning.steps.length && (
              <div className="text-center text-sm text-muted-foreground py-2">
                {reasoning.steps.length - visibleSteps.length} additional steps hidden.
                <Button variant="link" onClick={() => setDetailLevel('detailed')}>
                  Show all
                </Button>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="summary">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium">Question Type</h4>
                <p className="text-sm">{reasoning.summary.questionType}</p>
              </div>
              
              <div>
                <h4 className="font-medium">Key Points</h4>
                <ul className="list-disc list-inside text-sm">
                  {reasoning.summary.keyPoints.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium">Limitations</h4>
                <ul className="list-disc list-inside text-sm">
                  {reasoning.summary.limitations.map((limitation, i) => (
                    <li key={i}>{limitation}</li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium">Overall Confidence</h4>
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full" 
                    style={{ width: `${reasoning.summary.confidenceScore * 100}%` }}>
                  </div>
                </div>
                <p className="text-right text-xs mt-1">
                  {Math.round(reasoning.summary.confidenceScore * 100)}%
                </p>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="sources">
            <div className="space-y-2">
              {reasoning.steps
                .flatMap(step => step.sources)
                .filter((source, index, self) => 
                  index === self.findIndex(s => s.id === source.id)
                )
                .map(source => (
                  <SourceCard key={source.id} source={source} />
                ))}
                
              {reasoning.steps.flatMap(step => step.sources).length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">
                  No explicit sources used in this reasoning.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface ReasoningStepCardProps {
  step: ReasoningStep
  isExpanded: boolean
  onToggle: () => void
  detailLevel: 'minimal' | 'moderate' | 'detailed'
}

function ReasoningStepCard({
  step,
  isExpanded,
  onToggle,
  detailLevel
}: ReasoningStepCardProps) {
  // Get icon based on step type
  const getStepIcon = (type: string) => {
    switch (type) {
      case 'analysis': return <Search className="h-4 w-4" />;
      case 'inference': return <Lightbulb className="h-4 w-4" />;
      case 'conclusion': return <FileText className="h-4 w-4" />;
      default: return <Info className="h-4 w-4" />;
    }
  };
  
  // Get color based on confidence
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
    if (confidence >= 0.5) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
  };
  
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle} className="border rounded-md">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-left">
        <div className="flex items-center space-x-2">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-medium">
            {step.stepNumber}. {step.description}
          </span>
          <Badge variant="outline" className="capitalize">
            <span className="mr-1">{getStepIcon(step.type)}</span>
            {step.type}
          </Badge>
        </div>
        
        <Badge className={`${getConfidenceColor(step.confidence)}`}>
          {Math.round(step.confidence * 100)}%
        </Badge>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="p-3 pt-0 border-t">
        <div className="text-sm space-y-2">
          <p>{step.content}</p>
          
          {step.sources.length > 0 && detailLevel !== 'minimal' && (
            <div className="mt-2">
              <h4 className="text-xs font-medium text-muted-foreground">Sources:</h4>
              <ul className="list-disc list-inside text-xs text-muted-foreground">
                {step.sources.map(source => (
                  <li key={source.id}>
                    <span className="capitalize">{source.type}</span>
                    {source.content && `: "${source.content.substring(0, 60)}${source.content.length > 60 ? '...' : ''}"`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface SourceCardProps {
  source: ReasoningSource
}

function SourceCard({ source }: SourceCardProps) {
  return (
    <div className="border rounded-md p-3">
      <div className="flex justify-between items-start mb-2">
        <Badge variant="outline" className="capitalize">
          {source.type}
        </Badge>
        <Badge className={source.confidence >= 0.7 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
          {Math.round(source.confidence * 100)}% confidence
        </Badge>
      </div>
      
      {source.content && (
        <div className="text-sm">
          <p className="italic">"{source.content}"</p>
        </div>
      )}
      
      {source.metadata?.url && (
        <a 
          href={source.metadata.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:underline mt-2 inline-block"
        >
          {source.metadata.url}
        </a>
      )}
    </div>
  );
}
```

#### 6. Integration with Message Component

Adding reasoning display to the message component:

```tsx
// components/message.tsx
import { Message as MessageType } from 'ai'
import { useContext } from 'react'
import { MessageContext } from './message-context'
import { Avatar } from './ui/avatar'
import { StructuredReasoning } from '@/lib/reasoning/types'
import { ReasoningViewer } from './reasoning/reasoning-viewer'
import { SearchSection } from './search-section'
import { Markdown } from './ui/markdown'

interface MessageProps {
  message: MessageType
  isLoading?: boolean
}

export function Message({ message, isLoading }: MessageProps) {
  const { getIsOpen, onOpenChange } = useContext(MessageContext)
  
  // Extract reasoning data if available
  const reasoningData = message.annotations?.find(
    a => a.type === 'structured_reasoning'
  )?.data as StructuredReasoning | undefined;
  
  // Extract search results if available
  const searchData = message.annotations?.find(
    a => a.type === 'tool_call' && a.toolName === 'search'
  )?.data;
  
  return (
    <div className="group relative mb-4 flex items-start md:mb-6">
      <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md border bg-background shadow">
        <Avatar name={message.role === 'user' ? 'User' : 'Assistant'} />
      </div>
      
      <div className="ml-4 flex-1 space-y-2 overflow-hidden">
        {/* Message content */}
        <div className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0">
          <Markdown content={message.content} />
        </div>
        
        {/* Reasoning viewer */}
        {reasoningData && (
          <div className="mt-4 pt-2 border-t">
            <ReasoningViewer 
              reasoning={reasoningData}
              initialDetailLevel="minimal"
            />
          </div>
        )}
        
        {/* Search results if available */}
        {searchData && (
          <SearchSection
            results={searchData.results}
            isOpen={getIsOpen(message.id + '-search')}
            onOpenChange={(open) => onOpenChange(message.id + '-search', open)}
          />
        )}
      </div>
    </div>
  )
}
```

### Improved Reasoning Controls

Adding user controls to adjust reasoning display:

```tsx
// components/reasoning/reasoning-controls.tsx
'use client'

import { useState } from 'react'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Settings, Brain } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

export function ReasoningPreferences() {
  const [open, setOpen] = useState(false)
  const [showReasoning, setShowReasoning] = useLocalStorage('show-reasoning', true)
  const [reasoningDetail, setReasoningDetail] = useLocalStorage('reasoning-detail-level', 'moderate')
  const [autoExpandConclusions, setAutoExpandConclusions] = useLocalStorage('auto-expand-conclusions', true)
  
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
          <Brain className="h-4 w-4" />
          <span className="sr-only">Reasoning preferences</span>
        </Button>
      </SheetTrigger>
      
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Reasoning Preferences</SheetTitle>
        </SheetHeader>
        
        <div className="py-4 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="show-reasoning">Show reasoning</Label>
              <div className="text-sm text-muted-foreground">
                Display the AI's step-by-step reasoning process
              </div>
            </div>
            <Switch
              id="show-reasoning"
              checked={showReasoning}
              onCheckedChange={setShowReasoning}
            />
          </div>
          
          {showReasoning && (
            <>
              <div className="space-y-2">
                <Label htmlFor="reasoning-detail">Detail level</Label>
                <Select value={reasoningDetail} onValueChange={setReasoningDetail}>
                  <SelectTrigger id="reasoning-detail">
                    <SelectValue placeholder="Select detail level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minimal">Minimal - Show only conclusions</SelectItem>
                    <SelectItem value="moderate">Moderate - Show key steps</SelectItem>
                    <SelectItem value="detailed">Detailed - Show all steps</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-expand">Auto-expand conclusions</Label>
                  <div className="text-sm text-muted-foreground">
                    Automatically expand conclusion steps
                  </div>
                </div>
                <Switch
                  id="auto-expand"
                  checked={autoExpandConclusions}
                  onCheckedChange={setAutoExpandConclusions}
                />
              </div>
            </>
          )}
          
          <div className="pt-4 text-sm text-muted-foreground">
            These preferences control how reasoning is displayed. The AI will 
            still use thorough reasoning behind the scenes even if reasoning 
            display is disabled.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

### Integration with ChatPanel

Adding reasoning controls to the chat interface:

```tsx
// components/chat-panel.tsx
import { ReasoningPreferences } from './reasoning/reasoning-controls'

// In the ChatPanel component render function:
return (
  <div className="fixed inset-x-0 bottom-0 bg-gradient-to-b from-muted/10 from-10% to-muted/30 to-50%">
    <div className="mx-auto sm:max-w-2xl sm:px-4">
      <div className="space-y-4 border-t bg-background px-4 py-2 shadow-lg sm:rounded-t-xl sm:border md:py-4">
        <div className="flex items-center justify-between">
          <ModelSelector models={models} />
          <div className="flex items-center gap-2">
            <ReasoningPreferences />
            <SearchModeToggle />
            <ThemeToggle />
          </div>
        </div>
        
        {/* Rest of component */}
      </div>
    </div>
  </div>
)
```

## Implementation Plan

### Phase 1: Core Framework

1. Implement the structured reasoning data model
2. Create the reasoning capture engine
3. Update prompts to generate structured reasoning
4. Implement basic reasoning display in UI

### Phase 2: Enhanced User Experience

1. Add user controls for reasoning preferences
2. Implement collapsible/expandable reasoning steps
3. Create confidence indicators and visualizations
4. Improve source attribution in reasoning display

### Phase 3: Reasoning Analytics and Feedback

1. Add reasoning quality metrics
2. Implement user feedback collection on reasoning
3. Create reasoning comparison across different models
4. Develop reasoning analytics dashboard

## Benefits of Enhanced Reasoning Transparency

1. **Improved User Trust**
   - Clearer understanding of how AI reaches conclusions
   - Ability to inspect and verify sources
   - Transparency about confidence levels and limitations

2. **Better Information Assessment**
   - Users can evaluate the quality of reasoning
   - Clearer distinction between facts and inferences
   - Understanding of how sources influence conclusions

3. **Educational Value**
   - Reasoning steps demonstrate analytical thinking
   - Users learn how to approach complex questions
   - Exposes the research and analysis process

4. **Customizable Experience**
   - Adjustable detail levels for different user needs
   - Focus on specific aspects of reasoning
   - Progressive disclosure for novice vs expert users

5. **Enhanced Debuggability**
   - Easier identification of reasoning flaws
   - Better visibility into model hallucinations
   - Clear connection between sources and claims

## Conclusion

The Enhanced Reasoning Transparency system would transform VernisAI from a black-box answer provider to a transparent reasoning partner. By capturing, structuring, and visualizing the AI's reasoning process, this improvement would:

1. Build trust through transparency and source attribution
2. Enhance the educational value of the system
3. Provide users with control over the level of detail they see
4. Make it easier to identify and address reasoning errors
5. Create a more engaging and interactive experience

This approach aligns with emerging best practices in AI transparency and explainability, making the system more trustworthy and useful for a wide range of users - from casual information seekers to professional researchers requiring rigorous source validation and reasoning.