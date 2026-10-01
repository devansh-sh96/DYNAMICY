/**
 * The tools Icy is allowed to call, and the vocabulary the model uses to reach them.
 *
 * The declarations are described structurally rather than through the SDK's types so the
 * main process can name its tools without pulling an LLM SDK into its bundle. The worker
 * converts this list to the provider's tool schema.
 *
 * Descriptions are load-bearing. The model routes on them, so each one names the tool's
 * effect, its accepted arguments, and the phrasings that should land on it.
 */

import { RENDERER_TOOL_NAMES, type RendererToolName } from '../../shared/ipc'

export type IcyToolName = RendererToolName | 'launch_application' | 'close_active_window_or_tab'

/**
 * Tools the main process hands to the renderer instead of running itself.
 *
 * Main keeps the two that only it can do — spawning a program and sending a keystroke to
 * whatever window is focused. Everything else is state the renderer owns, and routing it
 * there has a second benefit for the telemetry tool: the numbers Icy reads are the same
 * ones the island is drawing, so she can never contradict the gauges on screen.
 */
export const RENDERER_TOOLS: ReadonlySet<IcyToolName> = new Set<IcyToolName>(RENDERER_TOOL_NAMES)

type IcyParameter = {
  type: 'STRING' | 'INTEGER'
  description: string
  enum?: string[]
}

export type IcyFunctionDeclaration = {
  name: IcyToolName
  description: string
  parameters?: {
    type: 'OBJECT'
    properties: Record<string, IcyParameter>
    required?: string[]
  }
}

/** The parameterless tools deliberately omit `parameters`; the worker adds an empty schema. */
export const ICY_TOOL_DECLARATIONS: IcyFunctionDeclaration[] = [
  {
    name: 'get_system_telemetry',
    description:
      "Read this computer's live condition: CPU load, memory usage and battery level. " +
      "Use for 'how is my computer running', 'system status', 'what's my CPU at', " +
      "'how much RAM is free', 'what's the battery level'."
  },
  {
    name: 'launch_application',
    description:
      'Open a desktop application on this computer. Pass a short alias or the app name — ' +
      'for example vsc, vscode, code, spotify, chrome, edge, firefox, notepad, calc, ' +
      'terminal, cmd, explorer, paint, settings, taskmgr, word, excel, outlook, discord, steam. ' +
      "Use for 'open spotify', 'launch vscode', 'start the calculator'.",
    parameters: {
      type: 'OBJECT',
      properties: {
        app_name: { type: 'STRING', description: 'Alias or name of the application to open.' }
      },
      required: ['app_name']
    }
  },
  {
    name: 'set_focus_timer',
    description:
      'Start the island focus countdown. minutes is how long it should run, between 1 and 180. ' +
      "Use for 'start focus for 45 min', 'set a 20 minute timer', 'start a pomodoro'.",
    parameters: {
      type: 'OBJECT',
      properties: {
        minutes: { type: 'INTEGER', description: 'Focus length in minutes, 1 to 180.' }
      },
      required: ['minutes']
    }
  },
  {
    name: 'close_active_window_or_tab',
    description:
      "Send Ctrl+W to the focused window, closing its active tab or document. Use for 'close tab' " +
      "and 'close this tab'."
  },
  {
    name: 'add_task',
    description:
      "Add an item to the user's task list. title is the task itself, short and imperative. " +
      "Use for 'remind me to refill the water', 'add a task to call mum', 'put milk on my list'.",
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'The task text.' }
      },
      required: ['title']
    }
  },
  {
    name: 'control_media',
    description:
      "Control whatever is playing right now. Use for 'pause the music', 'skip this song', " +
      "'next track', 'resume playback'.",
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Which transport control to trigger.',
          enum: ['playPause', 'next', 'previous']
        }
      },
      required: ['action']
    }
  }
]
