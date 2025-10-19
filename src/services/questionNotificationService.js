import { Capacitor, registerPlugin } from '@capacitor/core';

const ACTION_TYPE_ID = 'QUESTION_ACTIONS';
const SMALL_ICON_NAME = 'ic_notification_compass';

let localNotificationsPlugin = null;
let setupPromise = null;
let actionListenerRegistered = false;

const getLocalNotifications = () => {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  if (!localNotificationsPlugin) {
    try {
      localNotificationsPlugin = registerPlugin('LocalNotifications');
    } catch (error) {
      console.warn('[QuestionNotification] Could not register LocalNotifications plugin:', error);
      localNotificationsPlugin = null;
    }
  }

  return localNotificationsPlugin;
};

const serializeOptions = (options = []) => {
  return options
    .filter(Boolean)
    .slice(0, 4)
    .map((opt) => (typeof opt === 'string' ? opt : String(opt)));
};

const ensureSetup = async () => {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  const plugin = getLocalNotifications();
  if (!plugin) {
    return;
  }

  if (!setupPromise) {
    setupPromise = (async () => {
      await plugin.requestPermissions().catch((error) => {
        console.warn('[QuestionNotification] Could not request permissions:', error);
      });

      try {
        await plugin.registerActionTypes({
          types: [
            {
              id: ACTION_TYPE_ID,
              actions: [
                {
                  id: 'answer',
                  title: 'Svara',
                  input: true,
                  editable: true,
                  buttonTitle: 'Skicka',
                  placeholder: 'Ange alternativ (1-4 eller text)',
                },
                {
                  id: 'open',
                  title: 'Öppna i appen',
                  foreground: true,
                },
              ],
            },
          ],
        });
      } catch (error) {
        console.warn('[QuestionNotification] Could not register action types:', error);
      }

      if (!actionListenerRegistered) {
        actionListenerRegistered = true;
        plugin.addListener('localNotificationActionPerformed', (event) => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('routequest:notificationAction', {
                detail: event,
              }),
            );
          }
        });
      }
    })().catch((error) => {
      console.warn('[QuestionNotification] Setup failed:', error);
      setupPromise = null;
    });
  }

  return setupPromise;
};

const buildBody = ({ questionText, order, total, distanceMeters, mode }) => {
  const locationInfo =
    mode === 'distance' && typeof distanceMeters === 'number'
      ? `Du har gått ${Math.round(distanceMeters)} meter.`
      : 'Du är nära nästa kontrollpunkt.';

  const orderInfo =
    typeof order === 'number' && typeof total === 'number'
      ? `Fråga ${order}/${total}`
      : 'Ny fråga väntar';

  const questionLine = questionText ? `\n${questionText}` : '';

  return `${orderInfo}\n${locationInfo}${questionLine}`;
};

export const ensureNotificationPermissions = async () => {
  if (Capacitor.isNativePlatform()) {
    await ensureSetup();
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

export const notifyQuestionAvailable = async ({
  questionId = null,
  questionTitle = 'Ny fråga väntar!',
  questionText = '',
  options = [],
  order = null,
  total = null,
  distanceMeters = null,
  mode = 'route',
} = {}) => {
  const cleanedOptions = serializeOptions(options);
  const body = buildBody({ questionText, order, total, distanceMeters, mode });

  const extraPayload = {
    questionId,
    options: cleanedOptions,
    order,
    total,
    distanceMeters,
    mode,
  };

  if (Capacitor.isNativePlatform()) {
    const plugin = getLocalNotifications();
    if (!plugin) {
      return;
    }

    await ensureSetup();

    try {
      const notificationId = Math.floor(Date.now() % 2147483647);
      await plugin.schedule({
        notifications: [
          {
            id: notificationId,
            title: questionTitle,
            body,
            smallIcon: SMALL_ICON_NAME,
            sound: 'question_alert.wav',
            actionTypeId: ACTION_TYPE_ID,
            extra: extraPayload,
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
      try {
        const notification = new Notification(questionTitle, {
          body,
          tag: `question-${questionId || Date.now()}`,
          data: extraPayload,
        });

        notification.onclick = () => {
          window.dispatchEvent(
            new CustomEvent('routequest:webNotificationClicked', {
              detail: extraPayload,
            }),
          );
          window.focus();
        };
      } catch (error) {
        console.warn('[QuestionNotification] Could not show web notification:', error);
      }
    }
  }
};

const questionNotificationService = {
  ensureNotificationPermissions,
  notifyQuestionAvailable,
};

export default questionNotificationService;
