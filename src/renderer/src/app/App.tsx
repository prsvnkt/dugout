import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { projectColorVar } from '@renderer/features/projects/projectColor'
import { ProjectTabs } from '@renderer/features/projects/ProjectTabs'
import { CloneDialog } from '@renderer/features/clone/CloneDialog'
import { useAuthStore } from '@renderer/features/github/authStore'
import { SignInDialog } from '@renderer/features/github/SignInDialog'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { ProjectWorkspace } from '@renderer/features/workspace/ProjectWorkspace'
import { StatusBar } from '@renderer/features/workspace/StatusBar'
import { useAppCommands } from '@renderer/features/workspace/useAppCommands'
import { useHasUnsavedChanges } from '@renderer/features/editor/editorStore'
import { useWorkspacePersistence } from '@renderer/features/workspace/useWorkspacePersistence'
import { WelcomeScreen } from '@renderer/features/welcome/WelcomeScreen'
import { watchUsageChanges } from '@renderer/features/usage/usageStore'
import { useTaskQueueRunner } from '@renderer/features/taskQueue/useTaskQueueRunner'
import { dugout } from '@renderer/lib/dugout'
import styles from './App.module.css'

export function App() {
  const { projects, selectedId, isLoaded, loadError, load, add } = useProjectsStore()
  const [pickError, setPickError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])
  const connectAuth = useAuthStore((state) => state.connect)
  useEffect(() => connectAuth(), [connectAuth])
  useEffect(() => watchUsageChanges(), [])

  const startAddProject = useCallback(async () => {
    setPickError(null)
    try {
      const rootPath = await dugout.dialog.pickFolder()
      // Named after its folder, in a random colour: nothing to ask.
      if (rootPath) await add({ rootPath })
    } catch (error) {
      console.error('[projects] could not add a project', error)
      setPickError(error instanceof Error ? error.message : 'Could not add the project.')
    }
  }, [add])
  const addProject = useCallback(() => void startAddProject(), [startAddProject])
  const [isCloneOpen, setIsCloneOpen] = useState(false)
  const openClone = useCallback(() => setIsCloneOpen(true), [])
  useAppCommands(addProject, openClone)
  useWorkspacePersistence(isLoaded && loadError === null)
  useTaskQueueRunner()
  const hasUnsavedChanges = useHasUnsavedChanges()
  useEffect(() => dugout.editor.setHasUnsavedChanges(hasUnsavedChanges), [hasUnsavedChanges])

  if (!isLoaded) return <div className={styles.app} />

  // Inside a project everything is the project's colour; field green is the welcome screen's.
  const selected = projects.find((project) => project.id === selectedId)
  const accent = selected
    ? ({ '--accent': projectColorVar(selected.color) } as CSSProperties)
    : undefined

  return (
    <div className={styles.app} style={accent}>
      <ProjectTabs onAddProject={addProject} onCloneProject={openClone} />
      <div className={styles.body}>
        <main className={styles.main}>
          {projects.length === 0 ? (
            <WelcomeScreen onAddProject={addProject} onClone={openClone} />
          ) : (
            projects.map((project) => (
              <ProjectWorkspace
                key={project.id}
                project={project}
                isActive={project.id === selectedId}
              />
            ))
          )}
          {(loadError ?? pickError) && (
            <p className={styles.error} role="alert">
              {loadError ?? pickError}
            </p>
          )}
        </main>
      </div>
      <StatusBar />
      {isCloneOpen && <CloneDialog onClose={() => setIsCloneOpen(false)} />}
      <SignInDialog />
    </div>
  )
}
