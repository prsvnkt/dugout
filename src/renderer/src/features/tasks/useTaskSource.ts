import type { ProjectId } from '@shared/project'
import { GITHUB_TASK_SOURCE, taskSourceOf, type TaskSource } from '@shared/tasks'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'

/** Where the project's tasks live: GitHub Issues unless the project chose a Linear team. */
export function useTaskSource(projectId: ProjectId): TaskSource {
  return useProjectsStore((state) => {
    const project = state.projects.find((candidate) => candidate.id === projectId)
    return project ? taskSourceOf(project) : GITHUB_TASK_SOURCE
  })
}
