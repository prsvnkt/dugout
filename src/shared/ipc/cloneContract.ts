import { z } from 'zod'
import { absolutePath } from './fields'

/** Schema for cloning a repository into a new project. */

/** https, ssh (incl. scp-style git@host:path), file:// or an absolute local path. Never an option. */
const cloneUrl = z
  .string()
  .min(1)
  .max(2048)
  .regex(
    /^(https?:\/\/|ssh:\/\/|file:\/\/|[\w.-]+@[\w.-]+:|\/)\S+$/,
    'Enter an https, ssh or local repository URL',
  )

const folderName = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[\w.][\w.-]*$/, 'Use letters, numbers, dots, dashes or underscores')
  .refine((name) => name !== '.' && name !== '..', 'Choose a folder name')

export const cloneRequestSchema = z.object({ url: cloneUrl, parentDir: absolutePath, folderName })

export type CloneRequest = z.infer<typeof cloneRequestSchema>
