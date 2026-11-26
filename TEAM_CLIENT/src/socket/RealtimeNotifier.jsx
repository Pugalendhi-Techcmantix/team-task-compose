import { useNotifications } from '../context/NotificationContext'
import { isOwnTask } from './ownChanges'
import { SOCKET_EVENTS } from './socket'
import { useSocketEvent } from './useSocketEvent'
import { notificationText } from './notificationText'

/**
 * App-wide: every `notification` event becomes a toast, on any page.
 * Skipped when it's about a task this tab just changed itself.
 * (The bell's count and list come from NotificationInboxProvider.)
 */
export default function RealtimeNotifier() {
  const { notify } = useNotifications()

  useSocketEvent(SOCKET_EVENTS.NOTIFICATION, (n) => {
    if (isOwnTask(n?.taskId)) return
    const text = notificationText(n)
    if (text) notify(text, { tone: 'live' })
  })

  return null
}
