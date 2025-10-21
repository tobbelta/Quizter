/**
 * QUESTION NOTIFICATION SERVICE
 * 
 * SYFTE: Hanterar notifieringar när nya frågor blir tillgängliga i en runda
 * 
 * PLATTFORMSSTÖD:
 * - Native (Android/iOS): Capacitor LocalNotifications med ljud och vibration
 * - Web: Web Notification API med service worker för offline-support
 * 
 * VIKTIGA FUNKTIONER:
 * - notifyQuestionAvailable(): Skicka notifiering omedelbart
 * - scheduleNativeQuestionNotification(): Schemalägg notifiering för framtida tidpunkt (native only)
 * - cancelNativeNotification(): Avbryt schemalagd notifiering
 * - ensureNotificationPermissions(): Begär notifieringsbehörigheter
 * 
 * TEKNISKA DETALJER:
 * - Android kräver numeriska notification IDs → vi hashar question ID:n
 * - Exakt timing kräver SCHEDULE_EXACT_ALARM permission på Android 12+
 * - Service worker används för web-notifieringar när appen är offline/bakgrund
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// ============================================================================
// WEB NOTIFICATION HELPER
// SYFTE: Visa web-notifikation med eller utan service worker
// ============================================================================

/**
 * Visar web-notifikation, föredrar service worker registration om tillgänglig
 * 
 * Service worker ger:
 * - Notifieringar även när appen är stängd
 * - Bättre offline-support
 * - Mer robust än vanliga Notification API
 */
const showWebNotification = async (title, options) => {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
    } else {
      // Fallback till vanliga Notification API om service worker saknas
      new Notification(title, options);
    }
  } catch (error) {
    console.warn('[QuestionNotification] Could not show notification:', error);
  }
};

// ============================================================================
// PERMISSIONS
// SYFTE: Begär notifieringsbehörigheter på både native och web
// ============================================================================

/**
 * Begär notifieringsbehörigheter från användaren
 * 
 * NATIVE: LocalNotifications.requestPermissions()
 * WEB: Notification.requestPermission()
 * 
 * ANVÄNDNING: Anropas i GenerateRunPage när användaren klickar "Aktivera notifieringar"
 */
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

// ============================================================================
// NOTIFICATION ID GENERATOR
// SYFTE: Konvertera string IDs till numeriska IDs för Android kompatibilitet
// ============================================================================

// Android LocalNotifications kräver numeriska IDs, men Firebase question IDs är strings
const MAX_NOTIFICATION_ID = 2000000000;

/**
 * Genererar ett numeriskt notification ID från en string
 * 
 * TEKNISK BAKGRUND:
 * - Android LocalNotifications API kräver numeriska IDs
 * - Firebase question IDs är strings (firestore auto-generated)
 * - Vi hashar stringen till ett nummer mellan 1 och MAX_NOTIFICATION_ID
 * 
 * @param {string} key - Huvudnyckel (t.ex. question ID)
 * @param {string} salt - Extra salt för unikhet (t.ex. timestamp)
 * @returns {number} - Numeriskt ID mellan 1 och MAX_NOTIFICATION_ID
 */
const generateNotificationId = (key, salt) => {
  const input = `${key ?? ''}${salt ?? ''}`;

  // Om ingen input, använd timestamp
  if (!input) {
    return Date.now() % MAX_NOTIFICATION_ID;
  }

  // Simple hash function (djb2 algorithm)
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0; // Force 32-bit integer
  }

  // Normalisera till positivt nummer inom range
  const normalized = Math.abs(hash) % MAX_NOTIFICATION_ID;
  return normalized === 0 ? 1 : normalized; // Undvik 0 (kan orsaka problem på vissa Android-versioner)
};

// ============================================================================
// NOTIFICATION CONTENT BUILDER
// SYFTE: Bygg titel, body och metadata för notifieringar baserat på run-typ
// ============================================================================

