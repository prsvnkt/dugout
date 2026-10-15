import { useState, type SyntheticEvent } from 'react'
import { Music } from 'lucide-react'
import { Icon } from '@renderer/lib/Icon'
import { formatDuration } from './viewerInfo'
import { useFileSizeText, ViewerToolbar } from './ViewerToolbar'
import styles from './Viewers.module.css'

interface MediaPlayerProps {
  readonly path: string
  readonly url: string
  readonly kind: 'video' | 'audio'
}

interface Metadata {
  readonly duration: string
  readonly dimensions: string | null
}

function metadataOf(element: HTMLVideoElement | HTMLAudioElement): Metadata {
  const isVideo = element instanceof HTMLVideoElement && element.videoWidth > 0
  return {
    duration: formatDuration(element.duration),
    dimensions: isVideo ? `${element.videoWidth} × ${element.videoHeight} px` : null,
  }
}

/**
 * A video or audio file with the native controls. Main serves byte ranges, so seeking
 * streams from the new position instead of reading the whole file.
 */
export function MediaPlayer({ path, url, kind }: MediaPlayerProps) {
  const [metadata, setMetadata] = useState<Metadata | null>(null)
  const [hasFailed, setFailed] = useState(false)
  const sizeText = useFileSizeText(url)
  const name = path.slice(path.lastIndexOf('/') + 1)
  const onMetadata = (event: SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) =>
    setMetadata(metadataOf(event.currentTarget))
  const onError = () => setFailed(true)
  return (
    <div className={styles.viewer}>
      <ViewerToolbar
        path={path}
        kind={kind}
        details={[metadata?.dimensions, metadata?.duration, sizeText]}
      />
      <div className={styles.stage}>
        {hasFailed ? (
          <p className={styles.message}>
            This {kind} could not be played. Chromium plays MP4 (H.264), WebM, MP3, WAV and Ogg.
          </p>
        ) : (
          <div className={styles.fit}>
            {kind === 'video' ? (
              <video
                className={styles.video}
                src={url}
                controls
                preload="metadata"
                aria-label={name}
                onLoadedMetadata={onMetadata}
                onError={onError}
              />
            ) : (
              <div className={styles.audioCard}>
                <span className={styles.audioGlyph}>
                  <Icon icon={Music} size="rail" />
                </span>
                <span className={styles.audioName}>{name}</span>
                <audio
                  className={styles.audio}
                  src={url}
                  controls
                  preload="metadata"
                  aria-label={name}
                  onLoadedMetadata={onMetadata}
                  onError={onError}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
