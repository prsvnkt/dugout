import type { AgentKind } from '@shared/agents'
import type {
  ContextEntry,
  ContextEntryEdit,
  ContextEntryInput,
  ContextEntryView,
  ContextProposal,
  ContextScope,
  ProjectContext,
} from '@shared/context'
import type { ProjectId } from '@shared/project'
import { parseEntry, parseProposal, serializeEntry, serializeProposal } from './contextFormat'
import { idFromFileName, uniqueId } from './contextIds'

/** A folder of entry files: `.dugout/context/` in the checkout, or one in app data. */
export interface EntryFolder {
  /** File names in the folder; none when it does not exist. */
  names(): Promise<string[]>
  /** The file's text, or null when it is missing or not readable text. */
  read(name: string): Promise<{ content: string; modifiedAt: string } | null>
  write(name: string, content: string): Promise<void>
  remove(name: string): Promise<void>
}

export interface ContextProject {
  readonly id: ProjectId
  readonly rootPath: string
}

export interface ContextStoreDeps {
  readonly folder: (project: ContextProject, kind: ContextScope | 'proposed') => EntryFolder
  /** Content hash of a path in the checkout; null when it does not exist. */
  readonly hashPath: (root: string, path: string) => Promise<string | null>
  readonly now: () => Date
}

/** Codemaps replace each other: a project has one. */
export const CODEMAP_ID = 'codemap'
const SCOPES: readonly ContextScope[] = ['shared', 'private']
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

const fileName = (id: string): string => `${id}.md`

/**
 * A project's context: shared entries in `.dugout/context/`, private ones and agents'
 * proposals in app data. Pinned files carry a content hash, compared on every read.
 */
export class ContextStore {
  constructor(private readonly deps: ContextStoreDeps) {}

  async read(project: ContextProject): Promise<ProjectContext> {
    const [entries, proposals] = await Promise.all([this.entries(project), this.proposals(project)])
    return { entries, proposals }
  }

  /** Shared entries, then private ones with other ids, by title, with their pin state. */
  async entries(project: ContextProject): Promise<ContextEntryView[]> {
    const shared = await this.readScope(project, 'shared')
    const sharedIds = new Set(shared.map((entry) => entry.id))
    const own = (await this.readScope(project, 'private')).filter((e) => !sharedIds.has(e.id))
    const all = [...shared, ...own].sort((a, b) => collator.compare(a.title, b.title))
    return Promise.all(all.map((entry) => this.withPin(project, entry)))
  }

  async get(project: ContextProject, id: string): Promise<ContextEntryView | null> {
    return (await this.entries(project)).find((entry) => entry.id === id) ?? null
  }

