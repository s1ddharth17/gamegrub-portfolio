importScripts('https://www.gstatic.com/firebasejs/13.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js');
importScripts('/firebase-messaging-config.js');

const options = self.gameGrubFirebaseOptions || {};
if (options.projectId && options.appId && options.apiKey) {
  firebase.initializeApp(options);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const title = payload.notification?.title || 'GameGrub update';
    const body = payload.notification?.body || '';
    self.registration.showNotification(title, {
      body,
      icon: '/icons/Icon-192.png',
      data: payload.data || {},
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const deepLink = event.notification.data?.deep_link || '/notifications';
  const destination = new URL('/', self.location.origin);
  destination.searchParams.set('deep_link', deepLink);
  event.waitUntil(self.clients.openWindow(destination.toString()));
});
