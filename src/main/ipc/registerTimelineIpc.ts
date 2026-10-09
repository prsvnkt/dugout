import { IpcChannel } from '@shared/ipc/channels'
import { timelineSessionRequestSchema } from '@shared/ipc/contract'
import type { TimelineService } from '../services/timeline/TimelineService'
import { handleRequest, type IpcMainLike } from './handle'

export function registerTimelineIpc(
  timeline: Pick<TimelineService, 'timeline'>,
  ipc?: IpcMainLike,
): void {
  handleRequest(
    IpcChannel.timelineSession,
    timelineSessionRequestSchema,
    ({ agent, sessionId }) => timeline.timeline(agent, sessionId),
    ipc,
  )
}