/**
 * Bygger notifikationsinnehåll anpassat för olika run-typer
 * 
 * @param {object} questionData - Data om frågan och rundan
 * @returns {object} - { title, body, questionId, runId, mode, targetUrl, ... }
 * 
 * ANPASSNINGAR PER MODE:
 * - route: "🧭 Fråga X av Y" - GPS-baserad
 * - distance: "📍 Ny fråga tillgänglig!" - Distansbaserad
 * - time: "⏱️ Fråga X av Y" - Tidsbaserad med nedräkning
 */
const buildNotificationContent = (questionData = {}) => {
  const {
    questionId,
    questionText,
    questionOrder,
    order,
    totalQuestions,
    total,
    mode = 'route',          // Standardläge är route-baserat
    runId,
    minutesBetweenQuestions, // För tidsbaserade rundor
  } = questionData;

  // Normalisera order/total (kan komma med olika namngivning)
  const resolvedOrder = order ?? questionOrder ?? 1;
  const resolvedTotal = total ?? totalQuestions ?? 1;

  // Anpassa titel baserat på run mode
  let title;
  switch (mode) {
    case 'distance':
      title = '📍 Ny fråga tillgänglig!';
      break;
    case 'time':
      title = `⏱️ Fråga ${resolvedOrder} av ${resolvedTotal}`;
      break;
    default: // 'route'
      title = `🧭 Fråga ${resolvedOrder} av ${resolvedTotal}`;
  }

  // Body: Visa preview av frågetexten (max 100 tecken) eller generiskt meddelande
  let body = questionText
    ? `${questionText.substring(0, 100)}${questionText.length > 100 ? '...' : ''}`
    : 'En ny fråga väntar på dig!';

  // Specialmeddelande för tidsbaserade rundor
  if (mode === 'time' && !questionText) {
    body = 'Nedräkningen är klar – dags att svara!';
  }

  // Lägg till intervall-info för tidsbaserade rundor (hjälper användaren förstå schemat)
  if (mode === 'time' && minutesBetweenQuestions) {
    body = `${body} (Intervall: ${minutesBetweenQuestions} min)`;
  }

  // Target URL för när användaren klickar på notifieringen
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

// ============================================================================
// NOTIFY QUESTION AVAILABLE (IMMEDIATE)
// SYFTE: Skicka notifiering omedelbart när en fråga blir tillgänglig
// ANVÄNDS: Främst för route/distance-baserade rundor och som fallback
// ============================================================================

/**
 * Skickar en omedelbar notifiering att en fråga är tillgänglig
 * 
 * PLATTFORMAR:
 * - Native: Schedular notifiering 100ms fram (ger tid för app state)
 * - Web: Visar direkt via Notification API eller service worker
 * 
 * @param {object} questionData - Data om frågan (questionId, questionText, mode, etc)
 * @param {object} extraPayload - Extra metadata att bifoga
 * 
 * ANVÄNDNING: Kallas från PlayRunPage när:
 * - Användaren når en waypoint (route-baserat)
 * - Användaren gått tillräckligt långt (distance-baserat)
 * - Timer går ut men appen är i bakgrund (time-baserat backup)
 */
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

  // NATIVE PLATFORM (Android/iOS via Capacitor)
  if (Capacitor.isNativePlatform()) {
    try {
      // Kontrollera permission status
      const permStatus = await LocalNotifications.checkPermissions();
      if (permStatus.display !== 'granted') {
        // Försök begära permission om inte granted
        const requested = await LocalNotifications.requestPermissions();
        if (requested.display !== 'granted') {
          console.warn('[QuestionNotification] User denied notification permission');
          return; // Kan inte visa notifiering utan permission
        }
      }

      // Generera numeriskt ID (Android kräver detta)
      const numericId = generateNotificationId(questionId);

      // Scheduala notifiering 100ms fram i tiden
      // Varför? För att ge Android tid att hantera app state korrekt
      await LocalNotifications.schedule({
        notifications: [
          {
            id: numericId,
            title,
            body,
            schedule: {
              at: new Date(Date.now() + 100), // 100ms framåt
            },
            sound: 'question_alert.wav', // Custom ljud (finns i public/sounds/)
            actionTypeId: 'QUESTION_READY',  // För att hantera notifiering-klick
            extra: {
              // Extra metadata som skickas med notifieringen
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
