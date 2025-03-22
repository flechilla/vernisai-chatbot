import { initializePromptSystem } from './initialize'

/**
 * Global state to track if initialization has been performed
 */
let isSystemInitialized = false

/**
 * Initialize the prompt system for server-side usage
 * This is idempotent - will only run once regardless of how many times it's called
 */
export async function ensurePromptSystemInitialized() {
  if (isSystemInitialized) {
    return
  }
  
  console.log('Initializing prompt management system for server-side use...')
  const success = await initializePromptSystem()
  isSystemInitialized = success
  
  if (success) {
    console.log('Prompt management system initialized for server-side use')
  } else {
    console.warn('Failed to initialize prompt management system for server-side use')
  }
}