  async proposals(project: ContextProject): Promise<ContextProposal[]> {
    const folder = this.deps.folder(project, 'proposed')
    const files = await this.readFolder(folder)
    return files
      .map(({ id, content, modifiedAt }) => parseProposal(id, content, modifiedAt))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async add(project: ContextProject, input: ContextEntryInput): Promise<ContextEntry> {
    const base = {
      id: await this.newId(project, input.title),
      scope: input.scope,
      title: input.title,
      body: input.body,
      updatedAt: this.deps.now().toISOString(),
    }
    const entry: ContextEntry =
      input.kind === 'file'
        ? { ...base, kind: 'file', path: input.path, hash: await this.hash(project, input.path) }
        : input.kind === 'link'
          ? { ...base, kind: 'link', url: input.url }
          : { ...base, kind: 'note' }
    await this.write(project, entry)
    return entry
  }

  async edit(project: ContextProject, edit: ContextEntryEdit): Promise<ContextEntry> {
    const entry = await this.require(project, edit.id)
    return this.write(project, { ...entry, title: edit.title, body: edit.body })
  }

  /** Takes a pinned file's current content as the new baseline, so it is no longer stale. */
  async repin(project: ContextProject, id: string): Promise<ContextEntry> {
    const entry = await this.require(project, id)
    if (entry.kind !== 'file') throw new Error('Only pinned files can be marked as current.')
    return this.write(project, { ...entry, hash: await this.hash(project, entry.path) })
  }

  async remove(project: ContextProject, id: string): Promise<void> {
    const entry = await this.require(project, id)
    await this.deps.folder(project, entry.scope).remove(fileName(id))
  }

  /** Saves a document the user imported from outside the project. */
  async addDoc(
    project: ContextProject,
    scope: ContextScope,
    doc: { title: string; source: string; body: string },
  ): Promise<ContextEntry> {
    const id = await this.newId(project, doc.title)
    return this.write(project, { id, scope, kind: 'doc', ...doc, updatedAt: this.now() })
  }

  /** Saves (or replaces) the project's shared codemap. */
  async saveCodemap(
    project: ContextProject,
    agent: AgentKind,
    body: string,
  ): Promise<ContextEntry> {
    const entry: ContextEntry = {
      id: CODEMAP_ID,
      scope: 'shared',
      kind: 'codemap',
      agent,
      title: 'Codemap',
      body,
      updatedAt: this.now(),
    }
    return this.write(project, entry)
  }

  /** A note from an agent, kept aside until the user approves it. */
  async propose(
    project: ContextProject,
    note: { title: string; body: string },
    proposedBy: AgentKind | null,
  ): Promise<ContextProposal> {
    const proposal = {
      id: await this.newId(project, note.title),
      ...note,
      proposedBy,
      createdAt: this.now(),
    }
    await this.deps
      .folder(project, 'proposed')
      .write(fileName(proposal.id), serializeProposal(proposal))
    return proposal
  }

  /** Shares a proposed note: it becomes a shared entry in `.dugout/context/`. */
  async approve(project: ContextProject, id: string): Promise<ContextEntry> {
    const proposal = (await this.proposals(project)).find((candidate) => candidate.id === id)
    if (!proposal) throw new Error('That proposed note no longer exists.')
    const entry = await this.write(project, {
      id: await this.newId(project, proposal.title, id),
      scope: 'shared',
      kind: 'note',
      title: proposal.title,
      body: proposal.body,
      updatedAt: this.now(),
    })
    await this.deps.folder(project, 'proposed').remove(fileName(id))
    return entry
  }

  async discard(project: ContextProject, id: string): Promise<void> {
    await this.deps.folder(project, 'proposed').remove(fileName(id))
  }

  private now(): string {
    return this.deps.now().toISOString()
  }

  private async write(project: ContextProject, entry: ContextEntry): Promise<ContextEntry> {
    const saved = { ...entry, updatedAt: this.now() }
    await this.deps.folder(project, entry.scope).write(fileName(entry.id), serializeEntry(saved))
    return saved
  }

  private async require(project: ContextProject, id: string): Promise<ContextEntryView> {
    const entry = await this.get(project, id)
    if (!entry) throw new Error('That context entry no longer exists.')
    return entry
  }

  private async hash(project: ContextProject, path: string): Promise<string> {
    const hash = await this.deps.hashPath(project.rootPath, path)
    if (hash === null) throw new Error(`${path} does not exist in the project.`)
    return hash
  }

  private async withPin(project: ContextProject, entry: ContextEntry): Promise<ContextEntryView> {
    if (entry.kind !== 'file') return entry
    const hash = await this.deps.hashPath(project.rootPath, entry.path).catch(() => null)
    return { ...entry, pin: hash === null ? 'missing' : hash === entry.hash ? 'current' : 'stale' }
  }

  /**
   * An unused id from the title, unique across shared, private and proposed entries. An
   * approved proposal keeps its id (`preferred`) unless an entry took it meanwhile.
   */
  private async newId(project: ContextProject, title: string, preferred?: string): Promise<string> {
    const folders = preferred ? SCOPES : [...SCOPES, 'proposed' as const]
    const names = await Promise.all(folders.map((kind) => this.deps.folder(project, kind).names()))
    const taken = new Set(names.flat().map(idFromFileName))
    if (preferred && !taken.has(preferred)) return preferred
    return uniqueId(title, taken)
  }

  private async readScope(project: ContextProject, scope: ContextScope): Promise<ContextEntry[]> {
    const files = await this.readFolder(this.deps.folder(project, scope))
    return files.map(({ id, content, modifiedAt }) => parseEntry(id, scope, content, modifiedAt))
  }

  private async readFolder(folder: EntryFolder) {
    const ids = (await folder.names()).map(idFromFileName).filter((id) => id !== null)
    const files = await Promise.all(
      ids.map(async (id) => ({ id, file: await folder.read(fileName(id)) })),
    )
    return files.flatMap(({ id, file }) => (file ? [{ id, ...file }] : []))
  }
}
