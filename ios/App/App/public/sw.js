// Service Worker för RouteQuest
// Optimerat för mobila nätverk och offline-funktionalitet

const CACHE_NAME = 'routequest-v1.0.0';
const STATIC_CACHE = 'routequest-static-v1.0.0';
const DYNAMIC_CACHE = 'routequest-dynamic-v1.0.0';

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
    body: event.data ? event.data.text() : 'RouteQuest notification',
    icon: '/logo192.png',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: {
      url: '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification('RouteQuest', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});