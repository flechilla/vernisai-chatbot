# Streaming & Agents Architecture Documentation

## Overview

The VernisAI Chatbot implements a sophisticated streaming architecture that enables real-time AI responses with dynamic tool usage. This document details the current implementation, architectural patterns, and recommended improvements.

## Architecture Components

### Streaming System

The streaming system handles the real-time communication between the AI models and the frontend interface, with two primary implementation paths:

1. **Native Tool Calling Stream** (`create-tool-calling-stream.ts`)
   - Used with models that natively support tool calling (e.g., OpenAI models)
   - Directly passes tool definitions to the model
   - Manages response streaming through Vercel AI SDK

2. **Manual Tool Calling Stream** (`create-manual-tool-stream.ts`)
   - Used with models without native tool calling support
   - Implements a two-stage process:
     1. First sends user query to determine search parameters
     2. Then executes search and passes results to a second model call
   - Tracks reasoning timing for performance monitoring

### Agent System

The agent system provides the logical layer between user queries and model responses:

1. **Researcher Agent** (`researcher.ts`)
   - Primary agent for models with native tool calling
   - Configured with search, retrieve, and video search tools
   - Uses a research-oriented system prompt

2. **Manual Researcher Agent** (`manual-researcher.ts`)
   - Used for models without native tool calling
   - Receives pre-processed search results
   - Has search-enabled and search-disabled modes

3. **Related Questions Generator** (`generate-related-questions.ts`)
   - Generates follow-up questions based on conversation context
   - Executed after the main query is answered

### Tool Execution

Tool execution is handled through:

1. **Tool Execution** (`tool-execution.ts`)
   - Parses natural language into structured tool calls
   - Currently prioritizes search functionality
   - Uses XML-based format for tool parameters

2. **Tool Call Parsing** (`parse-tool-call.ts`)
   - Converts model-generated XML into structured objects
   - Uses regex-based parsing for parameter extraction
   - Validates parameters against Zod schemas

## Data Flow

1. User submits a query via the chat interface
2. The appropriate stream handler is selected based on model capabilities
3. For native tool calling:
   - Query is sent directly to the model with tool definitions
   - Model decides when and how to use tools
4. For manual tool calling:
   - First call extracts search parameters
   - Search is executed with those parameters
   - Results are sent with the original query to generate final response
5. Tool results and model responses are streamed in real-time to the UI
6. Stream handling wraps up with:
   - Saving the conversation
   - Generating related questions
   - Final message composition

## Technical Challenges

### 1. Dual Implementation Paths

Supporting both native and manual tool calling creates maintenance challenges and potential inconsistencies. The current approach uses two separate implementations with similar but not identical behaviors.

### 2. Context Management

The system needs to balance:
- Token limits imposed by AI models
- Preserving relevant context for follow-up questions
- Ensuring search results are properly synthesized

### 3. Error Handling

Handling failures at various points in the streaming process requires careful error management, particularly with:
- Network interruptions
- Model errors
- Tool execution failures

## Improvement Opportunities

### Error Handling Consistency
**Current state**: Error handling differs between streaming implementations, with inconsistent approaches to error propagation.

**Recommendation**: Implement a unified error handling strategy with:
- Standardized error types and categories
- Consistent recovery mechanisms
- User-friendly error messages
- Proper error logging for debugging

### Stream Resilience
**Current state**: Streams are vulnerable to connection issues with limited recovery options.

**Recommendation**: Enhance stream resilience with:
- Client-side reconnection logic with exponential backoff
- State preservation during disconnections
- Ability to resume from last known position
- Heartbeat mechanism to detect broken connections

### Code Duplication Reduction
**Current state**: Significant overlap between native and manual tool calling implementations.

**Recommendation**: Refactor streaming architecture to:
- Extract common functionality into shared utilities
- Implement a factory pattern for stream creation
- Create a unified stream handler with strategy pattern for different tool calling types
- Share configuration and parameter handling logic

### Robust Parameter Parsing
**Current state**: Regex-based XML parsing is fragile and sensitive to output variations.

**Recommendation**: Enhance parsing robustness with:
- Structured parsing using proper XML/HTML libraries
- Schema-based validation with clear error messages
- Fallback mechanisms for handling imperfect outputs
- Graceful degradation when parsing fails

### Enhanced Tool Framework
**Current state**: Tool support is limited and heavily focused on search functionality.

**Recommendation**: Create a more flexible tool system with:
- Dynamic tool registry for easy extension
- Tool composition and chaining capabilities
- Configuration-driven tool selection
- Metrics to track tool effectiveness

### Prompt Management System
**Current state**: System prompts are duplicated with slight variations across agent implementations.

**Recommendation**: Create a centralized prompt management system with:
- Template-based prompts with variables
- Version control for prompt iterations
- Conditional content based on model capabilities
- A/B testing infrastructure for prompt optimization

### Configurable Model Parameters
**Current state**: Model parameters like temperature are hardcoded in agent implementations.

**Recommendation**: Implement flexible parameter configuration:
- User-adjustable parameters for different tasks
- Task-specific presets (creative, precise, balanced)
- Parameter exposure in the UI for power users
- Default configurations based on model strengths

### Smart Context Management
**Current state**: Basic message truncation that may lose critical context.

**Recommendation**: Implement intelligent context handling:
- Semantic-aware message summarization
- Prioritize retention of relevant information
- Add metadata to track truncated content
- Provide context indicators in the UI

### Enhanced Reasoning Transparency
**Current state**: Limited exposure of reasoning process to users.

**Recommendation**: Improve reasoning transparency:
- Expandable reasoning steps in the UI
- Confidence indicators for different reasoning components
- Explicit source attribution for claims
- User controls for reasoning detail level

### Dynamic Tool Selection
**Current state**: Tools are enabled/disabled based on static configuration.

**Recommendation**: Implement intelligent tool selection:
- Query analysis to determine appropriate tools
- Automatic tool suggestion based on intent detection
- Learn from successful tool usage patterns
- Adapt to user preferences over time

## Implementation Guidelines

When enhancing the streaming and agent systems, consider these principles:

1. **Modularity**: Design components with clear interfaces and single responsibilities
2. **Testability**: Ensure all logic can be tested in isolation
3. **Type Safety**: Use strong TypeScript typing throughout
4. **Error Resilience**: Design for graceful failure and recovery
5. **Performance**: Minimize latency in streaming responses
6. **Extensibility**: Make it easy to add new tools and models
7. **Consistency**: Provide a uniform experience across different models

## Future Directions

The streaming and agent architecture could evolve to support:

1. **Multi-agent Collaboration**: Multiple specialized agents working together
2. **Long-Running Operations**: Support for tasks that exceed typical response windows
3. **Memory Systems**: More sophisticated context retention between sessions
4. **Tool Learning**: Automatically discover and optimize tool usage patterns
5. **Custom Tool Creation**: Allow users to define their own tools