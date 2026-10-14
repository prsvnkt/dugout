/**
 * Schemas for IPC payloads. Main validates every incoming payload; never trust the renderer.
 *
 * Each domain has its own `<domain>Contract.ts` beside this file; this barrel re-exports them so
 * callers import from one place. Context schemas (`contextContract.ts`) are imported directly,
 * and on-disk file formats live in `shared/persistence/`.
 */

export { repoRelativePath, sessionId as sessionIdSchema } from './fields'
export * from './agentConfigContract'
export * from './cloneContract'
export * from './filesContract'
export * from './gitContract'
export * from './previewContract'
export * from './projectContract'
export * from './settingsContract'
export * from './taskContract'
export * from './terminalContract'
export * from './usageContract'
