import { createManualToolStreamResponse } from '@/lib/streaming/create-manual-tool-stream'
import { createToolCallingStreamResponse } from '@/lib/streaming/create-tool-calling-stream'
import { Model } from '@/lib/types/models'
import { isProviderEnabled } from '@/lib/utils/registry'
import { ensurePromptSystemInitialized } from '@/lib/prompts/initialize-server'
import { cookies } from 'next/headers'

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    // Initialize the prompt system on first API call
    await ensurePromptSystemInitialized()
    
    // For direct searches, always enable search mode
    const searchMode = true
    const { messages, id: chatId } = await req.json()

    const cookieStore = await cookies()
    const modelJson = cookieStore.get('selectedModel')?.value

    let selectedModel: Model = {
      id: 'gpt-4o-mini',
      name: 'GPT-4o mini',
      provider: 'OpenAI',
      providerId: 'openai',
      enabled: true,
      toolCallType: 'native'
    }

    if (modelJson) {
      try {
        selectedModel = JSON.parse(modelJson) as Model
      } catch (e) {
        console.error('Failed to parse selected model:', e)
      }
    }

    if (
      !isProviderEnabled(selectedModel.providerId) ||
      selectedModel.enabled === false
    ) {
      return new Response(
        `Selected provider is not enabled ${selectedModel.providerId}`,
        {
          status: 404,
          statusText: 'Not Found'
        }
      )
    }

    const supportsToolCalling = selectedModel.toolCallType === 'native'

    return supportsToolCalling
      ? createToolCallingStreamResponse({
          messages,
          model: selectedModel,
          chatId,
          searchMode
        })
      : createManualToolStreamResponse({
          messages,
          model: selectedModel,
          chatId,
          searchMode
        })
  } catch (error) {
    console.error('API route error:', error)
    return new Response('Error processing your request', {
      status: 500,
      statusText: 'Internal Server Error'
    })
  }
}
