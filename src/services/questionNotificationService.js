import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Helper för att visa web-notifikation med eller utan service worker
 */
const showWebNotification = async (title, options) => {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
    } else {
      // Fallback till vanliga Notification API
      new Notification(title, options);
    }
  } catch (error) {
    console.warn('[QuestionNotification] Could not show notification:', error);
  }
};

export const ensureNotificationPermissions = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.requestPermissions();
    } catch (error) {
      console.warn('[QuestionNotification] Could not request native permissions:', error);
    }
  } else if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (error) {
        console.warn('[QuestionNotification] Could not request web notification permission:', error);
      }
    }
  }
};

const MAX_NOTIFICATION_ID = 2000000000;

const generateNotificationId = (key, salt) => {
  const input = `${key ?? ''}${salt ?? ''}`;

  if (!input) {
    return Date.now() % MAX_NOTIFICATION_ID;
  }

  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0; // Force 32-bit
  }

  const normalized = Math.abs(hash) % MAX_NOTIFICATION_ID;
  return normalized === 0 ? 1 : normalized;
};

const buildNotificationContent = (questionData = {}) => {
  const {
    questionId,
    questionText,
    questionOrder,
    order,
    totalQuestions,
    total,
    mode = 'route',
    runId,
    minutesBetweenQuestions,
  } = questionData;

  const resolvedOrder = order ?? questionOrder ?? 1;
  const resolvedTotal = total ?? totalQuestions ?? 1;

  let title;
  switch (mode) {
    case 'distance':
      title = '📍 Ny fråga tillgänglig!';
      break;
    case 'time':
      title = `⏱️ Fråga ${resolvedOrder} av ${resolvedTotal}`;
      break;
    default:
      title = `🧭 Fråga ${resolvedOrder} av ${resolvedTotal}`;
  }

  let body = questionText
    ? `${questionText.substring(0, 100)}${questionText.length > 100 ? '...' : ''}`
    : 'En ny fråga väntar på dig!';

  if (mode === 'time' && !questionText) {
    body = 'Nedräkningen är klar – dags att svara!';
  }

  if (mode === 'time' && minutesBetweenQuestions) {
    body = `${body} (Intervall: ${minutesBetweenQuestions} min)`;
  }

  const targetPath = runId ? `/run/${runId}/play` : '/';
  const targetUrl = typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}${targetPath}`
    : targetPath;

  return {
    title,
    body,
    questionId,
    runId,
    mode,
    minutesBetweenQuestions,
    targetUrl,
  };
};

export const notifyQuestionAvailable = async (questionData = {}, extraPayload = {}) => {
  const {
    title,
    body,
    questionId,
    runId,
    mode,
    minutesBetweenQuestions,
    targetUrl,
  } = buildNotificationContent(questionData);

  console.log('[QuestionNotification] 🔔 Sending notification for question:', questionId, 'mode:', mode);

  if (Capacitor.isNativePlatform()) {
    try {
      const permStatus = await LocalNotifications.checkPermissions();
      if (permStatus.display !== 'granted') {
        const requested = await LocalNotifications.requestPermissions();
        if (requested.display !== 'granted') {
          console.warn('[QuestionNotification] User denied notification permission');
          return;
        }
      }

      const numericId = generateNotificationId(questionId);

      await LocalNotifications.schedule({
        notifications: [
          {
            id: numericId,
            title,
            body,
            schedule: {
              at: new Date(Date.now() + 100),
            },
            sound: 'question_alert.wav',
            actionTypeId: 'QUESTION_READY',
            extra: {
              questionId,
              runId,
              mode,
              minutesBetweenQuestions,
              ...extraPayload,
            },
          },
        ],
      });

      console.log('[QuestionNotification] ✅ Native notification scheduled immediately. ID:', numericId);
    } catch (error) {
      console.error('[QuestionNotification] Could not schedule native notification:', error);
    }
  } else if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (error) {
        console.warn('[QuestionNotification] Could not request Notification permission:', error);
      }
    }

    if (Notification.permission === 'granted') {
      await showWebNotification(title, {
        body,
        tag: `question-${questionId || Date.now()}`,
        data: {
          questionId,
          runId,
          mode,
          minutesBetweenQuestions,
          url: targetUrl,
          ...extraPayload,
        },
      });
    }
  }
};

export const scheduleNativeQuestionNotification = async (questionData = {}, scheduleAt, extraPayload = {}) => {
  if (!Capacitor.isNativePlatform() || !scheduleAt) {
    return null;
  }

  const {
    title,
    body,
    questionId,
    runId,
    mode,
    minutesBetweenQuestions,
  } = buildNotificationContent(questionData);

  try {
    const permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== 'granted') {
      const requested = await LocalNotifications.requestPermissions();
      if (requested.display !== 'granted') {
        console.warn('[QuestionNotification] User denied notification permission for scheduled notification');
        return null;
      }
    }

    const numericId = generateNotificationId(questionId || 'scheduled', scheduleAt);

    try {
      await LocalNotifications.cancel({ notifications: [{ id: numericId }] });
    } catch (cancelError) {
      console.warn('[QuestionNotification] Could not cancel existing scheduled notification:', cancelError);
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: numericId,
          title,
          body,
          schedule: {
            at: new Date(scheduleAt),
            allowWhileIdle: true,
          },
          sound: 'question_alert.wav',
          actionTypeId: 'QUESTION_READY',
          extra: {
            questionId,
            runId,
            mode,
            minutesBetweenQuestions,
            scheduled: true,
            ...extraPayload,
          },
        },
      ],
    });

    console.log('[QuestionNotification] Scheduled native notification', numericId, 'for', new Date(scheduleAt).toISOString());
    return numericId;
  } catch (error) {
    const details = typeof error?.message === 'string' ? error.message : String(error);
    console.error('[QuestionNotification] Could not schedule native notification:', details, {
      code: error?.code,
      data: error?.data,
    });
    return null;
  }
};

export const cancelNativeNotification = async (identifier) => {
  if (!Capacitor.isNativePlatform() || identifier === null || identifier === undefined) {
    return;
  }

  const numericId = typeof identifier === 'number'
    ? identifier
    : generateNotificationId(identifier);

  try {
    await LocalNotifications.cancel({ notifications: [{ id: numericId }] });
    console.log('[QuestionNotification] Cancelled native notification', numericId);
  } catch (error) {
    console.warn('[QuestionNotification] Could not cancel native notification:', error);
  }
};

const questionNotificationService = {
  ensureNotificationPermissions,
  notifyQuestionAvailable,
  scheduleNativeQuestionNotification,
  cancelNativeNotification,
};

export default questionNotificationService;
