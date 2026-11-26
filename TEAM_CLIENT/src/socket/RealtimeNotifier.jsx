import { useNotifications } from '../context/NotificationContext'
import { isOwnTask } from './ownChanges'
import { SOCKET_EVENTS } from './socket'
import { useSocketEvent } from './useSocketEvent'
import { notificationText } from './notificationText'

/**
 * App-wide: every `notification` event becomes a toast and a bell entry, on any page.
 * Skipped when it's about a task this tab just changed itself.
 */
export default function RealtimeNotifier() {
  const { notify } = useNotifications()

  useSocketEvent(SOCKET_EVENTS.NOTIFICATION, (n) => {
    if (isOwnTask(n?.taskId)) return
    const text = notificationText(n)
    if (text) notify(text, { tone: 'live', record: true })
  })

  return null
}
