import { useCallback, useEffect, useState } from 'react'
import type { Project } from '@shared/project'
import { ProjectDialog, type ProjectDialogTarget } from '@renderer/features/projects/ProjectDialog'
import { ProjectTabs } from '@renderer/features/projects/ProjectTabs'
import { CloneDialog } from '@renderer/features/clone/CloneDialog'
import { useAuthStore } from '@renderer/features/github/authStore'
import { SignInDialog } from '@renderer/features/github/SignInDialog'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { ProjectWorkspace } from '@renderer/features/workspace/ProjectWorkspace'
import { StatusBar } from '@renderer/features/workspace/StatusBar'
import { useAppCommands } from '@renderer/features/workspace/useAppCommands'
import { useHasUnsavedChanges, useEditorStore } from '@renderer/features/editor/editorStore'
import { useWorkspacePersistence } from '@renderer/features/workspace/useWorkspacePersistence'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { dugout } from '@renderer/lib/dugout'
import styles from './App.module.css'

function Welcome({ onAddProject, onClone }: { onAddProject(): void; onClone(): void }) {
  return (
    <div className={styles.welcome}>
      <h1 className={styles.heading}>Add your first project</h1>
      <p className={styles.hint}>A project is a git repository you run agents in.</p>
      <div className={styles.welcomeActions}>
        <button className={styles.primary} onClick={onAddProject}>
          Add project…
        </button>
        <button className={styles.secondary} onClick={onClone}>
          Clone repository…
        </button>
      </div>
    </div>
  )
}

export function App() {
  const { projects, selectedId, isLoaded, loadError, load } = useProjectsStore()
  const removeLayout = useWorkspaceStore((state) => state.removeProject)
  const [dialog, setDialog] = useState<ProjectDialogTarget | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])
  const connectAuth = useAuthStore((state) => state.connect)
  useEffect(() => connectAuth(), [connectAuth])

  const startAddProject = useCallback(async () => {
    setPickError(null)
    try {
      const rootPath = await dugout.dialog.pickFolder()
      if (rootPath) setDialog({ mode: 'add', rootPath })
    } catch (error) {
      console.error('[projects] folder picker failed', error)
      setPickError('Could not open the folder picker.')
    }
  }, [])
  const addProject = useCallback(() => void startAddProject(), [startAddProject])
  const [isCloneOpen, setIsCloneOpen] = useState(false)
  const openClone = useCallback(() => setIsCloneOpen(true), [])
  useAppCommands(addProject, openClone)
  useWorkspacePersistence(isLoaded && loadError === null)
  const hasUnsavedChanges = useHasUnsavedChanges()
  useEffect(() => dugout.editor.setHasUnsavedChanges(hasUnsavedChanges), [hasUnsavedChanges])

  const editProject = (project: Project) => setDialog({ mode: 'edit', project })
  const removeEditorTabs = useEditorStore((state) => state.removeProject)
  const onRemoved = (project: Project) => {
    removeLayout(project.id)
    removeEditorTabs(project.id)
  }

  if (!isLoaded) return <div className={styles.app} />

  return (
    <div className={styles.app}>
      <ProjectTabs
        onAddProject={addProject}
        onCloneProject={openClone}
        onEditProject={editProject}
      />
      <div className={styles.body}>
        <main className={styles.main}>
          {projects.length === 0 ? (
            <Welcome onAddProject={addProject} onClone={openClone} />
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
      {dialog && (
        <ProjectDialog target={dialog} onClose={() => setDialog(null)} onRemoved={onRemoved} />
      )}
    </div>
  )
}
