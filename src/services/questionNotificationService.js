import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Helper för att visa web-notifikation med eller utan service worker
 */
const showWebNotification = async (title, options) => {
  try {
    // Om service worker finns, använd den (krävs i vissa browserkontexer)
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
    } else {
      // Fallback till vanlig Notification API
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

export const notifyQuestionAvailable = async (questionData = {}, extraPayload = {}) => {
  const {
    questionId,
    questionText,
    questionOrder,
    order,
    totalQuestions,
    total,
    mode = 'route',
    runId,
    minutesBetweenQuestions
  } = questionData;

  console.log('[QuestionNotification] 📢 Sending notification for question:', questionId, 'order:', questionOrder, 'mode:', mode);

  const resolvedOrder = (order ?? questionOrder ?? 1);
  const resolvedTotal = (total ?? totalQuestions ?? 1);

  let questionTitle;
  switch (mode) {
    case 'distance':
      questionTitle = '🧭 Ny fråga tillgänglig!';
      break;
    case 'time':
      questionTitle = `⏱️ Fråga ${resolvedOrder} av ${resolvedTotal}`;
      break;
    default:
      questionTitle = `🗺️ Fråga ${resolvedOrder} av ${resolvedTotal}`;
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
  // Konstruera ABSOLUT URL för att navigera tillbaka till rätt run
  const targetPath = runId ? `/run/${runId}/play` : '/';
  const targetUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}${targetPath}`
    : targetPath;

  console.log('[QuestionNotification] Target URL:', targetUrl);

  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: questionTitle,
            body,
            id: questionId || Date.now(),
            schedule: { at: new Date(Date.now() + 100) },
            sound: 'question_alert.wav',
            actionTypeId: 'QUESTION_READY',
            extra: {
              questionId,
              runId,
              mode,
              minutesBetweenQuestions,
              ...extraPayload
            },
          },
        ],
      });
    } catch (error) {
      console.warn('[QuestionNotification] Could not schedule native notification:', error);
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
      await showWebNotification(questionTitle, {
        body,
        tag: `question-${questionId || Date.now()}`,
        data: {
          questionId,
          runId,
          mode,
          minutesBetweenQuestions,
          url: targetUrl,
          ...extraPayload
        },
      });
    }
  }
};

const questionNotificationService = {
  ensureNotificationPermissions,
  notifyQuestionAvailable,
};

export default questionNotificationService;



