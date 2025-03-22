# Vernisai Chatbot Development Guide

## Commands

- `npm run dev` - Start development server with Turbo
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint checks

## Code Style

- **Naming**: kebab-case for files, PascalCase for components, camelCase for variables/functions
- **Formatting**: 2-space indents, single quotes, no semi-colons, no trailing commas
- **Imports**: Follow order: React/Next → 3rd-party → types → local (@/\*) → relative (./)

## TypeScript

- Strict mode enabled
- Path alias: `@/*` points to root directory
- Define interfaces for props and state
- Use type narrowing instead of type assertions when possible

## React/Next.js

- Use React 19 with functional components
- Add `'use client'` directive for client components
- Utilize hooks for state management
- Follow Next.js 15+ App Router structure

## Error Handling

- Use try/catch for async operations
- Provide appropriate fallbacks for failed operations
- Log errors with contextual information

## Log Changes

- Analyze the changes and add the changes summary the right file in the /changes folder. Each has a name format: yyyy-mm-dd.md. If today file doesn't exist, then create it. You will add using a concise title that decribe the changes (##) and bullet point with the changes; your change should be added at the end; form the title as: ## <title of changes> - <hh:mm am/pm>

NOTE: DOn't commit changes or do anything related to git if not instructed directly
