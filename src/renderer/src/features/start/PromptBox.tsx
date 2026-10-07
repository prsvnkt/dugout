import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { MAX_INITIAL_PROMPT_LENGTH } from '@shared/ipc/contract'
import type { Project } from '@shared/project'
import { AGENT_KINDS, AGENT_LABEL } from '@shared/terminal'
import { titleFromPrompt } from '@renderer/features/workspace/recentSessions'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { useDefaultAgentStore } from './defaultAgentStore'
import styles from './StartScreen.module.css'

/** "What do you want to work on?": the prompt starts a session with the default agent. */
export function PromptBox({ project }: { project: Project }) {
  const [prompt, setPrompt] = useState('')
  const defaultAgent = useDefaultAgentStore((state) => state.defaultAgent)
  const setDefaultAgent = useDefaultAgentStore((state) => state.setDefaultAgent)
  const load = useDefaultAgentStore((state) => state.load)
  const addPane = useWorkspaceStore((state) => state.addPane)
  const inputId = useId()
  const hasPrompt = prompt.trim().length > 0

  useEffect(() => void load(), [load])

  const start = () => {
    const text = prompt.trim()
    if (!text) return
    addPane(project.id, defaultAgent, undefined, {
      initialPrompt: text,
      title: titleFromPrompt(text),
    })
    setPrompt('')
  }

  // Enter starts; Shift+Enter adds a line. Never interrupt an IME composition.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    start()
  }

  return (
    <form
      className={styles.prompt}
      onSubmit={(event) => {
        event.preventDefault()
        start()
      }}
    >
      <label htmlFor={inputId} className={styles.heading}>
        What do you want to work on in {project.name}?
      </label>
      <textarea
        id={inputId}
        className={styles.input}
        rows={3}
        value={prompt}
        maxLength={MAX_INITIAL_PROMPT_LENGTH}
        placeholder="Describe a task, ask a question, or paste an error…"
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className={styles.promptFooter}>
        <label className={styles.agentPicker}>
          Agent
          <select
            value={defaultAgent}
            onChange={(event) => {
              const agent = AGENT_KINDS.find((kind) => kind === event.target.value)
              if (agent) void setDefaultAgent(agent)
            }}
          >
            {AGENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {AGENT_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.keyHint}>↵ to start · ⇧↵ for a new line</span>
        <button type="submit" className={styles.primary} disabled={!hasPrompt}>
          Start
        </button>
      </div>
    </form>
  )
}
