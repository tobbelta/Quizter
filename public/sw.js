// Service Worker för Quizter
// Optimerat för mobila nätverk och offline-funktionalitet

const CACHE_NAME = 'quizter-v1.0.0';
const STATIC_CACHE = 'quizter-static-v1.0.0';
const DYNAMIC_CACHE = 'quizter-dynamic-v1.0.0';

// Kritiska resurser som alltid ska cachas
const STATIC_ASSETS = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico',
  // Leaflet essentials
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// API endpoints som ska cachas
const CACHE_STRATEGIES = {
  // Cache first for static assets
  'static': ['/static/', '/favicon.ico', '/logo'],
  // Network first for API data
  'networkFirst': ['/api/', 'firestore.googleapis.com'],
  // Stale while revalidate for fonts and external assets
  'staleWhileRevalidate': ['fonts.googleapis.com', 'unpkg.com']
};

// Install event
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('Service Worker: Static assets cached');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Cache failed', error);
      })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated');
        return self.clients.claim();
      })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension requests
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // Skip SSE streams to avoid caching and SW errors
  const accepts = request.headers.get('accept') || '';
  if (url.pathname.startsWith('/api/sse') || accepts.includes('text/event-stream')) {
    return;
  }

  // Determine caching strategy
  let strategy = 'networkFirst'; // default

  for (const [strategyName, patterns] of Object.entries(CACHE_STRATEGIES)) {
    if (patterns.some(pattern => url.href.includes(pattern))) {
      strategy = strategyName;
      break;
    }
  }

  switch (strategy) {
    case 'static':
      event.respondWith(cacheFirstStrategy(request));
      break;
    case 'networkFirst':
      event.respondWith(networkFirstStrategy(request));
      break;
    case 'staleWhileRevalidate':
      event.respondWith(staleWhileRevalidateStrategy(request));
      break;
    default:
      event.respondWith(networkFirstStrategy(request));
  }
});

// Cache First Strategy - för statiska resurser
async function cacheFirstStrategy(request) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Cache first strategy failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

// Network First Strategy - för API-anrop
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('Network failed, trying cache:', error);

    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // Fallback för offline
    if (request.destination === 'document') {
      const cache = await caches.open(STATIC_CACHE);
      return cache.match('/');
    }

    return new Response('Offline', { status: 503 });
  }
}

// Stale While Revalidate Strategy - för externa resurser
async function staleWhileRevalidateStrategy(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(request);

  // Fetch i bakgrunden för att uppdatera cache
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => {
    // Tyst fel för bakgrundsuppdateringar
  });

  // Returnera cache direkt om tillgänglig, annars vänta på nätverk
  return cachedResponse || fetchPromise;
}

// Background sync för offline actions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);

  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Implementera background sync logik här
  // T.ex. skicka köade position updates när online igen
  console.log('Service Worker: Performing background sync');
}

// Push notifications (för framtida funktionalitet)
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push event received');

  const options = {
    body: event.data ? event.data.text() : 'Quizter notification',
    icon: '/logo192.png',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: {
      url: '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification('Quizter', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');
  console.log('Service Worker: Notification data:', event.notification.data);
  event.notification.close();

  event.waitUntil(handleNotificationClick(event));
});

async function handleNotificationClick(event) {
  const notificationData = event.notification.data || {};
  const runId = notificationData.runId;
  let rawTarget = notificationData.url;

  if (!rawTarget && runId) {
    rawTarget = `/play/${runId}`;
  }

  if (!rawTarget) {
    rawTarget = '/';
  }
  console.log('Service Worker: Target URL from notification:', rawTarget);
  console.log('Service Worker: Notification runId:', runId);

  try {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    console.log('Service Worker: Found clients:', clientList.length);

    // Först: hitta en klient som redan är på EXAKT samma run
    if (runId) {
      for (const client of clientList) {
        console.log('Service Worker: Checking client:', client.url);
        const clientUrl = new URL(client.url);

        // Om klienten är på EXAKT samma run (kolla både pathname och eventuell /run/ variant)
        const isOnSameRun = 
          clientUrl.pathname === `/play/${runId}` || 
          clientUrl.pathname === `/run/${runId}/play`;
          
        if (isOnSameRun && 'focus' in client) {
          console.log('Service Worker: ✅ Found exact match, just showing question (NO NAVIGATION)');
          await client.focus();
          
          if ('postMessage' in client) {
            client.postMessage({
              type: 'SHOW_QUESTION',
              data: notificationData
            });
          }
          return;
        }
      }
    }

    // Andra: hitta en klient från samma origin (men fel sida)
    for (const client of clientList) {
      const clientUrl = new URL(client.url);

      if (clientUrl.origin === self.location.origin && 'focus' in client) {
        console.log('Service Worker: Found same-origin client, navigating to', rawTarget);
        await client.focus();

        // Bygg URL korrekt - rawTarget börjar redan med /
        const targetUrl = new URL(rawTarget, self.location.origin);
        targetUrl.searchParams.set('fromNotification', 'true');

        // Navigera till rätt sida
        if ('postMessage' in client) {
          client.postMessage({
            type: 'NAVIGATE_TO',
            url: targetUrl.href,
            data: notificationData
          });
        }
        return;
      }
    }

    // Sist: öppna nytt fönster
    console.log('Service Worker: No matching client, opening new window');
    const targetUrl = new URL(rawTarget, self.location.origin);
    targetUrl.searchParams.set('fromNotification', 'true');
    
    if (clients.openWindow) {
      return clients.openWindow(targetUrl.href);
    }
  } catch (error) {
    console.error('Service Worker: Error handling notification click', error);
  }

  // Fallback
  if (clients.openWindow) {
    const targetUrl = new URL(rawTarget, self.location.origin);
    targetUrl.searchParams.set('fromNotification', 'true');
    console.log('Service Worker: Opening new window', targetUrl.href);
    return clients.openWindow(targetUrl.href);
  }
}
