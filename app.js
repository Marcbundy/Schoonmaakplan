// =====================================================
// CONFIGURATION
// =====================================================
// Wachtwoord om bestaande taken te wijzigen / Password to edit tasks.
// Pas deze waarde aan om het wachtwoord te wijzigen / Change this value to update the password.
const EDIT_PASSWORD = "kam";

// ┌──────────────────────────────────────────────────────────────────┐
// │  ⚙️  SUPER-USER E-MAIL — VUL HIER JOUW EIGEN E-MAILADRES IN  ⚙️    │
// │                                                                  │
// │  Het account met dit e-mailadres krijgt automatisch alle rechten │
// │  (rollen beheren, alles bewerken, alle instellingen aanpassen).  │
// │                                                                  │
// │  Vervang "VUL_HIER_JE_EMAIL_IN@voorbeeld.nl" met het e-mailadres │
// │  dat je in Firebase Authentication (stap 1.6 van de README) hebt │
// │  aangemaakt.                                                     │
// │                                                                  │
// │  Voor lokale modus (geen Firebase): laat de placeholder staan —  │
// │  de app gebruikt geen rollen wanneer er geen auth is.            │
// └──────────────────────────────────────────────────────────────────┘
const SUPERUSER_EMAIL = "info@huisvanbakkers.nl";

// =====================================================
// PWA — Progressive Web App support
// =====================================================
// Sets up a runtime web-app manifest (so the app can be installed) and a
// minimal service worker for offline caching. Both are generated as Blob
// URLs so the entire app stays in this single HTML file — no separate
// manifest.json or sw.js to deploy.

(function setupPwa() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (typeof document === 'undefined') return;
  // location is undefined in some test environments (Node.js without jsdom)
  if (typeof location === 'undefined' || !location.protocol) return;
  // Only run from http/https origins — file:// and other origins reject SW
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  // ---- Manifest ----
  // Built dynamically because we want the icons inline (data URLs) so the
  // single-file deployment model is preserved.
  const iconSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'>
    <rect width='512' height='512' rx='110' fill='#1d5b42'/>
    <text x='256' y='340' font-size='280' text-anchor='middle' fill='white' font-family='-apple-system,sans-serif'>🧽</text>
  </svg>`;
  const iconUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(iconSvg);
  const manifest = {
    name: 'Schoonmaakplan — Huis van Bakkers',
    short_name: 'Schoonmaakplan',
    description: 'Gedeelde versie van het schoonmaakplan',
    start_url: '.',
    display: 'standalone',
    background_color: '#1d5b42',
    theme_color: '#1d5b42',
    orientation: 'any',
    icons: [
      { src: iconUrl, sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
      { src: iconUrl, sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
    ]
  };
  try {
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    const manifestUrl = URL.createObjectURL(blob);
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = manifestUrl;
  } catch (e) {
    console.warn('PWA manifest setup failed:', e);
  }

  // ---- Service worker ----
  // Generated as a Blob URL. The SW uses the network-first strategy with a
  // cache fallback for offline browsing — fresh data when online, last-seen
  // pages when offline. Firebase requests are never cached (they handle their
  // own offline persistence).
  if ('serviceWorker' in navigator) {
    const swCode = `
      const CACHE = 'schoonmaakplan-v1';
      self.addEventListener('install', e => self.skipWaiting());
      self.addEventListener('activate', e => {
        e.waitUntil(
          caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE).map(k => caches.delete(k))
          )).then(() => self.clients.claim())
        );
      });
      self.addEventListener('fetch', e => {
        const url = new URL(e.request.url);
        // Skip Firebase/Google domains — they handle their own offline cache
        if (url.host.includes('firebaseio.com') ||
            url.host.includes('firestore.googleapis.com') ||
            url.host.includes('googleapis.com') ||
            url.host.includes('gstatic.com') ||
            url.host.includes('firebaseapp.com')) return;
        // Network-first for HTML so updates are picked up; cache fallback
        e.respondWith(
          fetch(e.request)
            .then(res => {
              if (res && res.ok && (e.request.method === 'GET')) {
                const copy = res.clone();
                caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
              }
              return res;
            })
            .catch(() => caches.match(e.request).then(r => r || new Response('Offline', { status: 503 })))
        );
      });
    `;
    try {
      const swBlob = new Blob([swCode], { type: 'application/javascript' });
      const swUrl = URL.createObjectURL(swBlob);
      navigator.serviceWorker.register(swUrl).catch(err => {
        console.warn('SW registration failed:', err);
      });
    } catch (e) {
      console.warn('SW setup failed:', e);
    }
  }

  // ---- Install prompt ----
  // Browsers fire 'beforeinstallprompt' when the app meets PWA criteria.
  // We capture it and show our own install button via the sidebar.
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    // Mark a flag so renderSidebar() knows to show the install button
    if (typeof state !== 'undefined') {
      state.canInstallPwa = true;
      // Try to refresh sidebar if it's already rendered
      const sidebar = document.getElementById('sidebar');
      if (sidebar && sidebar.classList && sidebar.classList.contains('open')) {
        if (typeof renderSidebar === 'function') renderSidebar();
      }
    }
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (typeof state !== 'undefined') state.canInstallPwa = false;
    if (typeof showToast === 'function') showToast('App geïnstalleerd! 🎉', 'success');
  });
  // Expose a function the sidebar can call to trigger the prompt
  window.installPwa = async function() {
    if (!deferredPrompt) {
      if (typeof showToast === 'function') {
        const L = (typeof T !== 'undefined') ? T[state.lang] : null;
        showToast(L ? L.pwa_install_unavailable : 'App is al geïnstalleerd of niet ondersteund', 'info');
      }
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (typeof state !== 'undefined') state.canInstallPwa = false;
  };
})();

// =====================================================
// FIREBASE — gedeelde data tussen alle gebruikers (OPTIONEEL)
// =====================================================
// ┌──────────────────────────────────────────────────────────────────┐
// │  ⚙️  SETUP VEREIST — VUL HIER JE EIGEN FIREBASE-WAARDES IN  ⚙️    │
// │                                                                  │
// │  Hieronder staan placeholder-waarden. Je MOET ze vervangen met   │
// │  je eigen Firebase-project-config voordat cloud-sync werkt.      │
// │                                                                  │
// │  STAPPENPLAN (zie ook README.md, hoofdstuk 1):                   │
// │   1. Ga naar https://console.firebase.google.com                 │
// │   2. Maak een nieuw project aan                                  │
// │   3. Voeg een Web-app toe (`</>` icoon)                          │
// │   4. Kopieer de `firebaseConfig` waarden uit de Firebase Console │
// │   5. Vervang elke "VUL_HIER_..."-waarde hieronder met jouw eigen │
// │   6. Sla dit bestand op en upload het naar je webhosting         │
// │                                                                  │
// │  GEEN FIREBASE NODIG?                                            │
// │   Laat de placeholders staan — de app draait dan in "lokale      │
// │   modus" (alle data in localStorage van je browser). Werkt       │
// │   prima voor 1 persoon op 1 apparaat.                            │
// │                                                                  │
// │  VERGEET OOK NIET:                                               │
// │   - SUPERUSER_EMAIL hieronder aan te passen (ctrl-F)             │
// │   - Firestore Security Rules in de Firebase Console te plaatsen  │
// │     (zie README.md stap 1.5)                                     │
// │   - Authentication > E-mail/wachtwoord in te schakelen           │
// │     (zie README.md stap 1.4)                                     │
// └──────────────────────────────────────────────────────────────────┘
const firebaseConfig = {
  apiKey:            "AIzaSyBrOYRguAcxtEVFGOcvKc9CjmdfeeXeDpo",
  authDomain:        "schoonmaakplan-gte.firebaseapp.com",
  projectId:         "schoonmaakplan-gte",
  storageBucket:     "schoonmaakplan-gte.firebasestorage.app",
  messagingSenderId: "596411442029",
  appId:             "1:596411442029:web:a19dcd27876b773241f064"
};

// Lazy-initialize Firebase only if the SDK successfully loaded. This keeps
// the app functional offline (with local-only state) when CDN access fails.
let fbApp = null, fbAuth = null, fbDb = null, fbStorage = null;
function initFirebase() {
  if (typeof firebase === 'undefined') {
    // SDK not loaded — running in local-only mode (test env or offline).
    // We don't log this since it's a normal scenario.
    return false;
  }
  // Detect placeholder config: if the user hasn't filled in their Firebase
  // values, the apiKey will still start with "VUL_HIER". In that case we
  // skip init and run in local-only mode. This is the expected fresh-install
  // behaviour for Etsy customers who haven't set up Firebase yet.
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.indexOf('VUL_HIER') === 0) {
    console.info('Firebase niet geconfigureerd — app draait in lokale modus. Zie README.md voor setup.');
    return false;
  }
  try {
    if (!fbApp) {
      fbApp = firebase.initializeApp(firebaseConfig);
      fbAuth = firebase.auth();
      fbDb = firebase.firestore();
      // Cloud Storage for task images. Only initialised when the SDK is
      // present (added via the firebase-storage-compat script). If absent,
      // image features degrade to read-only and existing images still show
      // (since they're served from public download URLs).
      try {
        if (firebase.storage) fbStorage = firebase.storage();
      } catch (e) {
        console.warn('Firebase Storage init failed:', e);
      }
      // Auth persistence: LOCAL.
      //
      // De token wordt bewaard in localStorage en overleeft tabblad sluiten,
      // browser-herstart en device-reboot. Firebase ververst 'm automatisch
      // via het refresh-token, dus in de praktijk hoef je pas weer in te
      // loggen na een expliciete logout (of als Firebase de sessie intrekt).
      //
      // Trade-off: op een gedeeld apparaat blijft de vorige gebruiker
      // ingelogd. Voor deze afdeling acceptabel — gebruikers hebben eigen
      // accounts en eigen apparaten/PWA-install.
      try {
        fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => {
          console.warn('Auth persistence setting failed:', err);
        });
      } catch (e) {
        console.warn('Auth persistence not available:', e);
      }
      // (Historische migratie: een eerdere versie wiste hier legacy LOCAL-
      // tokens omdat we naar SESSION-persistence overstapten. We zijn nu
      // weer terug op LOCAL — de wipe is dus niet meer gewenst en is hier
      // bewust verwijderd. De oude flag in localStorage doet geen kwaad.)
      // SECURITY: strip any inline auth tokens from the URL before they can
      // be picked up by Firebase. Email-link sign-in (signInWithEmailLink)
      // and OAuth-redirect flows can carry tokens in the URL fragment or
      // query string, which would mean a shared link could log someone in
      // as the original sender. We aren't using those flows, so any such
      // params can only be malicious or accidentally pasted — wipe them.
      try {
        if (typeof window !== 'undefined' && window.location) {
          const dirtyKeys = [
            'apiKey', 'oobCode', 'mode',           // email-link sign-in params
            'access_token', 'id_token',            // OAuth tokens (hash)
            'refresh_token', 'auth_token', 'token' // generic tokens
          ];
          const url = new URL(window.location.href);
          let cleaned = false;
          dirtyKeys.forEach(k => {
            if (url.searchParams.has(k)) { url.searchParams.delete(k); cleaned = true; }
          });
          // Also scrub the hash fragment
          if (url.hash && url.hash.length > 1) {
            const hashParams = new URLSearchParams(url.hash.replace(/^#\??/, ''));
            let hashCleaned = false;
            dirtyKeys.forEach(k => {
              if (hashParams.has(k)) { hashParams.delete(k); hashCleaned = true; }
            });
            if (hashCleaned) {
              const remaining = hashParams.toString();
              url.hash = remaining ? '#' + remaining : '';
              cleaned = true;
            }
          }
          if (cleaned && window.history && window.history.replaceState) {
            window.history.replaceState({}, '', url.toString());
            console.warn('Stripped auth-related parameters from URL');
          }
        }
      } catch (e) {
        console.warn('URL cleanup failed:', e);
      }
      // Enable offline persistence so the app keeps working when the network
      // drops. Firestore queues writes locally and replays them on reconnect.
      fbDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
        // 'failed-precondition' = multiple tabs open without sync support;
        // 'unimplemented' = browser doesn't support persistence. Both are
        // non-fatal — the app still works, just without offline cache.
        console.warn('Firestore persistence:', err.code);
      });
    }
    return true;
  } catch (e) {
    console.error('Firebase init failed:', e);
    return false;
  }
}

// =====================================================
// EMBEDDED DATA
// =====================================================
// DATA holds the CURRENTLY ACTIVE plan's data. On plan switch its contents
// are replaced with the target plan's data. For multi-plan storage see state.plans.
let DATA = {"tasks":[{"row":3,"ruimte":"Algemeen productie","werkplek":"algemeen","onderdeel":"5S borden","subcat":"Reinigen bezems + vloerblikken + handvegers wisselen","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r3"},{"row":4,"ruimte":"Algemeen productie","werkplek":"deegmakerij","onderdeel":"Stellingen","subcat":null,"uitvoerend":"Facilitair","vervuiling":"stof, vuil","vscore":3,"zscore":3,"afstand":1,"freq":"Per kwartaal","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Topaz LD1","freq_key":"quarterly","id":"r4"},{"row":5,"ruimte":"Algemeen productie","werkplek":"opslag","onderdeel":"Stellingen","subcat":null,"uitvoerend":"Facilitair","vervuiling":"stof, vuil","vscore":3,"zscore":3,"afstand":1,"freq":"Per kwartaal","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Topaz LD1","freq_key":"quarterly","id":"r5"},{"row":6,"ruimte":"Expeditie","werkplek":"Kratten transport","onderdeel":"Krattentransport","subcat":"Stofvrij maken","uitvoerend":"Facilitair","vervuiling":"Stof","vscore":3,"zscore":2,"afstand":2,"freq":"Maandelijks","wanneer":"12.00","methode":"Stofvrij maken/bezem","middel":"Bezemmateriaal","freq_key":"monthly","id":"r6"},{"row":7,"ruimte":"Algemeen productie","werkplek":"algemeen","onderdeel":"Schrobmachine's","subcat":"geheel","uitvoerend":"Facilitair","vervuiling":"aanslag, vuil","vscore":3,"zscore":2,"afstand":2,"freq":"Dagelijks","wanneer":"Na gebruik","methode":"Sprayreiniging","middel":"Sirifan Speed","freq_key":"daily","id":"r7"},{"row":8,"ruimte":"Algemeen productie","werkplek":"algemeen","onderdeel":"Vloer reinigen","subcat":"Oudbrood verwerking","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r8"},{"row":9,"ruimte":"Algemeen productie","werkplek":"algemeen","onderdeel":"Vloer reinigen","subcat":"Opslagruimte grondstoffen bakkerij","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r9"},{"row":10,"ruimte":"Lijn 2","werkplek":"algemeen","onderdeel":"Vloer reinigen","subcat":"Tussen Oven KB en Vaste wand","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r10"},{"row":11,"ruimte":"Lijn 2","werkplek":"algemeen","onderdeel":"Vloer reinigen","subcat":"KB Bakplaten opslag en voor diepvries","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r11"},{"row":12,"ruimte":"Lijn 2","werkplek":"algemeen","onderdeel":"Vloer reinigen","subcat":"Voor KB NRK en KB Oven","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r12"},{"row":13,"ruimte":"Magazijn","werkplek":"Bakkerij","onderdeel":"Vloer","subcat":"Grondstofmagazijn naast koeling","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":4,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r13"},{"row":14,"ruimte":"Magazijn","werkplek":"Bakkerij","onderdeel":"Vloer","subcat":"Grondstofmagazijn aan roldeur ontvangst","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r14"},{"row":15,"ruimte":"Magazijn","werkplek":"Bakkerij","onderdeel":"Vloer","subcat":"Grondstofmagazijn naast deegmakerij","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r15"},{"row":16,"ruimte":"Algemeen productie","werkplek":"algemeen","onderdeel":"Wastafels","subcat":"Afnemen vochtige doek","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":5,"zscore":3,"afstand":2,"freq":"Dagelijks","wanneer":"1x per dag","methode":"Handmatig","middel":"Vochtige doek","freq_key":"daily","id":"r16"},{"row":17,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Schaduwborden","subcat":"Borden en onderdelen reinigen","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r17"},{"row":18,"ruimte":"Algemeen productie","werkplek":"overig","onderdeel":"Wanden overige","subcat":"Wanden bakkerij","uitvoerend":"Facilitair","vervuiling":"aangekoekt vuil, aanslag","vscore":2,"zscore":2,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"Topaz LD1","freq_key":"semiannual","id":"r18"},{"row":19,"ruimte":"Algemeen productie","werkplek":"Deegmakerij/inpak","onderdeel":"Water dispensers","subcat":"Waterfilter wisselen","uitvoerend":"Facilitair","vervuiling":"aanslag","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":"Tijdens productie","methode":"Handmatig","middel":"","freq_key":"semiannual","id":"r19"},{"row":20,"ruimte":"Algemeen productie","werkplek":"Machinepark","onderdeel":"Schrobmachine's","subcat":"Waterreservoir ledigen en desinfecteren","uitvoerend":"Facilitair","vervuiling":"Vuil water","vscore":5,"zscore":3,"afstand":2,"freq":"Dagelijks","wanneer":"Na gebruik","methode":"Ledigen","middel":"Sirifan Speed","freq_key":"daily","id":"r20"},{"row":21,"ruimte":"Algemeen productie","werkplek":"algemeen","onderdeel":"Blus apparatuur","subcat":"Afstoffen","uitvoerend":"Facilitair","vervuiling":"stof","vscore":2,"zscore":2,"afstand":2,"freq":"Per kwartaal","wanneer":"Tijdens productie","methode":"Handmatig","middel":"","freq_key":"quarterly","id":"r21"},{"row":22,"ruimte":"Algemeen productie","werkplek":"Alle","onderdeel":"Roldeuren en nooduitgang deuren","subcat":"inclusief bovenbouw / rolbak","uitvoerend":"Facilitair","vervuiling":"strepen, aanslag, stof","vscore":3,"zscore":2,"afstand":2,"freq":"Maandelijks","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r22"},{"row":23,"ruimte":"Algemeen productie","werkplek":"spoelruimtes, verdeel","onderdeel":"drukknoppen, wandcontactdozen","subcat":"Reinigen","uitvoerend":"Facilitair","vervuiling":"handsmeer","vscore":2,"zscore":2,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatige desinfectie (Sirifan Speed)","middel":"Sirifan Speed","freq_key":"quarterly","id":"r23"},{"row":24,"ruimte":"Algemeen productie","werkplek":"algemeen","onderdeel":"5S borden groene schoonmaakmaterialen","subcat":"Krabbers en borstels productcontact","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":3,"freq":"Dagelijks","wanneer":"1x per dag","methode":"Handmatig","middel":"","freq_key":"daily","id":"r24"},{"row":25,"ruimte":"Algemene ruimtes","werkplek":"Kantine","onderdeel":"Blikjesautomaat","subcat":"uitgave systeem afnemen vochtige doek","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":null,"zscore":null,"afstand":null,"freq":"Maandelijks","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Sirifan Speed","freq_key":"monthly","id":"r25"},{"row":26,"ruimte":"Algemeen productie","werkplek":"Technische dienst","onderdeel":"Deuren","subcat":"Afnemen vochtige doek","uitvoerend":"Facilitair","vervuiling":"smeer/vet/vuil","vscore":4,"zscore":3,"afstand":1,"freq":"Maandelijks","wanneer":"Tijdens productie","methode":"Handmatige desinfectie","middel":"Sirifan Speed","freq_key":"monthly","id":"r26"},{"row":27,"ruimte":"Algemeen productie","werkplek":"Wasplaats","onderdeel":"Vloer","subcat":"Afvoerput, rooster, vloer","uitvoerend":"Facilitair","vervuiling":"Algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Dagelijks","wanneer":"1x per dag","methode":"Inschuimen (LD1, MD5, P3-Steril)","middel":"P3-Steril","freq_key":"daily","id":"r27"},{"row":28,"ruimte":"Algemeen productie","werkplek":"Wasplaats","onderdeel":"Vaatwasser","subcat":"Voorraadtank legen, filter reinigen, spoelen","uitvoerend":"Facilitair","vervuiling":"Algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Dagelijks","wanneer":"1x per dag","methode":"Inschuimen (LD1, MD5, P3-Steril)","middel":"P3-Steril","freq_key":"daily","id":"r28"},{"row":29,"ruimte":"Algemeen productie","werkplek":"Wasplaats","onderdeel":"Wanden, droogrek","subcat":"Reinigen en desinfecteren","uitvoerend":"Facilitair","vervuiling":"Algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Dagelijks","wanneer":"1x per dag","methode":"Inschuimen (LD1, MD5, P3-Steril)","middel":"P3-Steril","freq_key":"daily","id":"r29"},{"row":30,"ruimte":"Algemeen productie","werkplek":"Kantoor","onderdeel":"Bakkerij kantoor","subcat":"Vloer stofzuigen en dweilen","uitvoerend":"Extern schoonmaakbedrijf","vervuiling":"algemene vervuiling","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"weekly","id":"r30"},{"row":31,"ruimte":"Algemeen productie","werkplek":"Kantoor","onderdeel":"Bakkerij kantoor","subcat":"Bureau afnemen","uitvoerend":"Extern schoonmaakbedrijf","vervuiling":"algeemen vervuiling","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"weekly","id":"r31"},{"row":32,"ruimte":"Algemeen productie","werkplek":"Kantoor","onderdeel":"Expeditie kantoor","subcat":"Vloer stofzuigen en dweilen","uitvoerend":"Extern schoonmaakbedrijf","vervuiling":"algemene vervuiling","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"weekly","id":"r32"},{"row":33,"ruimte":"Algemeen productie","werkplek":"Kantoor","onderdeel":"Expeditie kantoor","subcat":"Bureau afnemen","uitvoerend":"Extern schoonmaakbedrijf","vervuiling":"algemene vervuiling","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"weekly","id":"r33"},{"row":34,"ruimte":"Algemene ruimtes","werkplek":"Kantoor","onderdeel":"Toiletten man + vrouw","subcat":"Reinigen","uitvoerend":"Extern schoonmaakbedrijf","vervuiling":"algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Dagelijks","wanneer":"1x per dag","methode":"Extern","middel":"","freq_key":"daily","id":"r34"},{"row":35,"ruimte":"Algemene ruimtes","werkplek":"Kantoor","onderdeel":"Inkomsthal bezoek en kantoor","subcat":"Reinigen","uitvoerend":"Extern schoonmaakbedrijf","vervuiling":"algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"weekly","id":"r35"},{"row":36,"ruimte":"Algemene ruimtes","werkplek":"Gang","onderdeel":"Vloer","subcat":"Stofzuigen en dweilen","uitvoerend":"Extern schoonmaakbedrijf","vervuiling":"algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"weekly","id":"r36"},{"row":37,"ruimte":"Algemene ruimtes","werkplek":"Kantoor","onderdeel":"Bureaus","subcat":"Afnemen met vochtige doek, vuilniszakken vervangen","uitvoerend":"Extern schoonmaakbedrijf","vervuiling":"algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"weekly","id":"r37"},{"row":38,"ruimte":"Algemene ruimtes","werkplek":"Kantoor","onderdeel":"Vloer","subcat":"Stofzuigen en dweilen","uitvoerend":"Extern schoonmaakbedrijf","vervuiling":"algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"weekly","id":"r38"},{"row":39,"ruimte":"Algemene ruimtes","werkplek":"kantine","onderdeel":"Vloer","subcat":"Stofzuigen en dweilen","uitvoerend":"Extern schoonmaakbedrijf","vervuiling":"algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"weekly","id":"r39"},{"row":40,"ruimte":"Algemeen productie","werkplek":"Deegmakerij/inpak","onderdeel":"Water dispensers","subcat":"Stofvrij maken, afnemen met vochtige doek","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Dagelijks","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Topaz LD1","freq_key":"daily","id":"r40"},{"row":41,"ruimte":"Gistruimte","werkplek":"Gistruimte","onderdeel":"Vloer reinigen","subcat":"Gistruimte","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r41"},{"row":42,"ruimte":"Algemene ruimtes","werkplek":"Kantine","onderdeel":"Tafels","subcat":"Opruimen en tafels afnemen","uitvoerend":"Facilitair","vervuiling":"Algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Dagelijks","wanneer":"1x per dag","methode":"Handmatig","middel":"Vochtige doek","freq_key":"daily","id":"r42"},{"row":43,"ruimte":"Algemene ruimtes","werkplek":"Kantine","onderdeel":"Automaten","subcat":"Vullen","uitvoerend":"Facilitair","vervuiling":"NVT","vscore":5,"zscore":2,"afstand":2,"freq":"Dagelijks","wanneer":"1x per dag","methode":"Handmatig","middel":"NVT","freq_key":"daily","id":"r43"},{"row":44,"ruimte":"Algemene ruimtes","werkplek":"Kantine","onderdeel":"Kantine","subcat":"koffieautomaat/soepautomaat reinigen -> Omwille van hygiëne voor personeel ondanks score op dagelijks","uitvoerend":"Facilitair","vervuiling":"Algemene vervuiling","vscore":2,"zscore":2,"afstand":3,"freq":"Dagelijks","wanneer":"1x per dag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"daily","id":"r44"},{"row":45,"ruimte":"Algemene ruimtes","werkplek":"Kleedkamer mannen","onderdeel":"Toiletten","subcat":"Reinigen","uitvoerend":"Externe firma","vervuiling":"algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":"2x per week","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r45"},{"row":46,"ruimte":"Algemene ruimtes","werkplek":"Kleedkamer mannen","onderdeel":"Douches","subcat":"Reinigen","uitvoerend":"Externe firma","vervuiling":"algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":null,"methode":"Handmatig","middel":"","freq_key":"weekly","id":"r46"},{"row":47,"ruimte":"Algemene ruimtes","werkplek":"Kleedkamer vrouwen","onderdeel":"Toiletten","subcat":"Reinigen","uitvoerend":"Externe firma","vervuiling":"algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":"2x per week","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r47"},{"row":48,"ruimte":"Algemene ruimtes","werkplek":"Kleedkamer vrouwen","onderdeel":"Douches","subcat":"Reinigen","uitvoerend":"Externe firma","vervuiling":"algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":null,"methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"weekly","id":"r48"},{"row":49,"ruimte":"Algemene ruimtes","werkplek":"Kantine","onderdeel":"Kantine/gangen/kleedruimtes","subcat":"Vuilniszakken wisselen, handdoekrollen bijvullen, haarnetjes bijvullen, oordopjes bijvullen","uitvoerend":"Facilitair","vervuiling":"Algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Dagelijks","wanneer":"1x per dag","methode":"Handmatig","middel":"NVT","freq_key":"daily","id":"r49"},{"row":50,"ruimte":"Algemene ruimtes","werkplek":"Kantine","onderdeel":"kleedruimtes","subcat":"Controle op vuile was, schoenen, afval","uitvoerend":"Facilitair","vervuiling":"Algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Dagelijks","wanneer":"1x per dag","methode":"Handmatig","middel":"NVT","freq_key":"daily","id":"r50"},{"row":51,"ruimte":"Algemeen productie","werkplek":"productie en inpak","onderdeel":"drukknoppen, wandcontactdozen","subcat":"Reinigen","uitvoerend":"Facilitair","vervuiling":"handsmeer","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatige desinfectie","middel":"Sirifan Speed","freq_key":"monthly","id":"r51"},{"row":52,"ruimte":"Algemene ruimtes","werkplek":"Kantine","onderdeel":"Ramen en Kozijnen","subcat":"Ramen en kozijnen kantine","uitvoerend":"Externe firma De Watertoren","vervuiling":"vet/strepen, aanslag","vscore":5,"zscore":1,"afstand":1,"freq":"Per kwartaal","wanneer":null,"methode":"Extern","middel":"","freq_key":"quarterly","id":"r52"},{"row":53,"ruimte":"Algemene ruimtes","werkplek":"Kantine","onderdeel":"Ramen en Kozijnen","subcat":"Ramen en kozijnen kantine","uitvoerend":"Externe firma De Watertoren","vervuiling":"vet/strepen, aanslag","vscore":4,"zscore":1,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"semiannual","id":"r53"},{"row":54,"ruimte":"Algemene ruimtes","werkplek":"Kantoor","onderdeel":"Alle kantoor ruimtes incl vergaderzaal","subcat":"Stofzuigen en dweilen","uitvoerend":"Extern schoonmaakbedrijf","vervuiling":"algemeen","vscore":4,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":"2 x per week","methode":"Extern","middel":"","freq_key":"weekly","id":"r54"},{"row":55,"ruimte":"Algemene ruimtes","werkplek":"Kantoor","onderdeel":"Begane grond","subcat":"Ramen kantoor","uitvoerend":"Externe firma De Watertoren","vervuiling":"vet, strepen","vscore":2,"zscore":1,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"annual","id":"r55"},{"row":56,"ruimte":"Algemene ruimtes","werkplek":"Kantoor","onderdeel":"Begane grond","subcat":"Toiletten kantoor","uitvoerend":"Externe firma","vervuiling":"algemeen","vscore":5,"zscore":1,"afstand":2,"freq":"Wekelijks","wanneer":"2 x per week","methode":"Extern","middel":"","freq_key":"weekly","id":"r56"},{"row":57,"ruimte":"Algemene ruimtes","werkplek":"Kantoor","onderdeel":"Ramen en Kozijnen","subcat":"Ramen en kozijnen kantoor","uitvoerend":"Externe firma De Watertoren","vervuiling":"vet/strepen, aanslag","vscore":5,"zscore":1,"afstand":1,"freq":"Per kwartaal","wanneer":null,"methode":"Extern","middel":"","freq_key":"quarterly","id":"r57"},{"row":58,"ruimte":"Algemene ruimtes","werkplek":"Kantoor","onderdeel":"Ramen en Kozijnen","subcat":"Ramen en kozijnen productie kantoor","uitvoerend":"Externe firma De Watertoren","vervuiling":"vet/strepen, aanslag","vscore":4,"zscore":1,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"semiannual","id":"r58"},{"row":59,"ruimte":"Algemene ruimtes","werkplek":"Kantine","onderdeel":"Begane grond","subcat":"Dweilen","uitvoerend":"Extern schoonmaakbedrijf","vervuiling":"algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":"2x per week","methode":"Extern","middel":"","freq_key":"weekly","id":"r59"},{"row":60,"ruimte":"Buitenterrein","werkplek":"algemeen","onderdeel":"Wanden overige","subcat":"Buitengevel en buitenwanden silo's","uitvoerend":"Externe firma","vervuiling":"aangekoekt vuil, aanslag","vscore":2,"zscore":1,"afstand":1,"freq":"Jaarlijks","wanneer":"1x per jaar","methode":"Extern","middel":"","freq_key":"annual","id":"r60"},{"row":61,"ruimte":"Buitenterrein","werkplek":"Dak","onderdeel":"Ontdoen van vuil en bladeren","subcat":null,"uitvoerend":"Facilitair","vervuiling":"algemene vervuiling","vscore":2,"zscore":1,"afstand":1,"freq":"Jaarlijks","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"annual","id":"r61"},{"row":62,"ruimte":"Buitenterrein","werkplek":"algemeen","onderdeel":"Restafval pers","subcat":"Hefsysteem reinigen","uitvoerend":"Facilitair","vervuiling":"Algemene vervuiling","vscore":5,"zscore":1,"afstand":1,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5, P3-Steril)","middel":"Topaz LD1","freq_key":"weekly","id":"r62"},{"row":63,"ruimte":"Algemeen productie","werkplek":"Hygiënesluizen","onderdeel":"Desinfectie","subcat":"Bijvullen","uitvoerend":"Facilitair","vervuiling":"Algemene vervuiling","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Handmatig","middel":"P3-manosoft","freq_key":"weekly","id":"r63"},{"row":64,"ruimte":"Buitenterrein","werkplek":"algemeen","onderdeel":"Watertank & ventilator","subcat":"Reinigen","uitvoerend":"Facilitair","vervuiling":"algemene vervuiling / aanslag","vscore":1,"zscore":2,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":"Hoge druk reiniging","middel":"","freq_key":"annual","id":"r64"},{"row":65,"ruimte":"Buitenterrein","werkplek":"algemeen","onderdeel":"Zwerfvuil verwijderen","subcat":"Let op bij laaddocks, nooit alleen opruimen, in het donker veiligheids lichten gebruiken","uitvoerend":"Facilitair","vervuiling":"algemene vervuiling","vscore":5,"zscore":2,"afstand":1,"freq":"Elke 2 maanden","wanneer":null,"methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"bimonthly","id":"r65"},{"row":66,"ruimte":"Buitenterrein","werkplek":"Algemeen","onderdeel":"Dak","subcat":"Blad vrij maken + zwerfafval","uitvoerend":"Facilitair","vervuiling":"algemene vervuiling","vscore":1,"zscore":1,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"annual","id":"r66"},{"row":67,"ruimte":"Algemene ruimtes","werkplek":"Kantine/gangen/kleedruimtes","onderdeel":"WC","subcat":"Wc behandelen met ontstopper","uitvoerend":"Facilitair","vervuiling":"algemene vervuiling","vscore":5,"zscore":2,"afstand":1,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"","freq_key":"monthly","id":"r67"},{"row":68,"ruimte":"Expeditie","werkplek":"Expeditie","onderdeel":"Wanden overige","subcat":"Wanden verdeelmagazijn","uitvoerend":"Facilitair","vervuiling":"stof, aanslag","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"Topaz LD1","freq_key":"semiannual","id":"r68"},{"row":69,"ruimte":"Expeditie","werkplek":"Expeditie","onderdeel":"Dakkoepels","subcat":null,"uitvoerend":"Externe firma","vervuiling":"aanslag, kalk","vscore":2,"zscore":1,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"annual","id":"r69"},{"row":70,"ruimte":"Gistruimte","werkplek":"magazijn","onderdeel":"Gisttanks, watertanks, loogtanks","subcat":"Buitenzijde reinigen","uitvoerend":"Facilitair","vervuiling":"stof, aanslag","vscore":3,"zscore":2,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"","freq_key":"semiannual","id":"r70"},{"row":71,"ruimte":"Gistruimte","werkplek":"magazijn","onderdeel":"stellage schoonmaakmiddelen","subcat":"reinigen","uitvoerend":"Facilitair","vervuiling":"stof, aanslag","vscore":2,"zscore":2,"afstand":2,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"","freq_key":"semiannual","id":"r71"},{"row":72,"ruimte":"Gistruimte","werkplek":"magazijn","onderdeel":"Ventilatoren","subcat":"reinigen","uitvoerend":"Facilitair","vervuiling":"stof, aanslag","vscore":1,"zscore":2,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":"Handmatig","middel":"","freq_key":"annual","id":"r72"},{"row":73,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"Schakelkasten uitwendig","subcat":"Schakelkasten uitwendig","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Handmatige desinfectie (Sirifan Speed)","middel":"Sirifan Speed","freq_key":"weekly","id":"r73"},{"row":74,"ruimte":"Magazijn","werkplek":"magazijn","onderdeel":"Begane grond","subcat":"Chemie opslag reinigen","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":4,"zscore":2,"afstand":2,"freq":"Per kwartaal","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Topaz LD1","freq_key":"quarterly","id":"r74"},{"row":75,"ruimte":"Gistruimte","werkplek":"magazijn","onderdeel":"Pekelwater installatie","subcat":"Aanmaakvat pekelwater installatie","uitvoerend":"Facilitair","vervuiling":"aanslag, kalk","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":"","methode":"Handmatig","middel":"","freq_key":"semiannual","id":"r75"},{"row":76,"ruimte":"Inpak lijn 1","werkplek":"inpak","onderdeel":"Kunstof wanden","subcat":"Wanden inpak lijn 1","uitvoerend":"Facilitair","vervuiling":"stof, aanslag","vscore":1,"zscore":2,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"Topaz LD1","freq_key":"annual","id":"r76"},{"row":77,"ruimte":"Inpak lijn 1","werkplek":"inpak","onderdeel":"Dak rooster","subcat":null,"uitvoerend":"Facilitair","vervuiling":"aanslag, kalk","vscore":2,"zscore":1,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":"Schrobben/machinaal","middel":"","freq_key":"annual","id":"r77"},{"row":78,"ruimte":"Koelcel","werkplek":"magazijn","onderdeel":"Vloer reinigen","subcat":"Goed drogen","uitvoerend":"Facilitair","vervuiling":"Bacteriën (Listeria)","vscore":4,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r78"},{"row":79,"ruimte":"Gistruimte","werkplek":"magazijn","onderdeel":"Meng/aanmaakvat","subcat":"Afnemen","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":4,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r79"},{"row":80,"ruimte":"Algemeen productie","werkplek":"opslag","onderdeel":"Pallet stapelaar","subcat":"Stofvrij maken, afnemen met vochtige doek","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"monthly","id":"r80"},{"row":81,"ruimte":"Buitenterrein","werkplek":"Silo's","onderdeel":"Vloer reinigen","subcat":"Controle lekkage's bloem","uitvoerend":"Facilitair","vervuiling":"Bloem","vscore":5,"zscore":3,"afstand":1,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r81"},{"row":82,"ruimte":"Gistruimte","werkplek":"magazijn","onderdeel":"Algemeen","subcat":"schaduw borden en onderdelen reinigen","uitvoerend":"Facilitair","vervuiling":"Bloem","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r82"},{"row":83,"ruimte":"Magazijn","werkplek":"magazijn","onderdeel":"Algemeen","subcat":"schaduw borden en onderdelen reinigen","uitvoerend":"Facilitair","vervuiling":"Bloem","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r83"},{"row":84,"ruimte":"Magazijn","werkplek":"rozijnen","onderdeel":"Algemeen","subcat":"schaduw borden en onderdelen reinigen","uitvoerend":"Facilitair","vervuiling":"Bloem","vscore":5,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":"Tijdens productie","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r84"},{"row":85,"ruimte":"Algemeen productie","werkplek":"algemeen","onderdeel":"kliko's/emmers/tonnen","subcat":"legen/reinigen","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":4,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Vaatwasser","middel":"Solid protect/Clear dry","freq_key":"weekly","id":"r85"},{"row":86,"ruimte":"Algemeen productie","werkplek":"algemeen","onderdeel":"Toetsenborden productie bediening","subcat":"Reinigen","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":4,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Vochtige doek","freq_key":"weekly","id":"r86"},{"row":89,"ruimte":"Expeditie","werkplek":"Expeditie","onderdeel":"Laad docks","subcat":"Laad docks (Omwille van weersomstandigheden, kan 1x per 2 weken nodig zijn in de winter)","uitvoerend":"Facilitair","vervuiling":"vloervuil, stof","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r89"},{"row":90,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"Rek verpakkingsmateriaal","subcat":"Schappen en frame","uitvoerend":"Facilitair","vervuiling":"kruimels, stof","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r90"},{"row":91,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"Koelbanen","subcat":"schakelband, transportmat","uitvoerend":"Facilitair","vervuiling":"kruimels, smeer","vscore":1,"zscore":3,"afstand":3,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"quarterly","id":"r91"},{"row":92,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"Koelbanen","subcat":"omkasting","uitvoerend":"Facilitair","vervuiling":"aanslag","vscore":1,"zscore":3,"afstand":2,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"","freq_key":"semiannual","id":"r92"},{"row":93,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"Koeltoren","subcat":"schakelband, transportmat","uitvoerend":"Facilitair","vervuiling":"kruimels, smeer","vscore":1,"zscore":3,"afstand":3,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"","freq_key":"quarterly","id":"r93"},{"row":94,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"Koeltoren","subcat":"omkasting","uitvoerend":"Facilitair","vervuiling":"aanslag","vscore":1,"zscore":3,"afstand":2,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"semiannual","id":"r94"},{"row":95,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"Koelbanen","subcat":"borstels","uitvoerend":"Facilitair","vervuiling":"kruimels","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r95"},{"row":110,"ruimte":"Inpak lijn 2","werkplek":"inpak","onderdeel":"Wanden overige","subcat":"Wanden achter inpak lijn 2","uitvoerend":"Facilitair","vervuiling":"aangekoekt vuil, aanslag","vscore":1,"zscore":3,"afstand":2,"freq":"Halfjaarlijks","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"Topaz LD1","freq_key":"semiannual","id":"r110"},{"row":111,"ruimte":"Inpak lijn 2","werkplek":"inpak","onderdeel":"Dak rooster","subcat":null,"uitvoerend":"Facilitair","vervuiling":"aanslag, kalk","vscore":2,"zscore":1,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":null,"middel":"","freq_key":"annual","id":"r111"},{"row":112,"ruimte":"Algemeen productie","werkplek":"algemeen","onderdeel":"Opvangbakken GMP","subcat":"legen/reinigen","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":4,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Vaatwasser","middel":"Solid protect/Clear dry","freq_key":"weekly","id":"r112"},{"row":113,"ruimte":"Algemeen productie","werkplek":"algemeen","onderdeel":"Vloer reinigen","subcat":"Naast Produktie kantoor en Werkplaats","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r113"},{"row":114,"ruimte":"Algemeen productie","werkplek":"algemeen","onderdeel":"Vloer reinigen","subcat":"Koppel reiniging machine","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r114"},{"row":115,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"etikeerlijn heel","subcat":"buitenzijde en transport","uitvoerend":"Facilitair","vervuiling":"stof, aanslag","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r115"},{"row":116,"ruimte":"Inpak lijn 2","werkplek":"Inpak","onderdeel":"Koelbanen","subcat":"schakelband, transportmat","uitvoerend":"Facilitair","vervuiling":"kruimels, smeer","vscore":1,"zscore":3,"afstand":3,"freq":"Per kwartaal","wanneer":null,"methode":"Stofvrij maken/bezem","middel":"Bezemmateriaal","freq_key":"quarterly","id":"r116"},{"row":117,"ruimte":"Inpak lijn 2","werkplek":"Inpak","onderdeel":"Koelbanen","subcat":"omkasting","uitvoerend":"Facilitair","vervuiling":"aanslag","vscore":1,"zscore":3,"afstand":2,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"semiannual","id":"r117"},{"row":118,"ruimte":"Inpak lijn 2","werkplek":"Inpak","onderdeel":"metaaldetector","subcat":"inclusief opvangbak, stellage, baan en omkasting","uitvoerend":"Facilitair","vervuiling":"aanslag","vscore":1,"zscore":3,"afstand":3,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"quarterly","id":"r118"},{"row":119,"ruimte":"Inpak lijn 2","werkplek":"Inpak","onderdeel":"Koelbanen","subcat":"borstels","uitvoerend":"Facilitair","vervuiling":"kruimels","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r119"},{"row":130,"ruimte":"Koelcel","werkplek":"magazijn","onderdeel":"Koelcel","subcat":"verdampers 3 maal. Leeg rijden","uitvoerend":"Externe firma","vervuiling":"Listeria, pseudomonas","vscore":1,"zscore":2,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"annual","id":"r130"},{"row":131,"ruimte":"Koelcel","werkplek":"magazijn","onderdeel":"Koelcel","subcat":"wanden en deuren. Leeg rijden","uitvoerend":"Facilitair","vervuiling":"aanslag, m.o.","vscore":2,"zscore":2,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"","freq_key":"quarterly","id":"r131"},{"row":132,"ruimte":"Lijn 1","werkplek":"algemeen","onderdeel":"Vloer reinigen","subcat":"Groot brood naaldepanner","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r132"},{"row":150,"ruimte":"Lijn 2","werkplek":"algemeen","onderdeel":"Vloer reinigen","subcat":"Vloer tussen Klein brood straat","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r150"},{"row":170,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"doseerpunt IBC","subcat":null,"uitvoerend":"Facilitair","vervuiling":"stof, vuil","vscore":3,"zscore":3,"afstand":1,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"quarterly","id":"r170"},{"row":171,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Bollenkast","subcat":"netjes reinigen","uitvoerend":"Facilitair","vervuiling":"schimmel","vscore":1,"zscore":3,"afstand":3,"freq":"Per kwartaal","wanneer":null,"methode":"Weken (MD2)","middel":"Topaz MD2","freq_key":"quarterly","id":"r171"},{"row":172,"ruimte":"Inpak lijn 2","werkplek":"Inpak","onderdeel":"Rek verpakkingsmateriaal","subcat":"Schappen en frame","uitvoerend":"Facilitair","vervuiling":"kruimels, stof","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r172"},{"row":173,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Bollenkast","subcat":"dieptereiniginging binnenwerk","uitvoerend":"Facilitair","vervuiling":"aanslag, smeer, vuil","vscore":1,"zscore":3,"afstand":2,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"semiannual","id":"r173"},{"row":174,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Opboller","subcat":"onderbouw / binnenwerk","uitvoerend":"Facilitair","vervuiling":"aanslag, smeer, vuil","vscore":1,"zscore":3,"afstand":2,"freq":"Halfjaarlijks","wanneer":null,"methode":null,"middel":"","freq_key":"semiannual","id":"r174"},{"row":175,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Langmaker (regulier)","subcat":"Onderzijde / dieptereiniging","uitvoerend":"Facilitair","vervuiling":"aanslag, smeer, vuil","vscore":1,"zscore":3,"afstand":2,"freq":"Halfjaarlijks","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"Topaz LD1","freq_key":"semiannual","id":"r175"},{"row":176,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Strooi unit","subcat":"Decoratie bakken leegmaken","uitvoerend":"Facilitair","vervuiling":"aangekoekt vuil","vscore":1,"zscore":3,"afstand":3,"freq":"Per kwartaal","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"","freq_key":"quarterly","id":"r176"},{"row":177,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Deegkuipen","subcat":"onderstel dieptereiniginging","uitvoerend":"Facilitair","vervuiling":"smeer/vet/vuil","vscore":1,"zscore":3,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatige desinfectie (Sirifan Speed)","middel":"Sirifan Speed","freq_key":"quarterly","id":"r177"},{"row":178,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Kneders","subcat":"binnenwerk dieptereiniginging","uitvoerend":"Facilitair","vervuiling":"smeer/vet/vuil","vscore":1.5,"zscore":3,"afstand":2,"freq":"Elke 2 maanden","wanneer":null,"methode":null,"middel":"","freq_key":"bimonthly","id":"r178"},{"row":179,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Bollenkast","subcat":"dieptereiniginging geleiders, netjeshouders etc","uitvoerend":"Facilitair","vervuiling":"aanslag, smeer, vuil","vscore":"2","zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r179"},{"row":180,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Afmeter","subcat":"4 Opvangplaten aan onderzijde","uitvoerend":"Facilitair","vervuiling":"aanslag / ingedroogd vuil","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r180"},{"row":181,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Afmeter","subcat":"Afschermkappen rondom","uitvoerend":"Facilitair","vervuiling":"aanslag / ingedroogd vuil","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r181"},{"row":182,"ruimte":"Lijn 1","werkplek":"Bakkerij","onderdeel":"Voedingspaal opboller","subcat":"Reinigen","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz MD5","freq_key":"weekly","id":"r182"},{"row":183,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Transport naar langmaker","subcat":"omkasting","uitvoerend":"Facilitair","vervuiling":"aangekoekte resten","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r183"},{"row":184,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Afmeter","subcat":"Binnenzijde","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r184"},{"row":185,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Narijskast (binnenzijde)","subcat":"Plafond, klima en leidingen","uitvoerend":"Facilitair","vervuiling":"aanslag, schimmel","vscore":1,"zscore":3,"afstand":2,"freq":"Halfjaarlijks","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"","freq_key":"semiannual","id":"r185"},{"row":186,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Afmeter","subcat":"Blauwe transport band","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r186"},{"row":187,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Afmeter","subcat":"Bedieningspaneel","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatige desinfectie (Sirifan Speed)","middel":"Sirifan Speed","freq_key":"weekly","id":"r187"},{"row":188,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Afmeter","subcat":"Deegsnijplaat","uitvoerend":"Facilitair","vervuiling":"aanslag / ingedroogd vuil","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r188"},{"row":192,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Afmeter","subcat":"Trechter buiten/bovenzijde","uitvoerend":"Facilitair","vervuiling":"aanslag / ingedroogd vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r192"},{"row":193,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Algemeen","subcat":"Muren","uitvoerend":"Facilitair","vervuiling":"Deeg","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5)","middel":"P3-Steril","freq_key":"weekly","id":"r193"},{"row":194,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Algemeen","subcat":"Muren","uitvoerend":"Facilitair","vervuiling":"deegresten","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r194"},{"row":195,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Algemeen","subcat":"Grondstoffen rekken, ledigen en nat schuimreinigen","uitvoerend":"Facilitair","vervuiling":"aangekoekte grondstofresten","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5)","middel":"","freq_key":"weekly","id":"r195"},{"row":196,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Bollenkast","subcat":"geleiders / binnenwerk / band / tuimelbak","uitvoerend":"Facilitair","vervuiling":"Deeg","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r196"},{"row":197,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Bollenkast","subcat":"vloer, luchtkanaal (Let op onderkant)","uitvoerend":"Facilitair","vervuiling":"stof, aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5)","middel":"P3-Steril","freq_key":"weekly","id":"r197"},{"row":198,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Bovenkant kneedmachines","subcat":"Reinigen","uitvoerend":"Facilitair","vervuiling":"Deeg","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":null,"middel":"","freq_key":"weekly","id":"r198"},{"row":199,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Checkweger","subcat":"Rvs buitenzijde+binnezijde+frame, inspectie","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5)","middel":"Topaz LD1","freq_key":"weekly","id":"r199"},{"row":200,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Deegkuipen","subcat":"Schoon spuiten, binnenkant, buitenkant en onderstel","uitvoerend":"Facilitair","vervuiling":"Deeg","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Schrobben/machinaal","middel":"Topaz LD1","freq_key":"weekly","id":"r200"},{"row":201,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Deegkuipen","subcat":"Schoon spuiten","uitvoerend":"Facilitair","vervuiling":"deegresten","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Schrobben/machinaal","middel":"Topaz LD1","freq_key":"weekly","id":"r201"},{"row":202,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Deegkuipen","subcat":"binnen en buitenzijde","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r202"},{"row":203,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Deegkuipen","subcat":"binnen en buitenzijde","uitvoerend":"Facilitair","vervuiling":"aanslag / ingedroogd vuil","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5)","middel":"Topaz LD1","freq_key":"weekly","id":"r203"},{"row":205,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Hefkiep installatie","subcat":"Inspectie","uitvoerend":"Facilitair","vervuiling":"Vet/olie","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r205"},{"row":206,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Hefkiep installatie","subcat":"Trap","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r206"},{"row":207,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Hefkiep installatie","subcat":"Voorzijde en achterzijde","uitvoerend":"Facilitair","vervuiling":"Vet/olie","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r207"},{"row":208,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Hefkiep installatie","subcat":"Bordestrap","uitvoerend":"Facilitair","vervuiling":"Algemene vervuiling","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r208"},{"row":209,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Hefkiep installatie","subcat":"Kooi","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5)","middel":"Topaz LD1","freq_key":"weekly","id":"r209"},{"row":210,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Narijskast (binnenzijde)","subcat":"Tranportbanden, ketting, Smeren na schoonmaak","uitvoerend":"Facilitair","vervuiling":"ingedroogde resten, smeer","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"","freq_key":"monthly","id":"r210"},{"row":211,"ruimte":"Lijn 1","werkplek":"algemeen","onderdeel":"Kunstof wanden","subcat":"Wanden productie Lijn 1","uitvoerend":"Facilitair","vervuiling":"stof, aanslag","vscore":1,"zscore":1,"afstand":2,"freq":"Jaarlijks","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"Topaz LD1","freq_key":"annual","id":"r211"},{"row":212,"ruimte":"Lijn 1","werkplek":"productie","onderdeel":"Metaaldetector","subcat":"Bakje voor staafjes wisselen","uitvoerend":"Facilitair","vervuiling":"stof, kruimels, aanslag","vscore":1,"zscore":1,"afstand":2,"freq":"Jaarlijks","wanneer":null,"methode":"Handmatig","middel":"","freq_key":"annual","id":"r212"},{"row":213,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Kneders","subcat":"binnen en buitenzijde","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r213"},{"row":215,"ruimte":"Lijn 1","werkplek":"algemeen","onderdeel":"Ramen en Kozijnen","subcat":"Ramen en kozijnen productie Lijn 1","uitvoerend":"Externe firma","vervuiling":"vet/strepen, aanslag","vscore":5,"zscore":1,"afstand":1,"freq":"Per kwartaal","wanneer":null,"methode":"Extern","middel":"","freq_key":"quarterly","id":"r215"},{"row":216,"ruimte":"Lijn 1","werkplek":"algemeen","onderdeel":"Ramen en Kozijnen","subcat":"Ramen en kozijnen productie Lijn 1","uitvoerend":"Externe firma","vervuiling":"vet/strepen, aanslag","vscore":4,"zscore":1,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"semiannual","id":"r216"},{"row":217,"ruimte":"Lijn 1","werkplek":"algemeen","onderdeel":"Ramen en Kozijnen","subcat":"Ramen en kozijnen blikkenopslag Lijn 1","uitvoerend":"Externe firma","vervuiling":"vet/strepen, aanslag","vscore":4,"zscore":1,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"semiannual","id":"r217"},{"row":218,"ruimte":"Lijn 1","werkplek":"algemeen","onderdeel":"Dakkoepels","subcat":null,"uitvoerend":"Externe firma","vervuiling":"aanslag, kalk","vscore":2,"zscore":1,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"annual","id":"r218"},{"row":219,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Vloer narijskast","subcat":"Nat schoon maken","uitvoerend":"Facilitair","vervuiling":"aangekoekt vuil","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Schrobben/machinaal","middel":"","freq_key":"monthly","id":"r219"},{"row":220,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Kneders","subcat":"binnen en buitenzijde","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5)","middel":"Topaz LD1","freq_key":"weekly","id":"r220"},{"row":221,"ruimte":"Lijn 1","werkplek":"Bakkerij","onderdeel":"Plafond","subcat":"Reinigen","uitvoerend":"Facilitair","vervuiling":"aangekoekt vuil, aanslag","vscore":1,"zscore":1,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"annual","id":"r221"},{"row":222,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Transport naar langmaker","subcat":"dieptereiniging band","uitvoerend":"Facilitair","vervuiling":"aangekoekte resten","vscore":1,"zscore":3,"afstand":3,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"quarterly","id":"r222"},{"row":223,"ruimte":"Lijn 1","werkplek":"Bakkerij","onderdeel":"Afzuiging boven langmaker 2x","subcat":"Reinigen","uitvoerend":"Facilitair","vervuiling":"Stof","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"monthly","id":"r223"},{"row":224,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Langmaker (regulier)","subcat":"Beplating rondom + intern","uitvoerend":"Facilitair","vervuiling":"aanslag, vuil","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r224"},{"row":225,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Langmaker (regulier)","subcat":"Besturingskast","uitvoerend":"Facilitair","vervuiling":"handsmeeer, stof","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatige desinfectie (Sirifan Speed)","middel":"Sirifan Speed","freq_key":"monthly","id":"r225"},{"row":226,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Narijskast (binnenzijde)","subcat":"Deuren, wanden, tap en bordes","uitvoerend":"Facilitair","vervuiling":"spetters, aanslag, schimmel","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"","freq_key":"monthly","id":"r226"},{"row":227,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Narijskast (binnenzijde)","subcat":"Spanstation","uitvoerend":"Facilitair","vervuiling":"smeer/vet/vuil","vscore":1,"zscore":3,"afstand":2,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"semiannual","id":"r227"},{"row":228,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Narijskast omgeving","subcat":"Wanden","uitvoerend":"Facilitair","vervuiling":"stof, aanslag","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"semiannual","id":"r228"},{"row":229,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Narijskast omgeving","subcat":"Leidingwerk, draagbalken, plafond","uitvoerend":"Facilitair","vervuiling":"stof, spinnewebben","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Stofzuiger","freq_key":"semiannual","id":"r229"},{"row":230,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Oven","subcat":"bovenzijde, zijkanten, trapjes, leidingen","uitvoerend":"Facilitair","vervuiling":"stof","vscore":3,"zscore":2.5,"afstand":1,"freq":"Per kwartaal","wanneer":null,"methode":"Weken (MD2)","middel":"Topaz LD1","freq_key":"quarterly","id":"r230"},{"row":231,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Oven","subcat":"Kijkluiken","uitvoerend":"Facilitair","vervuiling":"vet wasem","vscore":2,"zscore":2.5,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"","freq_key":"quarterly","id":"r231"},{"row":232,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Oven","subcat":"Loader","uitvoerend":"Facilitair","vervuiling":"blikvervuiling","vscore":2,"zscore":2.5,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"quarterly","id":"r232"},{"row":233,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Oven","subcat":"Unloader","uitvoerend":"Facilitair","vervuiling":"blikvervuiling, vet","vscore":2,"zscore":2.5,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"quarterly","id":"r233"},{"row":234,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Oven","subcat":"Afzuigkap + filters voorzijden","uitvoerend":"Facilitair","vervuiling":"vet wasem","vscore":2,"zscore":2.5,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Weken (MD2)","middel":"Topaz LD1","freq_key":"quarterly","id":"r234"},{"row":235,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Oven","subcat":"Afzuigkap + filters achterzijden","uitvoerend":"Facilitair","vervuiling":"vet wasem","vscore":2,"zscore":2.5,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Weken (MD2)","middel":"Topaz LD1","freq_key":"quarterly","id":"r235"},{"row":236,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Oven","subcat":"Loader & unloader oven omgeving","uitvoerend":"Facilitair","vervuiling":"kruimels, bakblik vuil","vscore":2,"zscore":2.5,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Inschuimen (LD1, MD5, P3-Steril)","middel":"Topaz MD5","freq_key":"quarterly","id":"r236"},{"row":237,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Oven","subcat":"Achter de panelen","uitvoerend":"Facilitair","vervuiling":"vuil, stof","vscore":2,"zscore":2.5,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"semiannual","id":"r237"},{"row":238,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Narijskast (binnenzijde)","subcat":"Schakelkast","uitvoerend":"Facilitair","vervuiling":"handsmeer / aangekoekt vuil","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatige desinfectie (Sirifan Speed)","middel":"Sirifan Speed","freq_key":"monthly","id":"r238"},{"row":239,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Naalddepanner","subcat":"Naaldepanner hekwerk","uitvoerend":"Facilitair","vervuiling":"stof","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r239"},{"row":240,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Naalddepanner","subcat":"Schakelkast","uitvoerend":"Facilitair","vervuiling":"handsmeer, stof","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r240"},{"row":241,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Koppelkeerstation","subcat":"Blauwe borstel en koppelkeerder","uitvoerend":"Facilitair","vervuiling":"kruimels, bakblikvuil","vscore":1,"zscore":3,"afstand":3,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"quarterly","id":"r241"},{"row":242,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Koppelkeerstation","subcat":"Koppelkeer buitenzijden","uitvoerend":"Facilitair","vervuiling":"aanslag, vuil","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r242"},{"row":243,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Blikken opslag","subcat":"Omkasting","uitvoerend":"Facilitair","vervuiling":"aanslag","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r243"},{"row":244,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Blikken opslag","subcat":"Uitstoot baan, goed naspoelen","uitvoerend":"Facilitair","vervuiling":"bakblikresten, stof","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r244"},{"row":245,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Transport karren casino platen","subcat":"Transport karren casino platen","uitvoerend":"Facilitair","vervuiling":"bakblikresten, stof","vscore":1,"zscore":3,"afstand":3,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"quarterly","id":"r245"},{"row":246,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Transport banden","subcat":"Transport van naalddepanner naar koppelkeer, goed naspoelen met water","uitvoerend":"Facilitair","vervuiling":"schimmel, aangekoekte resten","vscore":1,"zscore":3,"afstand":3,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"quarterly","id":"r246"},{"row":247,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Blikken opslag","subcat":"Besturingskast bij NRK GB, goed naspoelen met water","uitvoerend":"Facilitair","vervuiling":"stof, handsmeer","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatige desinfectie (Sirifan Speed)","middel":"Sirifan Speed","freq_key":"monthly","id":"r247"},{"row":248,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Transport banden","subcat":"Transport van oven unloader naar naaldepanner","uitvoerend":"Facilitair","vervuiling":"bakblikresten, stof","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r248"},{"row":249,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Oven omgeving","subcat":"Wanden","uitvoerend":"Facilitair","vervuiling":"stof, aanslag","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"semiannual","id":"r249"},{"row":250,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Oven omgeving","subcat":"Leidingwerk, draagbalen, plafond","uitvoerend":"Facilitair","vervuiling":"stof, spinnewebben","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Stofzuiger","freq_key":"semiannual","id":"r250"},{"row":251,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Kopmachine","subcat":"5 Opvangplaten aan onderzijde","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5, P3-Steril)","middel":"P3-Steril","freq_key":"weekly","id":"r251"},{"row":252,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Langmaker","subcat":"Reinigen","uitvoerend":"Facilitair","vervuiling":"Deeg","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5, P3-Steril)","middel":"P3-Steril","freq_key":"weekly","id":"r252"},{"row":253,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Langmaker","subcat":"Drukplank, band, rollen, etc","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r253"},{"row":254,"ruimte":"Algemene ruimtes","werkplek":"Gang","onderdeel":"Hyghiënepunt richting productie","subcat":"Zeepautomaten bijvullen, handdrogers","uitvoerend":"Facilitair","vervuiling":"NVT","vscore":5,"zscore":2,"afstand":2,"freq":"Dagelijks","wanneer":"Indien leeg","methode":"Handmatig","middel":"","freq_key":"daily","id":"r254"},{"row":255,"ruimte":"Algemene ruimtes","werkplek":"Gang","onderdeel":"Hyghiënepunt richting productie","subcat":"Baardnetjes, haarnetjes bijvullen, oordoppen","uitvoerend":"Facilitair","vervuiling":"NVT","vscore":5,"zscore":2,"afstand":2,"freq":"Dagelijks","wanneer":"Indien leeg","methode":"Handmatig","middel":"","freq_key":"daily","id":"r255"},{"row":256,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Narijskast (binnenzijde)","subcat":"Vloer","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"weekly","id":"r256"},{"row":257,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Opboller","subcat":"Buitenzijde","uitvoerend":"Facilitair","vervuiling":"aangekoekte resten","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r257"},{"row":258,"ruimte":"Lijn 1","werkplek":"Deegmakerij","onderdeel":"Oven / Narijskast","subcat":"Afvoerput, controle ongedierte 15L warm water doorspoelen","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"P3-Steril","freq_key":"weekly","id":"r258"},{"row":259,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Tappunten","subcat":"Binnenzijde, terugblaasslang, aanslag verwijderen","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5, P3-Steril)","middel":"P3-Steril","freq_key":"weekly","id":"r259"},{"row":263,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Tappunten","subcat":"Binnenzijden schoonkrabben en deegresten verwijderen. Leidingen en frame rondom tot 1.80.","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5, P3-Steril)","middel":"P3-Steril","freq_key":"weekly","id":"r263"},{"row":264,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Tappunten","subcat":"Binnenzijden schoonkrabben en deegresten verwijderen. Leidingen en frame rondom tot 1.80.","uitvoerend":"Facilitair","vervuiling":"grondstofresten/aanslag/ingedroogd vuil","vscore":3,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5, P3-Steril)","middel":"P3-Steril","freq_key":"weekly","id":"r264"},{"row":265,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Tappunten","subcat":"Binnenzijde, terugblaasslang, aanslag verwijderen","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5, P3-Steril)","middel":"P3-Steril","freq_key":"weekly","id":"r265"},{"row":266,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Weegbunker","subcat":"Weegbunker dieptereiniging","uitvoerend":"Facilitair","vervuiling":"aanslag, vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r266"},{"row":267,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Weegbunker","subcat":"Weegbunker dieptereiniging","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r267"},{"row":295,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"werktafel / plateau","subcat":"onder en bovenzijde","uitvoerend":"Facilitair","vervuiling":"handsmeer / aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r295"},{"row":299,"ruimte":"Lijn 1","werkplek":"deegmakerij","onderdeel":"Werktafels","subcat":"Reingen","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r299"},{"row":307,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"afpakband (hand)","subcat":"binnen en buitenom","uitvoerend":"Facilitair","vervuiling":"Kruimels","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r307"},{"row":308,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Narijskast","subcat":"Dieptereiniging + kooiladders","uitvoerend":"Facilitair","vervuiling":"aanslag, smeer, vuil","vscore":"2","zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"semiannual","id":"r308"},{"row":309,"ruimte":"Lijn 2","werkplek":"tussenman","onderdeel":"Kleinbroodstraat","subcat":"Onderzijde / dieptereiniging","uitvoerend":"Facilitair","vervuiling":"aanslag, smeer, vuil","vscore":1,"zscore":3,"afstand":2,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"semiannual","id":"r309"},{"row":310,"ruimte":"Lijn 2","werkplek":"tussenman","onderdeel":"Kleinbroodstraat","subcat":"dieptereiniging kopmachine tot afzetneus","uitvoerend":"Facilitair","vervuiling":"aangekoekte resten","vscore":1,"zscore":3,"afstand":3,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"quarterly","id":"r310"},{"row":311,"ruimte":"Lijn 2","werkplek":"tussenman","onderdeel":"Narijskast (binnenzijde)","subcat":"Kettingen, geleiders. Smeren na schoonmaak","uitvoerend":"Facilitair","vervuiling":"ingedroogde resten, smeer","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":null,"middel":"","freq_key":"semiannual","id":"r311"},{"row":312,"ruimte":"Lijn 2","werkplek":"tussenman","onderdeel":"Narijskast (binnenzijde)","subcat":"Deuren, wanden, tap en bordes","uitvoerend":"Facilitair","vervuiling":"spetters, aanslag, schimmel","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"semiannual","id":"r312"},{"row":313,"ruimte":"Lijn 2","werkplek":"tussenman","onderdeel":"Narijskast (binnenzijde)","subcat":"Plafond, klima en leidingen","uitvoerend":"Facilitair","vervuiling":"aanslag, schimmel","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"semiannual","id":"r313"},{"row":314,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Transport banden","subcat":"Transport aanvoer na koppelkeerder muurzijden","uitvoerend":"Facilitair","vervuiling":"bakblikresten, stof","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r314"},{"row":315,"ruimte":"Lijn 2","werkplek":"tussenman","onderdeel":"Narijskast (buitenzijde)","subcat":"Schakelkast","uitvoerend":"Facilitair","vervuiling":"handsmeer / aangekoekt vuil","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatige desinfectie (Sirifan Speed)","middel":"Sirifan Speed","freq_key":"monthly","id":"r315"},{"row":316,"ruimte":"Lijn 2","werkplek":"tussenman","onderdeel":"Narijskast (buitenzijde)","subcat":"Invoerkooi","uitvoerend":"Facilitair","vervuiling":"handsmeer / aangekoekt vuil","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatige desinfectie (Sirifan Speed)","middel":"Sirifan Speed","freq_key":"monthly","id":"r316"},{"row":317,"ruimte":"Lijn 2","werkplek":"tussenman","onderdeel":"Narijskast omgeving","subcat":"Wanden","uitvoerend":"Facilitair","vervuiling":"stof, aanslag","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"","freq_key":"semiannual","id":"r317"},{"row":318,"ruimte":"Lijn 2","werkplek":"tussenman","onderdeel":"Narijskast omgeving","subcat":"Leidingwerk, draagbalken, plafond","uitvoerend":"Facilitair","vervuiling":"stof, spinnewebben","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"","freq_key":"semiannual","id":"r318"},{"row":319,"ruimte":"Lijn 2","werkplek":"Ovenist","onderdeel":"Oven","subcat":"Loader baan","uitvoerend":"Facilitair","vervuiling":"blikvervuiling","vscore":2,"zscore":2.5,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"quarterly","id":"r319"},{"row":320,"ruimte":"Lijn 2","werkplek":"Ovenist","onderdeel":"Oven","subcat":"Unloader baan","uitvoerend":"Facilitair","vervuiling":"blikvervuiling, vet","vscore":2,"zscore":2.5,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"quarterly","id":"r320"},{"row":321,"ruimte":"Lijn 2","werkplek":"Ovenist","onderdeel":"Oven","subcat":"Kijkluiken","uitvoerend":"Facilitair","vervuiling":"vet, wasem","vscore":2,"zscore":2.5,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"quarterly","id":"r321"},{"row":322,"ruimte":"Lijn 2","werkplek":"Ovenist","onderdeel":"Oven","subcat":"Afzuigkap voorkant","uitvoerend":"Facilitair","vervuiling":"vet, wasem","vscore":2,"zscore":2.5,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"Topaz LD1","freq_key":"quarterly","id":"r322"},{"row":323,"ruimte":"Lijn 2","werkplek":"Ovenist","onderdeel":"Oven","subcat":"bovenzijde, zijkanten, leidingen","uitvoerend":"Facilitair","vervuiling":"stof","vscore":3,"zscore":2.5,"afstand":1,"freq":null,"wanneer":null,"methode":"Handmatig","middel":"Stofzuiger","freq_key":"unknown","id":"r323"},{"row":324,"ruimte":"Inpak lijn 2","werkplek":"Inpak","onderdeel":"afpakband (hand)","subcat":"binnen en buitenom","uitvoerend":"Facilitair","vervuiling":"Kruimels","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r324"},{"row":325,"ruimte":"Lijn 2","werkplek":"Ovenist","onderdeel":"Transport baan","subcat":"Transport naar unloader","uitvoerend":"Facilitair","vervuiling":"schimmel, aangekoekte resten","vscore":1,"zscore":3,"afstand":3,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"quarterly","id":"r325"},{"row":326,"ruimte":"Lijn 2","werkplek":"Ovenist","onderdeel":"Oven omgeving","subcat":"Wanden","uitvoerend":"Facilitair","vervuiling":"stof, aanslag","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Inschuimen (LD1, MD5, P3-Steril)","middel":"Topaz LD1","freq_key":"semiannual","id":"r326"},{"row":327,"ruimte":"Lijn 2","werkplek":"Ovenist","onderdeel":"Oven omgeving","subcat":"Leidingwerk, draagbalken, plafond","uitvoerend":"Facilitair","vervuiling":"stof, spinnewebben","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"semiannual","id":"r327"},{"row":328,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"Daalband","subcat":"binnen en buitenom","uitvoerend":"Facilitair","vervuiling":"Kruimels","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r328"},{"row":329,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"etikeerlijn","subcat":"buitenzijde en transport","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r329"},{"row":330,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"inpakmachine heel","subcat":"buitenom, plexiglas, onderstel","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r330"},{"row":331,"ruimte":"Inpak lijn 2","werkplek":"Inpak","onderdeel":"Koelbanen","subcat":"opvangbakken legen en beplating","uitvoerend":"Facilitair","vervuiling":"Kruimels","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Stofvrij maken/bezem","middel":"Bezemmateriaal","freq_key":"weekly","id":"r331"},{"row":332,"ruimte":"Lijn 2","werkplek":"algemeen","onderdeel":"Kunstof wanden","subcat":"Wanden productie Lijn 2","uitvoerend":"Facilitair","vervuiling":"stof, aanslag","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Inschuimen (LD1, MD5)","middel":"Topaz LD1","freq_key":"semiannual","id":"r332"},{"row":333,"ruimte":"Inpak lijn 2","werkplek":"Inpak","onderdeel":"metaaldetector","subcat":"inclusief opvangbak, stellage, baan en omkasting","uitvoerend":"Facilitair","vervuiling":"Kruimels","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r333"},{"row":334,"ruimte":"Lijn 2","werkplek":"algemeen","onderdeel":"Vloer reinigen","subcat":"Voor KB Oven tpv opslag rozijnen","uitvoerend":"Facilitair","vervuiling":"stof","vscore":3,"zscore":1,"afstand":2,"freq":"Halfjaarlijks","wanneer":null,"methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"semiannual","id":"r334"},{"row":335,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"metaaldetector na snij/inpakmachine","subcat":"inclusief opvangbak, stellage, baan en omkasting","uitvoerend":"Facilitair","vervuiling":"Kruimels","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r335"},{"row":336,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"muren","subcat":null,"uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"P3-Steril","freq_key":"weekly","id":"r336"},{"row":337,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"snijmachine heel","subcat":"buitenom, plexiglas, onderstel","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r337"},{"row":338,"ruimte":"Inpak lijn 1","werkplek":"Inpak","onderdeel":"Vloer","subcat":null,"uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r338"},{"row":339,"ruimte":"Expeditie","werkplek":"Krathandeling","onderdeel":"Manipulator, put","subcat":"Vloer ontdoen van vervuiling","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":4,"zscore":2,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Stofvrij maken/bezem","middel":"Bezemmateriaal","freq_key":"weekly","id":"r339"},{"row":340,"ruimte":"Lijn 2","werkplek":"algemeen","onderdeel":"Dakkoepels","subcat":null,"uitvoerend":"Externe firma","vervuiling":"aanslag, kalk","vscore":2,"zscore":1,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"annual","id":"r340"},{"row":341,"ruimte":"Expeditie","werkplek":"Krathandeling","onderdeel":"Shute","subcat":"Stofvrij maken","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":4,"zscore":2,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Stofvrij maken/bezem","middel":"Bezemmateriaal","freq_key":"weekly","id":"r341"},{"row":342,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Blikken insmeer unit","subcat":"Buitenzijde","uitvoerend":"Facilitair","vervuiling":"smeer/vet/vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r342"},{"row":343,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Deegkuipen","subcat":"onderstel dieptereiniginging","uitvoerend":"Facilitair","vervuiling":"smeer/vet/vuil","vscore":1,"zscore":3,"afstand":2,"freq":"Per kwartaal","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"quarterly","id":"r343"},{"row":344,"ruimte":"Lijn 2","werkplek":"tussenman","onderdeel":"Narijskast (buitenzijde)","subcat":"Uitvoerkooi","uitvoerend":"Facilitair","vervuiling":"handsmeer / aangekoekt vuil","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatige desinfectie (Sirifan Speed)","middel":"Sirifan Speed","freq_key":"monthly","id":"r344"},{"row":345,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Kneders","subcat":"binnenwerk dieptereiniginging","uitvoerend":"Facilitair","vervuiling":"smeer/vet/vuil","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r345"},{"row":346,"ruimte":"Lijn 2","werkplek":"deegmakerij","onderdeel":"Kopmachine","subcat":"Afschermkappen rondom","uitvoerend":"Facilitair","vervuiling":"aanslag / ingedroogd vuil","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Vochtige doek","freq_key":"monthly","id":"r346"},{"row":347,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Blikken insmeer unit","subcat":"Omkasting","uitvoerend":"Facilitair","vervuiling":"smeer/vet/vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r347"},{"row":348,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Blikken opslag","subcat":"Vloer binnenkant","uitvoerend":"Facilitair","vervuiling":"aangekoekte resten","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Schrobben/machinaal","middel":"Clint KF 200","freq_key":"weekly","id":"r348"},{"row":349,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Blikken opslag","subcat":"Vloer binnenkant","uitvoerend":"Facilitair","vervuiling":"bakblikresten, stof","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Schrobben/machinaal","middel":"Topaz MD5","freq_key":"weekly","id":"r349"},{"row":350,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Koppelkeerstation","subcat":"Blauwe borstel","uitvoerend":"Facilitair","vervuiling":"kruimels, bakblikvuil","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r350"},{"row":351,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Koppelkeerstation","subcat":"Koppelkeer binnenzijden","uitvoerend":"Facilitair","vervuiling":"kruimels, bakblikvuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r351"},{"row":352,"ruimte":"Lijn 1","werkplek":"ovenist","onderdeel":"Lekbak olie opvang","subcat":"Lekbak olie opvang","uitvoerend":"Facilitair","vervuiling":"Vet/olie","vscore":2,"zscore":2.5,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r352"},{"row":353,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"metaaldetector na depanner","subcat":"inclusief opvangbak, baan en omkasting","uitvoerend":"Facilitair","vervuiling":"kruimels","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatige desinfectie (Sirifan Speed)","middel":"Sirifan Speed","freq_key":"weekly","id":"r353"},{"row":354,"ruimte":"Magazijn","werkplek":"Magazijn","onderdeel":"afvalbeheer","subcat":"Restafval containers legen","uitvoerend":"Facilitair","vervuiling":"Algemene vervuiling","vscore":5,"zscore":3,"afstand":1,"freq":"Dagelijks","wanneer":"Indien vol","methode":"Handmatig","middel":"Topaz LD1","freq_key":"daily","id":"r354"},{"row":355,"ruimte":"Lijn 2","werkplek":"tussenman","onderdeel":"Kleinbroodstraat","subcat":"omkasting","uitvoerend":"Facilitair","vervuiling":"aangekoekte resten","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r355"},{"row":356,"ruimte":"Magazijn","werkplek":"magazijn","onderdeel":"Chemie opslag facilitair","subcat":"Facilitair ruimte reinigen","uitvoerend":"Facilitair","vervuiling":"vloervuil, stof","vscore":4,"zscore":1,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Schrobben/machinaal","middel":"","freq_key":"semiannual","id":"r356"},{"row":357,"ruimte":"Magazijn","werkplek":"magazijn","onderdeel":"Lekbak olie opvang","subcat":"Lekbak olie opvang","uitvoerend":"Facilitair","vervuiling":"olie","vscore":2,"zscore":2.5,"afstand":2,"freq":"Halfjaarlijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"semiannual","id":"r357"},{"row":358,"ruimte":"Lijn 2","werkplek":"Ovenist","onderdeel":"Oven","subcat":"Trap","uitvoerend":"Facilitair","vervuiling":"Kruimels","vscore":3,"zscore":2.5,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r358"},{"row":359,"ruimte":"Lijn 2","werkplek":"Ovenist","onderdeel":"Oven","subcat":"Schakelkast","uitvoerend":"Facilitair","vervuiling":"Stof, aanslag","vscore":3,"zscore":2.5,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatige desinfectie (Sirifan Speed)","middel":"Sirifan Speed","freq_key":"weekly","id":"r359"},{"row":360,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Oven omgeving","subcat":"Loader & unloader oven kruimels reinigen","uitvoerend":"Facilitair","vervuiling":"kruimels, bakblik vuil","vscore":4,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Stofzuiger","freq_key":"weekly","id":"r360"},{"row":361,"ruimte":"Magazijn","werkplek":"magazijn","onderdeel":"Grondstof magazijn","subcat":"stellingen, muren, leidingen, etc","uitvoerend":"Facilitair","vervuiling":"stof, aangekoekt vuil","vscore":3,"zscore":2,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r361"},{"row":362,"ruimte":"Magazijn","werkplek":"Bakkerij","onderdeel":"Plateau acculader","subcat":"Reinigen","uitvoerend":"Facilitair","vervuiling":"kruimels, stof","vscore":3,"zscore":2,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Vochtige doek","freq_key":"monthly","id":"r362"},{"row":363,"ruimte":"Magazijn","werkplek":"Bakkerij","onderdeel":"Gele IBC opvangbak","subcat":"Volledig reinigen met hogedruk reiniger","uitvoerend":"Facilitair","vervuiling":"Olie","vscore":3,"zscore":2,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Inschuimen (LD1, MD5, P3-Steril)","middel":"Topaz LD1","freq_key":"monthly","id":"r363"},{"row":364,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Transport banden","subcat":"Transport blikken insmeer unit, goed naspoelen met water","uitvoerend":"Facilitair","vervuiling":"bakblikresten, stof","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r364"},{"row":365,"ruimte":"Productie","werkplek":"tussenman","onderdeel":"Bakkerij","subcat":"Luchtzakken ventilatie","uitvoerend":"Facilitair","vervuiling":"stof, aanslag","vscore":2,"zscore":3,"afstand":1,"freq":"Halfjaarlijks","wanneer":null,"methode":"Extern","middel":"","freq_key":"semiannual","id":"r365"},{"row":366,"ruimte":"Productie","werkplek":"tussenman","onderdeel":"Wasbakken","subcat":"Perlators reinigen/vervangen","uitvoerend":"Facilitair","vervuiling":"aanslag, vuil","vscore":1,"zscore":1,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":"Handmatig","middel":"Sirifan Speed","freq_key":"annual","id":"r366"},{"row":379,"ruimte":"Magazijn","werkplek":"Inpak","onderdeel":"Plateau acculader","subcat":"Reinigen","uitvoerend":"Facilitair","vervuiling":"kruimels, stof","vscore":3,"zscore":2,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Vochtige doek","freq_key":"monthly","id":"r379"},{"row":395,"ruimte":"Wasplaats","werkplek":"Bakkerij","onderdeel":"Vaatwasser","subcat":"Jaarlijks onderhoud","uitvoerend":"Externe firma","vervuiling":"n.v.t.","vscore":1,"zscore":1,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":null,"middel":"","freq_key":"annual","id":"r395"},{"row":396,"ruimte":"Lijn 1","werkplek":"Ovenist","onderdeel":"Transport banden","subcat":"Transport van naalddepanner naar koppelkeer, goed naspoelen met water","uitvoerend":"Facilitair","vervuiling":"bakblikresten, stof","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Bezemmateriaal","freq_key":"weekly","id":"r396"},{"row":397,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Langmaker","subcat":"Drukplank, band, rollen.","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Handmatig","middel":"Topaz LD1","freq_key":"weekly","id":"r397"},{"row":398,"ruimte":"Inpak VB","werkplek":"Inpak","onderdeel":"Rek verpakkingsmateriaal","subcat":"Schappen en frame","uitvoerend":"Facilitair","vervuiling":"kruimels, stof","vscore":2,"zscore":3,"afstand":2,"freq":"Maandelijks","wanneer":null,"methode":"Handmatig","middel":"Topaz LD1","freq_key":"monthly","id":"r398"},{"row":399,"ruimte":"Krathandeling","werkplek":"Krat-dolly banen","onderdeel":"Dolly-Krattransporten","subcat":"Vuilvrij maken","uitvoerend":"Facilitair","vervuiling":"Algemene vervuiling","vscore":2,"zscore":2,"afstand":2,"freq":"Per kwartaal","wanneer":"12.00","methode":"Handmatig","middel":"Krabber","freq_key":"quarterly","id":"r399"},{"row":400,"ruimte":"Krathandeling","werkplek":"Stapelaars/Ontstapelaars","onderdeel":"Frame","subcat":"Stofvrij maken","uitvoerend":"Facilitair","vervuiling":"algemene vervuiling","vscore":2,"zscore":2,"afstand":2,"freq":"Per kwartaal","wanneer":"12.00","methode":"Handmatig","middel":"Luchtdruk","freq_key":"quarterly","id":"r400"},{"row":403,"ruimte":"Krathandeling","werkplek":"Volledig","onderdeel":"Volledig","subcat":"Natreinigen","uitvoerend":"Facilitair","vervuiling":"Algemene vervuiling","vscore":1,"zscore":2,"afstand":1,"freq":"Jaarlijks","wanneer":null,"methode":"Handmatig","middel":"Vochtige doek","freq_key":"annual","id":"r403"},{"row":406,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Narijskast (binnenzijde)","subcat":"Vloer nat reinigen","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5)","middel":"P3-Steril","freq_key":"weekly","id":"r406"},{"row":407,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Narijskast (binnenzijde)","subcat":"Blikken transport","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":3,"zscore":3,"afstand":2,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5)","middel":"P3-Steril","freq_key":"weekly","id":"r407"},{"row":408,"ruimte":"Lijn 1","werkplek":"tussenman","onderdeel":"Strooi unit","subcat":"Water sproeier","uitvoerend":"Facilitair","vervuiling":"Aangekoekt vuil","vscore":2,"zscore":3,"afstand":3,"freq":"Wekelijks","wanneer":"Zaterdag","methode":"Inschuimen (LD1, MD5)","middel":"P3-Steril","freq_key":"weekly","id":"r408"}],"products":[{"name":"Sirifan speed","beschrijving":"Sproeidesinfectiemiddel","toepassing":"Desinfectie van materialen","concentratie":"onverdund","meetwijze":"--","opmerking":null},{"name":"Topaz LD1","beschrijving":"Neutraal reinigingsmiddel. Kan handmatig en ook schuimend gebruikt worden.","toepassing":"Handmatige schoonmaak. Algemeen voor oppervlakte. Voor lichte vervuilingen","concentratie":"0,5-5%","meetwijze":"--","opmerking":null},{"name":"Topaz MD5","beschrijving":"Medium alkalisch reinigingsmiddel. Goede ontvetter. Kan handmatig en ook schuimend gebruikt worden","toepassing":"Handmatige schoonmaak voor vette/sterkere vervuiling","concentratie":"2-5%","meetwijze":"pH","opmerking":"Kracht product. Niet op Aluminium, Goed naspoelen met water"},{"name":"Topaz MD2","beschrijving":"Alkalische schuimreiniger bollenetjes","toepassing":"Reiniging van bollenetjes","concentratie":"2-5%","meetwijze":"pH","opmerking":"Niet op Aluminium"},{"name":"P3-Oxonia Active","beschrijving":"Desinfectiemiddel CIP installatie op basis van perazijnzuur en waterstofperoxide","toepassing":"Circulatie desinfectie van CIP-set","concentratie":"0,2-0,5%","meetwijze":"Peroxide","opmerking":"Bijtend, draag juiste PBM's"},{"name":"P3-Steril","beschrijving":"Reiniging + desinfectie combinatie voor handmatige op hogedruk reiniging","toepassing":"Handmatige schoonmaak of machinale schoonmaak voor algemene vervuiling + desinfectie","concentratie":"1-5%","meetwijze":"Quat","opmerking":null},{"name":"Mip C","beschrijving":"Sterk alkalisch reinigingsmiddel","toepassing":"Circulatie reinigingsmiddel voor CIP-set","concentratie":"0,2-2%","meetwijze":"pH","opmerking":null},{"name":"Clear Dry PL","beschrijving":"Geconcentreerd naglansmiddel vaatwasser","toepassing":"Automatische dosering vaatwasser","concentratie":null,"meetwijze":"pH","opmerking":null},{"name":"Solid Protect","beschrijving":"Sterk geconcentreerd vaatwasmiddel met metaalbeschermer","toepassing":"Automatische dosering vaatwasser","concentratie":null,"meetwijze":"pH","opmerking":null},{"name":"Topaz CL4","beschrijving":"Chloor alkalische schuimreinigingsmiddel","toepassing":"Schuimreiniging van rijskast","concentratie":"2-5%","meetwijze":"kaliumjodide","opmerking":"Niet op Aluminium"},{"name":"Clint KF 200","beschrijving":"Universeel toepasbaar automatische en handmatige reiniging van oppervlakken bijv. Vloeren","toepassing":"Vloerreiniging, mop of schrob-zuigmachine","concentratie":"2 - 4 %","meetwijze":"pH","opmerking":null},{"name":"Chromol","beschrijving":"RVS onderhoudsproduct","toepassing":"Verwijderen vingerafdrukken, vuil of (water)vlekken","concentratie":"onverdund","meetwijze":"pH","opmerking":null},{"name":"Greaselift RTU","beschrijving":"Compleet ovenreinigingsmiddel","toepassing":"Oven, in- en uitgang","concentratie":"onverdund","meetwijze":"pH","opmerking":"Alleen voor Ovens, Goed naspoelen met water"},{"name":"Dreumex Handzeep","beschrijving":"Reinigingsmiddel tbv handen TD werkplaats","toepassing":"reinigingsmiddel tbv handen","concentratie":"onverdund","meetwijze":"--","opmerking":null},{"name":"P3-manodes LI","beschrijving":"Neutraal desinfectiemiddel tbv handen","toepassing":"Handen desinfectie","concentratie":"onverdund","meetwijze":"--","opmerking":null},{"name":"P3-manosoft","beschrijving":"Neutraal reinigingsmiddel tbv handen","toepassing":"reinigingsmiddel tbv handen","concentratie":"onverdund","meetwijze":"--","opmerking":null},{"name":"Luchtdruk","beschrijving":null,"toepassing":null,"concentratie":null,"meetwijze":null,"opmerking":null}],"methods":[{"code":"Meth. A","name":"Stofvrij maken/bezem","description":["Indien mogelijk stof en productresten verwijderen met behulp van een stofzuiger.","Anders aanvegen met behulp van kunstof borstel of bezem. Let op de juiste kleur","Geschikt voor: schonen van lijnen"]},{"code":"Meth. B","name":"Sprayreiniging","description":["Niet te sterk vervuild oppervlak (grof vuil verwijderd) insprayen met de reinigingsoplossing","met behulp van een sproeiflacon. Na even inwerken afnemen met een klamvochtige ","kunstofvezel doek met reinigingsoplossing. Het oppervlak nadoen met een schone","kunstofvezel doek. ","Geschikt voor: buitenkant machines"]},{"code":"Meth. C","name":"Handmatig","description":["Reiniging met behulp van borstel of schuurpad, borstelen. ","Vul een lauwwarm emmertje sop met de juiste concentratie chemie,","verwijder grove resten met blik/veger/krabber en verwijder aangekoekte resten met een spons en doek. Wrijf na met een schone doek (met water).","Eventueel spoelen met weinig, lage druk water. Waar nodig droog maken met een kunstofvezel doek.","Geschikt voor: apparatuur die nat gereinigd kan worden. Scherm kwetsbare delen af."]},{"code":"Meth. D","name":"Schrobben/ Machinaal","description":["Vloeren schrobben met behulp van de schrobzuigmachine en de reinigingsoplossing.","Hierbij tijdens de eerste rondgang alleen borstelen en de tweede rondgang borstelen en","opzuigen. Op plaatsen waar de schrobzuigmachine niet kan komen handmatig ","schrobben met kunstof schrobber, pad of een schijfsmachine met reinigingsoplossing.","Bij vloer moppen dezelfde reinigingsoplossing gebruiken. ","Geschikt voor: vloeren"]},{"code":"Meth. E","name":"Handmatige desinfectie (Sirifan Speed)","description":["Het gereinigde oppervlak/onderdeel extra nadesinfecteren met een sproeidesinfectant op","alcohol basis d.m.v. sproeiflacon. ","Geschikt voor: inpaklijnen met verhoogd risico op nabesmetting / langhoudbaar product"]},{"code":"Meth. F","name":"Sproeidesinfectie","description":["Het te desinfceteren (schone) opppervlak 5 minuten in laten werken. Goed naspoelen met water. ","Geschikt voor: specifieke oppervlaktes met microbiologsch risico's","Hogedruk reiniging","Met behulp van hoge druk een oppervlakte schoon reinigen. Houd hierbij rekening met schakelkasten, "]},{"code":"Meth. G","name":"elektra en alleen onderdelen die hierbij niet beschadigd kunnen worden","description":["Geschikt voor: muren en vloeren"]},{"code":"Meth. I","name":"Inschuimen (LD1, MD5, P3-Steril)","description":["Loop naar spoelruimte en scherm kwetsbare delen af. ","Verwijder grove resten en breng met behulp van de schuimunit een schuimlaag op het te reinigen oppervlak aan","15 tot 20 minuten laten inwerken en daarna het losgeweekte vuil handmatig afspoelen. Waar nodig schrobben. Goed naspoelen","Geschikt voor: deegkuipen, nat te reinigen machines, muren, banen etc"]},{"code":"Meth.J","name":"Weken (MD2)","description":["Demonteer het schoon te maken onderdeel en leg deze in een bak met de juiste concentratie chemie. ","Laat minimaal 1 uur inweken en haal vervoglens het gedemonteerde onderdeel eruit. Spuit af met een hoge drukreiniger en monteer weer","Geschikt voor: transportbanen, borstels, bollennetjes"]}],"versions":[{"version":"v08","date":"2025-12-22 00:00:00","changes":["Voortaan versies hier bijhouden ipv in MM omdat dit een werkdocument is. Vanaf 2026 starten met deze versie","(we gaan dan van v02 naar v08, heeft te maken met enkele testconcepten in Manual Master waardoor er een paar gepubliceerde versies overgeslaan zijn)"]},{"version":"v09","date":"2026-02-06 00:00:00","changes":["Schoonmaaklijsten bakkerij overlopen met de productiemanager en doublures, fouten in frequentie eruit gehaald. ","Vaste dropdown gemaakt voor 'wanneer', 'type vervuiling'","Deze versie in productie vanaf week 8","Schoonmaak van de buitenzijde van het gebouw en de silo's toegevoegd, jaarlijks ","Krathandling toegevoegd","Kleine filters van inpak lijn 2 weg gehaald op deze lijst -> hoort in het onderhoudsplan van de TD","Topaz Alu uit de lijst met middelen gehaald. Deze is vervangen door Topaz CL4"]},{"version":"v10","date":"2026-05-08 00:00:00","changes":["Opvangplaat onder afweger op de vloer bij bakkerij grootbrood toegevoegd op dagelijkse schoonmaaklijst","Ledigen H2 opvangbak weggehaald vanwege overgang naar Borntrager","Op de schoonmaaklijsten van de bakkerij de volgorde verandert zodat alles meer in de volgorde van het proces staat en dit overzichtelijker is.","Wekelijkse lijst KB koeltoren, specifieke dag waarop het uitgevoerd moet worden weggehaald. ","v10 gebruiken vanaf week 20"]}]};

// =====================================================
// TRANSLATIONS
// =====================================================
const T = {
  nl: {
    app_title: "Schoonmaakplan",
    app_subtitle: "GTE-D-09-99 · versie {v}",
    export: "⬇ Exporteer Excel",
    lang_btn: "🌐 EN",
    tabs: {
      today: "Vandaag",
      coordinator: "Coördinator",
      all: "Alle",
      daily: "Dagelijks", weekly: "Wekelijks", monthly: "Maandelijks",
      bimonthly: "Elke 2 maanden", quarterly: "Per kwartaal",
      semiannual: "Halfjaarlijks", annual: "Jaarlijks",
      changelog: "📋 Versiebeheer",
      changelog_label: "Versiebeheer"
    },
    headers: {
      row: "Rij", area: "Ruimte", werkplek: "Werkplek", onderdeel: "Onderdeel",
      task: "Taak / beschrijving", performer: "Uitvoerend", vervuiling: "Type vervuiling",
      method: "Methode", product: "Middel", when: "Wanneer", score: "Score",
      location: "Locatie", frequency: "Frequentie"
    },
    shifts: { morning: "Ochtend", afternoon: "Middag", night: "Nacht" },
    days: ["Zon", "Maa", "Din", "Woe", "Don", "Vri", "Zat"],
    months: ["Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"],
    quarters: ["Q1 (jan-mrt)", "Q2 (apr-jun)", "Q3 (jul-sep)", "Q4 (okt-dec)"],
    halves: ["H1 (jan-jun)", "H2 (jul-dec)"],
    bimonths: ["jan-feb", "mrt-apr", "mei-jun", "jul-aug", "sep-okt", "nov-dec"],
    filter_area: "Ruimte:", filter_performer: "Uitvoerend:", filter_search: "Zoeken:",
    sort_label: "Sorteren:",
    sort_default: "Standaard",
    sort_area: "Ruimte (A-Z)",
    sort_soiling: "Vervuilingsgraad ↓",
    filter_btn: "Filter",
    filter_toggle_tooltip: "Filters openen / sluiten",
    filter_all: "Alle",
    dept_facilitair: "Facilitair",
    dept_operator: "Operator",
    dept_overig: "Overig",
    undo_label: "Ongedaan maken",
    undo_restored: "Hersteld",
    sync_done: "Bijgewerkt vanuit de cloud",
    sync_failed: "Bijwerken mislukt — controleer je verbinding",
    sync_local_only: "Lokale weergave ververst",
    print_btn: "Printen",
    print_tooltip: "Druk de huidige periode af",
    print_title: "Schoonmaakplan",
    print_period: "Periode",
    print_date: "Afgedrukt op",
    print_task: "Taak",
    print_method: "Methode",
    print_product: "Middel",
    print_when: "Wanneer",
    print_signature: "Handtekening",
    print_no_tasks: "Geen taken in deze periode om te printen.",

    // ===== Vandaag-view (PUNT 1) =====
    today_header_title: "Vandaag, {date}",
    today_header_count_one: "{n} taak open",
    today_header_count_many: "{n} taken open",
    today_header_count_zero: "alles klaar",
    today_begin_round_btn: "🚀 Begin ronde",
    today_resume_round_btn: "▶ Hervat ronde ({done}/{total})",
    today_new_round_btn: "🆕 Nieuwe ronde",
    today_my_tasks_filter: "Alleen mijn taken",
    today_my_tasks_filter_off: "Alle taken",
    today_all_done_title: "🎉 Alles klaar!",
    today_all_done_sub: "Geen taken meer open voor vandaag.",
    today_group_none: "Geen tijdstip",
    today_overdue_pill: "Achterstand",
    today_due_pill: "Vandaag",
    today_section_count_one: "{n} taak",
    today_section_count_many: "{n} taken",
    today_freq_label_daily: "dagelijks",
    today_freq_label_weekly: "wekelijks",
    today_freq_label_monthly: "maandelijks",
    today_freq_label_bimonthly: "elke 2 mnd",
    today_freq_label_quarterly: "per kwartaal",
    today_freq_label_semiannual: "halfjaarlijks",
    today_freq_label_annual: "jaarlijks",

    // ===== Coördinator-overzicht (admin/superuser) =====
    coord_header_title: "Coördinator-overzicht",
    coord_header_sub: "Volledige tabel-weergave per frequentie — voor planning en oversight",
    coord_subtab_aria: "Frequentie-tabbladen",

    // ===== Instellingen (Etsy-customisation) =====
    settings_tab_label: "Instellingen",
    settings_title: "Instellingen",
    settings_subtitle: "Pas je app aan naar je eigen bedrijf",
    settings_section_branding: "Bedrijfsidentiteit",
    settings_section_branding_sub: "Bedrijfsnaam, logo en accent-kleur",
    settings_section_schedule: "Werkrooster",
    settings_section_schedule_sub: "Werkdagen, shifts en dag-specifieke taken",
    settings_section_features: "Functies",
    settings_section_features_sub: "Schakel modules in of uit",
    settings_section_data: "Gegevens & sjablonen",
    settings_section_data_sub: "Plan exporteren, voorbeelddata laden, resetten",
    settings_admin_only: "Alleen voor admins en super-users",
    settings_coming_soon: "Wordt opgeleverd in de volgende update.",
    // Branding-sectie velden
    settings_brand_company_label: "Bedrijfsnaam",
    settings_brand_company_placeholder: "bijv. Bakkerij Janssen",
    settings_brand_company_help: "Vervangt 'Schoonmaakplan' bovenaan de app.",
    settings_brand_doc_label: "Documentcode",
    settings_brand_doc_placeholder: "bijv. BJ-D-01",
    settings_brand_doc_help: "HACCP-referentienummer in de subtitel.",
    settings_brand_subtitle_label: "Subtitel",
    settings_brand_subtitle_placeholder: "bijv. Schoonmaakplan productie",
    settings_brand_subtitle_help: "Wordt onder de bedrijfsnaam getoond.",
    settings_brand_logo_label: "Logo",
    settings_brand_logo_help: "PNG of SVG, max 200KB. Wordt automatisch verkleind naar 400px hoog.",
    settings_brand_logo_dark_label: "Logo voor donkere modus",
    settings_brand_logo_dark_help: "Optioneel — als je logo donker is en niet leesbaar op donker-mode background.",
    settings_brand_logo_upload: "Logo kiezen",
    settings_brand_logo_remove: "Verwijderen",
    settings_brand_logo_too_large: "Bestand te groot — max 200KB.",
    settings_brand_logo_invalid: "Ongeldig bestand. Gebruik PNG, JPG of SVG.",
    settings_brand_color_label: "Accent-kleur",
    settings_brand_color_help: "Knoppen, links en geaccentueerde elementen.",
    settings_brand_color_custom: "Aangepast",
    settings_brand_save: "Opslaan",
    settings_brand_saved: "Branding opgeslagen",
    settings_brand_preview_title: "Voorbeeld",
    settings_brand_preview_btn: "Voorbeeld-knop",
    settings_brand_preview_link: "Voorbeeld-link",

    // Schedule (werkrooster)
    settings_sched_workdays_label: "Werkdagen",
    settings_sched_workdays_help: "Welke dagen is je bedrijf actief? Klik om te wisselen.",
    settings_sched_shifts_label: "Shift-momenten voor notificaties",
    settings_sched_shifts_help: "Tijden waarop herinneringen worden verstuurd. Max 4 shifts.",
    settings_sched_shift_add: "+ Shift toevoegen",
    settings_sched_shift_remove: "Verwijderen",
    settings_sched_bigday_label: "Grote-schoonmaak-dag",
    settings_sched_bigday_help: "Op welke dag horen \"Zaterdag\"-taken thuis? Standaard zaterdag.",
    settings_sched_twice_label: "\"2× per week\"-dagen",
    settings_sched_twice_help: "Welke twee dagen vallen 2x-per-week-taken? Kies precies 2.",
    settings_sched_save: "Werkrooster opslaan",
    settings_sched_saved: "Werkrooster opgeslagen",
    weekday_short_su: "Zo",
    weekday_short_mo: "Ma",
    weekday_short_tu: "Di",
    weekday_short_we: "Wo",
    weekday_short_th: "Do",
    weekday_short_fr: "Vr",
    weekday_short_sa: "Za",
    // Features-sectie velden
    settings_feat_intro: "Schakel modules in of uit. Wijzigingen zijn lokaal — andere collega's worden niet beïnvloed.",
    settings_feat_cloudSync_label: "Cloud-sync (Firebase)",
    settings_feat_cloudSync_help: "Real-time sync met collega's. Uit = lokaal opslaan, je werk wordt niet gedeeld.",
    settings_feat_roles_label: "Rollen-systeem",
    settings_feat_roles_help: "Toon admin/super-user-rechten. Uit = iedereen mag alles. Aanbevolen voor 1-persoonsbedrijven.",
    settings_feat_cleaningRound_label: "Schoonmaakronde-modus",
    settings_feat_cleaningRound_help: "De '🚀 Begin ronde'-knop op de Vandaag-view. Uit = geen rondemodus.",
    settings_feat_notifications_label: "Notificaties",
    settings_feat_notifications_help: "Push-notificaties bij shift-momenten en de bell-knop bovenin. Uit = geen meldingen.",
    settings_feat_qrCodes_label: "QR-codes",
    settings_feat_qrCodes_help: "Print QR-codes per ruimte/werkplek. Uit = geen QR-tab en geen scan-functionaliteit.",
    settings_feat_photos_label: "Foto's bij taken",
    settings_feat_photos_help: "Voorbeeldfoto's bij elke taak. Uit = bespaart opslagruimte; geen thumbnails.",
    settings_feat_excelExport_label: "Excel-export",
    settings_feat_excelExport_help: "Exporteer taken/checks naar Excel. Uit = geen export-knop in de sidebar.",
    settings_feat_changelog_label: "Versiebeheer",
    settings_feat_changelog_help: "Wijzigingsgeschiedenis-tab + changelog-entries bij elke wijziging. Uit = simpeler interface.",
    settings_feat_assignedUsers_label: "Toegewezen aan-veld",
    settings_feat_assignedUsers_help: "Taken aan specifieke gebruiker toewijzen + 'Mijn taken'-filter op Vandaag. Uit = team-mode.",
    settings_feat_save: "Opslaan",
    settings_feat_saved: "Functies bijgewerkt",
    settings_feat_warning_cloudSync: "⚠ Bij uitzetten zien collega's je werk niet meer.",
    settings_feat_warning_changelog: "⚠ Eerder gemaakte changelog-entries blijven bewaard.",
    // Onboarding-wizard (niet-blokkerende banner)
    onb_banner_title: "Welkom! Pas je app aan in 5 stappen",
    onb_banner_sub: "Eenmalig — daarna nooit meer.",
    onb_dismiss_aria: "Banner sluiten",
    onb_step_label: "Stap {n} van 5",
    onb_back: "Vorige",
    onb_next: "Volgende",
    onb_finish: "Voltooien",
    onb_skip: "Overslaan",
    // Stap 1: bedrijfsnaam
    onb_s1_title: "Wat is je bedrijfsnaam?",
    onb_s1_help: "Deze verschijnt bovenaan de app, in plaats van 'Schoonmaakplan'.",
    onb_s1_placeholder: "bijv. Bakkerij Janssen",
    // Stap 2: kleur
    onb_s2_title: "Kies een accent-kleur",
    onb_s2_help: "Voor knoppen, links en accent-elementen. Je kunt later aanpassen.",
    // Stap 3: logo
    onb_s3_title: "Voeg je logo toe (optioneel)",
    onb_s3_help: "PNG, JPG of SVG, max 200KB. Geen logo? Sla deze stap over.",
    // Stap 4: werkrooster
    onb_s4_title: "Wanneer is je bedrijf open?",
    onb_s4_help: "Beïnvloedt welke taken op welke dagen worden getoond.",
    onb_s4_workdays: "Werkdagen",
    // Stap 5: klaar
    onb_s5_title: "Je bent klaar! 🎉",
    onb_s5_help: "Bekijk later in Instellingen → Bedrijfsidentiteit voor meer aanpassingen, zoals documentcode, subtitel, donker-mode logo en geavanceerde rooster-opties.",
    onb_s5_explore: "App verkennen",
    onb_done_toast: "Welkom — je app is gepersonaliseerd!",
    // Data-management sectie (fase 5)
    settings_data_intro: "Beheer je plan-gegevens. Exporteer als template om te delen of bewaren, laad voorbeelddata, of begin helemaal opnieuw.",
    settings_data_export_title: "📤 Plan exporteren als template",
    settings_data_export_help: "Download je huidige takenlijst als JSON. Bevat geen check-data of foto's — alleen de structuur van je plan, om te delen met collega-vestigingen of als backup.",
    settings_data_export_btn: "Template downloaden",
    settings_data_export_filename: "schoonmaakplan-template",
    settings_data_export_success: "Template geëxporteerd",
    settings_data_import_title: "📥 Template importeren",
    settings_data_import_help: "Laad een eerder gedownload template. Vervangt je huidige taken-lijst maar behoudt afvinkingen waar mogelijk.",
    settings_data_import_btn: "Template laden",
    settings_data_import_invalid: "Ongeldig template-bestand.",
    settings_data_import_success: "Template geïmporteerd ({n} taken)",
    settings_data_import_confirm: "Weet je zeker dat je dit template wil laden? Je huidige taken-lijst wordt vervangen.",
    settings_data_starters_title: "🏭 Voorbeeldplannen (starter-templates)",
    settings_data_starters_help: "Vooraf samengestelde plannen voor verschillende branches. Klik om te laden — vervangt je huidige plan.",
    settings_data_starter_bakery: "Bakkerij",
    settings_data_starter_bakery_sub: "HACCP-conform, dagshift + middagshift",
    settings_data_starter_restaurant: "Restaurant",
    settings_data_starter_restaurant_sub: "Keuken, zaal, sanitair, voorbereiding",
    settings_data_starter_office: "Kantoor",
    settings_data_starter_office_sub: "Werkplekken, vergaderzalen, koffiehoek",
    settings_data_starter_salon: "Kapsalon",
    settings_data_starter_salon_sub: "Stoel, wasbak, gereedschap, ontvangst",
    settings_data_starter_load: "Laden",
    settings_data_starter_loaded: "Voorbeeldplan geladen ({n} taken)",
    settings_data_starter_confirm: "Wil je dit voorbeeldplan laden? Je huidige taken worden vervangen.",
    settings_data_reset_title: "🗑️ Plan resetten",
    settings_data_reset_help: "Wis ALLE taken, afvinkingen, foto's en pending wijzigingen. Bedrijfsidentiteit en werkrooster blijven behouden. Niet ongedaan te maken!",
    settings_data_reset_btn: "Reset volledig plan",
    settings_data_reset_confirm1: "Weet je het zeker? Dit wist alle taken en afvinkingen.",
    settings_data_reset_confirm2: "Echt zeker? Dit kan NIET ongedaan gemaakt worden.",
    settings_data_reset_success: "Plan gereset",
    // Custom vervuilingstypes
    settings_data_soiling_title: "🦠 Vervuilingstypes",
    settings_data_soiling_help: "Pas de lijst aan voor jouw branche. Bakkerij: vet, meel, vleessap. Kantoor: stof, koffie. Kapsalon: haar, kleurresten.",
    settings_data_soiling_add: "+ Type toevoegen",
    settings_data_soiling_placeholder: "bv. haar",
    settings_data_soiling_save: "Opslaan",
    settings_data_soiling_saved: "Vervuilingstypes bijgewerkt",
    // Custom PBM-emoji's
    settings_data_ppe_title: "🧤 PBM-items",
    settings_data_ppe_help: "Persoonlijke beschermingsmiddelen die getoond worden bij taken. Voeg eigen emoji + label toe.",
    settings_data_ppe_add: "+ PBM toevoegen",
    settings_data_ppe_placeholder_emoji: "🧤",
    settings_data_ppe_placeholder_label: "Handschoenen",
    settings_data_ppe_save: "Opslaan",
    settings_data_ppe_saved: "PBM-items bijgewerkt",
    // Ruimtes-beheer
    settings_data_rooms_title: "🏠 Ruimtes beheren",
    settings_data_rooms_help: "Bewerk de ruimtes/locaties die in je plan voorkomen. Voeg icoon en kleur toe per ruimte voor visuele herkenning.",
    settings_data_rooms_add: "+ Ruimte toevoegen",
    settings_data_rooms_name: "Naam",
    settings_data_rooms_icon: "Icoon",
    settings_data_rooms_color: "Kleur",
    settings_data_rooms_remove: "Verwijderen",
    settings_data_rooms_save: "Opslaan",
    settings_data_rooms_saved: "Ruimtes bijgewerkt",
    settings_data_rooms_in_use: "Deze ruimte wordt gebruikt door {n} taken — eerst die taken verplaatsen.",

    // ===== Afwerklijst (Coördinator-tool) =====
    afw_open_btn: "✏️ Afwerklijst",
    afw_open_btn_count: "✏️ Afwerklijst ({n})",
    afw_modal_title: "Afwerklijst — incomplete taken",
    afw_modal_sub: "Vul ontbrekende velden in. Wijzigingen komen in de pending-lijst en moeten later via 'Doorvoeren' worden vastgelegd.",
    afw_progress: "Taak {cur} van {total}",
    afw_no_incompletes_title: "🎉 Geen incomplete taken",
    afw_no_incompletes_sub: "Alle taken hebben een wanneer, methode én middel ingevuld (of zijn als NVT gemarkeerd).",
    afw_field_wanneer: "Wanneer",
    afw_field_methode: "Methode",
    afw_field_middel: "Middel",
    afw_missing_label: "ontbreekt",
    afw_nvt_label: "NVT",
    afw_show_all_btn: "Toon alle velden",
    afw_show_compact_btn: "Toon alleen ontbrekende",
    afw_btn_save: "💾 Opslaan & volgende",
    afw_btn_save_only: "💾 Opslaan",
    afw_btn_skip: "↷ Overslaan",
    afw_btn_nvt: "🚫 Markeer NVT",
    afw_btn_close: "Sluiten",
    afw_btn_finish: "Klaar",
    afw_saved_toast: "Wijziging opgeslagen — staat in pending",
    afw_nvt_toast: "Veld gemarkeerd als NVT",
    afw_nvt_unmark_btn: "Verwijder NVT-markering",
    afw_extern_hint: "Externe firma brengt eigen middel mee — overweeg om dit veld als NVT te markeren.",
    afw_finished_title: "🎉 Afwerklijst klaar",
    afw_finished_sub: "{saved} taken opgeslagen, {nvt} NVT-markeringen, {skipped} overgeslagen. Vergeet niet om <strong>⟳ Doorvoeren</strong> te klikken om de wijzigingen vast te leggen in Versiebeheer.",
    afw_task_context: "Ruimte: {ruimte} · Onderdeel: {onderdeel}",

    // ===== Schoonmaakronde-modus (PUNT 6) =====
    round_title: "Schoonmaakronde",
    round_progress: "{cur} van {total}",
    round_btn_prev: "◀ Vorige",
    round_btn_next: "Volgende ▶",
    round_btn_check: "✓ Klaar",
    round_btn_uncheck: "✓ Klaar (afvinken ongedaan)",
    round_btn_skip: "↷ Overslaan",
    round_btn_close: "Pauzeer",
    round_btn_finish: "Ronde afsluiten",
    round_finished_title: "🎉 Ronde voltooid",
    round_finished_sub: "{done} van {total} taken afgevinkt in deze ronde.",
    round_finished_close: "Sluiten",
    round_no_tasks: "Geen taken om in een ronde te lopen.",
    round_label_method: "Methode",
    round_label_product: "Middel",
    round_label_when: "Wanneer",
    round_label_pbm: "PBM",
    round_label_note: "Opmerking",
    round_note_placeholder: "Optioneel: opmerking bij deze afvink…",
    round_resume_banner: "Ronde gepauzeerd — {done} van {total} klaar",
    round_started_at: "Gestart om {time}",

    // ===== Persoonlijke toewijzing (PUNT 10) =====
    assigned_user_label: "Toegewezen aan",
    assigned_user_none: "Niemand specifiek",
    assigned_user_me: "Mij",
    assigned_user_filter_all: "Alle taken",
    assigned_user_filter_mine: "Alleen mijn taken",
    assigned_user_placeholder: "naam — leeg = iedereen",
    optional_hint: "optioneel",
    notif_enable_btn: "🔔 Notificaties aanzetten",
    notif_enabled: "🔔 Notificaties aan",
    notif_blocked: "🔕 Notificaties geblokkeerd",
    notif_shift_morning: "Ochtendshift — {n} taken open",
    notif_shift_afternoon: "Middagshift — {n} taken open",
    notif_test_title: "Test-notificatie",
    notif_test_body: "Notificaties werken. Je krijgt herinneringen bij shift-momenten.",

    period_info_today: "Vandaag",
    period_info_week: "Week",
    period_info_month: "Deze maand",
    period_info_year: "Dit jaar",
    period_auto_reset: "Checks resetten automatisch per periode — oude periodes blijven bewaard in historie",
    view_period: "Bekijk periode",
    period_current: "huidig",
    week_label: "Week",
    month_names_short: ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'],
    historical_banner_title: "Je bekijkt een vorige periode",
    historical_banner_body: "Afvinkingen zijn alleen-lezen. Exporteren geeft de checks van deze periode.",
    historical_readonly: "Vorige periodes zijn alleen-lezen. Ga terug naar de huidige periode om weer af te vinken.",
    correction_banner_title: "Correctiemodus — vorige periode",
    correction_banner_body: "Als super-user kun je vergeten vinkjes alsnog plaatsen. Wijzigingen worden gelogd als correctie.",
    future_banner_title: "Je bekijkt een toekomstige periode",
    future_banner_body: "Deze periode is nog niet begonnen. Alleen-lezen — checks verschijnen zodra de periode start.",
    period_future: "toekomstig",
    freq_day: "dag",
    freq_week: "week",
    return_current: "Terug naar huidige periode",
    new_period_notice: "Nieuwe {freq} begonnen. Vorige periode is bewaard — gebruik de 'Bekijk periode'-selector om terug te kijken of te exporteren.",
    no_msds: "Geen MSDS beschikbaar",
    msds_description: "Beschrijving",
    msds_usage: "Toepassing",
    msds_concentration: "Concentratie",
    msds_measurement: "Type meetwijze",
    msds_remarks: "Opmerkingen / Waarschuwingen",
    msds_classification: "Gevarenklasse",
    msds_general_note: "Samenvatting op basis van het werkdocument. Gebruik de link hierboven voor het officiële veiligheidsblad van de leverancier.",
    msds_ppe_warning: "PBM's verplicht: handschoenen, veiligheidsbril. Raadpleeg specifiek MSDS voor aanvullende beschermingsmaatregelen.",
    changelog_title: "Versiebeheer / Changelog",
    changelog_add_title: "Wijziging toevoegen",
    changelog_version: "Versie (bijv. v11)",
    changelog_date: "Datum",
    changelog_description: "Beschrijving van de wijziging",
    changelog_add_btn: "+ Toevoegen",
    changelog_delete: "Verwijderen",
    changelog_delete_confirm: "Deze versie-wijziging verwijderen?",
    changelog_add_success: "Wijziging toegevoegd aan versiebeheer",
    export_success: "Excel-bestand geëxporteerd",
    import_success: "Plan geïmporteerd: {n} taken. Je bekijkt nu het nieuwe plan.",
    import_error: "Importfout",
    import_error_no_tasks: "Geen taken gevonden in dit bestand. Controleer of het dezelfde opzet heeft als het origineel.",
    plan_rename: "Plan hernoemen",
    plan_rename_prompt: "Nieuwe naam voor dit plan:",
    plan_renamed: "Plan hernoemd",
    plan_delete: "Plan verwijderen",
    plan_delete_confirm: "Weet je zeker dat je \"{n}\" wilt verwijderen? Alle wijzigingen en afvinkingen in dit plan gaan verloren.",
    plan_deleted: "Plan verwijderd",
    export_error: "Fout bij exporteren",
    empty: "Geen taken gevonden met deze filters",
    total_tasks: "taken",
    done: "klaar",
    reset_all: "Alles resetten",
    reset_confirm: "Alle vinkjes van deze periode resetten voor dit tabblad?",
    reset_done: "Vinkjes zijn gereset",
    reset_modal_title: "Weet je zeker dat je alles wilt resetten?",
    reset_modal_subtitle: "Deze actie kan niet ongedaan worden gemaakt",
    reset_warning_title: "Je staat op het punt vinkjes te wissen",
    reset_warning_body: "Alle aangevinkte taken voor de hieronder getoonde periode worden verwijderd. Deze data kan niet worden hersteld.",
    reset_info_tab: "Tabblad",
    reset_info_period: "Periode",
    reset_info_tasks: "Taken met vinkjes",
    reset_info_checks: "Totaal aantal vinkjes",
    reset_confirm_btn: "Ja, alles resetten",
    reset_final_warning: "Dit verwijdert alleen vinkjes van dit tabblad en periode — niet van andere tabbladen of toekomstige periodes.",
    reset_nothing_to_reset: "Er zijn geen vinkjes om te resetten in deze periode",
    no_product: "geen product",
    // Add task
    add_task_btn: "Nieuwe taak",
    add_task_title: "Nieuwe schoonmaaktaak toevoegen",
    add_task_subtitle: "Vul de velden in om een nieuwe taak toe te voegen aan het schoonmaakplan",
    form_ruimte: "Ruimte",
    form_werkplek: "Werkplek",
    form_onderdeel: "Onderdeel",
    form_subcat: "Taak / beschrijving",
    form_onderdeel_en: "Onderdeel (EN)",
    form_subcat_en: "Taak / beschrijving (EN)",
    form_optional_hint: "optioneel",
    form_uitvoerend: "Uitvoerend",
    form_vervuiling: "Type vervuiling",
    form_wanneer: "Wanneer",
    form_freq: "Frequentie",
    form_methode: "Methode",
    form_middel: "Middel / hulpmiddel",
    form_hint_methode: "Uit Methodieken-tab",
    form_hint_middel: "Uit Middelen-tab. Laat leeg als niet van toepassing.",
    form_scores: "Risico-scores (optioneel)",
    form_hint_scores: "Vervuilingscore × Zonescore × Afstand tot product. Alle drie nodig voor automatische berekening.",
    score_v: "Vervuiling",
    score_z: "Zone",
    score_a: "Afstand",
    score_v_full: "Vervuilingscore",
    score_z_full: "Zonescore",
    score_a_full: "Afstand tot product",
    score_tooltip: "Risico-score: Vervuiling × Zone × Afstand tot product",
    score_total_label: "Score",
    score_legacy_marker: "bestaand",
    score_levels: {
      vscore: [
        { v: 1, label: "1 — Minimaal — droge stof, geen besmettingsrisico" },
        { v: 2, label: "2 — Licht — stof/aanslag, lage microbiologische druk" },
        { v: 3, label: "3 — Matig — vet/residu, kans op kruisbesmetting" },
        { v: 4, label: "4 — Zwaar — aangekoekt organisch materiaal, hoge microbiologische druk" },
        { v: 5, label: "5 — Kritisch — direct productcontact, HACCP-beheerspunt (CCP)" }
      ],
      zscore: [
        { v: 1, label: "Zone 1 — Niet-productiegebieden (minimaal risico)" },
        { v: 2, label: "Zone 2 — Verkeerszones/omkleedruimtes (laag risico)" },
        { v: 3, label: "Zone 3 — Productieruimte/vloer (medium risico)" },
        { v: 4, label: "Zone 4 — Onmiddellijke omgeving (hoog risico)" },
        { v: 5, label: "Zone 5 — Productcontactoppervlakken (hoogste risico)" }
      ],
      afstand: [
        { v: 1, label: "1 — Geen productcontact (vloer, plafond, buitenwand)" },
        { v: 2, label: "2 — Nabijheid product (omgeving machine, wanden productieruimte)" },
        { v: 3, label: "3 — Direct productcontact (werkblad, machine-onderdeel, transportband)" }
      ]
    },
    score_level_empty: "— kies niveau —",
    info_btn_tooltip: "Uitleg tonen over de risico-scores",
    info_v_text: "hoe snel het onderdeel vervuild raakt (hoger = sneller vuil)",
    info_z_text: "type ruimte / hygiëneklasse (zie opties in de dropdown)",
    info_a_text: "afstand tot het product (hoger = dichter bij het product)",
    info_formula: "Samen bepalen deze de risico-score: V × Z × A. Hoe hoger de score, hoe belangrijker de taak.",
    update_author_label: "Doorgevoerd door",
    update_author_placeholder: "Vul je naam in...",
    update_author_required: "Vul in wie de wijzigingen doorvoert",
    form_btn_save: "Taak opslaan",
    form_btn_cancel: "Annuleren",
    form_placeholder_vervuiling: "bijv. stof, aanslag, vet",
    form_placeholder_wanneer: "bijv. Tijdens productie, 1x per dag",
    form_middel_none: "— geen —",
    form_required_error: "Vul de verplichte velden in (ruimte, onderdeel, taak, methode)",
    form_save_success: "Nieuwe taak toegevoegd",
    delete_task_confirm: "Deze taak definitief verwijderen?",
    bulk_selected_one: "taak geselecteerd",
    bulk_selected_many: "taken geselecteerd",
    bulk_select_all: "Alle zichtbare taken selecteren / deselecteren",
    bulk_select_row: "Selecteer deze taak",
    bulk_deselect_all: "Deselecteren",
    bulk_delete_button: "Verwijder geselecteerd",
    bulk_delete_title: "⚠ Geselecteerde taken verwijderen?",
    bulk_delete_subtitle: "{n} taken worden gemarkeerd voor verwijdering",
    bulk_delete_warning_title: "Let op",
    bulk_delete_warning_body: "Deze taken worden uit het schoonmaakplan gehaald en gemarkeerd als verwijderd. De wijziging komt in de pending-lijst en wordt vastgelegd in Versiebeheer wanneer je 'Doorvoeren' klikt. Tot die tijd kun je de actie terugdraaien via 'Verwerpen' in de Update-modal.",
    bulk_and_n_more: "... en nog {n} taken",
    bulk_delete_success: "{n} taken verwijderd — doorvoeren via de ⟳ Update-knop om in Versiebeheer vast te leggen",
    help_btn: "Help",
    help_btn_title: "Hoe werkt dit schoonmaakplan?",
    help_close: "Sluiten",
    backup_btn: "Back-up",
    backup_btn_title: "Maak een volledige back-up van alle data",
    backup_success: "Back-up opgeslagen — bewaar het bestand op een veilige plek",
    restore_btn: "Herstel",
    restore_btn_title: "Herstel een eerdere back-up van bestand",
    restore_invalid_format: "Dit is geen geldig back-up bestand",
    restore_empty: "Back-up bevat geen plannen",
    restore_confirm: "Let op: herstel vervangt alle huidige data ({plans} plan(nen) uit back-up van {date}). Doorgaan?",
    restore_success: "Back-up hersteld — {n} plan(nen) geladen",
    restore_parse_error: "Bestand kon niet worden gelezen — geen geldige JSON",
    restore_read_error: "Fout bij het lezen van het bestand",
    overdue_label: "Achterstand",
    overdue_tooltip: "Deze taak is in de vorige periode niet afgevinkt",
    overdue_count_one: "taak met achterstand",
    overdue_count_many: "taken met achterstand",
    only_overdue: "Alleen achterstand",
    overdue_overview_btn: "Achterstand",
    overdue_overview_tooltip: "Bekijk alle taken met achterstand",
    overdue_overview_title: "Taken met achterstand",
    overdue_overview_empty: "Geen achterstand — alles is bij.",
    overdue_overview_goto: "Ga naar →",
    overdue_overview_close: "Sluiten",
    dashboard_title: "Dashboard",
    dashboard_subtitle: "Live-overzicht van de huidige periode",
    dashboard_compliance: "Voortgang totaal",
    dashboard_tasks_done: "taken afgerond",
    dashboard_overdue: "Achterstand",
    dashboard_view_overdue: "Bekijk achterstand →",
    dashboard_risk: "Risicoverdeling",
    dashboard_risk_low: "Laag",
    dashboard_risk_mid: "Middel",
    dashboard_risk_high: "Hoog",
    dashboard_per_freq: "Voortgang per frequentie",
    dashboard_freq_col: "Frequentie",
    dashboard_done_col: "Klaar",
    dashboard_total_col: "Totaal",
    dashboard_progress_col: "Voortgang",
    dashboard_top_skipped: "Vaakst gemiste taken (laatste 4 weken)",
    dashboard_periods_skipped: "periodes gemist",
    dashboard_no_skipped: "Geen taken die regelmatig worden overgeslagen — top!",
    dashboard_per_performer: "Taken per uitvoerder",
    dashboard_performer_col: "Uitvoerder",
    dashboard_tasks_col: "Aantal taken",
    dashboard_btn: "Dashboard",
    products_btn: "Middelen",
    products_title: "Middelen overzicht",
    products_subtitle: "Alle schoonmaakmiddelen met bijbehorende MSDS-informatie.",
    products_view_msds: "MSDS bekijken",
    products_open_msds: "Info / MSDS",
    products_msds_uploaded: "MSDS beschikbaar",
    products_empty: "Geen middelen gevonden.",
    hero_all_done_title: "Alles klaar! 🎉",
    hero_all_done_sub: "Alle {count} taken voor {period} zijn afgevinkt. Top werk.",
    hero_period_today: "vandaag",
    hero_period_this_week: "deze week",
    hero_period_this_month: "deze maand",
    hero_period_this_quarter: "dit kwartaal",
    hero_period_this_year: "dit jaar",
    hero_period_this_period: "deze periode",
    empty_filter_title: "Geen taken gevonden",
    empty_filter_sub: "Probeer je filter aan te passen of zoek met andere woorden.",
    empty_filter_clear: "Filter wissen",
    empty_no_tasks_title: "Niets gepland",
    empty_no_tasks_sub: "Er staan geen taken voor deze frequentie.",
    dashboard_dept_distribution: "Verdeling per afdeling",
    dashboard_total_tasks: "taken",
    dashboard_spark_label: "Voltooiing afgelopen 14 dagen",
    dashboard_no_data: "Geen data",
    user_anon_label: "Anoniem",
    user_btn_title_set: "Ingelogd als {name} — klik om te wisselen",
    user_btn_title_unset: "Wie ben jij? Klik om je naam in te stellen",
    user_modal_title: "Wie ben jij?",
    user_modal_subtitle: "Je naam wordt vastgelegd bij elke afvinking, voor accountability bij audits",
    user_name_label: "Jouw naam",
    user_name_placeholder: "bijv. Anna",
    user_existing_label: "Eerder gebruikt",
    user_anon_btn: "Anoniem doorgaan",
    user_save_btn: "Opslaan",
    user_set_success: "Welkom {name} — afvinkingen worden nu vastgelegd op jouw naam",
    user_anon_set: "Anoniem doorgaan — afvinkingen worden niet aan een naam gekoppeld",
    checked_by_at: "Afgevinkt door {by} op {at}",
    checked_at: "Afgevinkt op {at}",
    correction_tooltip: "Achteraf gecorrigeerd door {by} op {at}",
    image_label: "Afbeelding",
    image_label_hint: "optioneel — admins/superusers",
    image_pick: "📷 Kies afbeelding",
    image_clear: "🗑 Verwijderen",
    image_none: "Geen afbeelding",
    image_pending_upload: "Wordt geüpload bij opslaan",
    image_uploading: "Afbeelding wordt geüpload...",
    image_upload_failed: "Uploaden mislukt — probeer een kleinere of andere afbeelding",
    image_not_an_image: "Dit bestand is geen afbeelding",
    image_view_tooltip: "Bekijk afbeelding",
    note_add_tooltip: "Opmerking toevoegen",
    note_edit_tooltip: "Opmerking bekijken / bewerken",
    note_modal_title: "Opmerking bij afvinking",
    note_modal_label: "Opmerking (optioneel)",
    note_modal_placeholder: "bijv. Machine was deels uit productie, alleen buitenkant schoongemaakt.",
    note_modal_cancel: "Annuleren",
    note_modal_save: "💾 Opslaan",
    note_modal_clear: "🗑 Opmerking wissen",
    note_saved: "Opmerking opgeslagen",
    note_cleared: "Opmerking verwijderd",
    image_close: "Sluiten",
    image_esc_hint: "Druk Esc om te sluiten",
    image_goto_btn: "Ga naar taak",
    image_goto_tooltip: "Spring naar deze taak in de lijst",
    image_load_failed: "Afbeelding kon niet worden geladen",
    image_delete_btn: "Verwijderen",
    image_delete_tooltip: "Afbeelding verwijderen (admin)",
    image_delete_confirm: "Afbeelding verwijderen? Dit kan niet ongedaan worden gemaakt.",
    image_deleted: "Afbeelding verwijderd",
    qr_btn: "QR-codes",
    qr_btn_title: "Genereer QR-codes per ruimte voor scannen op locatie",
    qr_modal_title: "QR-codes per ruimte",
    qr_modal_subtitle: "Print en plak op locatie — scannen opent direct de juiste filterview",
    qr_generate_for: "Genereer voor",
    qr_per_area: "Per ruimte",
    qr_per_workplace: "Per werkplek",
    qr_print: "Print",
    qr_task_one: "taak",
    qr_task_many: "taken",
    qr_no_data: "Geen ruimtes of werkplekken gevonden om QR-codes voor te genereren.",
    qr_lib_missing: "QR-bibliotheek niet geladen — controleer je internetverbinding.",
    qr_print_blocked: "Print-venster werd geblokkeerd. Sta pop-ups toe en probeer opnieuw.",
    qr_print_subtitle: "Scan deze codes met een telefoon-camera om direct de filtersweergave voor die locatie te openen.",
    role_denied_not_superuser: "Alleen de super-user kan rollen wijzigen.",
    role_cannot_demote_self: "Je kunt je eigen rol niet wijzigen.",
    role_invalid: "Ongeldige rol — alleen 'user' of 'admin' is toegestaan.",
    role_changed: "Rol gewijzigd — de wijziging is direct actief.",
    role_change_failed: "Rol wijzigen mislukt — controleer je rechten.",
    role_denied_admin_required: "Alleen admins en super-users kunnen dit doen.",
    changelog_readonly_notice: "Je bekijkt het versiebeheer in alleen-lezen modus. Alleen admins en super-users kunnen wijzigingen vastleggen.",
    sidebar_title: "Menu",
    sidebar_role_local: "Lokaal",
    sidebar_role_user: "User",
    sidebar_role_admin: "Admin",
    sidebar_role_superuser: "Super-user",
    sidebar_section_navigate: "Navigatie",
    sidebar_section_tools: "Hulpmiddelen",
    sidebar_section_admin: "Beheer",
    sidebar_section_su: "Super-user",
    sidebar_section_account: "Account",
    sidebar_section_app: "App",
    pwa_install_btn: "App installeren",
    pwa_install_unavailable: "App is al geïnstalleerd of niet ondersteund",
    sidebar_change_name: "Naam wijzigen",
    sidebar_import: "Plan importeren",
    sidebar_manage_users: "Beheer accounts",
    sidebar_sign_out: "Uitloggen",
    cloud_connected_badge: "Cloud verbonden",
    cloud_local_badge: "Lokale modus",
    edit_mode_unlocked_btn: "Wijzigen ontgrendelen",
    edit_mode_locked_btn: "Wijzigen vergrendelen",
    export_excel: "Exporteer Excel",
    msds_file_title: "MSDS / Veiligheidsblad",
    msds_uploaded_by: "door",
    msds_open_link: "Open MSDS",
    msds_link_add: "MSDS-link toevoegen",
    msds_link_save: "Opslaan",
    msds_link_saved: "MSDS-link opgeslagen",
    msds_link_save_failed: "Opslaan mislukt — controleer je rechten",
    msds_link_deleted: "MSDS-link verwijderd",
    msds_link_delete_confirm: "Weet je zeker dat je deze MSDS-link wilt verwijderen?",
    msds_link_empty: "Vul een URL in.",
    msds_link_invalid: "Geen geldige URL — controleer of de link klopt.",
    msds_link_placeholder: "https://leverancier.nl/msds/product.pdf",
    msds_link_none: "Nog geen MSDS-link beschikbaar voor dit product.",
    msds_link_none_admin: "Voeg de link naar het veiligheidsblad van de leverancier toe:",
    delete_task_success: "Taak verwijderd",
    delete_task_tooltip: "Taak verwijderen",
    custom_label: "Eigen",
    // Edit task
    edit_task_tooltip: "Taak wijzigen (wachtwoord vereist)",
    edit_task_title: "Taak wijzigen",
    edit_task_subtitle: "Pas de velden aan om de taak te wijzigen",
    edit_btn_save: "Wijzigingen opslaan",
    edit_password_prompt: "Voer het wachtwoord in om taken te wijzigen:",
    edit_password_wrong: "Onjuist wachtwoord",
    edit_password_ok: "Wijzigen ontgrendeld — wijzig-knoppen zijn nu zichtbaar",
    edit_save_success: "Taak bijgewerkt",
    edit_mode_locked_btn: "Wijzigen",
    edit_mode_unlocked_btn: "Wijzigen uitschakelen",
    edit_mode_locked_title: "Klik om wijzigen te ontgrendelen (wachtwoord vereist)",
    edit_mode_unlocked_title: "Klik om wijzigen weer uit te schakelen",
    edit_mode_locked: "Wijzigen uitgeschakeld",
    edit_mode_active_banner: "✏️ Wijzigingsmodus actief — je kunt taken bewerken, toevoegen of verwijderen",
    edit_mode_active_close: "Wijzigen uitschakelen",
    password_modal_title: "Wijzigen ontgrendelen",
    password_modal_subtitle: "Voer het wachtwoord in om taken te kunnen bewerken",
    password_modal_label: "Wachtwoord",
    password_modal_submit: "Ontgrendelen",
    password_modal_empty: "Voer een wachtwoord in",
    auth_enter_email_first: "Vul eerst je e-mail in.",
    auth_invalid_email: "Vul een geldig e-mailadres in.",
    auth_reset_sent_title: "Mail verstuurd!",
    auth_reset_sent_body: "We hebben een mail met een reset-link gestuurd naar:",
    auth_reset_hint: "Geen mail ontvangen? Check ook je spam-folder of probeer het over een paar minuten opnieuw.",
    auth_reset_back: "Terug naar inloggen",
    onboard_welcome_title: "Welkom bij het schoonmaakplan! 👋",
    onboard_welcome_body: "Een korte rondleiding om je op weg te helpen. Klik op 'Volgende' om te beginnen, of 'Overslaan' om direct aan de slag te gaan.",
    onboard_tabs_title: "Frequentie-tabs",
    onboard_tabs_body: "Hier kun je wisselen tussen taken die dagelijks, wekelijks, maandelijks etc. moeten gebeuren. Het getal toont je voortgang.",
    onboard_check_title: "Taken afvinken",
    onboard_check_body: "Klik op de vakjes rechts in een rij om een taak af te vinken. Het wordt automatisch opgeslagen en gedeeld met je team.",
    onboard_menu_title: "Het menu",
    onboard_menu_body: "Via de drie puntjes rechtsboven kom je bij Help, Dashboard, Versiebeheer, QR-codes en meer.",
    onboard_admin_title: "Wijzigen als admin",
    onboard_admin_body: "Als admin kun je via het menu de wijzigingsmodus aanzetten. Daarna kun je taken bewerken, toevoegen en verwijderen. Vergeet niet om je wijzigingen door te voeren via Versiebeheer.",
    onboard_su_title: "Beheer accounts",
    onboard_su_body: "Als super-user kun je via 'Beheer accounts' rollen toekennen aan andere gebruikers. Geef admins de juiste rechten en houd users op alleen-lezen.",
    onboard_skip: "Overslaan",
    onboard_next: "Volgende",
    onboard_finish: "Aan de slag",
    pbm_gloves: "Handschoenen verplicht",
    pbm_goggles: "Veiligheidsbril aanbevolen",
    pbm_mask: "Stofmasker / mondkapje aanbevolen",
    edit_locked_hint: "Ontgrendel eerst de wijzig-modus via de knop rechtsboven",
    edited_label: "Bewerkt",
    edited_tooltip: "Deze taak is gewijzigd ten opzichte van het originele schoonmaakplan",
    // Update / changelog auto-commit
    update_btn: "Update",
    update_btn_title_empty: "Geen wijzigingen om door te voeren",
    update_btn_title_has: "{n} wijziging(en) klaar om door te voeren naar de changelog",
    update_modal_title: "Wijzigingen doorvoeren naar Versiebeheer",
    update_modal_subtitle: "Controleer de wijzigingen en voeg toe aan de changelog",
    update_commit_btn: "Doorvoeren naar changelog",
    update_no_changes_title: "Geen wijzigingen om door te voeren",
    update_no_changes_hint: "Voeg taken toe, wijzig of verwijder ze; ze verschijnen hier klaar om te committen.",
    update_summary_one: "1 wijziging klaar om door te voeren",
    update_summary_many: "{n} wijzigingen klaar om door te voeren",
    update_note_label: "Extra opmerking (optioneel)",
    update_note_placeholder: "Bijv. reden van de wijziging, datum van goedkeuring, verantwoordelijke...",
    update_success: "Wijzigingen toegevoegd aan het Versiebeheer",
    update_version_required: "Versienummer is verplicht",
    update_no_field_changes: "Geen inhoudelijke wijzigingen gedetecteerd",
    update_pending_one: "wijziging wacht op verwerking",
    update_pending_many: "wijzigingen wachten op verwerking",
    update_open_btn: "Nu doorvoeren",
    update_cancel_warning_one: "Je hebt 1 wijziging die nog niet is doorgevoerd. Wat wil je doen?",
    update_cancel_warning_many: "Je hebt {n} wijzigingen die nog niet zijn doorgevoerd. Wat wil je doen?",
    update_discard_btn: "Verwerpen",
    update_keep_btn: "Behouden",
    update_discard_success: "Wijzigingen verworpen",
    update_keep_success: "Wijzigingen behouden — je kunt verder gaan met wijzigen",
    change_type_add: "Toegevoegd",
    change_type_edit: "Gewijzigd",
    change_type_delete: "Verwijderd",
    auto_label: "Auto"
  },
  en: {
    app_title: "Cleaning Plan",
    app_subtitle: "GTE-D-09-99 · version {v}",
    export: "⬇ Export Excel",
    lang_btn: "🌐 NL",
    tabs: {
      today: "Today",
      coordinator: "Coordinator",
      all: "All",
      daily: "Daily", weekly: "Weekly", monthly: "Monthly",
      bimonthly: "Every 2 months", quarterly: "Quarterly",
      semiannual: "Semi-annually", annual: "Annually",
      changelog: "📋 Changelog",
      changelog_label: "Changelog"
    },
    headers: {
      row: "Row", area: "Area", werkplek: "Workplace", onderdeel: "Component",
      task: "Task / description", performer: "Performed by", vervuiling: "Type of soiling",
      method: "Method", product: "Agent", when: "When", score: "Score",
      location: "Location", frequency: "Frequency"
    },
    shifts: { morning: "Morning", afternoon: "Afternoon", night: "Night" },
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    quarters: ["Q1 (jan-mar)", "Q2 (apr-jun)", "Q3 (jul-sep)", "Q4 (oct-dec)"],
    halves: ["H1 (jan-jun)", "H2 (jul-dec)"],
    bimonths: ["jan-feb", "mar-apr", "may-jun", "jul-aug", "sep-oct", "nov-dec"],
    filter_area: "Area:", filter_performer: "Performer:", filter_search: "Search:",
    sort_label: "Sort:",
    sort_default: "Default",
    sort_area: "Area (A-Z)",
    sort_soiling: "Risk score ↓",
    filter_btn: "Filter",
    filter_toggle_tooltip: "Open / close filters",
    filter_all: "All",
    dept_facilitair: "Facility",
    dept_operator: "Operator",
    dept_overig: "Other",
    undo_label: "Undo",
    undo_restored: "Restored",
    sync_done: "Updated from the cloud",
    sync_failed: "Update failed — check your connection",
    sync_local_only: "Local view refreshed",
    print_btn: "Print",
    print_tooltip: "Print the current period",
    print_title: "Cleaning Plan",
    print_period: "Period",
    print_date: "Printed on",
    print_task: "Task",
    print_method: "Method",
    print_product: "Product",
    print_when: "When",
    print_signature: "Signature",
    print_no_tasks: "No tasks in this period to print.",

    // ===== Today view (POINT 1) =====
    today_header_title: "Today, {date}",
    today_header_count_one: "{n} task open",
    today_header_count_many: "{n} tasks open",
    today_header_count_zero: "all done",
    today_begin_round_btn: "🚀 Start round",
    today_resume_round_btn: "▶ Resume round ({done}/{total})",
    today_new_round_btn: "🆕 New round",
    today_my_tasks_filter: "Only my tasks",
    today_my_tasks_filter_off: "All tasks",
    today_all_done_title: "🎉 All done!",
    today_all_done_sub: "No tasks left for today.",
    today_group_none: "No time slot",
    today_overdue_pill: "Overdue",
    today_due_pill: "Today",
    today_section_count_one: "{n} task",
    today_section_count_many: "{n} tasks",
    today_freq_label_daily: "daily",
    today_freq_label_weekly: "weekly",
    today_freq_label_monthly: "monthly",
    today_freq_label_bimonthly: "every 2 mo",
    today_freq_label_quarterly: "quarterly",
    today_freq_label_semiannual: "semi-annual",
    today_freq_label_annual: "annual",

    // ===== Coordinator overview (admin/superuser) =====
    coord_header_title: "Coordinator overview",
    coord_header_sub: "Full table view per frequency — for planning and oversight",
    coord_subtab_aria: "Frequency tabs",

    // ===== Settings (Etsy customisation) =====
    settings_tab_label: "Settings",
    settings_title: "Settings",
    settings_subtitle: "Customise the app for your business",
    settings_section_branding: "Brand identity",
    settings_section_branding_sub: "Company name, logo and accent colour",
    settings_section_schedule: "Work schedule",
    settings_section_schedule_sub: "Work days, shifts and day-specific tasks",
    settings_section_features: "Features",
    settings_section_features_sub: "Enable or disable modules",
    settings_section_data: "Data & templates",
    settings_section_data_sub: "Export plan, load samples, reset",
    settings_admin_only: "Admins and super-users only",
    settings_coming_soon: "Coming in the next update.",
    // Branding form fields
    settings_brand_company_label: "Company name",
    settings_brand_company_placeholder: "e.g. Janssen Bakery",
    settings_brand_company_help: "Replaces 'Cleaning plan' at the top of the app.",
    settings_brand_doc_label: "Document code",
    settings_brand_doc_placeholder: "e.g. JB-D-01",
    settings_brand_doc_help: "HACCP reference number shown in the subtitle.",
    settings_brand_subtitle_label: "Subtitle",
    settings_brand_subtitle_placeholder: "e.g. Production cleaning plan",
    settings_brand_subtitle_help: "Shown below the company name.",
    settings_brand_logo_label: "Logo",
    settings_brand_logo_help: "PNG or SVG, max 200KB. Automatically resized to 400px height.",
    settings_brand_logo_dark_label: "Dark-mode logo",
    settings_brand_logo_dark_help: "Optional — for when your logo is dark and unreadable on dark backgrounds.",
    settings_brand_logo_upload: "Choose logo",
    settings_brand_logo_remove: "Remove",
    settings_brand_logo_too_large: "File too large — max 200KB.",
    settings_brand_logo_invalid: "Invalid file. Use PNG, JPG or SVG.",
    settings_brand_color_label: "Accent colour",
    settings_brand_color_help: "Buttons, links and accent elements.",
    settings_brand_color_custom: "Custom",
    settings_brand_save: "Save",
    settings_brand_saved: "Branding saved",
    settings_brand_preview_title: "Preview",
    settings_brand_preview_btn: "Example button",
    settings_brand_preview_link: "Example link",

    // Schedule (work schedule)
    settings_sched_workdays_label: "Work days",
    settings_sched_workdays_help: "Which days is your business active? Click to toggle.",
    settings_sched_shifts_label: "Shift notification times",
    settings_sched_shifts_help: "Times when reminders are sent. Max 4 shifts.",
    settings_sched_shift_add: "+ Add shift",
    settings_sched_shift_remove: "Remove",
    settings_sched_bigday_label: "Deep-cleaning day",
    settings_sched_bigday_help: "Which day do \"Saturday\" tasks belong to? Default Saturday.",
    settings_sched_twice_label: "\"2× per week\" days",
    settings_sched_twice_help: "Which two days hold 2x-per-week tasks? Choose exactly 2.",
    settings_sched_save: "Save schedule",
    settings_sched_saved: "Schedule saved",
    weekday_short_su: "Sun",
    weekday_short_mo: "Mon",
    weekday_short_tu: "Tue",
    weekday_short_we: "Wed",
    weekday_short_th: "Thu",
    weekday_short_fr: "Fri",
    weekday_short_sa: "Sat",
    // Features section fields
    settings_feat_intro: "Enable or disable modules. Changes are local — other team members are not affected.",
    settings_feat_cloudSync_label: "Cloud sync (Firebase)",
    settings_feat_cloudSync_help: "Real-time sync with colleagues. Off = local-only, your work won't be shared.",
    settings_feat_roles_label: "Role system",
    settings_feat_roles_help: "Show admin/super-user permissions. Off = everyone can do anything. Recommended for 1-person businesses.",
    settings_feat_cleaningRound_label: "Cleaning round mode",
    settings_feat_cleaningRound_help: "The '🚀 Start round' button on the Today view. Off = no round mode.",
    settings_feat_notifications_label: "Notifications",
    settings_feat_notifications_help: "Push notifications at shift times and the bell button on top. Off = no alerts.",
    settings_feat_qrCodes_label: "QR codes",
    settings_feat_qrCodes_help: "Print QR codes per room/workplace. Off = no QR tab and no scan functionality.",
    settings_feat_photos_label: "Task photos",
    settings_feat_photos_help: "Reference photos for each task. Off = saves storage; no thumbnails.",
    settings_feat_excelExport_label: "Excel export",
    settings_feat_excelExport_help: "Export tasks/checks to Excel. Off = no export button in sidebar.",
    settings_feat_changelog_label: "Changelog",
    settings_feat_changelog_help: "Change history tab + changelog entries for each edit. Off = simpler interface.",
    settings_feat_assignedUsers_label: "Assigned-to field",
    settings_feat_assignedUsers_help: "Assign tasks to specific users + 'My tasks' filter on Today. Off = team mode.",
    settings_feat_save: "Save",
    settings_feat_saved: "Features updated",
    settings_feat_warning_cloudSync: "⚠ When off, colleagues no longer see your work.",
    settings_feat_warning_changelog: "⚠ Previously created changelog entries remain saved.",
    // Onboarding wizard (non-blocking banner)
    onb_banner_title: "Welcome! Customise your app in 5 steps",
    onb_banner_sub: "One-time only — then never again.",
    onb_dismiss_aria: "Close banner",
    onb_step_label: "Step {n} of 5",
    onb_back: "Back",
    onb_next: "Next",
    onb_finish: "Finish",
    onb_skip: "Skip",
    // Step 1: company
    onb_s1_title: "What's your company name?",
    onb_s1_help: "Appears at the top of the app, replacing 'Cleaning plan'.",
    onb_s1_placeholder: "e.g. Janssen Bakery",
    // Step 2: colour
    onb_s2_title: "Choose an accent colour",
    onb_s2_help: "For buttons, links and accent elements. You can change later.",
    // Step 3: logo
    onb_s3_title: "Add your logo (optional)",
    onb_s3_help: "PNG, JPG or SVG, max 200KB. No logo? Skip this step.",
    // Step 4: schedule
    onb_s4_title: "When is your business open?",
    onb_s4_help: "Affects which tasks appear on which days.",
    onb_s4_workdays: "Work days",
    // Step 5: done
    onb_s5_title: "You're all set! 🎉",
    onb_s5_help: "Visit Settings → Brand identity later for more customisation, like document code, subtitle, dark-mode logo and advanced schedule options.",
    onb_s5_explore: "Explore the app",
    onb_done_toast: "Welcome — your app is personalised!",
    // Data-management section (phase 5)
    settings_data_intro: "Manage your plan data. Export as template to share or backup, load sample data, or start fresh.",
    settings_data_export_title: "📤 Export plan as template",
    settings_data_export_help: "Download your current task list as JSON. Doesn't contain check-data or photos — just the plan structure, to share with other locations or as backup.",
    settings_data_export_btn: "Download template",
    settings_data_export_filename: "cleaning-plan-template",
    settings_data_export_success: "Template exported",
    settings_data_import_title: "📥 Import template",
    settings_data_import_help: "Load a previously downloaded template. Replaces your current task list but preserves check-marks where possible.",
    settings_data_import_btn: "Load template",
    settings_data_import_invalid: "Invalid template file.",
    settings_data_import_success: "Template imported ({n} tasks)",
    settings_data_import_confirm: "Are you sure you want to load this template? Your current task list will be replaced.",
    settings_data_starters_title: "🏭 Sample plans (starter templates)",
    settings_data_starters_help: "Pre-built plans for different industries. Click to load — replaces your current plan.",
    settings_data_starter_bakery: "Bakery",
    settings_data_starter_bakery_sub: "HACCP-compliant, morning + afternoon shift",
    settings_data_starter_restaurant: "Restaurant",
    settings_data_starter_restaurant_sub: "Kitchen, dining, restrooms, prep",
    settings_data_starter_office: "Office",
    settings_data_starter_office_sub: "Desks, meeting rooms, coffee area",
    settings_data_starter_salon: "Hair salon",
    settings_data_starter_salon_sub: "Chair, washbasin, tools, reception",
    settings_data_starter_load: "Load",
    settings_data_starter_loaded: "Sample plan loaded ({n} tasks)",
    settings_data_starter_confirm: "Load this sample plan? Your current tasks will be replaced.",
    settings_data_reset_title: "🗑️ Reset plan",
    settings_data_reset_help: "Erase ALL tasks, check-marks, photos and pending changes. Brand identity and schedule are kept. Cannot be undone!",
    settings_data_reset_btn: "Reset entire plan",
    settings_data_reset_confirm1: "Are you sure? This wipes all tasks and check-marks.",
    settings_data_reset_confirm2: "Really sure? This CANNOT be undone.",
    settings_data_reset_success: "Plan reset",
    // Custom soiling types
    settings_data_soiling_title: "🦠 Soiling types",
    settings_data_soiling_help: "Customise the list for your industry. Bakery: grease, flour, meat juice. Office: dust, coffee. Hair salon: hair, dye residue.",
    settings_data_soiling_add: "+ Add type",
    settings_data_soiling_placeholder: "e.g. hair",
    settings_data_soiling_save: "Save",
    settings_data_soiling_saved: "Soiling types updated",
    // Custom PPE emojis
    settings_data_ppe_title: "🧤 PPE items",
    settings_data_ppe_help: "Personal protective equipment shown on tasks. Add your own emoji + label.",
    settings_data_ppe_add: "+ Add PPE",
    settings_data_ppe_placeholder_emoji: "🧤",
    settings_data_ppe_placeholder_label: "Gloves",
    settings_data_ppe_save: "Save",
    settings_data_ppe_saved: "PPE items updated",
    // Rooms management
    settings_data_rooms_title: "🏠 Manage rooms",
    settings_data_rooms_help: "Edit the rooms/locations in your plan. Add icon and colour per room for visual recognition.",
    settings_data_rooms_add: "+ Add room",
    settings_data_rooms_name: "Name",
    settings_data_rooms_icon: "Icon",
    settings_data_rooms_color: "Colour",
    settings_data_rooms_remove: "Remove",
    settings_data_rooms_save: "Save",
    settings_data_rooms_saved: "Rooms updated",
    settings_data_rooms_in_use: "This room is used by {n} tasks — move those tasks first.",

    // ===== Completion list (Coordinator tool) =====
    afw_open_btn: "✏️ Completion list",
    afw_open_btn_count: "✏️ Completion list ({n})",
    afw_modal_title: "Completion list — incomplete tasks",
    afw_modal_sub: "Fill in missing fields. Changes go to the pending list and need to be committed later via 'Update'.",
    afw_progress: "Task {cur} of {total}",
    afw_no_incompletes_title: "🎉 No incomplete tasks",
    afw_no_incompletes_sub: "All tasks have when, method and agent filled in (or are marked N/A).",
    afw_field_wanneer: "When",
    afw_field_methode: "Method",
    afw_field_middel: "Agent",
    afw_missing_label: "missing",
    afw_nvt_label: "N/A",
    afw_show_all_btn: "Show all fields",
    afw_show_compact_btn: "Show only missing",
    afw_btn_save: "💾 Save & next",
    afw_btn_save_only: "💾 Save",
    afw_btn_skip: "↷ Skip",
    afw_btn_nvt: "🚫 Mark N/A",
    afw_btn_close: "Close",
    afw_btn_finish: "Done",
    afw_saved_toast: "Change saved — pending",
    afw_nvt_toast: "Field marked N/A",
    afw_nvt_unmark_btn: "Remove N/A mark",
    afw_extern_hint: "External firm brings its own agent — consider marking this field as N/A.",
    afw_finished_title: "🎉 Completion list done",
    afw_finished_sub: "{saved} tasks saved, {nvt} N/A marks, {skipped} skipped. Don't forget to click <strong>⟳ Update</strong> to commit the changes to the changelog.",
    afw_task_context: "Area: {ruimte} · Component: {onderdeel}",

    // ===== Cleaning round mode (POINT 6) =====
    round_title: "Cleaning round",
    round_progress: "{cur} of {total}",
    round_btn_prev: "◀ Previous",
    round_btn_next: "Next ▶",
    round_btn_check: "✓ Done",
    round_btn_uncheck: "✓ Done (undo check)",
    round_btn_skip: "↷ Skip",
    round_btn_close: "Pause",
    round_btn_finish: "Finish round",
    round_finished_title: "🎉 Round complete",
    round_finished_sub: "{done} of {total} tasks checked in this round.",
    round_finished_close: "Close",
    round_no_tasks: "No tasks available for a round.",
    round_label_method: "Method",
    round_label_product: "Agent",
    round_label_when: "When",
    round_label_pbm: "PPE",
    round_label_note: "Note",
    round_note_placeholder: "Optional: note for this check…",
    round_resume_banner: "Round paused — {done} of {total} done",
    round_started_at: "Started at {time}",

    // ===== Personal assignment (POINT 10) =====
    assigned_user_label: "Assigned to",
    assigned_user_none: "Anyone",
    assigned_user_me: "Me",
    assigned_user_filter_all: "All tasks",
    assigned_user_filter_mine: "Only my tasks",
    assigned_user_placeholder: "name — empty = anyone",
    optional_hint: "optional",
    notif_enable_btn: "🔔 Enable notifications",
    notif_enabled: "🔔 Notifications on",
    notif_blocked: "🔕 Notifications blocked",
    notif_shift_morning: "Morning shift — {n} tasks open",
    notif_shift_afternoon: "Afternoon shift — {n} tasks open",
    notif_test_title: "Test notification",
    notif_test_body: "Notifications are working. You'll get reminders at shift moments.",

    period_info_today: "Today",
    period_info_week: "Week",
    period_info_month: "This month",
    period_info_year: "This year",
    period_auto_reset: "Checks auto-reset per period — previous periods are kept in history",
    view_period: "View period",
    period_current: "current",
    week_label: "Week",
    month_names_short: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    historical_banner_title: "You are viewing a previous period",
    historical_banner_body: "Checks are read-only. Export will include this period's check data.",
    historical_readonly: "Previous periods are read-only. Return to the current period to check items.",
    correction_banner_title: "Correction mode — previous period",
    correction_banner_body: "As super-user you can fill in forgotten check-marks. Changes are logged as corrections.",
    future_banner_title: "You are viewing a future period",
    future_banner_body: "This period hasn't started yet. Read-only — checks become available when the period begins.",
    period_future: "future",
    freq_day: "day",
    freq_week: "week",
    return_current: "Back to current period",
    new_period_notice: "New {freq} started. Previous period is saved — use the 'View period' selector to review or export.",
    no_msds: "No MSDS available",
    msds_description: "Description",
    msds_usage: "Application",
    msds_concentration: "Concentration",
    msds_measurement: "Measurement type",
    msds_remarks: "Remarks / Warnings",
    msds_classification: "Hazard class",
    msds_general_note: "Summary based on the working document. Use the link above for the official supplier safety data sheet.",
    msds_ppe_warning: "PPE required: gloves, safety glasses. Consult specific MSDS for additional protection measures.",
    changelog_title: "Version Control / Changelog",
    changelog_add_title: "Add a change",
    changelog_version: "Version (e.g. v11)",
    changelog_date: "Date",
    changelog_description: "Description of the change",
    changelog_add_btn: "+ Add",
    changelog_delete: "Delete",
    changelog_delete_confirm: "Delete this version entry?",
    changelog_add_success: "Change added to version history",
    export_success: "Excel file exported",
    import_success: "Plan imported: {n} tasks. You are now viewing the new plan.",
    import_error: "Import error",
    import_error_no_tasks: "No tasks found in this file. Check that it has the same layout as the original.",
    plan_rename: "Rename plan",
    plan_rename_prompt: "New name for this plan:",
    plan_renamed: "Plan renamed",
    plan_delete: "Delete plan",
    plan_delete_confirm: "Are you sure you want to delete \"{n}\"? All edits and checks in this plan will be lost.",
    plan_deleted: "Plan deleted",
    export_error: "Error exporting",
    empty: "No tasks found with these filters",
    total_tasks: "tasks",
    done: "done",
    reset_all: "Reset all",
    reset_confirm: "Reset all checks for the current period in this tab?",
    reset_done: "Checks have been reset",
    reset_modal_title: "Are you sure you want to reset everything?",
    reset_modal_subtitle: "This action cannot be undone",
    reset_warning_title: "You are about to erase checks",
    reset_warning_body: "All checked tasks for the period shown below will be deleted. This data cannot be recovered.",
    reset_info_tab: "Tab",
    reset_info_period: "Period",
    reset_info_tasks: "Tasks with checks",
    reset_info_checks: "Total checks",
    reset_confirm_btn: "Yes, reset everything",
    reset_final_warning: "This only erases checks for this tab and period — not other tabs or future periods.",
    reset_nothing_to_reset: "There are no checks to reset in this period",
    no_product: "no product",
    // Add task
    add_task_btn: "New task",
    add_task_title: "Add new cleaning task",
    add_task_subtitle: "Fill in the fields to add a new task to the cleaning plan",
    form_ruimte: "Area",
    form_werkplek: "Workplace",
    form_onderdeel: "Component",
    form_subcat: "Task / description",
    form_onderdeel_en: "Component (EN)",
    form_subcat_en: "Task / description (EN)",
    form_optional_hint: "optional",
    form_uitvoerend: "Performed by",
    form_vervuiling: "Type of soiling",
    form_wanneer: "When",
    form_freq: "Frequency",
    form_methode: "Method",
    form_middel: "Agent / tool",
    form_hint_methode: "From Methodieken tab",
    form_hint_middel: "From Middelen tab. Leave empty if not applicable.",
    form_scores: "Risk scores (optional)",
    form_hint_scores: "Soiling × Zone × Distance to product. All three required for automatic calculation.",
    score_v: "Soiling",
    score_z: "Zone",
    score_a: "Distance",
    score_v_full: "Soiling score",
    score_z_full: "Zone score",
    score_a_full: "Distance to product",
    score_tooltip: "Risk score: Soiling × Zone × Distance to product",
    score_total_label: "Score",
    score_legacy_marker: "existing",
    score_levels: {
      vscore: [
        { v: 1, label: "1 — Minimal — dry dust, no contamination risk" },
        { v: 2, label: "2 — Light — dust/scale, low microbiological pressure" },
        { v: 3, label: "3 — Moderate — grease/residue, risk of cross-contamination" },
        { v: 4, label: "4 — Heavy — baked-on organic material, high microbiological pressure" },
        { v: 5, label: "5 — Critical — direct product contact, HACCP control point (CCP)" }
      ],
      zscore: [
        { v: 1, label: "Zone 1 — Non-production areas (minimal risk)" },
        { v: 2, label: "Zone 2 — Traffic zones/changing rooms (low risk)" },
        { v: 3, label: "Zone 3 — Production area/floor (medium risk)" },
        { v: 4, label: "Zone 4 — Immediate environment (high risk)" },
        { v: 5, label: "Zone 5 — Product contact surfaces (highest risk)" }
      ],
      afstand: [
        { v: 1, label: "1 — No product contact (floor, ceiling, exterior wall)" },
        { v: 2, label: "2 — Near product (machine surroundings, production room walls)" },
        { v: 3, label: "3 — Direct product contact (worktop, machine part, conveyor belt)" }
      ]
    },
    score_level_empty: "— choose level —",
    info_btn_tooltip: "Show explanation of risk scores",
    info_v_text: "how quickly the component gets soiled (higher = gets dirty faster)",
    info_z_text: "area type / hygiene class (see options in dropdown)",
    info_a_text: "distance to the product (higher = closer to product)",
    info_formula: "Together these determine the risk score: S × Z × D. The higher the score, the more important the task.",
    update_author_label: "Committed by",
    update_author_placeholder: "Enter your name...",
    update_author_required: "Please enter who is committing the changes",
    form_btn_save: "Save task",
    form_btn_cancel: "Cancel",
    form_placeholder_vervuiling: "e.g. dust, deposits, grease",
    form_placeholder_wanneer: "e.g. During production, 1x per day",
    form_middel_none: "— none —",
    form_required_error: "Please fill the required fields (area, component, task, method)",
    form_save_success: "New task added",
    delete_task_confirm: "Permanently delete this task?",
    bulk_selected_one: "task selected",
    bulk_selected_many: "tasks selected",
    bulk_select_all: "Select / deselect all visible tasks",
    bulk_select_row: "Select this task",
    bulk_deselect_all: "Deselect",
    bulk_delete_button: "Delete selected",
    bulk_delete_title: "⚠ Delete selected tasks?",
    bulk_delete_subtitle: "{n} tasks will be marked for deletion",
    bulk_delete_warning_title: "Warning",
    bulk_delete_warning_body: "These tasks will be removed from the cleaning plan and marked as deleted. The change appears in the pending list and will be recorded in the changelog when you click 'Commit'. You can undo this via 'Discard' in the Update modal before committing.",
    bulk_and_n_more: "... and {n} more tasks",
    bulk_delete_success: "{n} tasks deleted — commit via the ⟳ Update button to record in the changelog",
    help_btn: "Help",
    help_btn_title: "How does this cleaning plan work?",
    help_close: "Close",
    backup_btn: "Backup",
    backup_btn_title: "Create a full backup of all data",
    backup_success: "Backup saved — keep the file in a safe place",
    restore_btn: "Restore",
    restore_btn_title: "Restore an earlier backup from file",
    restore_invalid_format: "This is not a valid backup file",
    restore_empty: "Backup contains no plans",
    restore_confirm: "Warning: restoring will replace all current data ({plans} plan(s) from backup dated {date}). Continue?",
    restore_success: "Backup restored — {n} plan(s) loaded",
    restore_parse_error: "File could not be read — invalid JSON",
    restore_read_error: "Error reading the file",
    overdue_label: "Overdue",
    overdue_tooltip: "This task was not checked off in the previous period",
    overdue_count_one: "overdue task",
    overdue_count_many: "overdue tasks",
    only_overdue: "Only overdue",
    overdue_overview_btn: "Overdue",
    overdue_overview_tooltip: "View all overdue tasks",
    overdue_overview_title: "Overdue tasks",
    overdue_overview_empty: "No overdue tasks — you're all caught up.",
    overdue_overview_goto: "Go to →",
    overdue_overview_close: "Close",
    dashboard_title: "Dashboard",
    dashboard_subtitle: "Live overview of the current period",
    dashboard_compliance: "Overall progress",
    dashboard_tasks_done: "tasks completed",
    dashboard_overdue: "Overdue",
    dashboard_view_overdue: "View overdue →",
    dashboard_risk: "Risk distribution",
    dashboard_risk_low: "Low",
    dashboard_risk_mid: "Medium",
    dashboard_risk_high: "High",
    dashboard_per_freq: "Progress per frequency",
    dashboard_freq_col: "Frequency",
    dashboard_done_col: "Done",
    dashboard_total_col: "Total",
    dashboard_progress_col: "Progress",
    dashboard_top_skipped: "Most skipped tasks (last 4 weeks)",
    dashboard_periods_skipped: "periods missed",
    dashboard_no_skipped: "No regularly-skipped tasks — great work!",
    dashboard_per_performer: "Tasks per performer",
    dashboard_performer_col: "Performer",
    dashboard_tasks_col: "Tasks",
    dashboard_btn: "Dashboard",
    products_btn: "Products",
    products_title: "Cleaning agents overview",
    products_subtitle: "All cleaning agents with their MSDS information.",
    products_view_msds: "View MSDS",
    products_open_msds: "Info / MSDS",
    products_msds_uploaded: "MSDS available",
    products_empty: "No cleaning agents found.",
    hero_all_done_title: "All done! 🎉",
    hero_all_done_sub: "All {count} tasks for {period} are checked off. Great work.",
    hero_period_today: "today",
    hero_period_this_week: "this week",
    hero_period_this_month: "this month",
    hero_period_this_quarter: "this quarter",
    hero_period_this_year: "this year",
    hero_period_this_period: "this period",
    empty_filter_title: "No tasks found",
    empty_filter_sub: "Try adjusting your filter or searching for other terms.",
    empty_filter_clear: "Clear filter",
    empty_no_tasks_title: "Nothing scheduled",
    empty_no_tasks_sub: "There are no tasks for this frequency.",
    dashboard_dept_distribution: "Distribution by department",
    dashboard_total_tasks: "tasks",
    dashboard_spark_label: "Completion last 14 days",
    dashboard_no_data: "No data",
    user_anon_label: "Anonymous",
    user_btn_title_set: "Logged in as {name} — click to switch",
    user_btn_title_unset: "Who are you? Click to set your name",
    user_modal_title: "Who are you?",
    user_modal_subtitle: "Your name is recorded with every check-off, for audit accountability",
    user_name_label: "Your name",
    user_name_placeholder: "e.g. Anna",
    user_existing_label: "Previously used",
    user_anon_btn: "Continue anonymously",
    user_save_btn: "Save",
    user_set_success: "Welcome {name} — check-offs will now be recorded under your name",
    user_anon_set: "Continuing anonymously — check-offs will not be linked to a name",
    checked_by_at: "Checked by {by} on {at}",
    checked_at: "Checked on {at}",
    correction_tooltip: "Corrected after the fact by {by} on {at}",
    image_label: "Image",
    image_label_hint: "optional — admins/superusers",
    image_pick: "📷 Pick image",
    image_clear: "🗑 Remove",
    image_none: "No image",
    image_pending_upload: "Will upload on save",
    image_uploading: "Uploading image...",
    image_upload_failed: "Upload failed — try a smaller or different image",
    image_not_an_image: "This file is not an image",
    image_view_tooltip: "View image",
    note_add_tooltip: "Add remark",
    note_edit_tooltip: "View / edit remark",
    note_modal_title: "Remark on check-off",
    note_modal_label: "Remark (optional)",
    note_modal_placeholder: "e.g. Machine was partly out of production, only exterior cleaned.",
    note_modal_cancel: "Cancel",
    note_modal_save: "💾 Save",
    note_modal_clear: "🗑 Remove remark",
    note_saved: "Remark saved",
    note_cleared: "Remark removed",
    image_close: "Close",
    image_esc_hint: "Press Esc to close",
    image_goto_btn: "Go to task",
    image_goto_tooltip: "Jump to this task in the list",
    image_load_failed: "Image could not be loaded",
    image_delete_btn: "Remove",
    image_delete_tooltip: "Remove image (admin)",
    image_delete_confirm: "Remove this image? This cannot be undone.",
    image_deleted: "Image removed",
    qr_btn: "QR codes",
    qr_btn_title: "Generate QR codes per area for on-site scanning",
    qr_modal_title: "QR codes per area",
    qr_modal_subtitle: "Print and post on-site — scanning opens the filtered view directly",
    qr_generate_for: "Generate for",
    qr_per_area: "Per area",
    qr_per_workplace: "Per workplace",
    qr_print: "Print",
    qr_task_one: "task",
    qr_task_many: "tasks",
    qr_no_data: "No areas or workplaces found to generate QR codes for.",
    qr_lib_missing: "QR library not loaded — check your internet connection.",
    qr_print_blocked: "Print window was blocked. Allow pop-ups and try again.",
    qr_print_subtitle: "Scan these codes with a phone camera to open the filtered view for that location directly.",
    role_denied_not_superuser: "Only the super-user can change roles.",
    role_cannot_demote_self: "You cannot change your own role.",
    role_invalid: "Invalid role — only 'user' or 'admin' is allowed.",
    role_changed: "Role changed — the change is now active.",
    role_change_failed: "Failed to change role — check your permissions.",
    role_denied_admin_required: "Only admins and super-users can do this.",
    changelog_readonly_notice: "You are viewing the changelog in read-only mode. Only admins and super-users can record changes.",
    sidebar_title: "Menu",
    sidebar_role_local: "Local",
    sidebar_role_user: "User",
    sidebar_role_admin: "Admin",
    sidebar_role_superuser: "Super-user",
    sidebar_section_navigate: "Navigation",
    sidebar_section_tools: "Tools",
    sidebar_section_admin: "Admin",
    sidebar_section_su: "Super-user",
    sidebar_section_account: "Account",
    sidebar_section_app: "App",
    pwa_install_btn: "Install app",
    pwa_install_unavailable: "App is already installed or not supported",
    sidebar_change_name: "Change name",
    sidebar_import: "Import plan",
    sidebar_manage_users: "Manage accounts",
    sidebar_sign_out: "Sign out",
    cloud_connected_badge: "Cloud connected",
    cloud_local_badge: "Local mode",
    edit_mode_unlocked_btn: "Unlock editing",
    edit_mode_locked_btn: "Lock editing",
    export_excel: "Export Excel",
    msds_file_title: "MSDS / Safety Data Sheet",
    msds_uploaded_by: "by",
    msds_open_link: "Open MSDS",
    msds_link_add: "Add MSDS link",
    msds_link_save: "Save",
    msds_link_saved: "MSDS link saved",
    msds_link_save_failed: "Save failed — check your permissions",
    msds_link_deleted: "MSDS link removed",
    msds_link_delete_confirm: "Are you sure you want to remove this MSDS link?",
    msds_link_empty: "Please enter a URL.",
    msds_link_invalid: "Invalid URL — check that the link is correct.",
    msds_link_placeholder: "https://supplier.com/msds/product.pdf",
    msds_link_none: "No MSDS link available for this product yet.",
    msds_link_none_admin: "Add the link to the supplier's safety data sheet:",
    delete_task_success: "Task deleted",
    delete_task_tooltip: "Delete task",
    custom_label: "Custom",
    // Edit task
    edit_task_tooltip: "Edit task (password required)",
    edit_task_title: "Edit task",
    edit_task_subtitle: "Adjust the fields to modify the task",
    edit_btn_save: "Save changes",
    edit_password_prompt: "Enter the password to edit tasks:",
    edit_password_wrong: "Incorrect password",
    edit_password_ok: "Editing unlocked — edit buttons are now visible",
    edit_save_success: "Task updated",
    edit_mode_locked_btn: "Edit",
    edit_mode_unlocked_btn: "Turn off editing",
    edit_mode_locked_title: "Click to unlock editing (password required)",
    edit_mode_unlocked_title: "Click to turn editing off again",
    edit_mode_locked: "Editing turned off",
    edit_mode_active_banner: "✏️ Edit mode active — you can edit, add or remove tasks",
    edit_mode_active_close: "Turn off editing",
    password_modal_title: "Unlock editing",
    password_modal_subtitle: "Enter the password to be able to edit tasks",
    password_modal_label: "Password",
    password_modal_submit: "Unlock",
    password_modal_empty: "Please enter a password",
    auth_enter_email_first: "Please enter your email first.",
    auth_invalid_email: "Please enter a valid email address.",
    auth_reset_sent_title: "Email sent!",
    auth_reset_sent_body: "We've sent a password reset link to:",
    auth_reset_hint: "Didn't receive it? Check your spam folder or try again in a few minutes.",
    auth_reset_back: "Back to login",
    onboard_welcome_title: "Welcome to the cleaning plan! 👋",
    onboard_welcome_body: "A short tour to get you started. Click 'Next' to begin or 'Skip' to dive right in.",
    onboard_tabs_title: "Frequency tabs",
    onboard_tabs_body: "Switch between daily, weekly, monthly etc. tasks here. The number shows your progress.",
    onboard_check_title: "Checking off tasks",
    onboard_check_body: "Click the boxes on the right of each row to check off a task. It's saved automatically and shared with your team.",
    onboard_menu_title: "The menu",
    onboard_menu_body: "The three dots top-right give you access to Help, Dashboard, Changelog, QR codes and more.",
    onboard_admin_title: "Editing as admin",
    onboard_admin_body: "As admin you can enable edit mode via the menu. Then you can edit, add or remove tasks. Don't forget to commit changes via Changelog.",
    onboard_su_title: "Manage accounts",
    onboard_su_body: "As super-user you can assign roles to other users via 'Manage accounts'. Give admins the right permissions, keep users on read-only.",
    onboard_skip: "Skip",
    onboard_next: "Next",
    onboard_finish: "Get started",
    pbm_gloves: "Gloves required",
    pbm_goggles: "Safety glasses recommended",
    pbm_mask: "Dust mask / face mask recommended",
    edit_locked_hint: "Unlock editing first via the button at the top right",
    edited_label: "Edited",
    edited_tooltip: "This task has been modified from the original cleaning plan",
    // Update / changelog auto-commit
    update_btn: "Update",
    update_btn_title_empty: "No changes to commit",
    update_btn_title_has: "{n} change(s) ready to commit to the changelog",
    update_modal_title: "Commit changes to Changelog",
    update_modal_subtitle: "Review the changes and add them to the changelog",
    update_commit_btn: "Commit to changelog",
    update_no_changes_title: "No changes to commit",
    update_no_changes_hint: "Add, edit or delete tasks; they'll appear here ready to commit.",
    update_summary_one: "1 change ready to commit",
    update_summary_many: "{n} changes ready to commit",
    update_note_label: "Additional note (optional)",
    update_note_placeholder: "E.g. reason for the change, approval date, responsible person...",
    update_success: "Changes added to Changelog",
    update_version_required: "Version number is required",
    update_no_field_changes: "No field-level changes detected",
    update_pending_one: "change waiting to be committed",
    update_pending_many: "changes waiting to be committed",
    update_open_btn: "Commit now",
    update_cancel_warning_one: "You have 1 change that hasn't been committed yet. What do you want to do?",
    update_cancel_warning_many: "You have {n} changes that haven't been committed yet. What do you want to do?",
    update_discard_btn: "Discard",
    update_keep_btn: "Keep",
    update_discard_success: "Changes discarded",
    update_keep_success: "Changes kept — you can continue editing",
    change_type_add: "Added",
    change_type_edit: "Edited",
    change_type_delete: "Deleted",
    auto_label: "Auto"
  },
  pl: {
    app_title: "Plan sprzątania",
    app_subtitle: "GTE-D-09-99 · wersja {v}",
    export: "⬇ Eksportuj Excel",
    lang_btn: "🌐 NL",
    tabs: {
      today: "Dziś",
      coordinator: "Koordynator",
      all: "Wszystkie",
      daily: "Codziennie", weekly: "Co tydzień", monthly: "Co miesiąc",
      bimonthly: "Co 2 miesiące", quarterly: "Co kwartał",
      semiannual: "Co pół roku", annual: "Co rok",
      changelog: "📋 Historia zmian",
      changelog_label: "Historia zmian"
    },
    headers: {
      row: "Wiersz", area: "Pomieszczenie", werkplek: "Stanowisko", onderdeel: "Element",
      task: "Zadanie / opis", performer: "Wykonuje", vervuiling: "Rodzaj zabrudzenia",
      method: "Metoda", product: "Środek", when: "Kiedy", score: "Ocena",
      location: "Lokalizacja", frequency: "Częstotliwość"
    },
    shifts: { morning: "Rano", afternoon: "Popołudnie", night: "Noc" },
    days: ["Nie", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"],
    months: ["Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"],
    quarters: ["Q1 (sty-mar)", "Q2 (kwi-cze)", "Q3 (lip-wrz)", "Q4 (paź-gru)"],
    halves: ["H1 (sty-cze)", "H2 (lip-gru)"],
    bimonths: ["sty-lut", "mar-kwi", "maj-cze", "lip-sie", "wrz-paź", "lis-gru"],
    filter_area: "Pomieszczenie:", filter_performer: "Wykonuje:", filter_search: "Szukaj:",
    sort_label: "Sortuj:",
    sort_default: "Domyślnie",
    sort_area: "Pomieszczenie (A-Z)",
    sort_soiling: "Ocena ryzyka ↓",
    filter_btn: "Filtr",
    filter_toggle_tooltip: "Otwórz / zamknij filtry",
    filter_all: "Wszystkie",
    dept_facilitair: "Utrzymanie",
    dept_operator: "Operator",
    dept_overig: "Inne",
    undo_label: "Cofnij",
    undo_restored: "Przywrócono",
    sync_done: "Zaktualizowano z chmury",
    sync_failed: "Aktualizacja nieudana — sprawdź połączenie",
    sync_local_only: "Widok lokalny odświeżony",
    print_btn: "Drukuj",
    print_tooltip: "Wydrukuj bieżący okres",
    print_title: "Plan sprzątania",
    print_period: "Okres",
    print_date: "Wydrukowano",
    print_task: "Zadanie",
    print_method: "Metoda",
    print_product: "Środek",
    print_when: "Kiedy",
    print_signature: "Podpis",
    print_no_tasks: "Brak zadań w tym okresie do wydruku.",

    // ===== Today view (POINT 1) =====
    today_header_title: "Dziś, {date}",
    today_header_count_one: "{n} zadanie otwarte",
    today_header_count_many: "{n} zadań otwartych",
    today_header_count_zero: "wszystko gotowe",
    today_begin_round_btn: "🚀 Rozpocznij obchód",
    today_resume_round_btn: "▶ Wznów obchód ({done}/{total})",
    today_new_round_btn: "🆕 Nowy obchód",
    today_my_tasks_filter: "Tylko moje zadania",
    today_my_tasks_filter_off: "Wszystkie zadania",
    today_all_done_title: "🎉 Wszystko gotowe!",
    today_all_done_sub: "Brak zadań na dziś.",
    today_group_none: "Brak pory",
    today_overdue_pill: "Zaległe",
    today_due_pill: "Dziś",
    today_section_count_one: "{n} zadanie",
    today_section_count_many: "{n} zadań",
    today_freq_label_daily: "codziennie",
    today_freq_label_weekly: "co tydzień",
    today_freq_label_monthly: "co miesiąc",
    today_freq_label_bimonthly: "co 2 mies.",
    today_freq_label_quarterly: "co kwartał",
    today_freq_label_semiannual: "co pół roku",
    today_freq_label_annual: "co rok",

    // ===== Coordinator overview (admin/superuser) =====
    coord_header_title: "Przegląd koordynatora",
    coord_header_sub: "Pełny widok tabeli wg częstotliwości — do planowania i nadzoru",
    coord_subtab_aria: "Karty częstotliwości",

    // ===== Settings (Etsy customisation) =====
    settings_tab_label: "Ustawienia",
    settings_title: "Ustawienia",
    settings_subtitle: "Dostosuj aplikację do swojej firmy",
    settings_section_branding: "Tożsamość firmy",
    settings_section_branding_sub: "Nazwa firmy, logo i kolor akcentu",
    settings_section_schedule: "Harmonogram pracy",
    settings_section_schedule_sub: "Dni robocze, zmiany i zadania na konkretne dni",
    settings_section_features: "Funkcje",
    settings_section_features_sub: "Włącz lub wyłącz moduły",
    settings_section_data: "Dane i szablony",
    settings_section_data_sub: "Eksport planu, wczytanie przykładów, reset",
    settings_admin_only: "Tylko dla administratorów i super-użytkowników",
    settings_coming_soon: "Pojawi się w następnej aktualizacji.",
    // Branding form fields
    settings_brand_company_label: "Nazwa firmy",
    settings_brand_company_placeholder: "np. Piekarnia Janssen",
    settings_brand_company_help: "Zastępuje 'Plan sprzątania' u góry aplikacji.",
    settings_brand_doc_label: "Kod dokumentu",
    settings_brand_doc_placeholder: "np. JB-D-01",
    settings_brand_doc_help: "Numer referencyjny HACCP w podtytule.",
    settings_brand_subtitle_label: "Podtytuł",
    settings_brand_subtitle_placeholder: "np. Plan sprzątania produkcji",
    settings_brand_subtitle_help: "Wyświetlany pod nazwą firmy.",
    settings_brand_logo_label: "Logo",
    settings_brand_logo_help: "PNG lub SVG, maks. 200KB. Automatycznie skalowane do 400px wysokości.",
    settings_brand_logo_dark_label: "Logo dla trybu ciemnego",
    settings_brand_logo_dark_help: "Opcjonalnie — gdy logo jest ciemne i nieczytelne na ciemnym tle.",
    settings_brand_logo_upload: "Wybierz logo",
    settings_brand_logo_remove: "Usuń",
    settings_brand_logo_too_large: "Plik za duży — maks. 200KB.",
    settings_brand_logo_invalid: "Nieprawidłowy plik. Użyj PNG, JPG lub SVG.",
    settings_brand_color_label: "Kolor akcentu",
    settings_brand_color_help: "Przyciski, linki i elementy akcentu.",
    settings_brand_color_custom: "Własny",
    settings_brand_save: "Zapisz",
    settings_brand_saved: "Zapisano markę",
    settings_brand_preview_title: "Podgląd",
    settings_brand_preview_btn: "Przykładowy przycisk",
    settings_brand_preview_link: "Przykładowy link",

    // Schedule (work schedule)
    settings_sched_workdays_label: "Dni robocze",
    settings_sched_workdays_help: "W które dni firma działa? Kliknij, aby przełączyć.",
    settings_sched_shifts_label: "Godziny powiadomień o zmianach",
    settings_sched_shifts_help: "Godziny wysyłania przypomnień. Maks. 4 zmiany.",
    settings_sched_shift_add: "+ Dodaj zmianę",
    settings_sched_shift_remove: "Usuń",
    settings_sched_bigday_label: "Dzień gruntownego sprzątania",
    settings_sched_bigday_help: "Do którego dnia należą zadania \"sobotnie\"? Domyślnie sobota.",
    settings_sched_twice_label: "Dni \"2× w tygodniu\"",
    settings_sched_twice_help: "Które dwa dni zawierają zadania 2× w tygodniu? Wybierz dokładnie 2.",
    settings_sched_save: "Zapisz harmonogram",
    settings_sched_saved: "Zapisano harmonogram",
    weekday_short_su: "Nie",
    weekday_short_mo: "Pon",
    weekday_short_tu: "Wt",
    weekday_short_we: "Śr",
    weekday_short_th: "Czw",
    weekday_short_fr: "Pt",
    weekday_short_sa: "Sob",
    // Features section fields
    settings_feat_intro: "Włącz lub wyłącz moduły. Zmiany są lokalne — nie wpływają na innych członków zespołu.",
    settings_feat_cloudSync_label: "Synchronizacja w chmurze (Firebase)",
    settings_feat_cloudSync_help: "Synchronizacja na żywo z kolegami. Wył. = tylko lokalnie, Twoja praca nie będzie udostępniana.",
    settings_feat_roles_label: "System ról",
    settings_feat_roles_help: "Pokaż uprawnienia administratora/super-użytkownika. Wył. = każdy może wszystko. Zalecane dla firm jednoosobowych.",
    settings_feat_cleaningRound_label: "Tryb obchodu sprzątania",
    settings_feat_cleaningRound_help: "Przycisk '🚀 Rozpocznij obchód' w widoku Dziś. Wył. = brak trybu obchodu.",
    settings_feat_notifications_label: "Powiadomienia",
    settings_feat_notifications_help: "Powiadomienia push o godzinach zmian i przycisk dzwonka u góry. Wył. = brak alertów.",
    settings_feat_qrCodes_label: "Kody QR",
    settings_feat_qrCodes_help: "Drukuj kody QR na pomieszczenie/stanowisko. Wył. = brak karty QR i skanowania.",
    settings_feat_photos_label: "Zdjęcia zadań",
    settings_feat_photos_help: "Zdjęcia referencyjne dla każdego zadania. Wył. = oszczędza miejsce; brak miniatur.",
    settings_feat_excelExport_label: "Eksport Excel",
    settings_feat_excelExport_help: "Eksportuj zadania/odhaczenia do Excela. Wył. = brak przycisku eksportu na pasku bocznym.",
    settings_feat_changelog_label: "Historia zmian",
    settings_feat_changelog_help: "Karta historii zmian + wpisy dla każdej edycji. Wył. = prostszy interfejs.",
    settings_feat_assignedUsers_label: "Pole przypisania",
    settings_feat_assignedUsers_help: "Przypisuj zadania konkretnym użytkownikom + filtr 'Moje zadania' w widoku Dziś. Wył. = tryb zespołowy.",
    settings_feat_save: "Zapisz",
    settings_feat_saved: "Zaktualizowano funkcje",
    settings_feat_warning_cloudSync: "⚠ Po wyłączeniu koledzy nie widzą już Twojej pracy.",
    settings_feat_warning_changelog: "⚠ Wcześniej utworzone wpisy historii zmian pozostają zapisane.",
    // Onboarding wizard (non-blocking banner)
    onb_banner_title: "Witaj! Dostosuj aplikację w 5 krokach",
    onb_banner_sub: "Tylko raz — potem już nigdy.",
    onb_dismiss_aria: "Zamknij baner",
    onb_step_label: "Krok {n} z 5",
    onb_back: "Wstecz",
    onb_next: "Dalej",
    onb_finish: "Zakończ",
    onb_skip: "Pomiń",
    // Step 1: company
    onb_s1_title: "Jak nazywa się Twoja firma?",
    onb_s1_help: "Pojawia się u góry aplikacji, zastępując 'Plan sprzątania'.",
    onb_s1_placeholder: "np. Piekarnia Janssen",
    // Step 2: colour
    onb_s2_title: "Wybierz kolor akcentu",
    onb_s2_help: "Dla przycisków, linków i elementów akcentu. Możesz zmienić później.",
    // Step 3: logo
    onb_s3_title: "Dodaj swoje logo (opcjonalnie)",
    onb_s3_help: "PNG, JPG lub SVG, maks. 200KB. Brak logo? Pomiń ten krok.",
    // Step 4: schedule
    onb_s4_title: "Kiedy Twoja firma jest otwarta?",
    onb_s4_help: "Wpływa na to, które zadania pojawiają się w które dni.",
    onb_s4_workdays: "Dni robocze",
    // Step 5: done
    onb_s5_title: "Wszystko gotowe! 🎉",
    onb_s5_help: "Odwiedź później Ustawienia → Tożsamość firmy, aby dostosować więcej: kod dokumentu, podtytuł, logo trybu ciemnego i zaawansowane opcje harmonogramu.",
    onb_s5_explore: "Poznaj aplikację",
    onb_done_toast: "Witamy — aplikacja została spersonalizowana!",
    // Data-management section (phase 5)
    settings_data_intro: "Zarządzaj danymi planu. Eksportuj jako szablon do udostępnienia lub kopii zapasowej, wczytaj dane przykładowe lub zacznij od nowa.",
    settings_data_export_title: "📤 Eksportuj plan jako szablon",
    settings_data_export_help: "Pobierz bieżącą listę zadań jako JSON. Nie zawiera danych odhaczeń ani zdjęć — tylko strukturę planu, do udostępnienia innym lokalizacjom lub jako kopia zapasowa.",
    settings_data_export_btn: "Pobierz szablon",
    settings_data_export_filename: "szablon-planu-sprzatania",
    settings_data_export_success: "Wyeksportowano szablon",
    settings_data_import_title: "📥 Importuj szablon",
    settings_data_import_help: "Wczytaj wcześniej pobrany szablon. Zastępuje bieżącą listę zadań, ale zachowuje odhaczenia tam, gdzie to możliwe.",
    settings_data_import_btn: "Wczytaj szablon",
    settings_data_import_invalid: "Nieprawidłowy plik szablonu.",
    settings_data_import_success: "Zaimportowano szablon ({n} zadań)",
    settings_data_import_confirm: "Czy na pewno wczytać ten szablon? Bieżąca lista zadań zostanie zastąpiona.",
    settings_data_starters_title: "🏭 Przykładowe plany (szablony startowe)",
    settings_data_starters_help: "Gotowe plany dla różnych branż. Kliknij, aby wczytać — zastępuje bieżący plan.",
    settings_data_starter_bakery: "Piekarnia",
    settings_data_starter_bakery_sub: "Zgodny z HACCP, zmiana ranna + popołudniowa",
    settings_data_starter_restaurant: "Restauracja",
    settings_data_starter_restaurant_sub: "Kuchnia, sala, toalety, przygotowanie",
    settings_data_starter_office: "Biuro",
    settings_data_starter_office_sub: "Biurka, sale konferencyjne, kącik kawowy",
    settings_data_starter_salon: "Salon fryzjerski",
    settings_data_starter_salon_sub: "Fotel, myjnia, narzędzia, recepcja",
    settings_data_starter_load: "Wczytaj",
    settings_data_starter_loaded: "Wczytano przykładowy plan ({n} zadań)",
    settings_data_starter_confirm: "Wczytać ten przykładowy plan? Bieżące zadania zostaną zastąpione.",
    settings_data_reset_title: "🗑️ Resetuj plan",
    settings_data_reset_help: "Usuń WSZYSTKIE zadania, odhaczenia, zdjęcia i oczekujące zmiany. Tożsamość firmy i harmonogram pozostają. Nie można cofnąć!",
    settings_data_reset_btn: "Resetuj cały plan",
    settings_data_reset_confirm1: "Czy na pewno? To usuwa wszystkie zadania i odhaczenia.",
    settings_data_reset_confirm2: "Naprawdę na pewno? Tego NIE można cofnąć.",
    settings_data_reset_success: "Zresetowano plan",
    // Custom soiling types
    settings_data_soiling_title: "🦠 Rodzaje zabrudzeń",
    settings_data_soiling_help: "Dostosuj listę do swojej branży. Piekarnia: tłuszcz, mąka, soki mięsne. Biuro: kurz, kawa. Salon fryzjerski: włosy, resztki farby.",
    settings_data_soiling_add: "+ Dodaj rodzaj",
    settings_data_soiling_placeholder: "np. włosy",
    settings_data_soiling_save: "Zapisz",
    settings_data_soiling_saved: "Zaktualizowano rodzaje zabrudzeń",
    // Custom PPE emojis
    settings_data_ppe_title: "🧤 Środki ochrony (ŚOI)",
    settings_data_ppe_help: "Środki ochrony indywidualnej pokazywane przy zadaniach. Dodaj własne emoji + etykietę.",
    settings_data_ppe_add: "+ Dodaj ŚOI",
    settings_data_ppe_placeholder_emoji: "🧤",
    settings_data_ppe_placeholder_label: "Rękawice",
    settings_data_ppe_save: "Zapisz",
    settings_data_ppe_saved: "Zaktualizowano środki ochrony",
    // Rooms management
    settings_data_rooms_title: "🏠 Zarządzaj pomieszczeniami",
    settings_data_rooms_help: "Edytuj pomieszczenia/lokalizacje w planie. Dodaj ikonę i kolor dla wizualnego rozpoznania.",
    settings_data_rooms_add: "+ Dodaj pomieszczenie",
    settings_data_rooms_name: "Nazwa",
    settings_data_rooms_icon: "Ikona",
    settings_data_rooms_color: "Kolor",
    settings_data_rooms_remove: "Usuń",
    settings_data_rooms_save: "Zapisz",
    settings_data_rooms_saved: "Zaktualizowano pomieszczenia",
    settings_data_rooms_in_use: "To pomieszczenie jest używane przez {n} zadań — najpierw przenieś te zadania.",

    // ===== Completion list (Coordinator tool) =====
    afw_open_btn: "✏️ Lista uzupełnień",
    afw_open_btn_count: "✏️ Lista uzupełnień ({n})",
    afw_modal_title: "Lista uzupełnień — niekompletne zadania",
    afw_modal_sub: "Uzupełnij brakujące pola. Zmiany trafiają do listy oczekujących i należy je później zatwierdzić przez 'Aktualizuj'.",
    afw_progress: "Zadanie {cur} z {total}",
    afw_no_incompletes_title: "🎉 Brak niekompletnych zadań",
    afw_no_incompletes_sub: "Wszystkie zadania mają wypełnione kiedy, metodę i środek (lub są oznaczone jako nie dotyczy).",
    afw_field_wanneer: "Kiedy",
    afw_field_methode: "Metoda",
    afw_field_middel: "Środek",
    afw_missing_label: "brak",
    afw_nvt_label: "n/d",
    afw_show_all_btn: "Pokaż wszystkie pola",
    afw_show_compact_btn: "Pokaż tylko brakujące",
    afw_btn_save: "💾 Zapisz i dalej",
    afw_btn_save_only: "💾 Zapisz",
    afw_btn_skip: "↷ Pomiń",
    afw_btn_nvt: "🚫 Oznacz n/d",
    afw_btn_close: "Zamknij",
    afw_btn_finish: "Gotowe",
    afw_saved_toast: "Zapisano zmianę — oczekuje",
    afw_nvt_toast: "Pole oznaczone jako n/d",
    afw_nvt_unmark_btn: "Usuń oznaczenie n/d",
    afw_extern_hint: "Firma zewnętrzna używa własnego środka — rozważ oznaczenie tego pola jako n/d.",
    afw_finished_title: "🎉 Lista uzupełnień gotowa",
    afw_finished_sub: "{saved} zapisanych zadań, {nvt} oznaczeń n/d, {skipped} pominiętych. Nie zapomnij kliknąć <strong>⟳ Aktualizuj</strong>, aby zapisać zmiany w historii zmian.",
    afw_task_context: "Pomieszczenie: {ruimte} · Element: {onderdeel}",

    // ===== Cleaning round mode (POINT 6) =====
    round_title: "Obchód sprzątania",
    round_progress: "{cur} z {total}",
    round_btn_prev: "◀ Poprzednie",
    round_btn_next: "Następne ▶",
    round_btn_check: "✓ Gotowe",
    round_btn_uncheck: "✓ Gotowe (cofnij)",
    round_btn_skip: "↷ Pomiń",
    round_btn_close: "Wstrzymaj",
    round_btn_finish: "Zakończ obchód",
    round_finished_title: "🎉 Obchód zakończony",
    round_finished_sub: "Odhaczono {done} z {total} zadań w tym obchodzie.",
    round_finished_close: "Zamknij",
    round_no_tasks: "Brak zadań dostępnych do obchodu.",
    round_label_method: "Metoda",
    round_label_product: "Środek",
    round_label_when: "Kiedy",
    round_label_pbm: "ŚOI",
    round_label_note: "Notatka",
    round_note_placeholder: "Opcjonalnie: notatka do tego odhaczenia…",
    round_resume_banner: "Obchód wstrzymany — gotowe {done} z {total}",
    round_started_at: "Rozpoczęto o {time}",

    // ===== Personal assignment (POINT 10) =====
    assigned_user_label: "Przypisane do",
    assigned_user_none: "Każdy",
    assigned_user_me: "Ja",
    assigned_user_filter_all: "Wszystkie zadania",
    assigned_user_filter_mine: "Tylko moje zadania",
    assigned_user_placeholder: "imię — puste = każdy",
    optional_hint: "opcjonalne",
    notif_enable_btn: "🔔 Włącz powiadomienia",
    notif_enabled: "🔔 Powiadomienia wł.",
    notif_blocked: "🔕 Powiadomienia zablokowane",
    notif_shift_morning: "Zmiana ranna — {n} zadań otwartych",
    notif_shift_afternoon: "Zmiana popołudniowa — {n} zadań otwartych",
    notif_test_title: "Powiadomienie testowe",
    notif_test_body: "Powiadomienia działają. Otrzymasz przypomnienia w momentach zmian.",

    period_info_today: "Dziś",
    period_info_week: "Tydzień",
    period_info_month: "Ten miesiąc",
    period_info_year: "Ten rok",
    period_auto_reset: "Odhaczenia są resetowane automatycznie co okres — poprzednie okresy są zachowane w historii",
    view_period: "Pokaż okres",
    period_current: "bieżący",
    week_label: "Tydzień",
    month_names_short: ['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'],
    historical_banner_title: "Przeglądasz poprzedni okres",
    historical_banner_body: "Odhaczenia są tylko do odczytu. Eksport będzie zawierał dane odhaczeń tego okresu.",
    historical_readonly: "Poprzednie okresy są tylko do odczytu. Wróć do bieżącego okresu, aby odhaczać zadania.",
    correction_banner_title: "Tryb korekty — poprzedni okres",
    correction_banner_body: "Jako super-użytkownik możesz uzupełnić zapomniane odhaczenia. Zmiany są rejestrowane jako korekty.",
    future_banner_title: "Przeglądasz przyszły okres",
    future_banner_body: "Ten okres jeszcze się nie rozpoczął. Tylko do odczytu — odhaczanie będzie dostępne po rozpoczęciu okresu.",
    period_future: "przyszły",
    freq_day: "dzień",
    freq_week: "tydzień",
    return_current: "Wróć do bieżącego okresu",
    new_period_notice: "Rozpoczęto nowy okres ({freq}). Poprzedni okres jest zapisany — użyj selektora 'Pokaż okres', aby go przejrzeć lub wyeksportować.",
    no_msds: "Brak dostępnej karty charakterystyki",
    msds_description: "Opis",
    msds_usage: "Zastosowanie",
    msds_concentration: "Stężenie",
    msds_measurement: "Rodzaj pomiaru",
    msds_remarks: "Uwagi / Ostrzeżenia",
    msds_classification: "Klasa zagrożenia",
    msds_general_note: "Podsumowanie na podstawie dokumentu roboczego. Użyj linku powyżej, aby uzyskać oficjalną kartę charakterystyki dostawcy.",
    msds_ppe_warning: "Wymagane ŚOI: rękawice, okulary ochronne. Sprawdź właściwą kartę charakterystyki w celu dodatkowych środków ochrony.",
    changelog_title: "Kontrola wersji / Historia zmian",
    changelog_add_title: "Dodaj zmianę",
    changelog_version: "Wersja (np. v11)",
    changelog_date: "Data",
    changelog_description: "Opis zmiany",
    changelog_add_btn: "+ Dodaj",
    changelog_delete: "Usuń",
    changelog_delete_confirm: "Usunąć ten wpis wersji?",
    changelog_add_success: "Dodano zmianę do historii wersji",
    export_success: "Wyeksportowano plik Excel",
    import_success: "Zaimportowano plan: {n} zadań. Przeglądasz teraz nowy plan.",
    import_error: "Błąd importu",
    import_error_no_tasks: "Nie znaleziono zadań w tym pliku. Sprawdź, czy ma taki sam układ jak oryginał.",
    plan_rename: "Zmień nazwę planu",
    plan_rename_prompt: "Nowa nazwa tego planu:",
    plan_renamed: "Zmieniono nazwę planu",
    plan_delete: "Usuń plan",
    plan_delete_confirm: "Czy na pewno chcesz usunąć \"{n}\"? Wszystkie edycje i odhaczenia w tym planie zostaną utracone.",
    plan_deleted: "Usunięto plan",
    export_error: "Błąd eksportu",
    empty: "Brak zadań pasujących do tych filtrów",
    total_tasks: "zadań",
    done: "gotowe",
    reset_all: "Resetuj wszystko",
    reset_confirm: "Zresetować wszystkie odhaczenia bieżącego okresu na tej karcie?",
    reset_done: "Odhaczenia zostały zresetowane",
    reset_modal_title: "Czy na pewno zresetować wszystko?",
    reset_modal_subtitle: "Tej akcji nie można cofnąć",
    reset_warning_title: "Zamierzasz usunąć odhaczenia",
    reset_warning_body: "Wszystkie odhaczone zadania dla pokazanego poniżej okresu zostaną usunięte. Tych danych nie da się odzyskać.",
    reset_info_tab: "Karta",
    reset_info_period: "Okres",
    reset_info_tasks: "Zadania z odhaczeniami",
    reset_info_checks: "Łączna liczba odhaczeń",
    reset_confirm_btn: "Tak, zresetuj wszystko",
    reset_final_warning: "To usuwa tylko odhaczenia tej karty i okresu — nie innych kart ani przyszłych okresów.",
    reset_nothing_to_reset: "Brak odhaczeń do zresetowania w tym okresie",
    no_product: "brak środka",
    // Add task
    add_task_btn: "Nowe zadanie",
    add_task_title: "Dodaj nowe zadanie sprzątania",
    add_task_subtitle: "Wypełnij pola, aby dodać nowe zadanie do planu sprzątania",
    form_ruimte: "Pomieszczenie",
    form_werkplek: "Stanowisko",
    form_onderdeel: "Element",
    form_subcat: "Zadanie / opis",
    form_onderdeel_en: "Element (EN)",
    form_subcat_en: "Zadanie / opis (EN)",
    form_optional_hint: "opcjonalne",
    form_uitvoerend: "Wykonuje",
    form_vervuiling: "Rodzaj zabrudzenia",
    form_wanneer: "Kiedy",
    form_freq: "Częstotliwość",
    form_methode: "Metoda",
    form_middel: "Środek / narzędzie",
    form_hint_methode: "Z karty Metody",
    form_hint_middel: "Z karty Środki. Zostaw puste, jeśli nie dotyczy.",
    form_scores: "Oceny ryzyka (opcjonalnie)",
    form_hint_scores: "Zabrudzenie × Strefa × Odległość od produktu. Wszystkie trzy wymagane do automatycznego obliczenia.",
    score_v: "Zabrudzenie",
    score_z: "Strefa",
    score_a: "Odległość",
    score_v_full: "Ocena zabrudzenia",
    score_z_full: "Ocena strefy",
    score_a_full: "Odległość od produktu",
    score_tooltip: "Ocena ryzyka: Zabrudzenie × Strefa × Odległość od produktu",
    score_total_label: "Ocena",
    score_legacy_marker: "istniejące",
    score_levels: {
      vscore: [
        { v: 1, label: "1 — Minimalne — suchy kurz, brak ryzyka skażenia" },
        { v: 2, label: "2 — Lekkie — kurz/kamień, niska presja mikrobiologiczna" },
        { v: 3, label: "3 — Umiarkowane — tłuszcz/resztki, ryzyko zakażenia krzyżowego" },
        { v: 4, label: "4 — Ciężkie — przypieczony materiał organiczny, wysoka presja mikrobiologiczna" },
        { v: 5, label: "5 — Krytyczne — bezpośredni kontakt z produktem, punkt kontroli HACCP (CCP)" }
      ],
      zscore: [
        { v: 1, label: "Strefa 1 — Obszary nieprodukcyjne (minimalne ryzyko)" },
        { v: 2, label: "Strefa 2 — Ciągi komunikacyjne/szatnie (niskie ryzyko)" },
        { v: 3, label: "Strefa 3 — Obszar produkcyjny/posadzka (średnie ryzyko)" },
        { v: 4, label: "Strefa 4 — Bezpośrednie otoczenie (wysokie ryzyko)" },
        { v: 5, label: "Strefa 5 — Powierzchnie kontaktu z produktem (najwyższe ryzyko)" }
      ],
      afstand: [
        { v: 1, label: "1 — Brak kontaktu z produktem (podłoga, sufit, ściana zewnętrzna)" },
        { v: 2, label: "2 — Blisko produktu (otoczenie maszyn, ściany hali produkcyjnej)" },
        { v: 3, label: "3 — Bezpośredni kontakt z produktem (blat, część maszyny, taśma)" }
      ]
    },
    score_level_empty: "— wybierz poziom —",
    info_btn_tooltip: "Pokaż wyjaśnienie ocen ryzyka",
    info_v_text: "jak szybko element się brudzi (wyżej = brudzi się szybciej)",
    info_z_text: "rodzaj obszaru / klasa higieny (zobacz opcje na liście)",
    info_a_text: "odległość od produktu (wyżej = bliżej produktu)",
    info_formula: "Razem określają ocenę ryzyka: Z × S × O. Im wyższa ocena, tym ważniejsze zadanie.",
    update_author_label: "Zatwierdził(a)",
    update_author_placeholder: "Wpisz swoje imię...",
    update_author_required: "Wpisz, kto zatwierdza zmiany",
    form_btn_save: "Zapisz zadanie",
    form_btn_cancel: "Anuluj",
    form_placeholder_vervuiling: "np. kurz, osady, tłuszcz",
    form_placeholder_wanneer: "np. Podczas produkcji, 1× dziennie",
    form_middel_none: "— brak —",
    form_required_error: "Wypełnij wymagane pola (pomieszczenie, element, zadanie, metoda)",
    form_save_success: "Dodano nowe zadanie",
    delete_task_confirm: "Trwale usunąć to zadanie?",
    bulk_selected_one: "zaznaczone zadanie",
    bulk_selected_many: "zaznaczonych zadań",
    bulk_select_all: "Zaznacz / odznacz wszystkie widoczne zadania",
    bulk_select_row: "Zaznacz to zadanie",
    bulk_deselect_all: "Odznacz",
    bulk_delete_button: "Usuń zaznaczone",
    bulk_delete_title: "⚠ Usunąć zaznaczone zadania?",
    bulk_delete_subtitle: "{n} zadań zostanie oznaczonych do usunięcia",
    bulk_delete_warning_title: "Ostrzeżenie",
    bulk_delete_warning_body: "Te zadania zostaną usunięte z planu sprzątania i oznaczone jako usunięte. Zmiana pojawi się na liście oczekujących i zostanie zapisana w historii zmian po kliknięciu 'Zatwierdź'. Możesz to cofnąć przez 'Odrzuć' w oknie Aktualizacji przed zatwierdzeniem.",
    bulk_and_n_more: "... i {n} więcej zadań",
    bulk_delete_success: "{n} zadań usuniętych — zatwierdź przez przycisk ⟳ Aktualizuj, aby zapisać w historii zmian",
    help_btn: "Pomoc",
    help_btn_title: "Jak działa ten plan sprzątania?",
    help_close: "Zamknij",
    backup_btn: "Kopia zapasowa",
    backup_btn_title: "Utwórz pełną kopię zapasową wszystkich danych",
    backup_success: "Zapisano kopię zapasową — przechowuj plik w bezpiecznym miejscu",
    restore_btn: "Przywróć",
    restore_btn_title: "Przywróć wcześniejszą kopię zapasową z pliku",
    restore_invalid_format: "To nie jest prawidłowy plik kopii zapasowej",
    restore_empty: "Kopia zapasowa nie zawiera planów",
    restore_confirm: "Ostrzeżenie: przywrócenie zastąpi wszystkie bieżące dane ({plans} plan(ów) z kopii z dnia {date}). Kontynuować?",
    restore_success: "Przywrócono kopię zapasową — wczytano {n} plan(ów)",
    restore_parse_error: "Nie udało się odczytać pliku — nieprawidłowy JSON",
    restore_read_error: "Błąd odczytu pliku",
    overdue_label: "Zaległe",
    overdue_tooltip: "To zadanie nie zostało odhaczone w poprzednim okresie",
    overdue_count_one: "zaległe zadanie",
    overdue_count_many: "zaległych zadań",
    only_overdue: "Tylko zaległe",
    overdue_overview_btn: "Zaległe",
    overdue_overview_tooltip: "Pokaż wszystkie zaległe zadania",
    overdue_overview_title: "Zaległe zadania",
    overdue_overview_empty: "Brak zaległych zadań — wszystko nadrobione.",
    overdue_overview_goto: "Przejdź do →",
    overdue_overview_close: "Zamknij",
    dashboard_title: "Pulpit",
    dashboard_subtitle: "Przegląd na żywo bieżącego okresu",
    dashboard_compliance: "Ogólny postęp",
    dashboard_tasks_done: "ukończonych zadań",
    dashboard_overdue: "Zaległe",
    dashboard_view_overdue: "Pokaż zaległe →",
    dashboard_risk: "Rozkład ryzyka",
    dashboard_risk_low: "Niskie",
    dashboard_risk_mid: "Średnie",
    dashboard_risk_high: "Wysokie",
    dashboard_per_freq: "Postęp wg częstotliwości",
    dashboard_freq_col: "Częstotliwość",
    dashboard_done_col: "Gotowe",
    dashboard_total_col: "Razem",
    dashboard_progress_col: "Postęp",
    dashboard_top_skipped: "Najczęściej pomijane zadania (ostatnie 4 tygodnie)",
    dashboard_periods_skipped: "pominiętych okresów",
    dashboard_no_skipped: "Brak regularnie pomijanych zadań — świetna robota!",
    dashboard_per_performer: "Zadania wg wykonawcy",
    dashboard_performer_col: "Wykonawca",
    dashboard_tasks_col: "Zadania",
    dashboard_btn: "Pulpit",
    products_btn: "Środki",
    products_title: "Przegląd środków czystości",
    products_subtitle: "Wszystkie środki czystości wraz z informacjami z karty charakterystyki.",
    products_view_msds: "Pokaż kartę charakterystyki",
    products_open_msds: "Info / karta charakterystyki",
    products_msds_uploaded: "Karta charakterystyki dostępna",
    products_empty: "Nie znaleziono środków czystości.",
    hero_all_done_title: "Wszystko gotowe! 🎉",
    hero_all_done_sub: "Wszystkie {count} zadań na {period} są odhaczone. Świetna robota.",
    hero_period_today: "dziś",
    hero_period_this_week: "ten tydzień",
    hero_period_this_month: "ten miesiąc",
    hero_period_this_quarter: "ten kwartał",
    hero_period_this_year: "ten rok",
    hero_period_this_period: "ten okres",
    empty_filter_title: "Nie znaleziono zadań",
    empty_filter_sub: "Spróbuj dostosować filtr lub wyszukać inne terminy.",
    empty_filter_clear: "Wyczyść filtr",
    empty_no_tasks_title: "Nic zaplanowanego",
    empty_no_tasks_sub: "Brak zadań dla tej częstotliwości.",
    dashboard_dept_distribution: "Rozkład wg działu",
    dashboard_total_tasks: "zadań",
    dashboard_spark_label: "Ukończenia z ostatnich 14 dni",
    dashboard_no_data: "Brak danych",
    user_anon_label: "Anonimowy",
    user_btn_title_set: "Zalogowano jako {name} — kliknij, aby zmienić",
    user_btn_title_unset: "Kim jesteś? Kliknij, aby ustawić imię",
    user_modal_title: "Kim jesteś?",
    user_modal_subtitle: "Twoje imię jest zapisywane przy każdym odhaczeniu, na potrzeby audytu",
    user_name_label: "Twoje imię",
    user_name_placeholder: "np. Anna",
    user_existing_label: "Używane wcześniej",
    user_anon_btn: "Kontynuuj anonimowo",
    user_save_btn: "Zapisz",
    user_set_success: "Witaj {name} — odhaczenia będą teraz zapisywane pod Twoim imieniem",
    user_anon_set: "Kontynuujesz anonimowo — odhaczenia nie będą powiązane z imieniem",
    checked_by_at: "Odhaczone przez {by} dnia {at}",
    checked_at: "Odhaczone dnia {at}",
    correction_tooltip: "Skorygowane później przez {by} dnia {at}",
    image_label: "Zdjęcie",
    image_label_hint: "opcjonalnie — administratorzy/super-użytkownicy",
    image_pick: "📷 Wybierz zdjęcie",
    image_clear: "🗑 Usuń",
    image_none: "Brak zdjęcia",
    image_pending_upload: "Zostanie przesłane przy zapisie",
    image_uploading: "Przesyłanie zdjęcia...",
    image_upload_failed: "Przesyłanie nieudane — spróbuj mniejszego lub innego zdjęcia",
    image_not_an_image: "Ten plik nie jest zdjęciem",
    image_view_tooltip: "Pokaż zdjęcie",
    note_add_tooltip: "Dodaj uwagę",
    note_edit_tooltip: "Pokaż / edytuj uwagę",
    note_modal_title: "Uwaga do odhaczenia",
    note_modal_label: "Uwaga (opcjonalnie)",
    note_modal_placeholder: "np. Maszyna była częściowo poza produkcją, wyczyszczono tylko z zewnątrz.",
    note_modal_cancel: "Anuluj",
    note_modal_save: "💾 Zapisz",
    note_modal_clear: "🗑 Usuń uwagę",
    note_saved: "Zapisano uwagę",
    note_cleared: "Usunięto uwagę",
    image_close: "Zamknij",
    image_esc_hint: "Naciśnij Esc, aby zamknąć",
    image_goto_btn: "Przejdź do zadania",
    image_goto_tooltip: "Przeskocz do tego zadania na liście",
    image_load_failed: "Nie udało się załadować zdjęcia",
    image_delete_btn: "Usuń",
    image_delete_tooltip: "Usuń zdjęcie (administrator)",
    image_delete_confirm: "Usunąć to zdjęcie? Nie można cofnąć.",
    image_deleted: "Usunięto zdjęcie",
    qr_btn: "Kody QR",
    qr_btn_title: "Generuj kody QR na pomieszczenie do skanowania na miejscu",
    qr_modal_title: "Kody QR na pomieszczenie",
    qr_modal_subtitle: "Wydrukuj i powieś na miejscu — skanowanie otwiera bezpośrednio przefiltrowany widok",
    qr_generate_for: "Generuj dla",
    qr_per_area: "Na pomieszczenie",
    qr_per_workplace: "Na stanowisko",
    qr_print: "Drukuj",
    qr_task_one: "zadanie",
    qr_task_many: "zadań",
    qr_no_data: "Nie znaleziono pomieszczeń ani stanowisk do wygenerowania kodów QR.",
    qr_lib_missing: "Biblioteka QR nie załadowana — sprawdź połączenie internetowe.",
    qr_print_blocked: "Okno wydruku zostało zablokowane. Zezwól na wyskakujące okienka i spróbuj ponownie.",
    qr_print_subtitle: "Zeskanuj te kody aparatem telefonu, aby od razu otworzyć przefiltrowany widok dla danej lokalizacji.",
    role_denied_not_superuser: "Tylko super-użytkownik może zmieniać role.",
    role_cannot_demote_self: "Nie możesz zmienić własnej roli.",
    role_invalid: "Nieprawidłowa rola — dozwolone tylko 'user' lub 'admin'.",
    role_changed: "Zmieniono rolę — zmiana jest już aktywna.",
    role_change_failed: "Nie udało się zmienić roli — sprawdź uprawnienia.",
    role_denied_admin_required: "Tylko administratorzy i super-użytkownicy mogą to zrobić.",
    changelog_readonly_notice: "Przeglądasz historię zmian w trybie tylko do odczytu. Tylko administratorzy i super-użytkownicy mogą rejestrować zmiany.",
    sidebar_title: "Menu",
    sidebar_role_local: "Lokalny",
    sidebar_role_user: "Użytkownik",
    sidebar_role_admin: "Administrator",
    sidebar_role_superuser: "Super-użytkownik",
    sidebar_section_navigate: "Nawigacja",
    sidebar_section_tools: "Narzędzia",
    sidebar_section_admin: "Administrator",
    sidebar_section_su: "Super-użytkownik",
    sidebar_section_account: "Konto",
    sidebar_section_app: "Aplikacja",
    pwa_install_btn: "Zainstaluj aplikację",
    pwa_install_unavailable: "Aplikacja jest już zainstalowana lub nieobsługiwana",
    sidebar_change_name: "Zmień imię",
    sidebar_import: "Importuj plan",
    sidebar_manage_users: "Zarządzaj kontami",
    sidebar_sign_out: "Wyloguj się",
    cloud_connected_badge: "Połączono z chmurą",
    cloud_local_badge: "Tryb lokalny",
    edit_mode_unlocked_btn: "Odblokuj edycję",
    edit_mode_locked_btn: "Zablokuj edycję",
    export_excel: "Eksportuj Excel",
    msds_file_title: "Karta charakterystyki (MSDS)",
    msds_uploaded_by: "przez",
    msds_open_link: "Otwórz kartę charakterystyki",
    msds_link_add: "Dodaj link do karty charakterystyki",
    msds_link_save: "Zapisz",
    msds_link_saved: "Zapisano link do karty charakterystyki",
    msds_link_save_failed: "Zapis nieudany — sprawdź uprawnienia",
    msds_link_deleted: "Usunięto link do karty charakterystyki",
    msds_link_delete_confirm: "Czy na pewno usunąć ten link do karty charakterystyki?",
    msds_link_empty: "Wpisz adres URL.",
    msds_link_invalid: "Nieprawidłowy URL — sprawdź, czy link jest poprawny.",
    msds_link_placeholder: "https://dostawca.com/msds/produkt.pdf",
    msds_link_none: "Brak jeszcze linku do karty charakterystyki dla tego produktu.",
    msds_link_none_admin: "Dodaj link do karty charakterystyki dostawcy:",
    delete_task_success: "Usunięto zadanie",
    delete_task_tooltip: "Usuń zadanie",
    custom_label: "Własne",
    // Edit task
    edit_task_tooltip: "Edytuj zadanie (wymagane hasło)",
    edit_task_title: "Edytuj zadanie",
    edit_task_subtitle: "Dostosuj pola, aby zmodyfikować zadanie",
    edit_btn_save: "Zapisz zmiany",
    edit_password_prompt: "Wpisz hasło, aby edytować zadania:",
    edit_password_wrong: "Nieprawidłowe hasło",
    edit_password_ok: "Edycja odblokowana — przyciski edycji są teraz widoczne",
    edit_save_success: "Zaktualizowano zadanie",
    edit_mode_locked_btn: "Edytuj",
    edit_mode_unlocked_btn: "Wyłącz edycję",
    edit_mode_locked_title: "Kliknij, aby odblokować edycję (wymagane hasło)",
    edit_mode_unlocked_title: "Kliknij, aby ponownie wyłączyć edycję",
    edit_mode_locked: "Edycja wyłączona",
    edit_mode_active_banner: "✏️ Tryb edycji aktywny — możesz edytować, dodawać lub usuwać zadania",
    edit_mode_active_close: "Wyłącz edycję",
    password_modal_title: "Odblokuj edycję",
    password_modal_subtitle: "Wpisz hasło, aby móc edytować zadania",
    password_modal_label: "Hasło",
    password_modal_submit: "Odblokuj",
    password_modal_empty: "Wpisz hasło",
    auth_enter_email_first: "Najpierw wpisz swój e-mail.",
    auth_invalid_email: "Wpisz prawidłowy adres e-mail.",
    auth_reset_sent_title: "E-mail wysłany!",
    auth_reset_sent_body: "Wysłaliśmy link do zresetowania hasła na:",
    auth_reset_hint: "Nie otrzymałeś? Sprawdź folder spam lub spróbuj ponownie za kilka minut.",
    auth_reset_back: "Powrót do logowania",
    onboard_welcome_title: "Witaj w planie sprzątania! 👋",
    onboard_welcome_body: "Krótka prezentacja na start. Kliknij 'Dalej', aby zacząć, lub 'Pomiń', aby od razu przejść do aplikacji.",
    onboard_tabs_title: "Karty częstotliwości",
    onboard_tabs_body: "Tutaj przełączasz między zadaniami codziennymi, tygodniowymi, miesięcznymi itd. Liczba pokazuje Twój postęp.",
    onboard_check_title: "Odhaczanie zadań",
    onboard_check_body: "Kliknij pola po prawej stronie każdego wiersza, aby odhaczyć zadanie. Zapisuje się automatycznie i jest udostępniane zespołowi.",
    onboard_menu_title: "Menu",
    onboard_menu_body: "Trzy kropki w prawym górnym rogu dają dostęp do Pomocy, Pulpitu, Historii zmian, Kodów QR i nie tylko.",
    onboard_admin_title: "Edycja jako administrator",
    onboard_admin_body: "Jako administrator możesz włączyć tryb edycji z menu. Wtedy możesz edytować, dodawać lub usuwać zadania. Nie zapomnij zatwierdzić zmian przez Historię zmian.",
    onboard_su_title: "Zarządzaj kontami",
    onboard_su_body: "Jako super-użytkownik możesz przydzielać role innym użytkownikom przez 'Zarządzaj kontami'. Daj administratorom właściwe uprawnienia, a użytkowników zostaw w trybie tylko do odczytu.",
    onboard_skip: "Pomiń",
    onboard_next: "Dalej",
    onboard_finish: "Zaczynamy",
    pbm_gloves: "Wymagane rękawice",
    pbm_goggles: "Zalecane okulary ochronne",
    pbm_mask: "Zalecana maska przeciwpyłowa / na twarz",
    edit_locked_hint: "Najpierw odblokuj edycję przyciskiem w prawym górnym rogu",
    edited_label: "Edytowane",
    edited_tooltip: "To zadanie zostało zmienione względem oryginalnego planu sprzątania",
    // Update / changelog auto-commit
    update_btn: "Aktualizuj",
    update_btn_title_empty: "Brak zmian do zatwierdzenia",
    update_btn_title_has: "{n} zmian(a) gotowych do zapisania w historii zmian",
    update_modal_title: "Zatwierdź zmiany w historii zmian",
    update_modal_subtitle: "Przejrzyj zmiany i dodaj je do historii zmian",
    update_commit_btn: "Zatwierdź w historii zmian",
    update_no_changes_title: "Brak zmian do zatwierdzenia",
    update_no_changes_hint: "Dodaj, edytuj lub usuń zadania; pojawią się tutaj gotowe do zatwierdzenia.",
    update_summary_one: "1 zmiana gotowa do zatwierdzenia",
    update_summary_many: "{n} zmian gotowych do zatwierdzenia",
    update_note_label: "Dodatkowa uwaga (opcjonalnie)",
    update_note_placeholder: "Np. powód zmiany, data zatwierdzenia, osoba odpowiedzialna...",
    update_success: "Dodano zmiany do historii zmian",
    update_version_required: "Numer wersji jest wymagany",
    update_no_field_changes: "Nie wykryto zmian na poziomie pól",
    update_pending_one: "zmiana oczekuje na zatwierdzenie",
    update_pending_many: "zmian oczekuje na zatwierdzenie",
    update_open_btn: "Zatwierdź teraz",
    update_cancel_warning_one: "Masz 1 niezatwierdzoną zmianę. Co chcesz zrobić?",
    update_cancel_warning_many: "Masz {n} niezatwierdzonych zmian. Co chcesz zrobić?",
    update_discard_btn: "Odrzuć",
    update_keep_btn: "Zachowaj",
    update_discard_success: "Odrzucono zmiany",
    update_keep_success: "Zachowano zmiany — możesz kontynuować edycję",
    change_type_add: "Dodano",
    change_type_edit: "Edytowano",
    change_type_delete: "Usunięto",
    auto_label: "Auto"
  },
  ro: {
    app_title: "Plan de curățenie",
    app_subtitle: "GTE-D-09-99 · versiunea {v}",
    export: "⬇ Exportă Excel",
    lang_btn: "🌐 NL",
    tabs: {
      today: "Azi",
      coordinator: "Coordonator",
      all: "Toate",
      daily: "Zilnic", weekly: "Săptămânal", monthly: "Lunar",
      bimonthly: "La 2 luni", quarterly: "Trimestrial",
      semiannual: "Semestrial", annual: "Anual",
      changelog: "📋 Istoric modificări",
      changelog_label: "Istoric modificări"
    },
    headers: {
      row: "Rând", area: "Încăpere", werkplek: "Post de lucru", onderdeel: "Componentă",
      task: "Sarcină / descriere", performer: "Executat de", vervuiling: "Tip de murdărie",
      method: "Metodă", product: "Produs", when: "Când", score: "Scor",
      location: "Locație", frequency: "Frecvență"
    },
    shifts: { morning: "Dimineață", afternoon: "După-amiază", night: "Noapte" },
    days: ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"],
    months: ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Noi", "Dec"],
    quarters: ["T1 (ian-mar)", "T2 (apr-iun)", "T3 (iul-sep)", "T4 (oct-dec)"],
    halves: ["S1 (ian-iun)", "S2 (iul-dec)"],
    bimonths: ["ian-feb", "mar-apr", "mai-iun", "iul-aug", "sep-oct", "noi-dec"],
    filter_area: "Încăpere:", filter_performer: "Executat de:", filter_search: "Caută:",
    sort_label: "Sortează:",
    sort_default: "Implicit",
    sort_area: "Încăpere (A-Z)",
    sort_soiling: "Scor de risc ↓",
    filter_btn: "Filtru",
    filter_toggle_tooltip: "Deschide / închide filtrele",
    filter_all: "Toate",
    dept_facilitair: "Întreținere",
    dept_operator: "Operator",
    dept_overig: "Altele",
    undo_label: "Anulează",
    undo_restored: "Restaurat",
    sync_done: "Actualizat din cloud",
    sync_failed: "Actualizare eșuată — verifică conexiunea",
    sync_local_only: "Vizualizare locală reîmprospătată",
    print_btn: "Printează",
    print_tooltip: "Printează perioada curentă",
    print_title: "Plan de curățenie",
    print_period: "Perioadă",
    print_date: "Printat pe",
    print_task: "Sarcină",
    print_method: "Metodă",
    print_product: "Produs",
    print_when: "Când",
    print_signature: "Semnătură",
    print_no_tasks: "Nicio sarcină în această perioadă de printat.",

    // ===== Today view (POINT 1) =====
    today_header_title: "Azi, {date}",
    today_header_count_one: "{n} sarcină deschisă",
    today_header_count_many: "{n} sarcini deschise",
    today_header_count_zero: "totul gata",
    today_begin_round_btn: "🚀 Începe tura",
    today_resume_round_btn: "▶ Reia tura ({done}/{total})",
    today_new_round_btn: "🆕 Tură nouă",
    today_my_tasks_filter: "Doar sarcinile mele",
    today_my_tasks_filter_off: "Toate sarcinile",
    today_all_done_title: "🎉 Totul gata!",
    today_all_done_sub: "Nu mai sunt sarcini pentru azi.",
    today_group_none: "Fără interval",
    today_overdue_pill: "Restanță",
    today_due_pill: "Azi",
    today_section_count_one: "{n} sarcină",
    today_section_count_many: "{n} sarcini",
    today_freq_label_daily: "zilnic",
    today_freq_label_weekly: "săptămânal",
    today_freq_label_monthly: "lunar",
    today_freq_label_bimonthly: "la 2 luni",
    today_freq_label_quarterly: "trimestrial",
    today_freq_label_semiannual: "semestrial",
    today_freq_label_annual: "anual",

    // ===== Coordinator overview (admin/superuser) =====
    coord_header_title: "Prezentare coordonator",
    coord_header_sub: "Vizualizare completă pe frecvență — pentru planificare și supraveghere",
    coord_subtab_aria: "File de frecvență",

    // ===== Settings (Etsy customisation) =====
    settings_tab_label: "Setări",
    settings_title: "Setări",
    settings_subtitle: "Personalizează aplicația pentru afacerea ta",
    settings_section_branding: "Identitatea firmei",
    settings_section_branding_sub: "Nume firmă, logo și culoare de accent",
    settings_section_schedule: "Program de lucru",
    settings_section_schedule_sub: "Zile lucrătoare, ture și sarcini pe zile specifice",
    settings_section_features: "Funcții",
    settings_section_features_sub: "Activează sau dezactivează module",
    settings_section_data: "Date și șabloane",
    settings_section_data_sub: "Exportă planul, încarcă exemple, resetează",
    settings_admin_only: "Doar pentru administratori și super-utilizatori",
    settings_coming_soon: "Va apărea în următoarea actualizare.",
    // Branding form fields
    settings_brand_company_label: "Nume firmă",
    settings_brand_company_placeholder: "ex. Brutăria Janssen",
    settings_brand_company_help: "Înlocuiește 'Plan de curățenie' din partea de sus a aplicației.",
    settings_brand_doc_label: "Cod document",
    settings_brand_doc_placeholder: "ex. JB-D-01",
    settings_brand_doc_help: "Numărul de referință HACCP din subtitlu.",
    settings_brand_subtitle_label: "Subtitlu",
    settings_brand_subtitle_placeholder: "ex. Plan de curățenie producție",
    settings_brand_subtitle_help: "Afișat sub numele firmei.",
    settings_brand_logo_label: "Logo",
    settings_brand_logo_help: "PNG sau SVG, max. 200KB. Redimensionat automat la 400px înălțime.",
    settings_brand_logo_dark_label: "Logo pentru modul întunecat",
    settings_brand_logo_dark_help: "Opțional — pentru când logo-ul este întunecat și ilizibil pe fundal întunecat.",
    settings_brand_logo_upload: "Alege logo",
    settings_brand_logo_remove: "Elimină",
    settings_brand_logo_too_large: "Fișier prea mare — max. 200KB.",
    settings_brand_logo_invalid: "Fișier nevalid. Folosește PNG, JPG sau SVG.",
    settings_brand_color_label: "Culoare de accent",
    settings_brand_color_help: "Butoane, linkuri și elemente de accent.",
    settings_brand_color_custom: "Personalizat",
    settings_brand_save: "Salvează",
    settings_brand_saved: "Identitate salvată",
    settings_brand_preview_title: "Previzualizare",
    settings_brand_preview_btn: "Buton exemplu",
    settings_brand_preview_link: "Link exemplu",

    // Schedule (work schedule)
    settings_sched_workdays_label: "Zile lucrătoare",
    settings_sched_workdays_help: "În ce zile este activă afacerea ta? Apasă pentru a comuta.",
    settings_sched_shifts_label: "Ore de notificare pentru ture",
    settings_sched_shifts_help: "Orele la care se trimit memento-uri. Max. 4 ture.",
    settings_sched_shift_add: "+ Adaugă tură",
    settings_sched_shift_remove: "Elimină",
    settings_sched_bigday_label: "Zi de curățenie generală",
    settings_sched_bigday_help: "Cărei zile îi aparțin sarcinile \"de sâmbătă\"? Implicit sâmbătă.",
    settings_sched_twice_label: "Zile \"de 2× pe săptămână\"",
    settings_sched_twice_help: "Ce două zile conțin sarcinile de 2× pe săptămână? Alege exact 2.",
    settings_sched_save: "Salvează programul",
    settings_sched_saved: "Program salvat",
    weekday_short_su: "Dum",
    weekday_short_mo: "Lun",
    weekday_short_tu: "Mar",
    weekday_short_we: "Mie",
    weekday_short_th: "Joi",
    weekday_short_fr: "Vin",
    weekday_short_sa: "Sâm",
    // Features section fields
    settings_feat_intro: "Activează sau dezactivează module. Modificările sunt locale — nu afectează ceilalți membri ai echipei.",
    settings_feat_cloudSync_label: "Sincronizare cloud (Firebase)",
    settings_feat_cloudSync_help: "Sincronizare în timp real cu colegii. Oprit = doar local, munca ta nu va fi partajată.",
    settings_feat_roles_label: "Sistem de roluri",
    settings_feat_roles_help: "Afișează permisiunile de administrator/super-utilizator. Oprit = oricine poate face orice. Recomandat pentru afaceri cu o singură persoană.",
    settings_feat_cleaningRound_label: "Mod tură de curățenie",
    settings_feat_cleaningRound_help: "Butonul '🚀 Începe tura' din vizualizarea Azi. Oprit = fără mod tură.",
    settings_feat_notifications_label: "Notificări",
    settings_feat_notifications_help: "Notificări push la orele turelor și butonul clopoțel din partea de sus. Oprit = fără alerte.",
    settings_feat_qrCodes_label: "Coduri QR",
    settings_feat_qrCodes_help: "Printează coduri QR pe încăpere/post de lucru. Oprit = fără filă QR și fără scanare.",
    settings_feat_photos_label: "Fotografii sarcini",
    settings_feat_photos_help: "Fotografii de referință pentru fiecare sarcină. Oprit = economisește spațiu; fără miniaturi.",
    settings_feat_excelExport_label: "Export Excel",
    settings_feat_excelExport_help: "Exportă sarcini/bifări în Excel. Oprit = fără buton de export în bara laterală.",
    settings_feat_changelog_label: "Istoric modificări",
    settings_feat_changelog_help: "Filă de istoric + intrări de jurnal pentru fiecare editare. Oprit = interfață mai simplă.",
    settings_feat_assignedUsers_label: "Câmp de atribuire",
    settings_feat_assignedUsers_help: "Atribuie sarcini unor utilizatori anume + filtru 'Sarcinile mele' în Azi. Oprit = mod echipă.",
    settings_feat_save: "Salvează",
    settings_feat_saved: "Funcții actualizate",
    settings_feat_warning_cloudSync: "⚠ Când e oprit, colegii nu mai văd munca ta.",
    settings_feat_warning_changelog: "⚠ Intrările de jurnal create anterior rămân salvate.",
    // Onboarding wizard (non-blocking banner)
    onb_banner_title: "Bun venit! Personalizează aplicația în 5 pași",
    onb_banner_sub: "O singură dată — apoi niciodată.",
    onb_dismiss_aria: "Închide banerul",
    onb_step_label: "Pasul {n} din 5",
    onb_back: "Înapoi",
    onb_next: "Înainte",
    onb_finish: "Finalizează",
    onb_skip: "Sari peste",
    // Step 1: company
    onb_s1_title: "Cum se numește firma ta?",
    onb_s1_help: "Apare în partea de sus a aplicației, înlocuind 'Plan de curățenie'.",
    onb_s1_placeholder: "ex. Brutăria Janssen",
    // Step 2: colour
    onb_s2_title: "Alege o culoare de accent",
    onb_s2_help: "Pentru butoane, linkuri și elemente de accent. Poți schimba mai târziu.",
    // Step 3: logo
    onb_s3_title: "Adaugă logo-ul tău (opțional)",
    onb_s3_help: "PNG, JPG sau SVG, max. 200KB. Fără logo? Sari peste acest pas.",
    // Step 4: schedule
    onb_s4_title: "Când este deschisă afacerea ta?",
    onb_s4_help: "Afectează ce sarcini apar în ce zile.",
    onb_s4_workdays: "Zile lucrătoare",
    // Step 5: done
    onb_s5_title: "Ești gata! 🎉",
    onb_s5_help: "Vizitează mai târziu Setări → Identitatea firmei pentru mai multe personalizări: cod document, subtitlu, logo pentru modul întunecat și opțiuni avansate de program.",
    onb_s5_explore: "Explorează aplicația",
    onb_done_toast: "Bun venit — aplicația ta este personalizată!",
    // Data-management section (phase 5)
    settings_data_intro: "Gestionează datele planului. Exportă ca șablon pentru partajare sau backup, încarcă date exemplu sau începe de la zero.",
    settings_data_export_title: "📤 Exportă planul ca șablon",
    settings_data_export_help: "Descarcă lista curentă de sarcini ca JSON. Nu conține date de bifare sau fotografii — doar structura planului, pentru partajare cu alte locații sau ca backup.",
    settings_data_export_btn: "Descarcă șablonul",
    settings_data_export_filename: "sablon-plan-curatenie",
    settings_data_export_success: "Șablon exportat",
    settings_data_import_title: "📥 Importă șablon",
    settings_data_import_help: "Încarcă un șablon descărcat anterior. Înlocuiește lista curentă de sarcini, dar păstrează bifările unde este posibil.",
    settings_data_import_btn: "Încarcă șablonul",
    settings_data_import_invalid: "Fișier de șablon nevalid.",
    settings_data_import_success: "Șablon importat ({n} sarcini)",
    settings_data_import_confirm: "Sigur încarci acest șablon? Lista curentă de sarcini va fi înlocuită.",
    settings_data_starters_title: "🏭 Planuri exemplu (șabloane de start)",
    settings_data_starters_help: "Planuri predefinite pentru diferite domenii. Apasă pentru a încărca — înlocuiește planul curent.",
    settings_data_starter_bakery: "Brutărie",
    settings_data_starter_bakery_sub: "Conform HACCP, tura de dimineață + după-amiază",
    settings_data_starter_restaurant: "Restaurant",
    settings_data_starter_restaurant_sub: "Bucătărie, sală, toalete, preparare",
    settings_data_starter_office: "Birou",
    settings_data_starter_office_sub: "Birouri, săli de ședințe, colț de cafea",
    settings_data_starter_salon: "Salon de coafură",
    settings_data_starter_salon_sub: "Scaun, spălător, ustensile, recepție",
    settings_data_starter_load: "Încarcă",
    settings_data_starter_loaded: "Plan exemplu încărcat ({n} sarcini)",
    settings_data_starter_confirm: "Încarci acest plan exemplu? Sarcinile curente vor fi înlocuite.",
    settings_data_reset_title: "🗑️ Resetează planul",
    settings_data_reset_help: "Șterge TOATE sarcinile, bifările, fotografiile și modificările în așteptare. Identitatea firmei și programul se păstrează. Nu se poate anula!",
    settings_data_reset_btn: "Resetează tot planul",
    settings_data_reset_confirm1: "Ești sigur? Asta șterge toate sarcinile și bifările.",
    settings_data_reset_confirm2: "Chiar ești sigur? Asta NU se poate anula.",
    settings_data_reset_success: "Plan resetat",
    // Custom soiling types
    settings_data_soiling_title: "🦠 Tipuri de murdărie",
    settings_data_soiling_help: "Personalizează lista pentru domeniul tău. Brutărie: grăsime, făină, suc de carne. Birou: praf, cafea. Salon: păr, resturi de vopsea.",
    settings_data_soiling_add: "+ Adaugă tip",
    settings_data_soiling_placeholder: "ex. păr",
    settings_data_soiling_save: "Salvează",
    settings_data_soiling_saved: "Tipuri de murdărie actualizate",
    // Custom PPE emojis
    settings_data_ppe_title: "🧤 Echipament de protecție (EIP)",
    settings_data_ppe_help: "Echipament individual de protecție afișat la sarcini. Adaugă propriul emoji + etichetă.",
    settings_data_ppe_add: "+ Adaugă EIP",
    settings_data_ppe_placeholder_emoji: "🧤",
    settings_data_ppe_placeholder_label: "Mănuși",
    settings_data_ppe_save: "Salvează",
    settings_data_ppe_saved: "Echipament de protecție actualizat",
    // Rooms management
    settings_data_rooms_title: "🏠 Gestionează încăperile",
    settings_data_rooms_help: "Editează încăperile/locațiile din plan. Adaugă pictogramă și culoare pentru recunoaștere vizuală.",
    settings_data_rooms_add: "+ Adaugă încăpere",
    settings_data_rooms_name: "Nume",
    settings_data_rooms_icon: "Pictogramă",
    settings_data_rooms_color: "Culoare",
    settings_data_rooms_remove: "Elimină",
    settings_data_rooms_save: "Salvează",
    settings_data_rooms_saved: "Încăperi actualizate",
    settings_data_rooms_in_use: "Această încăpere este folosită de {n} sarcini — mută mai întâi acele sarcini.",

    // ===== Completion list (Coordinator tool) =====
    afw_open_btn: "✏️ Listă de completare",
    afw_open_btn_count: "✏️ Listă de completare ({n})",
    afw_modal_title: "Listă de completare — sarcini incomplete",
    afw_modal_sub: "Completează câmpurile lipsă. Modificările merg în lista în așteptare și trebuie confirmate ulterior prin 'Actualizează'.",
    afw_progress: "Sarcina {cur} din {total}",
    afw_no_incompletes_title: "🎉 Nicio sarcină incompletă",
    afw_no_incompletes_sub: "Toate sarcinile au completate când, metodă și produs (sau sunt marcate ca N/A).",
    afw_field_wanneer: "Când",
    afw_field_methode: "Metodă",
    afw_field_middel: "Produs",
    afw_missing_label: "lipsește",
    afw_nvt_label: "N/A",
    afw_show_all_btn: "Arată toate câmpurile",
    afw_show_compact_btn: "Arată doar lipsurile",
    afw_btn_save: "💾 Salvează și continuă",
    afw_btn_save_only: "💾 Salvează",
    afw_btn_skip: "↷ Sari peste",
    afw_btn_nvt: "🚫 Marchează N/A",
    afw_btn_close: "Închide",
    afw_btn_finish: "Gata",
    afw_saved_toast: "Modificare salvată — în așteptare",
    afw_nvt_toast: "Câmp marcat N/A",
    afw_nvt_unmark_btn: "Elimină marcajul N/A",
    afw_extern_hint: "Firma externă își aduce propriul produs — ia în calcul marcarea acestui câmp ca N/A.",
    afw_finished_title: "🎉 Listă de completare gata",
    afw_finished_sub: "{saved} sarcini salvate, {nvt} marcaje N/A, {skipped} sărite. Nu uita să apeși <strong>⟳ Actualizează</strong> pentru a salva modificările în istoric.",
    afw_task_context: "Încăpere: {ruimte} · Componentă: {onderdeel}",

    // ===== Cleaning round mode (POINT 6) =====
    round_title: "Tură de curățenie",
    round_progress: "{cur} din {total}",
    round_btn_prev: "◀ Anterior",
    round_btn_next: "Următor ▶",
    round_btn_check: "✓ Gata",
    round_btn_uncheck: "✓ Gata (anulează bifa)",
    round_btn_skip: "↷ Sari peste",
    round_btn_close: "Pauză",
    round_btn_finish: "Termină tura",
    round_finished_title: "🎉 Tură finalizată",
    round_finished_sub: "{done} din {total} sarcini bifate în această tură.",
    round_finished_close: "Închide",
    round_no_tasks: "Nicio sarcină disponibilă pentru o tură.",
    round_label_method: "Metodă",
    round_label_product: "Produs",
    round_label_when: "Când",
    round_label_pbm: "EIP",
    round_label_note: "Notă",
    round_note_placeholder: "Opțional: notă pentru această bifare…",
    round_resume_banner: "Tură în pauză — {done} din {total} gata",
    round_started_at: "Începută la {time}",

    // ===== Personal assignment (POINT 10) =====
    assigned_user_label: "Atribuit lui",
    assigned_user_none: "Oricine",
    assigned_user_me: "Eu",
    assigned_user_filter_all: "Toate sarcinile",
    assigned_user_filter_mine: "Doar sarcinile mele",
    assigned_user_placeholder: "nume — gol = oricine",
    optional_hint: "opțional",
    notif_enable_btn: "🔔 Activează notificările",
    notif_enabled: "🔔 Notificări active",
    notif_blocked: "🔕 Notificări blocate",
    notif_shift_morning: "Tura de dimineață — {n} sarcini deschise",
    notif_shift_afternoon: "Tura de după-amiază — {n} sarcini deschise",
    notif_test_title: "Notificare de test",
    notif_test_body: "Notificările funcționează. Vei primi memento-uri la momentele turelor.",

    period_info_today: "Azi",
    period_info_week: "Săptămână",
    period_info_month: "Luna aceasta",
    period_info_year: "Anul acesta",
    period_auto_reset: "Bifările se resetează automat pe perioadă — perioadele anterioare se păstrează în istoric",
    view_period: "Vezi perioada",
    period_current: "curentă",
    week_label: "Săptămâna",
    month_names_short: ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Noi','Dec'],
    historical_banner_title: "Vizualizezi o perioadă anterioară",
    historical_banner_body: "Bifările sunt doar pentru citire. Exportul va include datele de bifare ale acestei perioade.",
    historical_readonly: "Perioadele anterioare sunt doar pentru citire. Întoarce-te la perioada curentă pentru a bifa sarcini.",
    correction_banner_title: "Mod de corecție — perioadă anterioară",
    correction_banner_body: "Ca super-utilizator poți completa bifări uitate. Modificările sunt înregistrate ca corecții.",
    future_banner_title: "Vizualizezi o perioadă viitoare",
    future_banner_body: "Această perioadă nu a început încă. Doar pentru citire — bifarea devine disponibilă când începe perioada.",
    period_future: "viitoare",
    freq_day: "zi",
    freq_week: "săptămână",
    return_current: "Înapoi la perioada curentă",
    new_period_notice: "A început o nouă perioadă ({freq}). Perioada anterioară este salvată — folosește selectorul 'Vezi perioada' pentru a o revizui sau exporta.",
    no_msds: "Nicio fișă de securitate disponibilă",
    msds_description: "Descriere",
    msds_usage: "Aplicare",
    msds_concentration: "Concentrație",
    msds_measurement: "Tip de măsurare",
    msds_remarks: "Observații / Avertismente",
    msds_classification: "Clasă de pericol",
    msds_general_note: "Rezumat pe baza documentului de lucru. Folosește linkul de mai sus pentru fișa de securitate oficială a furnizorului.",
    msds_ppe_warning: "EIP necesar: mănuși, ochelari de protecție. Consultă fișa de securitate specifică pentru măsuri suplimentare de protecție.",
    changelog_title: "Control versiuni / Istoric modificări",
    changelog_add_title: "Adaugă o modificare",
    changelog_version: "Versiune (ex. v11)",
    changelog_date: "Dată",
    changelog_description: "Descrierea modificării",
    changelog_add_btn: "+ Adaugă",
    changelog_delete: "Șterge",
    changelog_delete_confirm: "Ștergi această intrare de versiune?",
    changelog_add_success: "Modificare adăugată în istoricul versiunilor",
    export_success: "Fișier Excel exportat",
    import_success: "Plan importat: {n} sarcini. Vizualizezi acum noul plan.",
    import_error: "Eroare la import",
    import_error_no_tasks: "Nu s-au găsit sarcini în acest fișier. Verifică dacă are același format ca originalul.",
    plan_rename: "Redenumește planul",
    plan_rename_prompt: "Nume nou pentru acest plan:",
    plan_renamed: "Plan redenumit",
    plan_delete: "Șterge planul",
    plan_delete_confirm: "Sigur vrei să ștergi \"{n}\"? Toate editările și bifările din acest plan se vor pierde.",
    plan_deleted: "Plan șters",
    export_error: "Eroare la export",
    empty: "Nicio sarcină găsită cu aceste filtre",
    total_tasks: "sarcini",
    done: "gata",
    reset_all: "Resetează tot",
    reset_confirm: "Resetezi toate bifările perioadei curente din această filă?",
    reset_done: "Bifările au fost resetate",
    reset_modal_title: "Sigur vrei să resetezi tot?",
    reset_modal_subtitle: "Această acțiune nu se poate anula",
    reset_warning_title: "Ești pe cale să ștergi bifări",
    reset_warning_body: "Toate sarcinile bifate pentru perioada afișată mai jos vor fi șterse. Aceste date nu pot fi recuperate.",
    reset_info_tab: "Filă",
    reset_info_period: "Perioadă",
    reset_info_tasks: "Sarcini cu bifări",
    reset_info_checks: "Total bifări",
    reset_confirm_btn: "Da, resetează tot",
    reset_final_warning: "Asta șterge doar bifările acestei file și perioade — nu alte file sau perioade viitoare.",
    reset_nothing_to_reset: "Nu există bifări de resetat în această perioadă",
    no_product: "fără produs",
    // Add task
    add_task_btn: "Sarcină nouă",
    add_task_title: "Adaugă o nouă sarcină de curățenie",
    add_task_subtitle: "Completează câmpurile pentru a adăuga o sarcină nouă în planul de curățenie",
    form_ruimte: "Încăpere",
    form_werkplek: "Post de lucru",
    form_onderdeel: "Componentă",
    form_subcat: "Sarcină / descriere",
    form_onderdeel_en: "Componentă (EN)",
    form_subcat_en: "Sarcină / descriere (EN)",
    form_optional_hint: "opțional",
    form_uitvoerend: "Executat de",
    form_vervuiling: "Tip de murdărie",
    form_wanneer: "Când",
    form_freq: "Frecvență",
    form_methode: "Metodă",
    form_middel: "Produs / unealtă",
    form_hint_methode: "Din fila Metode",
    form_hint_middel: "Din fila Produse. Lasă gol dacă nu se aplică.",
    form_scores: "Scoruri de risc (opțional)",
    form_hint_scores: "Murdărie × Zonă × Distanță față de produs. Toate trei necesare pentru calcul automat.",
    score_v: "Murdărie",
    score_z: "Zonă",
    score_a: "Distanță",
    score_v_full: "Scor de murdărie",
    score_z_full: "Scor de zonă",
    score_a_full: "Distanță față de produs",
    score_tooltip: "Scor de risc: Murdărie × Zonă × Distanță față de produs",
    score_total_label: "Scor",
    score_legacy_marker: "existent",
    score_levels: {
      vscore: [
        { v: 1, label: "1 — Minim — praf uscat, fără risc de contaminare" },
        { v: 2, label: "2 — Ușor — praf/calcar, presiune microbiologică redusă" },
        { v: 3, label: "3 — Moderat — grăsime/reziduuri, risc de contaminare încrucișată" },
        { v: 4, label: "4 — Greu — material organic ars, presiune microbiologică ridicată" },
        { v: 5, label: "5 — Critic — contact direct cu produsul, punct de control HACCP (CCP)" }
      ],
      zscore: [
        { v: 1, label: "Zona 1 — Zone neproductive (risc minim)" },
        { v: 2, label: "Zona 2 — Zone de circulație/vestiare (risc redus)" },
        { v: 3, label: "Zona 3 — Zonă de producție/pardoseală (risc mediu)" },
        { v: 4, label: "Zona 4 — Mediu imediat (risc ridicat)" },
        { v: 5, label: "Zona 5 — Suprafețe de contact cu produsul (risc maxim)" }
      ],
      afstand: [
        { v: 1, label: "1 — Fără contact cu produsul (pardoseală, tavan, perete exterior)" },
        { v: 2, label: "2 — Aproape de produs (împrejurimea mașinilor, pereții halei de producție)" },
        { v: 3, label: "3 — Contact direct cu produsul (blat, piesă de mașină, bandă transportoare)" }
      ]
    },
    score_level_empty: "— alege nivelul —",
    info_btn_tooltip: "Arată explicația scorurilor de risc",
    info_v_text: "cât de repede se murdărește componenta (mai mare = se murdărește mai repede)",
    info_z_text: "tipul zonei / clasa de igienă (vezi opțiunile din listă)",
    info_a_text: "distanța față de produs (mai mare = mai aproape de produs)",
    info_formula: "Împreună determină scorul de risc: M × Z × D. Cu cât scorul e mai mare, cu atât sarcina e mai importantă.",
    update_author_label: "Confirmat de",
    update_author_placeholder: "Introdu numele tău...",
    update_author_required: "Te rugăm să indici cine confirmă modificările",
    form_btn_save: "Salvează sarcina",
    form_btn_cancel: "Anulează",
    form_placeholder_vervuiling: "ex. praf, depuneri, grăsime",
    form_placeholder_wanneer: "ex. În timpul producției, 1× pe zi",
    form_middel_none: "— niciunul —",
    form_required_error: "Completează câmpurile obligatorii (încăpere, componentă, sarcină, metodă)",
    form_save_success: "Sarcină nouă adăugată",
    delete_task_confirm: "Ștergi definitiv această sarcină?",
    bulk_selected_one: "sarcină selectată",
    bulk_selected_many: "sarcini selectate",
    bulk_select_all: "Selectează / deselectează toate sarcinile vizibile",
    bulk_select_row: "Selectează această sarcină",
    bulk_deselect_all: "Deselectează",
    bulk_delete_button: "Șterge selecția",
    bulk_delete_title: "⚠ Ștergi sarcinile selectate?",
    bulk_delete_subtitle: "{n} sarcini vor fi marcate pentru ștergere",
    bulk_delete_warning_title: "Avertisment",
    bulk_delete_warning_body: "Aceste sarcini vor fi eliminate din planul de curățenie și marcate ca șterse. Modificarea apare în lista în așteptare și va fi înregistrată în istoric când apeși 'Confirmă'. Poți anula acest lucru prin 'Renunță' în fereastra de Actualizare înainte de confirmare.",
    bulk_and_n_more: "... și încă {n} sarcini",
    bulk_delete_success: "{n} sarcini șterse — confirmă prin butonul ⟳ Actualizează pentru a înregistra în istoric",
    help_btn: "Ajutor",
    help_btn_title: "Cum funcționează acest plan de curățenie?",
    help_close: "Închide",
    backup_btn: "Backup",
    backup_btn_title: "Creează un backup complet al tuturor datelor",
    backup_success: "Backup salvat — păstrează fișierul într-un loc sigur",
    restore_btn: "Restaurează",
    restore_btn_title: "Restaurează un backup anterior dintr-un fișier",
    restore_invalid_format: "Acesta nu este un fișier de backup valid",
    restore_empty: "Backupul nu conține planuri",
    restore_confirm: "Avertisment: restaurarea va înlocui toate datele curente ({plans} plan(uri) din backupul datat {date}). Continui?",
    restore_success: "Backup restaurat — {n} plan(uri) încărcate",
    restore_parse_error: "Fișierul nu a putut fi citit — JSON nevalid",
    restore_read_error: "Eroare la citirea fișierului",
    overdue_label: "Restanță",
    overdue_tooltip: "Această sarcină nu a fost bifată în perioada anterioară",
    overdue_count_one: "sarcină restantă",
    overdue_count_many: "sarcini restante",
    only_overdue: "Doar restanțe",
    overdue_overview_btn: "Restanțe",
    overdue_overview_tooltip: "Vezi toate sarcinile restante",
    overdue_overview_title: "Sarcini restante",
    overdue_overview_empty: "Nicio sarcină restantă — ești la zi.",
    overdue_overview_goto: "Mergi la →",
    overdue_overview_close: "Închide",
    dashboard_title: "Tablou de bord",
    dashboard_subtitle: "Prezentare în timp real a perioadei curente",
    dashboard_compliance: "Progres general",
    dashboard_tasks_done: "sarcini finalizate",
    dashboard_overdue: "Restanțe",
    dashboard_view_overdue: "Vezi restanțele →",
    dashboard_risk: "Distribuția riscului",
    dashboard_risk_low: "Scăzut",
    dashboard_risk_mid: "Mediu",
    dashboard_risk_high: "Ridicat",
    dashboard_per_freq: "Progres pe frecvență",
    dashboard_freq_col: "Frecvență",
    dashboard_done_col: "Gata",
    dashboard_total_col: "Total",
    dashboard_progress_col: "Progres",
    dashboard_top_skipped: "Cele mai sărite sarcini (ultimele 4 săptămâni)",
    dashboard_periods_skipped: "perioade ratate",
    dashboard_no_skipped: "Nicio sarcină sărită regulat — treabă bună!",
    dashboard_per_performer: "Sarcini pe executant",
    dashboard_performer_col: "Executant",
    dashboard_tasks_col: "Sarcini",
    dashboard_btn: "Tablou de bord",
    products_btn: "Produse",
    products_title: "Prezentare produse de curățenie",
    products_subtitle: "Toate produsele de curățenie cu informațiile din fișa de securitate.",
    products_view_msds: "Vezi fișa de securitate",
    products_open_msds: "Info / fișă de securitate",
    products_msds_uploaded: "Fișă de securitate disponibilă",
    products_empty: "Nu s-au găsit produse de curățenie.",
    hero_all_done_title: "Totul gata! 🎉",
    hero_all_done_sub: "Toate cele {count} sarcini pentru {period} sunt bifate. Treabă bună.",
    hero_period_today: "azi",
    hero_period_this_week: "săptămâna aceasta",
    hero_period_this_month: "luna aceasta",
    hero_period_this_quarter: "trimestrul acesta",
    hero_period_this_year: "anul acesta",
    hero_period_this_period: "perioada aceasta",
    empty_filter_title: "Nicio sarcină găsită",
    empty_filter_sub: "Încearcă să ajustezi filtrul sau să cauți alți termeni.",
    empty_filter_clear: "Șterge filtrul",
    empty_no_tasks_title: "Nimic programat",
    empty_no_tasks_sub: "Nu există sarcini pentru această frecvență.",
    dashboard_dept_distribution: "Distribuție pe departament",
    dashboard_total_tasks: "sarcini",
    dashboard_spark_label: "Finalizări în ultimele 14 zile",
    dashboard_no_data: "Fără date",
    user_anon_label: "Anonim",
    user_btn_title_set: "Conectat ca {name} — apasă pentru a schimba",
    user_btn_title_unset: "Cine ești? Apasă pentru a-ți seta numele",
    user_modal_title: "Cine ești?",
    user_modal_subtitle: "Numele tău este înregistrat la fiecare bifare, pentru responsabilitate la audit",
    user_name_label: "Numele tău",
    user_name_placeholder: "ex. Ana",
    user_existing_label: "Folosit anterior",
    user_anon_btn: "Continuă anonim",
    user_save_btn: "Salvează",
    user_set_success: "Bun venit {name} — bifările vor fi acum înregistrate pe numele tău",
    user_anon_set: "Continui anonim — bifările nu vor fi asociate unui nume",
    checked_by_at: "Bifat de {by} pe {at}",
    checked_at: "Bifat pe {at}",
    correction_tooltip: "Corectat ulterior de {by} pe {at}",
    image_label: "Imagine",
    image_label_hint: "opțional — administratori/super-utilizatori",
    image_pick: "📷 Alege imagine",
    image_clear: "🗑 Elimină",
    image_none: "Fără imagine",
    image_pending_upload: "Se va încărca la salvare",
    image_uploading: "Se încarcă imaginea...",
    image_upload_failed: "Încărcare eșuată — încearcă o imagine mai mică sau alta",
    image_not_an_image: "Acest fișier nu este o imagine",
    image_view_tooltip: "Vezi imaginea",
    note_add_tooltip: "Adaugă observație",
    note_edit_tooltip: "Vezi / editează observația",
    note_modal_title: "Observație la bifare",
    note_modal_label: "Observație (opțional)",
    note_modal_placeholder: "ex. Mașina era parțial scoasă din producție, s-a curățat doar exteriorul.",
    note_modal_cancel: "Anulează",
    note_modal_save: "💾 Salvează",
    note_modal_clear: "🗑 Elimină observația",
    note_saved: "Observație salvată",
    note_cleared: "Observație eliminată",
    image_close: "Închide",
    image_esc_hint: "Apasă Esc pentru a închide",
    image_goto_btn: "Mergi la sarcină",
    image_goto_tooltip: "Sari la această sarcină din listă",
    image_load_failed: "Imaginea nu a putut fi încărcată",
    image_delete_btn: "Elimină",
    image_delete_tooltip: "Elimină imaginea (administrator)",
    image_delete_confirm: "Elimini această imagine? Nu se poate anula.",
    image_deleted: "Imagine eliminată",
    qr_btn: "Coduri QR",
    qr_btn_title: "Generează coduri QR pe încăpere pentru scanare la fața locului",
    qr_modal_title: "Coduri QR pe încăpere",
    qr_modal_subtitle: "Printează și afișează la fața locului — scanarea deschide direct vizualizarea filtrată",
    qr_generate_for: "Generează pentru",
    qr_per_area: "Pe încăpere",
    qr_per_workplace: "Pe post de lucru",
    qr_print: "Printează",
    qr_task_one: "sarcină",
    qr_task_many: "sarcini",
    qr_no_data: "Nu s-au găsit încăperi sau posturi de lucru pentru generarea codurilor QR.",
    qr_lib_missing: "Biblioteca QR nu este încărcată — verifică conexiunea la internet.",
    qr_print_blocked: "Fereastra de print a fost blocată. Permite ferestrele pop-up și încearcă din nou.",
    qr_print_subtitle: "Scanează aceste coduri cu camera telefonului pentru a deschide direct vizualizarea filtrată pentru acea locație.",
    role_denied_not_superuser: "Doar super-utilizatorul poate schimba rolurile.",
    role_cannot_demote_self: "Nu îți poți schimba propriul rol.",
    role_invalid: "Rol nevalid — sunt permise doar 'user' sau 'admin'.",
    role_changed: "Rol schimbat — modificarea este acum activă.",
    role_change_failed: "Schimbarea rolului a eșuat — verifică permisiunile.",
    role_denied_admin_required: "Doar administratorii și super-utilizatorii pot face asta.",
    changelog_readonly_notice: "Vizualizezi istoricul în mod doar pentru citire. Doar administratorii și super-utilizatorii pot înregistra modificări.",
    sidebar_title: "Meniu",
    sidebar_role_local: "Local",
    sidebar_role_user: "Utilizator",
    sidebar_role_admin: "Administrator",
    sidebar_role_superuser: "Super-utilizator",
    sidebar_section_navigate: "Navigare",
    sidebar_section_tools: "Instrumente",
    sidebar_section_admin: "Administrator",
    sidebar_section_su: "Super-utilizator",
    sidebar_section_account: "Cont",
    sidebar_section_app: "Aplicație",
    pwa_install_btn: "Instalează aplicația",
    pwa_install_unavailable: "Aplicația este deja instalată sau nu este acceptată",
    sidebar_change_name: "Schimbă numele",
    sidebar_import: "Importă plan",
    sidebar_manage_users: "Gestionează conturile",
    sidebar_sign_out: "Deconectează-te",
    cloud_connected_badge: "Conectat la cloud",
    cloud_local_badge: "Mod local",
    edit_mode_unlocked_btn: "Deblochează editarea",
    edit_mode_locked_btn: "Blochează editarea",
    export_excel: "Exportă Excel",
    msds_file_title: "Fișă de securitate (MSDS)",
    msds_uploaded_by: "de",
    msds_open_link: "Deschide fișa de securitate",
    msds_link_add: "Adaugă link fișă de securitate",
    msds_link_save: "Salvează",
    msds_link_saved: "Link fișă de securitate salvat",
    msds_link_save_failed: "Salvare eșuată — verifică permisiunile",
    msds_link_deleted: "Link fișă de securitate eliminat",
    msds_link_delete_confirm: "Sigur vrei să elimini acest link de fișă de securitate?",
    msds_link_empty: "Te rugăm să introduci un URL.",
    msds_link_invalid: "URL nevalid — verifică dacă linkul este corect.",
    msds_link_placeholder: "https://furnizor.com/msds/produs.pdf",
    msds_link_none: "Încă nu există un link de fișă de securitate pentru acest produs.",
    msds_link_none_admin: "Adaugă linkul către fișa de securitate a furnizorului:",
    delete_task_success: "Sarcină ștearsă",
    delete_task_tooltip: "Șterge sarcina",
    custom_label: "Personalizat",
    // Edit task
    edit_task_tooltip: "Editează sarcina (necesită parolă)",
    edit_task_title: "Editează sarcina",
    edit_task_subtitle: "Ajustează câmpurile pentru a modifica sarcina",
    edit_btn_save: "Salvează modificările",
    edit_password_prompt: "Introdu parola pentru a edita sarcini:",
    edit_password_wrong: "Parolă incorectă",
    edit_password_ok: "Editare deblocată — butoanele de editare sunt acum vizibile",
    edit_save_success: "Sarcină actualizată",
    edit_mode_locked_btn: "Editează",
    edit_mode_unlocked_btn: "Oprește editarea",
    edit_mode_locked_title: "Apasă pentru a debloca editarea (necesită parolă)",
    edit_mode_unlocked_title: "Apasă pentru a opri din nou editarea",
    edit_mode_locked: "Editare oprită",
    edit_mode_active_banner: "✏️ Mod de editare activ — poți edita, adăuga sau elimina sarcini",
    edit_mode_active_close: "Oprește editarea",
    password_modal_title: "Deblochează editarea",
    password_modal_subtitle: "Introdu parola pentru a putea edita sarcini",
    password_modal_label: "Parolă",
    password_modal_submit: "Deblochează",
    password_modal_empty: "Te rugăm să introduci o parolă",
    auth_enter_email_first: "Introdu mai întâi e-mailul tău.",
    auth_invalid_email: "Introdu o adresă de e-mail validă.",
    auth_reset_sent_title: "E-mail trimis!",
    auth_reset_sent_body: "Am trimis un link de resetare a parolei la:",
    auth_reset_hint: "Nu l-ai primit? Verifică folderul spam sau încearcă din nou în câteva minute.",
    auth_reset_back: "Înapoi la autentificare",
    onboard_welcome_title: "Bun venit în planul de curățenie! 👋",
    onboard_welcome_body: "Un scurt tur pentru început. Apasă 'Înainte' pentru a începe sau 'Sari peste' pentru a intra direct.",
    onboard_tabs_title: "File de frecvență",
    onboard_tabs_body: "Aici comuți între sarcini zilnice, săptămânale, lunare etc. Numărul arată progresul tău.",
    onboard_check_title: "Bifarea sarcinilor",
    onboard_check_body: "Apasă căsuțele din dreapta fiecărui rând pentru a bifa o sarcină. Se salvează automat și se partajează cu echipa.",
    onboard_menu_title: "Meniul",
    onboard_menu_body: "Cele trei puncte din dreapta sus îți dau acces la Ajutor, Tablou de bord, Istoric, Coduri QR și altele.",
    onboard_admin_title: "Editarea ca administrator",
    onboard_admin_body: "Ca administrator poți activa modul de editare din meniu. Apoi poți edita, adăuga sau elimina sarcini. Nu uita să confirmi modificările prin Istoric.",
    onboard_su_title: "Gestionează conturile",
    onboard_su_body: "Ca super-utilizator poți atribui roluri altor utilizatori prin 'Gestionează conturile'. Dă administratorilor permisiunile corecte, ține utilizatorii pe doar-citire.",
    onboard_skip: "Sari peste",
    onboard_next: "Înainte",
    onboard_finish: "Să începem",
    pbm_gloves: "Mănuși necesare",
    pbm_goggles: "Ochelari de protecție recomandați",
    pbm_mask: "Mască de praf / mască facială recomandată",
    edit_locked_hint: "Deblochează mai întâi editarea prin butonul din dreapta sus",
    edited_label: "Editat",
    edited_tooltip: "Această sarcină a fost modificată față de planul de curățenie original",
    // Update / changelog auto-commit
    update_btn: "Actualizează",
    update_btn_title_empty: "Nicio modificare de confirmat",
    update_btn_title_has: "{n} modificare(modificări) gata de înregistrat în istoric",
    update_modal_title: "Confirmă modificările în Istoric",
    update_modal_subtitle: "Revizuiește modificările și adaugă-le în istoric",
    update_commit_btn: "Confirmă în istoric",
    update_no_changes_title: "Nicio modificare de confirmat",
    update_no_changes_hint: "Adaugă, editează sau șterge sarcini; vor apărea aici gata de confirmat.",
    update_summary_one: "1 modificare gata de confirmat",
    update_summary_many: "{n} modificări gata de confirmat",
    update_note_label: "Notă suplimentară (opțional)",
    update_note_placeholder: "Ex. motivul modificării, data aprobării, persoana responsabilă...",
    update_success: "Modificări adăugate în Istoric",
    update_version_required: "Numărul versiunii este obligatoriu",
    update_no_field_changes: "Nicio modificare la nivel de câmp detectată",
    update_pending_one: "modificare în așteptarea confirmării",
    update_pending_many: "modificări în așteptarea confirmării",
    update_open_btn: "Confirmă acum",
    update_cancel_warning_one: "Ai 1 modificare neconfirmată încă. Ce vrei să faci?",
    update_cancel_warning_many: "Ai {n} modificări neconfirmate încă. Ce vrei să faci?",
    update_discard_btn: "Renunță",
    update_keep_btn: "Păstrează",
    update_discard_success: "Modificări anulate",
    update_keep_success: "Modificări păstrate — poți continua editarea",
    change_type_add: "Adăugat",
    change_type_edit: "Editat",
    change_type_delete: "Șters",
    auto_label: "Auto"
  }
};

// Dutch → English translations for common content (area names, performers, frequencies, common words)
// =====================================================
// TASK CONTENT TRANSLATIONS — onderdeel + subcat
// =====================================================
// Per-field translation tables for task names. Built once and used by
// trOnderdeel() / trSubcat() below. The split into two tables (instead of
// merging into CONTENT_TR) avoids ambiguity for short strings that could
// appear in multiple contexts. Custom user-added tasks may carry their
// own _en variants on the task object — see addTask in the modal.
const CONTENT_TR_ONDERDEEL = {
  "5S borden": "5S boards",
  "5S borden groene schoonmaakmaterialen": "5S boards green cleaning materials",
  "Afmeter": "Divider",
  "Afzuiging boven langmaker 2x": "Extraction above moulder 2x",
  "Algemeen": "General",
  "Alle kantoor ruimtes incl vergaderzaal": "All office rooms incl. meeting room",
  "Automaten": "Vending machines",
  "Bakkerij": "Bakery",
  "Bakkerij kantoor": "Bakery office",
  "Begane grond": "Ground floor",
  "Blikjesautomaat": "Can vending machine",
  "Blikken insmeer unit": "Pan greasing unit",
  "Blikken opslag": "Pan storage",
  "Blus apparatuur": "Fire-extinguishing equipment",
  "Bollenkast": "Intermediate prover",
  "Bovenkant kneedmachines": "Top of kneading machines",
  "Bureaus": "Desks",
  "Checkweger": "Checkweigher",
  "Chemie opslag facilitair": "Chemical storage facility",
  "Daalband": "Descent conveyor",
  "Dak": "Roof",
  "Dak rooster": "Roof grate",
  "Dakkoepels": "Roof domes",
  "Deegkuipen": "Dough tubs",
  "Desinfectie": "Disinfection",
  "Deuren": "Doors",
  "Dolly-Krattransporten": "Dolly crate transport",
  "Douches": "Showers",
  "Expeditie kantoor": "Dispatch office",
  "Frame": "Frame",
  "Gele IBC opvangbak": "Yellow IBC drip tray",
  "Gisttanks, watertanks, loogtanks": "Yeast tanks, water tanks, lye tanks",
  "Grondstof magazijn": "Raw material warehouse",
  "Hefkiep installatie": "Lift-tip installation",
  "Hyghiënepunt richting productie": "Hygiene point towards production",
  "Inkomsthal bezoek en kantoor": "Visitor and office entrance hall",
  "Kantine": "Canteen",
  "Kantine/gangen/kleedruimtes": "Canteen/corridors/changing rooms",
  "Kleinbroodstraat": "Small bread line",
  "Kneders": "Kneaders",
  "Koelbanen": "Cooling conveyors",
  "Koelcel": "Cold storage",
  "Koeltoren": "Cooling tower",
  "Kopmachine": "Heading machine",
  "Koppelkeerstation": "Coupling-reverser station",
  "Krattentransport": "Crate transport",
  "Kunstof wanden": "Plastic walls",
  "Laad docks": "Loading docks",
  "Langmaker": "Moulder",
  "Langmaker (regulier)": "Moulder (regular)",
  "Lekbak olie opvang": "Oil drip tray",
  "Manipulator, put": "Manipulator, pit",
  "Meng/aanmaakvat": "Mixing/preparation tank",
  "Metaaldetector": "Metal detector",
  "Naalddepanner": "Needle depanner",
  "Narijskast": "Final proofer",
  "Narijskast (binnenzijde)": "Final proofer (interior)",
  "Narijskast (buitenzijde)": "Final proofer (exterior)",
  "Narijskast omgeving": "Final proofer surroundings",
  "Ontdoen van vuil en bladeren": "Remove dirt and leaves",
  "Opboller": "Rounder",
  "Opvangbakken GMP": "GMP catch trays",
  "Oven": "Oven",
  "Oven / Narijskast": "Oven / Final proofer",
  "Oven omgeving": "Oven surroundings",
  "Pallet stapelaar": "Pallet stacker",
  "Pekelwater installatie": "Brine water installation",
  "Plafond": "Ceiling",
  "Plateau acculader": "Battery charger platform",
  "Ramen en Kozijnen": "Windows and frames",
  "Rek verpakkingsmateriaal": "Packaging material rack",
  "Restafval pers": "Residual waste press",
  "Roldeuren en nooduitgang deuren": "Roller doors and emergency exit doors",
  "Schaduwborden": "Shadow boards",
  "Schakelkasten uitwendig": "Switch cabinets exterior",
  "Schrobmachine's": "Scrubbing machines",
  "Shute": "Chute",
  "Stellingen": "Shelving",
  "Strooi unit": "Sprinkling unit",
  "Tafels": "Tables",
  "Tappunten": "Tap points",
  "Toetsenborden productie bediening": "Production control keyboards",
  "Toiletten": "Toilets",
  "Toiletten man + vrouw": "Toilets men + women",
  "Transport baan": "Transport lane",
  "Transport banden": "Transport belts",
  "Transport karren casino platen": "Transport carts casino plates",
  "Transport naar langmaker": "Transport to moulder",
  "Vaatwasser": "Dishwasher",
  "Ventilatoren": "Fans",
  "Vloer": "Floor",
  "Vloer narijskast": "Floor final proofer",
  "Vloer reinigen": "Clean floor",
  "Voedingspaal opboller": "Rounder feed pole",
  "Volledig": "Complete",
  "WC": "Toilet",
  "Wanden overige": "Other walls",
  "Wanden, droogrek": "Walls, drying rack",
  "Wasbakken": "Sinks",
  "Wastafels": "Wash basins",
  "Water dispensers": "Water dispensers",
  "Watertank & ventilator": "Water tank & fan",
  "Weegbunker": "Weighing bunker",
  "Werktafels": "Work tables",
  "Zwerfvuil verwijderen": "Remove litter",
  "afpakband (hand)": "pick-off belt (manual)",
  "afvalbeheer": "waste management",
  "doseerpunt IBC": "IBC dosing point",
  "drukknoppen, wandcontactdozen": "push buttons, wall sockets",
  "etikeerlijn": "labelling line",
  "etikeerlijn heel": "labelling line entire",
  "inpakmachine heel": "packaging machine entire",
  "kleedruimtes": "changing rooms",
  "kliko's/emmers/tonnen": "wheelie bins/buckets/drums",
  "metaaldetector": "metal detector",
  "metaaldetector na depanner": "metal detector after depanner",
  "metaaldetector na snij/inpakmachine": "metal detector after slicing/packaging machine",
  "muren": "walls",
  "snijmachine heel": "slicing machine entire",
  "stellage schoonmaakmiddelen": "cleaning materials rack",
  "werktafel / plateau": "work table / platform",
};

const CONTENT_TR_SUBCAT = {
  "4 Opvangplaten aan onderzijde": "4 catch plates on bottom",
  "5 Opvangplaten aan onderzijde": "5 catch plates on bottom",
  "Aanmaakvat pekelwater installatie": "Preparation tank brine water installation",
  "Achter de panelen": "Behind the panels",
  "Afnemen": "Wipe down",
  "Afnemen met vochtige doek, vuilniszakken vervangen": "Wipe with damp cloth, replace bin bags",
  "Afnemen vochtige doek": "Wipe with damp cloth",
  "Afschermkappen rondom": "Protective covers around",
  "Afstoffen": "Dust off",
  "Afvoerput, controle ongedierte 15L warm water doorspoelen": "Drain, pest check, flush 15L warm water",
  "Afvoerput, rooster, vloer": "Drain, grate, floor",
  "Afzuigkap + filters achterzijden": "Extractor hood + filters back sides",
  "Afzuigkap + filters voorzijden": "Extractor hood + filters front sides",
  "Afzuigkap voorkant": "Extractor hood front",
  "Baardnetjes, haarnetjes bijvullen, oordoppen": "Refill beard nets, hair nets, ear plugs",
  "Bakje voor staafjes wisselen": "Replace tray for sticks",
  "Bedieningspaneel": "Control panel",
  "Beplating rondom + intern": "Panelling around + internal",
  "Besturingskast": "Control cabinet",
  "Besturingskast bij NRK GB, goed naspoelen met water": "Control cabinet at NRK GB, rinse well with water",
  "Bijvullen": "Refill",
  "Binnenzijde": "Interior",
  "Binnenzijde, terugblaasslang, aanslag verwijderen": "Interior, return-blow hose, remove deposits",
  "Binnenzijden schoonkrabben en deegresten verwijderen. Leidingen en frame rondom tot 1.80.": "Scrape interiors clean and remove dough residue. Pipes and frame around up to 1.80m.",
  "Blad vrij maken + zwerfafval": "Clear leaves + litter",
  "Blauwe borstel": "Blue brush",
  "Blauwe borstel en koppelkeerder": "Blue brush and coupling reverser",
  "Blauwe transport band": "Blue transport belt",
  "Blikken transport": "Pan transport",
  "Borden en onderdelen reinigen": "Clean boards and components",
  "Bordestrap": "Platform stairs",
  "Buitengevel en buitenwanden silo's": "Outer facade and outer walls of silos",
  "Buitenzijde": "Exterior",
  "Buitenzijde reinigen": "Clean exterior",
  "Bureau afnemen": "Wipe desk",
  "Chemie opslag reinigen": "Clean chemical storage",
  "Controle lekkage's bloem": "Check flour leaks",
  "Controle op vuile was, schoenen, afval": "Check for dirty laundry, shoes, waste",
  "Decoratie bakken leegmaken": "Empty decoration trays",
  "Deegsnijplaat": "Dough cutting plate",
  "Deuren, wanden, tap en bordes": "Doors, walls, tap and platform",
  "Dieptereiniging + kooiladders": "Deep clean + cage ladders",
  "Drukplank, band, rollen, etc": "Pressure board, belt, rollers, etc",
  "Drukplank, band, rollen.": "Pressure board, belt, rollers.",
  "Dweilen": "Mop",
  "Facilitair ruimte reinigen": "Clean facility room",
  "Gistruimte": "Yeast room",
  "Goed drogen": "Dry well",
  "Grondstoffen rekken, ledigen en nat schuimreinigen": "Raw material racks, empty and wet foam clean",
  "Grondstofmagazijn aan roldeur ontvangst": "Raw material warehouse at receiving roller door",
  "Grondstofmagazijn naast deegmakerij": "Raw material warehouse next to dough room",
  "Grondstofmagazijn naast koeling": "Raw material warehouse next to cooling",
  "Groot brood naaldepanner": "Large bread needle depanner",
  "Hefsysteem reinigen": "Clean lifting system",
  "Inspectie": "Inspection",
  "Invoerkooi": "Infeed cage",
  "Jaarlijks onderhoud": "Annual maintenance",
  "KB Bakplaten opslag en voor diepvries": "KB baking sheet storage and in front of freezer",
  "Kettingen, geleiders. Smeren na schoonmaak": "Chains, guides. Lubricate after cleaning",
  "Kijkluiken": "Inspection hatches",
  "Kooi": "Cage",
  "Koppel reiniging machine": "Coupling cleaning machine",
  "Koppelkeer binnenzijden": "Coupling reverser interiors",
  "Koppelkeer buitenzijden": "Coupling reverser exteriors",
  "Krabbers en borstels productcontact": "Scrapers and brushes product contact",
  "Laad docks (Omwille van weersomstandigheden, kan 1x per 2 weken nodig zijn in de winter)": "Loading docks (due to weather, may be needed 1x per 2 weeks in winter)",
  "Leidingwerk, draagbalen, plafond": "Piping, support beams, ceiling",
  "Leidingwerk, draagbalken, plafond": "Piping, support beams, ceiling",
  "Lekbak olie opvang": "Oil drip tray",
  "Let op bij laaddocks, nooit alleen opruimen, in het donker veiligheids lichten gebruiken": "Caution at loading docks, never clean alone, use safety lights in the dark",
  "Loader": "Loader",
  "Loader & unloader oven kruimels reinigen": "Loader & unloader oven, clean crumbs",
  "Loader & unloader oven omgeving": "Loader & unloader oven surroundings",
  "Loader baan": "Loader lane",
  "Luchtzakken ventilatie": "Air bags ventilation",
  "Muren": "Walls",
  "Naaldepanner hekwerk": "Needle depanner fencing",
  "Naast Produktie kantoor en Werkplaats": "Next to Production office and Workshop",
  "Nat schoon maken": "Wet clean",
  "Natreinigen": "Wet clean",
  "Omkasting": "Casing",
  "Onderzijde / dieptereiniging": "Underside / deep clean",
  "Opruimen en tafels afnemen": "Tidy up and wipe tables",
  "Opslagruimte grondstoffen bakkerij": "Bakery raw material storage room",
  "Oudbrood verwerking": "Old bread processing",
  "Perlators reinigen/vervangen": "Clean/replace aerators",
  "Plafond, klima en leidingen": "Ceiling, HVAC and piping",
  "Ramen en kozijnen blikkenopslag Lijn 1": "Windows and frames pan storage Line 1",
  "Ramen en kozijnen kantine": "Windows and frames canteen",
  "Ramen en kozijnen kantoor": "Windows and frames office",
  "Ramen en kozijnen productie Lijn 1": "Windows and frames production Line 1",
  "Ramen en kozijnen productie kantoor": "Windows and frames production office",
  "Ramen kantoor": "Office windows",
  "Reingen": "Clean",
  "Reinigen": "Clean",
  "Reinigen bezems + vloerblikken + handvegers wisselen": "Replace cleaning brooms + dustpans + hand brushes",
  "Reinigen en desinfecteren": "Clean and disinfect",
  "Restafval containers legen": "Empty residual waste containers",
  "Rvs buitenzijde+binnezijde+frame, inspectie": "Stainless steel exterior+interior+frame, inspection",
  "Schakelkast": "Switch cabinet",
  "Schakelkasten uitwendig": "Switch cabinets exterior",
  "Schappen en frame": "Shelves and frame",
  "Schoon spuiten": "Spray clean",
  "Schoon spuiten, binnenkant, buitenkant en onderstel": "Spray clean, inside, outside and base",
  "Spanstation": "Tensioning station",
  "Stofvrij maken": "Dust removal",
  "Stofvrij maken, afnemen met vochtige doek": "Dust removal, wipe with damp cloth",
  "Stofzuigen en dweilen": "Vacuum and mop",
  "Toiletten kantoor": "Office toilets",
  "Tranportbanden, ketting, Smeren na schoonmaak": "Conveyor belts, chain, lubricate after cleaning",
  "Transport aanvoer na koppelkeerder muurzijden": "Transport supply after coupling reverser wall sides",
  "Transport blikken insmeer unit, goed naspoelen met water": "Transport pan greasing unit, rinse well with water",
  "Transport karren casino platen": "Transport carts casino plates",
  "Transport naar unloader": "Transport to unloader",
  "Transport van naalddepanner naar koppelkeer, goed naspoelen met water": "Transport from needle depanner to coupling reverser, rinse well with water",
  "Transport van oven unloader naar naaldepanner": "Transport from oven unloader to needle depanner",
  "Trap": "Stairs",
  "Trechter buiten/bovenzijde": "Funnel exterior/top",
  "Tussen Oven KB en Vaste wand": "Between oven KB and fixed wall",
  "Uitstoot baan, goed naspoelen": "Discharge lane, rinse well",
  "Uitvoerkooi": "Outfeed cage",
  "Unloader": "Unloader",
  "Unloader baan": "Unloader lane",
  "Vloer": "Floor",
  "Vloer binnenkant": "Floor inside",
  "Vloer nat reinigen": "Wet clean floor",
  "Vloer ontdoen van vervuiling": "Remove soiling from floor",
  "Vloer stofzuigen en dweilen": "Vacuum and mop floor",
  "Vloer tussen Klein brood straat": "Floor between small bread line",
  "Volledig reinigen met hogedruk reiniger": "Fully clean with high-pressure cleaner",
  "Voor KB NRK en KB Oven": "Front KB final proofer and KB oven",
  "Voor KB Oven tpv opslag rozijnen": "Front KB oven at raisin storage",
  "Voorraadtank legen, filter reinigen, spoelen": "Empty supply tank, clean filter, rinse",
  "Voorzijde en achterzijde": "Front and back",
  "Vuilniszakken wisselen, handdoekrollen bijvullen, haarnetjes bijvullen, oordopjes bijvullen": "Replace bin bags, refill paper towels, hair nets and ear plugs",
  "Vuilvrij maken": "Clear of dirt",
  "Vullen": "Refill",
  "Wanden": "Walls",
  "Wanden achter inpak lijn 2": "Walls behind packaging line 2",
  "Wanden bakkerij": "Bakery walls",
  "Wanden inpak lijn 1": "Walls packaging line 1",
  "Wanden productie Lijn 1": "Walls production Line 1",
  "Wanden productie Lijn 2": "Walls production Line 2",
  "Wanden verdeelmagazijn": "Walls distribution warehouse",
  "Water sproeier": "Water sprayer",
  "Waterfilter wisselen": "Replace water filter",
  "Waterreservoir ledigen en desinfecteren": "Empty and disinfect water reservoir",
  "Wc behandelen met ontstopper": "Treat toilet with drain unblocker",
  "Weegbunker dieptereiniging": "Weighing bunker deep clean",
  "Zeepautomaten bijvullen, handdrogers": "Refill soap dispensers, hand dryers",
  "binnen en buitenom": "inside and outside",
  "binnen en buitenzijde": "interior and exterior",
  "binnenwerk dieptereiniginging": "interior deep clean",
  "borstels": "brushes",
  "bovenzijde, zijkanten, leidingen": "top, sides, piping",
  "bovenzijde, zijkanten, trapjes, leidingen": "top, sides, steps, piping",
  "buitenom, plexiglas, onderstel": "outside, plexiglass, base",
  "buitenzijde en transport": "exterior and transport",
  "dieptereiniging band": "deep clean belt",
  "dieptereiniging kopmachine tot afzetneus": "deep clean heading machine up to discharge nose",
  "dieptereiniginging binnenwerk": "deep clean interior",
  "dieptereiniginging geleiders, netjeshouders etc": "deep clean guides, net holders etc",
  "geheel": "entire",
  "geleiders / binnenwerk / band / tuimelbak": "guides / interior / belt / tumbler",
  "inclusief bovenbouw / rolbak": "including superstructure / roller tray",
  "inclusief opvangbak, baan en omkasting": "including catch tray, lane and casing",
  "inclusief opvangbak, stellage, baan en omkasting": "including catch tray, rack, lane and casing",
  "koffieautomaat/soepautomaat reinigen -> Omwille van hygiëne voor personeel ondanks score op dagelijks": "clean coffee/soup machine -> for staff hygiene despite daily score",
  "legen/reinigen": "empty/clean",
  "netjes reinigen": "clean nets",
  "omkasting": "casing",
  "onder en bovenzijde": "bottom and top",
  "onderbouw / binnenwerk": "substructure / interior",
  "onderstel dieptereiniginging": "base deep clean",
  "opvangbakken legen en beplating": "empty catch trays and panelling",
  "reinigen": "clean",
  "schaduw borden en onderdelen reinigen": "clean shadow boards and components",
  "schakelband, transportmat": "switch belt, transport mat",
  "stellingen, muren, leidingen, etc": "shelving, walls, piping, etc",
  "uitgave systeem afnemen vochtige doek": "wipe dispensing system with damp cloth",
  "verdampers 3 maal. Leeg rijden": "evaporators 3 times. Drive empty",
  "vloer, luchtkanaal (Let op onderkant)": "floor, air duct (mind the underside)",
  "wanden en deuren. Leeg rijden": "walls and doors. Drive empty",
};


const CONTENT_TR = {
  // Areas
  "Algemeen productie": "General production",
  "Algemene ruimtes": "General areas",
  "Buitenterrein": "Outside area",
  "Expeditie": "Dispatch",
  "Gistruimte": "Yeast room",
  "Inpak VB": "Pack. VB",
  "Inpak VB sneetjes": "Pack. VB slices",
  "Inpak lijn 1": "Packaging line 1",
  "Inpak lijn 2": "Packaging line 2",
  "Koelcel": "Cold storage",
  "Krathandeling": "Crate handling",
  "Lijn 1": "Line 1",
  "Lijn 2": "Line 2",
  "Magazijn": "Warehouse", "magazijn": "warehouse",
  "Productie": "Production", "productie": "production",
  "Vrbrood": "Pre-bread",
  "Vrbrood sneetjes": "Pre-bread slices",
  "Wasplaats": "Wash area",
  // Werkplek (workplace) values — both capitalised and lowercase variants
  // exist in the data; we list the most common shapes explicitly. tr() also
  // tries lowercase fallback so most other variants resolve.
  "Algemeen": "General", "algemeen": "general",
  "Alle": "All",
  "Bakkerij": "Bakery",
  "Dak": "Roof",
  "Deegmakerij": "Dough room", "deegmakerij": "dough room",
  "Deegmakerij/inpak": "Dough room/packaging",
  "Gang": "Corridor",
  "Hygiënesluizen": "Hygiene locks",
  "Inpak": "Packaging", "inpak": "packaging",
  "Kantine": "Canteen", "kantine": "canteen",
  "Kantine/gangen/kleedruimtes": "Canteen/corridors/changing rooms",
  "Kantoor": "Office", "kantoor": "office",
  "Kleedkamer mannen": "Changing room men",
  "Kleedkamer vrouwen": "Changing room women",
  "Krat-dolly banen": "Crate-dolly lanes",
  "Kratten transport": "Crate transport",
  "Machinepark": "Machine park",
  "Ovenist": "Oven operator", "ovenist": "oven operator",
  "Silo's": "Silos",
  "Stapelaars/Ontstapelaars": "Stackers/Unstackers",
  "Technische dienst": "Technical department",
  "Volledig": "Complete",
  "opslag": "storage",
  "overig": "other",
  "productie en inpak": "production and packaging",
  "rozijnen": "raisins",
  "spoelruimtes, verdeel": "rinse rooms, distribution",
  "tussenman": "intermediate operator",
  // Performers
  "Facilitair": "Facility",
  "Operator": "Operator",
  "Extern schoonmaakbedrijf": "External cleaning company",
  "Externe firma": "External firm",
  "Externe firma De Watertoren": "External firm De Watertoren",
  // Frequencies
  "Dagelijks": "Daily", "Wekelijks": "Weekly", "Maandelijks": "Monthly",
  "Per kwartaal": "Quarterly", "Halfjaarlijks": "Semi-annually",
  "Jaarlijks": "Annually", "Elke 2 maanden": "Every 2 months",
  // Common task verbs / fragments
  "Reinigen": "Clean", "Afnemen": "Wipe", "Stofzuigen": "Vacuum",
  "Schrobben": "Scrub", "Inschuimen": "Foaming", "Handmatig": "Manual",
  "Sprayreiniging": "Spray cleaning", "Ledigen": "Empty",
  "Stofvrij maken": "Dust removal", "Extern": "External",
  "Stofvrij maken/bezem": "Dust/broom",
  "Handmatige desinfectie": "Manual disinfection",
  "Handmatige desinfectie (Sirifan Speed)": "Manual disinfection (Sirifan Speed)",
  "Sproeidesinfectie": "Spray disinfection",
  "Hogedruk reiniging": "High-pressure cleaning",
  "Hoge druk reiniging": "High-pressure cleaning",
  "Schrobben/machinaal": "Scrubbing/machine",
  "Vaatwasser": "Dishwasher",
  "Inschuimen (LD1, MD5)": "Foaming (LD1, MD5)",
  "Inschuimen (LD1, MD5, P3-Steril)": "Foaming (LD1, MD5, P3-Steril)",
  "Weken (MD2)": "Soaking (MD2)",
  "Tijdens productie": "During production",
  "Na gebruik": "After use",
  "1x per dag": "1x per day",
  "Zaterdag": "Saturday",
  "2x per week": "2x per week",
  "2 x per week": "2x per week",
  "Indien leeg": "If empty",
  "Indien vol": "If full",
  "12.00": "12:00",
  "1x per jaar": "1x per year",
  "Stof": "Dust", "Stof, aanslag": "Dust, deposits",
  "aangekoekt vuil": "encrusted dirt",
  "Aangekoekt vuil": "Encrusted dirt",
  "algemene vervuiling": "general soiling",
  "Algemene vervuiling": "General soiling",
  "aanslag": "deposits",
  "stof, vuil": "dust, dirt",
  "aanslag, vuil": "deposits, dirt",
  "stof": "dust",
  "Vuil water": "Dirty water",
  "vuil": "dirt",
  "Handsmeer": "Hand grease",
  "handsmeer": "hand grease",
  "smeer/vet/vuil": "grease/fat/dirt",
  "strepen, aanslag, stof": "streaks, deposits, dust",
  "aangekoekt vuil, aanslag": "encrusted dirt, deposits",
  "NVT": "N/A"
};

// Map the active UI language to a BCP-47 locale for date/number formatting.
// PL and RO get their native locales so dates read correctly even though task
// content falls back to English.
function getDateLocale() {
  return ({ nl: 'nl-NL', en: 'en-GB', pl: 'pl-PL', ro: 'ro-RO' })[state.lang] || 'en-GB';
}

function tr(s) {
  if (!s) return s;
  if (state.lang === 'nl') return s;
  const trimmed = s.trim();
  return CONTENT_TR[trimmed] || CONTENT_TR[trimmed.toLowerCase()] || s;
}

// Return the localized 'onderdeel' for a task. Accepts either a task object
// (preferred — supports custom _en overrides) or a raw string. Falls back
// to the original NL value when no translation exists, so missing entries
// degrade gracefully instead of showing blank.
function trOnderdeel(taskOrStr) {
  const isObj = taskOrStr && typeof taskOrStr === 'object';
  const raw = isObj ? (taskOrStr.onderdeel || '') : (taskOrStr || '');
  if (!raw) return raw;
  if (state.lang === 'nl') return raw;
  // Custom user-added tasks may carry their own English variant.
  if (isObj && taskOrStr.onderdeel_en) return taskOrStr.onderdeel_en;
  const trimmed = raw.trim();
  return CONTENT_TR_ONDERDEEL[trimmed] || raw;
}

// Same as trOnderdeel but for the 'subcat' field.
function trSubcat(taskOrStr) {
  const isObj = taskOrStr && typeof taskOrStr === 'object';
  const raw = isObj ? (taskOrStr.subcat || '') : (taskOrStr || '');
  if (!raw) return raw;
  if (state.lang === 'nl') return raw;
  if (isObj && taskOrStr.subcat_en) return taskOrStr.subcat_en;
  const trimmed = raw.trim();
  return CONTENT_TR_SUBCAT[trimmed] || raw;
}

// =====================================================
// AREA META — icon + color per "ruimte" (room)
// =====================================================
// Each room gets a small emoji icon and an accent colour. Used by the task
// table to draw a coloured left border + emoji prefix on each row, which
// makes scanning much easier — you can spot at a glance which area a row
// belongs to without reading the text. The colour also gets applied to a
// small badge in mobile cards.
//
// Unknown rooms fall back to the generic icon and a neutral grey accent.
const AREA_META = {
  "Algemeen productie": { icon: "🏭", color: "#0ea5e9" },  // sky-blue
  "Algemene ruimtes":   { icon: "🏢", color: "#64748b" },  // slate
  "Buitenterrein":      { icon: "🌳", color: "#84cc16" },  // lime
  "Expeditie":          { icon: "🚚", color: "#f59e0b" },  // amber
  "Gistruimte":         { icon: "🧫", color: "#a855f7" },  // purple
  "Inpak VB":           { icon: "📦", color: "#06b6d4" },  // cyan
  "Inpak lijn 1":       { icon: "📦", color: "#3b82f6" },  // blue
  "Inpak lijn 2":       { icon: "📦", color: "#6366f1" },  // indigo
  "Koelcel":            { icon: "🧊", color: "#0891b2" },  // teal/cyan
  "Krathandeling":      { icon: "🗃️", color: "#d97706" },  // dark amber
  "Lijn 1":             { icon: "🍞", color: "#f97316" },  // orange
  "Lijn 2":             { icon: "🍞", color: "#ec4899" },  // pink
  "Magazijn":           { icon: "📦", color: "#8b5cf6" },  // violet
  "Productie":          { icon: "⚙️",  color: "#1d5b42" },  // emerald
  "Wasplaats":          { icon: "🚿", color: "#14b8a6" },  // teal
};
function getAreaMeta(ruimte) {
  // Eerst kijken in custom rooms (fase 5c): als de admin een ruimte heeft
  // gedefinieerd met eigen icoon/kleur, gebruik die. Anders fallback op de
  // hardcoded AREA_META (per default groep).
  if (state.customData && Array.isArray(state.customData.rooms)) {
    const custom = state.customData.rooms.find(r => r && r.name === ruimte);
    if (custom) {
      return {
        icon: custom.icon || "📍",
        color: custom.color || "#94a3b8"
      };
    }
  }
  return AREA_META[ruimte] || { icon: "📍", color: "#94a3b8" };
}

// =====================================================
// WANNEER groupering (gebruikt door Vandaag-view + Schoonmaakronde)
// =====================================================
// Volgorde waarin we taken willen tonen op de Vandaag-view en in de
// schoonmaakronde-modus. De volgorde volgt het werkritme van de bakkerij:
// eerst alles wat tijdens productie continu gebeurt, dan dagelijks/per
// gebruik, dan wekelijkse zaterdagsklussen, ten slotte jaarlijkse en
// niet-getimede taken. Extra waarden uit DATA die niet in deze lijst staan
// belanden in een "Geen tijdstip"-sectie aan het eind.
const WANNEER_ORDER = [
  'Tijdens productie',
  '1x per dag',
  'Na gebruik',
  'Indien leeg',
  'Indien vol',
  '12.00',
  '2x per week',
  'Zaterdag',
  '1x per jaar'
];

// Normaliseer een ruwe wanneer-string naar een groeperingssleutel. Lege
// strings, null/undefined en whitespace-only worden allemaal gemapped naar
// een speciale '__none__'-sleutel zodat ze samenvallen in één bucket.
// Ook wordt interne whitespace gecollapsed zodat varianten zoals "2x per week"
// en "2 x per week" in DATA als één groep verschijnen.
function normalizeWanneer(w) {
  if (w === null || w === undefined) return '__none__';
  let s = String(w).trim();
  if (!s) return '__none__';
  // Collapse interne whitespace + variant "2 x" → "2x"
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\b(\d+)\s*x\b/gi, '$1x');
  return s;
}

// Geeft de positie van een wanneer-waarde in de gewenste sortvolgorde.
// Onbekende waarden (niet in WANNEER_ORDER) komen ná alle bekende waarden
// maar vóór de "geen tijdstip"-bucket, gesorteerd op alfabet (zodat ze
// stabiel groeperen). De "__none__"-sleutel komt altijd helemaal achteraan.
function wanneerSortIndex(key) {
  if (key === '__none__') return 9999;
  const i = WANNEER_ORDER.indexOf(key);
  if (i !== -1) return i;
  return 1000; // unknown but real value
}

// Vertaal een wanneer-sleutel naar een display-label voor de huidige taal.
// '__none__' krijgt een speciale label ("Geen tijdstip" / "No time slot").
// Alle andere waarden gaan door tr() heen zodat de NL→EN-mapping pakt.
function wanneerLabel(key) {
  const L = T[state.lang];
  if (key === '__none__') return L.today_group_none;
  return tr(key);
}

// =====================================================
// VANDAAG-VIEW HELPERS
// =====================================================
// Verzamel alle taken die "vandaag open staan". Dat omvat:
//   - alle daily-taken waarvoor de huidige slot nog niet is afgevinkt
//   - alle taken (alle freqs) die isTaskOverdue() teruggeeft
//   - voor weekly/monthly/etc: taken waarvan de huidige slot nog niet is
//     afgevinkt EN die "actief" zijn voor de huidige periode (bv. een
//     kwartaaltaak alleen tonen in de laatste maand van het kwartaal —
//     daarvoor leunen we op getCurrentSlot + isRealSlot-logica zoals in
//     isTaskOverdue, maar simpeler: tonen zodra het de huidige slot is)
// Geeft één gededupliceerde lijst terug, met taken die al ergens anders zijn
// afgevinkt automatisch uitgefilterd.
function getTasksDueToday() {
  const tasks = getAllTasks();
  const out = [];
  const seen = new Set(); // dedup op task.id (overdue + huidige-slot kunnen overlappen)
  tasks.forEach(t => {
    const fk = t.freq_key;
    if (!fk || fk === 'unknown') return;
    // Sla taken zonder bekende frequentie over.
    if (!['daily','weekly','monthly','bimonthly','quarterly','semiannual','annual'].includes(fk)) return;

    const currentSlot = getCurrentSlot(fk);
    const periodKey = getStoragePeriodKey(fk);
    const periodStore = (state.checks[fk] && state.checks[fk][periodKey]) || {};
    const slots = periodStore[t.id] || {};

    // Helpers
    const slotChecked = (i) => {
      const e = slots[i];
      return e === true || (e && typeof e === 'object' && e.v === true);
    };

    let due = false;

    if (fk === 'daily') {
      // Dagelijks: één slot. Toon als de huidige slot niet afgevinkt is.
      // Op zondag verbergen we daily-taken; de cleaning department werkt niet.
      if (new Date().getDay() === 0) {
        // Toch overdue-items van vrijdag/zaterdag laten meekomen via de
        // generieke overdue-tak hieronder.
      } else if (!anySlotChecked(slots)) {
        due = true;
      }
    } else if (fk === 'weekly') {
      // Wekelijks: 7 slots (zon..zat). Toon als de slot van vandaag leeg is.
      // Verfijning: weekly-taken met een dag-specifieke `wanneer` (Zaterdag,
      // 2x per week) tonen we alleen op de matchende dag(en). Een "Tijdens
      // productie"-weekly-taak is daarentegen continu werk dat ergens deze
      // week moet gebeuren — die laten we elke werkdag in zicht tot afgevinkt.
      if (!slotChecked(currentSlot)) {
        const wkey = normalizeWanneer(t.wanneer);
        const todayIdx = new Date().getDay();
        // bigCleaningDay en twicePerWeekDays komen uit state.schedule
        // (configureerbaar). Default: 6 (za) en [2,5] (di+vr).
        const bigDay = (state.schedule && typeof state.schedule.bigCleaningDay === 'number')
          ? state.schedule.bigCleaningDay : 6;
        const twicePerDays = (state.schedule && Array.isArray(state.schedule.twicePerWeekDays))
          ? state.schedule.twicePerWeekDays : [2, 5];
        if (wkey === 'Zaterdag') {
          // Alleen op de grote-schoonmaak-dag zichtbaar. Niet zichtbaar op
          // andere dagen — de overdue-tak hieronder vangt eventuele
          // achterstanden op (vorige week niet afgevinkt).
          if (todayIdx === bigDay) due = true;
        } else if (wkey === '2x per week') {
          // Twee keer per week — toon op de geconfigureerde dagen.
          if (twicePerDays.includes(todayIdx)) due = true;
        } else {
          due = true;
        }
      }
    } else {
      // Monthly+: alleen tonen als de huidige slot een "echte" periode is
      // voor deze frequentie EN nog niet is afgevinkt. Voor kwartaal betekent
      // dat: alleen in de laatste maand van het kwartaal. Voor jaarlijks
      // alleen in december. Dit voorkomt dat een kwartaaltaak in januari op
      // de Vandaag-view verschijnt terwijl hij pas in maart aan de beurt is.
      const isRealSlot = (i) => {
        if (fk === 'quarterly')  return i % 3 === 2;
        if (fk === 'semiannual') return i % 6 === 5;
        if (fk === 'annual')     return i === 11;
        if (fk === 'bimonthly')  return i % 2 === 1;
        return true; // monthly
      };
      if (isRealSlot(currentSlot) && !slotChecked(currentSlot)) due = true;
    }

    // Achterstand: taken uit een eerdere periode die nooit zijn afgevinkt.
    // Niet voor zondag-suppressed daily — die laten we wél binnen via overdue
    // omdat een vrijdag-taak op zondag wel degelijk te laat is.
    const overdue = isTaskOverdue(t);

    if ((due || overdue) && !seen.has(t.id)) {
      seen.add(t.id);
      // Annoteer of de taak overdue is, zodat de view dit visueel kan tonen.
      out.push(Object.assign({}, t, { __overdue: overdue, __dueToday: due }));
    }
  });
  return out;
}

// Groepeer een lijst taken op `wanneer`-veld in de canonieke volgorde.
// Geeft een array van { key, label, tasks } terug, gesorteerd volgens
// WANNEER_ORDER. Lege groepen worden weggelaten.
function groupTasksByWanneer(tasks) {
  const buckets = {};
  tasks.forEach(t => {
    const key = normalizeWanneer(t.wanneer);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(t);
  });
  const keys = Object.keys(buckets);
  keys.sort((a, b) => {
    const ai = wanneerSortIndex(a);
    const bi = wanneerSortIndex(b);
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b); // stabiel
  });
  return keys.map(k => ({
    key: k,
    label: wanneerLabel(k),
    tasks: buckets[k]
  }));
}

// =====================================================
// S3 / S4 — Hero states for "all done" and empty results
// =====================================================
// These functions render full-width cards above the task table that give
// the page a sense of "doneness" or context, instead of just an empty box.
// Both are pure-string helpers so they slot directly into renderTaskView.

function renderAllDoneHero(taskCount, freqKey) {
  const L = T[state.lang];
  const periodLabel = ({
    daily: L.hero_period_today,
    weekly: L.hero_period_this_week,
    monthly: L.hero_period_this_month,
    bimonthly: L.hero_period_this_period,
    quarterly: L.hero_period_this_quarter,
    semiannual: L.hero_period_this_period,
    annual: L.hero_period_this_year
  })[freqKey] || L.hero_period_this_period;
  return `
    <div class="hero-all-done" role="status" aria-live="polite">
      <div class="hero-all-done-icon" aria-hidden="true">✓</div>
      <div class="hero-all-done-content">
        <div class="hero-all-done-title">${L.hero_all_done_title}</div>
        <div class="hero-all-done-sub">${L.hero_all_done_sub
          .replace('{count}', taskCount)
          .replace('{period}', periodLabel)}</div>
      </div>
      <div class="hero-all-done-decor" aria-hidden="true">
        <span class="hero-confetti hero-confetti-1">✦</span>
        <span class="hero-confetti hero-confetti-2">✧</span>
        <span class="hero-confetti hero-confetti-3">✦</span>
      </div>
    </div>
  `;
}

// =====================================================
// VANDAAG-VIEW (PUNT 1)
// =====================================================
// Smart landing page die alle openstaande taken voor "nu" toont, gegroepeerd
// op `wanneer`-veld. Combineert dagelijkse taken, achterstand uit eerdere
// periodes en weekly/monthly+ taken die in hun huidige slot vallen — alles in
// één lijst zodat een gebruiker direct ziet wat er moet gebeuren zonder per
// frequentie-tab te klikken.

// Format vandaag's datum in de actieve taal, bv. "donderdag 9 mei" of "Thursday May 9".
function formatTodayDate() {
  const d = new Date();
  const locale = getDateLocale();
  try {
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  } catch (e) {
    // Fallback voor browsers/omgevingen zonder Intl
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
}

// Korte freq-label voor de pill op een Today-kaart (één woord per frequentie).
function todayFreqLabel(freqKey) {
  const L = T[state.lang];
  return ({
    daily: L.today_freq_label_daily,
    weekly: L.today_freq_label_weekly,
    monthly: L.today_freq_label_monthly,
    bimonthly: L.today_freq_label_bimonthly,
    quarterly: L.today_freq_label_quarterly,
    semiannual: L.today_freq_label_semiannual,
    annual: L.today_freq_label_annual
  })[freqKey] || freqKey;
}

// Render de Vandaag-view in #filters-and-content. Geen filter-balk en geen
// frequentietabel — alleen een gegroepeerde lijst van openstaande taken.
// Filter-strip op de Vandaag-view: "Alleen mijn taken"-toggle (PUNT 10) +
// notif-status-knop. Alleen zichtbaar als state.currentUser is gezet —
// zonder gebruikersnaam heeft "mijn taken" geen betekenis.
function renderTodayFilterRow() {
  const L = T[state.lang];
  if (!state.currentUser) return '';
  // Hele rij verbergen als zowel assigned als notif zijn uitgeschakeld
  const showMine = isFeatureEnabled('assignedUsers');
  const showNotif = isFeatureEnabled('notifications');
  if (!showMine && !showNotif) return '';
  const isOn = !!state.todayShowMineOnly;
  const filterLabel = isOn ? L.today_my_tasks_filter : L.today_my_tasks_filter_off;
  // Notif-knop: drie staten — niet aangevraagd / aan / geblokkeerd.
  let notifBtn = '';
  if (showNotif && typeof Notification !== 'undefined') {
    const perm = Notification.permission;
    if (perm === 'granted' && state.notifEnabled) {
      notifBtn = `<button class="today-notif-btn is-on" onclick="toggleNotificationsPref()" title="${esc(L.notif_enabled)}">${esc(L.notif_enabled)}</button>`;
    } else if (perm === 'denied') {
      notifBtn = `<button class="today-notif-btn is-blocked" disabled title="${esc(L.notif_blocked)}">${esc(L.notif_blocked)}</button>`;
    } else {
      notifBtn = `<button class="today-notif-btn" onclick="requestNotificationPermission()" title="${esc(L.notif_enable_btn)}">${esc(L.notif_enable_btn)}</button>`;
    }
  }
  const mineToggle = showMine ? `
      <button class="today-mine-toggle ${isOn ? 'is-on' : ''}" onclick="toggleTodayMineFilter()"
              role="switch" aria-checked="${isOn}">
        <span class="today-mine-toggle-thumb" aria-hidden="true"></span>
        <span class="today-mine-toggle-label">${esc(filterLabel)}</span>
      </button>` : '';
  return `
    <div class="today-filter-row">
      ${mineToggle}
      ${notifBtn}
    </div>
  `;
}

// Toggle de Today-mijn-filter. Re-rendert de view zodat de filter direct
// effect heeft op de getoonde lijst.
function toggleTodayMineFilter() {
  state.todayShowMineOnly = !state.todayShowMineOnly;
  saveState();
  if (state.activeTab === 'today') {
    const c = document.getElementById('filters-and-content');
    if (c) c.innerHTML = renderTodayView();
    wireCheckboxes();
  }
}

function renderTodayView() {
  const L = T[state.lang];
  // Zondag: de afdeling werkt niet. Toon een rustdag-kaart i.p.v. taken.
  if (new Date().getDay() === 0) {
    const dateStr = formatTodayDate();
    const restTitle = state.lang === 'nl'
      ? 'Rustdag — geen schoonmaak op zondag'
      : 'Rest day — no cleaning on Sunday';
    const restSub = state.lang === 'nl'
      ? 'De afdeling werkt niet op zondag. Tot maandag!'
      : 'The department does not work on Sundays. See you Monday!';
    return `
      <div class="today-view" id="today-view">
        <div class="today-header">
          <div class="today-header-text">
            <h2 class="today-header-title">${esc(L.today_header_title.replace('{date}', dateStr))}</h2>
          </div>
        </div>
        <div class="hero-all-done today-all-done today-restday" role="status" aria-live="polite">
          <div class="hero-all-done-icon" aria-hidden="true">😴</div>
          <div class="hero-all-done-content">
            <div class="hero-all-done-title">${esc(restTitle)}</div>
            <div class="hero-all-done-sub">${esc(restSub)}</div>
          </div>
        </div>
      </div>`;
  }
  let tasks = getTasksDueToday();
  // Filter "alleen mijn taken" (PUNT 10): toon alleen taken waarvan
  // assigned_user_id (case-insensitive) matcht met state.currentUser.
  // Taken zonder assigned_user_id worden bij dit filter NIET getoond —
  // de filter is opt-in per gebruiker en bedoeld om je persoonlijke
  // werkpakket te zien, niet alle algemene taken.
  if (state.todayShowMineOnly && state.currentUser && isFeatureEnabled('assignedUsers')) {
    const me = String(state.currentUser).toLowerCase();
    tasks = tasks.filter(t => {
      const a = t.assigned_user_id;
      return a && String(a).toLowerCase() === me;
    });
  }
  const total = tasks.length;
  const dateStr = formatTodayDate();

  // Header: titel + count + ronde-knop (start of hervat).
  let countLabel;
  if (total === 0) countLabel = L.today_header_count_zero;
  else if (total === 1) countLabel = L.today_header_count_one.replace('{n}', total);
  else countLabel = L.today_header_count_many.replace('{n}', total);

  // Ronde-knop is contextafhankelijk: bestaat er een actieve ronde, dan toon
  // een Hervat-knop (afgehandeld in fase 3 — voor nu altijd "Begin ronde").
  const round = state.activeRound;
  let roundBtnHtml = '';
  // Ronde-knop alleen tonen als de cleaningRound-feature is ingeschakeld.
  if (total > 0 && isFeatureEnabled('cleaningRound')) {
    if (round && Array.isArray(round.taskIds) && round.taskIds.length > 0) {
      const done = (round.checkedIds || []).length;
      const tot = round.taskIds.length;
      roundBtnHtml = `
        <button class="today-round-btn today-round-btn-resume" onclick="resumeCleaningRound()">
          ${L.today_resume_round_btn.replace('{done}', done).replace('{total}', tot)}
        </button>
        <button class="today-round-btn today-round-btn-new" onclick="startCleaningRoundFromToday()">
          ${L.today_new_round_btn}
        </button>`;
    } else {
      roundBtnHtml = `
        <button class="today-round-btn today-round-btn-start" onclick="startCleaningRoundFromToday()">
          ${L.today_begin_round_btn}
        </button>`;
    }
  }

  let html = `
    <div class="today-view" id="today-view">
      <div class="today-header">
        <div class="today-header-text">
          <h2 class="today-header-title">${esc(L.today_header_title.replace('{date}', dateStr))}</h2>
          <div class="today-header-count">· ${esc(countLabel)}</div>
        </div>
        <div class="today-header-actions">
          ${roundBtnHtml}
        </div>
      </div>
      ${renderTodayFilterRow()}
      ${renderInspectionReminder()}
  `;

  // Hero state: alles klaar.
  if (total === 0) {
    html += `
      <div class="hero-all-done today-all-done" role="status" aria-live="polite">
        <div class="hero-all-done-icon" aria-hidden="true">✓</div>
        <div class="hero-all-done-content">
          <div class="hero-all-done-title">${L.today_all_done_title}</div>
          <div class="hero-all-done-sub">${L.today_all_done_sub}</div>
        </div>
        <div class="hero-all-done-decor" aria-hidden="true">
          <span class="hero-confetti hero-confetti-1">✦</span>
          <span class="hero-confetti hero-confetti-2">✧</span>
          <span class="hero-confetti hero-confetti-3">✦</span>
        </div>
      </div>
    </div>`;
    return html;
  }

  // Groepering op wanneer-veld in canonieke volgorde.
  const groups = groupTasksByWanneer(tasks);
  groups.forEach(group => {
    const cnt = group.tasks.length;
    const cntLabel = cnt === 1
      ? L.today_section_count_one.replace('{n}', cnt)
      : L.today_section_count_many.replace('{n}', cnt);
    html += `
      <section class="today-group" data-wanneer-key="${esc(group.key)}">
        <div class="today-group-header" role="heading" aria-level="3">
          <span class="today-group-icon" aria-hidden="true">⏱</span>
          <h3 class="today-group-title">${esc(group.label)}</h3>
          <span class="today-group-count">${esc(cntLabel)}</span>
        </div>
        <div class="today-group-body">
          ${group.tasks.map(t => renderTodayTaskCard(t)).join('')}
        </div>
      </section>
    `;
  });

  html += '</div>'; // .today-view
  return html;
}

// Eén taakkaart op de Vandaag-view. Hergebruikt dezelfde .check-box-markup
// als de freq-tabs, zodat wireCheckboxes() de afvink-handler kan binden.
function renderTodayTaskCard(t) {
  const L = T[state.lang];
  const fk = t.freq_key;
  const slotIdx = getCurrentSlot(fk);
  const checked = isChecked(fk, t.id, slotIdx);
  const areaMeta = getAreaMeta(t.ruimte);
  const overdue = !!t.__overdue;
  const middel = renderProductLink(t.middel);
  const pbm = renderPbmIcons(t);
  return `
    <article class="today-task-card ${checked ? 'task-done' : ''} ${overdue ? 'task-overdue' : ''}"
             data-task-id="${esc(t.id)}" data-freq-key="${esc(fk)}"
             style="--area-color: ${areaMeta.color};">
      <div class="today-task-check-wrap">
        <div class="check-box ${checked ? 'checked' : ''}"
             data-freq="${esc(fk)}" data-task="${esc(t.id)}" data-slot="${slotIdx}"
             role="checkbox" aria-checked="${checked}" tabindex="0"
             aria-label="${esc(L.bulk_select_row || 'Toggle')}"></div>
      </div>
      <div class="today-task-body">
        <div class="today-task-pills">
          <span class="area-badge today-area-badge" style="--area-color: ${areaMeta.color};">
            <span class="area-icon" aria-hidden="true">${areaMeta.icon}</span>${esc(tr(t.ruimte))}
          </span>
          <span class="today-freq-pill today-freq-${fk}">${esc(todayFreqLabel(fk))}</span>
          ${overdue ? `<span class="today-overdue-pill">⚠ ${esc(L.today_overdue_pill)}</span>` : ''}
          ${(t.assigned_user_id && isFeatureEnabled('assignedUsers')) ? `<span class="today-assigned-pill" title="${esc(L.assigned_user_label)}: ${esc(t.assigned_user_id)}">👤 ${esc(t.assigned_user_id)}</span>` : ''}
        </div>
        <div class="today-task-title">${esc(trOnderdeel(t))}</div>
        ${t.subcat ? `<div class="today-task-desc">${esc(trSubcat(t))}</div>` : ''}
        ${t.werkplek ? `<div class="today-task-meta">📍 ${esc(tr(t.werkplek))}</div>` : ''}
        <div class="today-task-meta-row">
          ${t.methode ? `<span class="today-task-meta-item"><span class="today-meta-label">${L.round_label_method}:</span> ${esc(tr(t.methode))}</span>` : ''}
          ${t.middel ? `<span class="today-task-meta-item"><span class="today-meta-label">${L.round_label_product}:</span> ${middel}</span>` : ''}
        </div>
        ${pbm ? `<div class="today-task-pbm">${pbm}</div>` : ''}
      </div>
    </article>
  `;
}

// Surgical update na een check op de Today-view: verwijder de kaart als hij
// nu afgevinkt is, update de groep-tellers, en check of de hele view nu leeg
// is — in dat geval rendert hij zichzelf opnieuw zodat de Alles-klaar-hero
// verschijnt.
function updateTodayAfterCheck(taskId) {
  const view = document.getElementById('today-view');
  if (!view) return; // niet op Today
  // Vind kaart via attribuut-iteratie — veiliger dan querySelector met dynamische ID.
  let card = null;
  view.querySelectorAll('.today-task-card').forEach(c => {
    if (!card && c.getAttribute('data-task-id') === taskId) card = c;
  });
  if (!card) return;
  // Lees of de check nu echt aan staat (kan ook uitgevinkt zijn). Als nog
  // open → laat de kaart staan (state-update via wireCheckboxes is genoeg).
  const fk = card.getAttribute('data-freq-key');
  const slotIdx = getCurrentSlot(fk);
  const isOn = isChecked(fk, taskId, slotIdx);
  if (!isOn) {
    // Uitgevinkt — markeer kaart weer als open.
    card.classList.remove('task-done');
    return;
  }
  // Aangevinkt: fade kaart uit, dan verwijder.
  card.classList.add('today-card-removing');
  setTimeout(() => {
    const group = card.closest('.today-group');
    card.remove();
    // Update group counter; verwijder hele group als leeg.
    if (group) {
      const remaining = group.querySelectorAll('.today-task-card').length;
      if (remaining === 0) {
        group.remove();
      } else {
        const cntEl = group.querySelector('.today-group-count');
        if (cntEl) {
          const lbl = remaining === 1
            ? T[state.lang].today_section_count_one.replace('{n}', remaining)
            : T[state.lang].today_section_count_many.replace('{n}', remaining);
          cntEl.textContent = lbl;
        }
      }
    }
    // Check of view nu helemaal leeg is.
    const stillThere = view.querySelectorAll('.today-task-card').length;
    if (stillThere === 0) {
      // Re-render via renderContent zodat de Alles-klaar-hero verschijnt.
      const c = document.getElementById('filters-and-content');
      if (c) c.innerHTML = renderTodayView();
    } else {
      // Update header-count zonder full render.
      const total = view.querySelectorAll('.today-task-card').length;
      const cnt = total === 1
        ? T[state.lang].today_header_count_one.replace('{n}', total)
        : T[state.lang].today_header_count_many.replace('{n}', total);
      const cntEl = view.querySelector('.today-header-count');
      if (cntEl) cntEl.textContent = '· ' + cnt;
    }
  }, 280); // moet matchen met CSS-transition-duur
}

// =====================================================
// COÖRDINATOR-OVERZICHT (admin/superuser)
// =====================================================
// Een "klassieke" view voor coördinatoren: sub-tabbalk met de zeven
// frequenties bovenaan, daaronder de bestaande filter-balk + tabel-view per
// frequentie. Alleen zichtbaar voor admin/super-user/local-mode (gated in
// renderSidebar). Geen freq-overdue-scan of fancy groepering — gewoon de
// volledige tabel zoals voor de Today-refactor.
//
// Implementatie-keuze: we hergebruiken renderFiltersBar() (en daarmee
// renderTaskView() en renderTaskCardsMobile()) door state.activeTab
// tijdelijk te zwappen naar de coordinator-active-freq tijdens render.
// Dit is een chirurgische hack maar voorkomt duplicatie van honderden
// regels render-code en houdt cloud-sync, wireCheckboxes, edit-modus en
// filtering 100% identiek aan de freq-tabs.

// =====================================================
// INSTELLINGEN (Etsy-customisation)
// =====================================================
// Alleen admin/super-user. Vier secties: branding, schedule, features, data.
// Fase 1 = lege placeholders. Fase 2-5 vullen de content in.

const SETTINGS_SECTIONS = ['branding', 'schedule', 'features', 'data'];

function renderSettingsView() {
  const L = T[state.lang];
  const local = !state.authUser;
  const admin = local || isAdmin();
  if (!admin) {
    return `
      <div class="settings-view" style="display:block;padding:40px;text-align:center;">
        <div class="empty-state-icon">🔒</div>
        <p style="color:var(--text-muted);margin-top:8px;">${esc(L.settings_admin_only)}</p>
      </div>
    `;
  }

  const active = SETTINGS_SECTIONS.includes(state.settingsActiveSection)
    ? state.settingsActiveSection : 'branding';

  const sectionMeta = {
    branding: { icon: '🎨', label: L.settings_section_branding },
    schedule: { icon: '📅', label: L.settings_section_schedule },
    features: { icon: '🧩', label: L.settings_section_features },
    data:     { icon: '📦', label: L.settings_section_data }
  };

  const navHtml = SETTINGS_SECTIONS.map(key => {
    const m = sectionMeta[key];
    return `<button class="settings-nav-item ${active === key ? 'active' : ''}"
                    onclick="switchSettingsSection('${key}')"
                    aria-current="${active === key ? 'page' : 'false'}">
      <span class="settings-nav-icon" aria-hidden="true">${m.icon}</span>
      ${esc(m.label)}
    </button>`;
  }).join('');

  const sectionContent = renderSettingsSection(active);
  const meta = sectionMeta[active];

  return `
    <div class="settings-view" id="settings-view">
      <nav class="settings-sidebar" aria-label="${esc(L.settings_title)}">
        <div class="settings-sidebar-title">${esc(L.settings_title)}</div>
        ${navHtml}
      </nav>
      <div class="settings-content">
        <h2 class="settings-section-title">${meta.icon} ${esc(sectionMeta[active].label)}</h2>
        <p class="settings-section-sub">${esc(L['settings_section_' + active + '_sub'] || '')}</p>
        ${sectionContent}
      </div>
    </div>
  `;
}

// Sectie-content router. Fase 1 = placeholders. Latere fases vervangen de
// individuele case-blocks zonder de router-structuur te raken.
function renderSettingsSection(key) {
  const L = T[state.lang];
  switch (key) {
    case 'branding': return renderSettingsBranding(L);
    case 'schedule': return renderSettingsSchedule(L);
    case 'features': return renderSettingsFeatures(L);
    case 'data':     return renderSettingsData(L);
    default:         return '';
  }
}

function renderSettingsBranding(L) {
  const b = state.branding || {};
  const accent = b.accentColor || '#1d5b42';
  const hasLogo = !!b.logoDataUrl;
  const hasDarkLogo = !!b.logoDarkDataUrl;

  const PRESETS = [
    { name: 'green',  hex: '#1d5b42' },
    { name: 'blue',   hex: '#3b82f6' },
    { name: 'indigo', hex: '#6366f1' },
    { name: 'purple', hex: '#8b5cf6' },
    { name: 'pink',   hex: '#ec4899' },
    { name: 'red',    hex: '#ef4444' },
    { name: 'orange', hex: '#f97316' },
    { name: 'amber',  hex: '#f59e0b' }
  ];
  const presetSwatchesHtml = PRESETS.map(p => {
    const isActive = (b.accentColor || '#1d5b42').toLowerCase() === p.hex.toLowerCase();
    return `<button type="button"
                    class="brand-color-swatch ${isActive ? 'is-active' : ''}"
                    data-hex="${p.hex}"
                    style="background: ${p.hex}"
                    aria-label="${p.name}"
                    aria-pressed="${isActive ? 'true' : 'false'}"></button>`;
  }).join('');

  return `
    <div class="settings-form">

      <div class="settings-field-row">
        <div class="settings-field-label-col">
          <label class="settings-label" for="brand-company">${esc(L.settings_brand_company_label)}</label>
          <p class="settings-help">${esc(L.settings_brand_company_help)}</p>
        </div>
        <div class="settings-field-input-col">
          <input type="text" id="brand-company" class="settings-input"
                 value="${esc(b.companyName || '')}"
                 placeholder="${esc(L.settings_brand_company_placeholder)}"
                 data-brand-field="companyName" maxlength="60">
        </div>
      </div>

      <div class="settings-field-row">
        <div class="settings-field-label-col">
          <label class="settings-label" for="brand-doc">${esc(L.settings_brand_doc_label)}</label>
          <p class="settings-help">${esc(L.settings_brand_doc_help)}</p>
        </div>
        <div class="settings-field-input-col">
          <input type="text" id="brand-doc" class="settings-input"
                 value="${esc(b.docCode || '')}"
                 placeholder="${esc(L.settings_brand_doc_placeholder)}"
                 data-brand-field="docCode" maxlength="30">
        </div>
      </div>

      <div class="settings-field-row">
        <div class="settings-field-label-col">
          <label class="settings-label" for="brand-subtitle">${esc(L.settings_brand_subtitle_label)}</label>
          <p class="settings-help">${esc(L.settings_brand_subtitle_help)}</p>
        </div>
        <div class="settings-field-input-col">
          <input type="text" id="brand-subtitle" class="settings-input"
                 value="${esc(b.subtitle || '')}"
                 placeholder="${esc(L.settings_brand_subtitle_placeholder)}"
                 data-brand-field="subtitle" maxlength="80">
        </div>
      </div>

      <div class="settings-field-row">
        <div class="settings-field-label-col">
          <label class="settings-label">${esc(L.settings_brand_logo_label)}</label>
          <p class="settings-help">${esc(L.settings_brand_logo_help)}</p>
        </div>
        <div class="settings-field-input-col">
          <div class="brand-logo-uploader">
            <div class="brand-logo-preview ${hasLogo ? 'has-logo' : 'empty'}">
              ${hasLogo
                ? `<img src="${esc(b.logoDataUrl)}" alt="logo preview">`
                : `<span class="brand-logo-empty-icon" aria-hidden="true">🖼️</span>`}
            </div>
            <div class="brand-logo-controls">
              <input type="file" id="brand-logo-input" accept="image/png,image/jpeg,image/svg+xml" hidden>
              <button type="button" class="settings-btn" onclick="document.getElementById('brand-logo-input').click()">${esc(L.settings_brand_logo_upload)}</button>
              ${hasLogo ? `<button type="button" class="settings-btn-ghost" onclick="removeBrandLogo(false)">${esc(L.settings_brand_logo_remove)}</button>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="settings-field-row">
        <div class="settings-field-label-col">
          <label class="settings-label">${esc(L.settings_brand_logo_dark_label)}</label>
          <p class="settings-help">${esc(L.settings_brand_logo_dark_help)}</p>
        </div>
        <div class="settings-field-input-col">
          <div class="brand-logo-uploader">
            <div class="brand-logo-preview brand-logo-preview-dark ${hasDarkLogo ? 'has-logo' : 'empty'}">
              ${hasDarkLogo
                ? `<img src="${esc(b.logoDarkDataUrl)}" alt="dark logo preview">`
                : `<span class="brand-logo-empty-icon" aria-hidden="true">🌙</span>`}
            </div>
            <div class="brand-logo-controls">
              <input type="file" id="brand-logo-dark-input" accept="image/png,image/jpeg,image/svg+xml" hidden>
              <button type="button" class="settings-btn" onclick="document.getElementById('brand-logo-dark-input').click()">${esc(L.settings_brand_logo_upload)}</button>
              ${hasDarkLogo ? `<button type="button" class="settings-btn-ghost" onclick="removeBrandLogo(true)">${esc(L.settings_brand_logo_remove)}</button>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="settings-field-row">
        <div class="settings-field-label-col">
          <label class="settings-label">${esc(L.settings_brand_color_label)}</label>
          <p class="settings-help">${esc(L.settings_brand_color_help)}</p>
        </div>
        <div class="settings-field-input-col">
          <div class="brand-color-row">
            <div class="brand-color-swatches">${presetSwatchesHtml}</div>
            <div class="brand-color-custom">
              <input type="color" id="brand-color-custom" value="${esc(accent)}" aria-label="${esc(L.settings_brand_color_custom)}">
              <span class="brand-color-hex">${esc(accent.toUpperCase())}</span>
            </div>
          </div>
          <!-- LIVE-VOORBEELD -->
          <div class="settings-preview" id="brand-preview" style="margin-top: 16px;">
            <div class="settings-preview-label">${esc(L.settings_brand_preview_title)}</div>
            <div class="settings-preview-content">
              <div class="settings-preview-mini-header">
                ${hasLogo ? `<img src="${esc(b.logoDataUrl)}" alt="" class="settings-preview-logo">` : ''}
                <div class="settings-preview-titles">
                  <div class="settings-preview-company">${esc(b.companyName || L.app_title || 'Schoonmaakplan')}</div>
                  <div class="settings-preview-subtitle">${esc((b.subtitle || '') + (b.docCode ? ' · ' + b.docCode : ''))}</div>
                </div>
              </div>
              <div class="settings-preview-elements">
                <button class="settings-preview-button">${esc(L.settings_brand_preview_btn)}</button>
                <a href="#" onclick="return false" class="settings-preview-link">${esc(L.settings_brand_preview_link)}</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-actions">
        <button class="settings-btn-primary" id="brand-save-btn" onclick="saveBrandingSettings()">
          ${esc(L.settings_brand_save)}
        </button>
      </div>

    </div>
  `;
}
function renderSettingsSchedule(L) {
  const s = state.schedule || {};
  const workDays = Array.isArray(s.workDays) ? s.workDays : [1,2,3,4,5,6];
  const shifts = Array.isArray(s.shifts) ? s.shifts : [{hour:6,minute:0},{hour:14,minute:0}];
  const bigDay = (typeof s.bigCleaningDay === 'number') ? s.bigCleaningDay : 6;
  const twicePer = Array.isArray(s.twicePerWeekDays) ? s.twicePerWeekDays : [2,5];

  // 7 weekday-pills, Zo=0..Za=6. Voor visuele week-volgorde tonen we
  // Ma-Zo (1,2,3,4,5,6,0) — dat past beter bij Europese gewoonten.
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
  const weekdayShortLabels = {
    0: L.weekday_short_su, 1: L.weekday_short_mo, 2: L.weekday_short_tu,
    3: L.weekday_short_we, 4: L.weekday_short_th, 5: L.weekday_short_fr,
    6: L.weekday_short_sa
  };

  const workDaysHtml = weekdayOrder.map(d => {
    const isActive = workDays.includes(d);
    return `<button type="button"
                    class="sched-day-pill ${isActive ? 'is-active' : ''}"
                    data-day="${d}"
                    data-pill-type="workday"
                    aria-pressed="${isActive ? 'true' : 'false'}">
      ${esc(weekdayShortLabels[d])}
    </button>`;
  }).join('');

  // Big-day: radio-knoppen, één keuze
  const bigDayHtml = weekdayOrder.map(d => {
    const isActive = d === bigDay;
    return `<button type="button"
                    class="sched-day-pill sched-day-pill-radio ${isActive ? 'is-active' : ''}"
                    data-day="${d}"
                    data-pill-type="bigday"
                    aria-pressed="${isActive ? 'true' : 'false'}">
      ${esc(weekdayShortLabels[d])}
    </button>`;
  }).join('');

  // 2x per week: checkbox-pills, precies 2 selecteerbaar
  const twiceHtml = weekdayOrder.map(d => {
    const isActive = twicePer.includes(d);
    return `<button type="button"
                    class="sched-day-pill ${isActive ? 'is-active' : ''}"
                    data-day="${d}"
                    data-pill-type="twice"
                    aria-pressed="${isActive ? 'true' : 'false'}">
      ${esc(weekdayShortLabels[d])}
    </button>`;
  }).join('');

  // Shifts: max 4. Voor elke shift een tijd-input + remove-knop.
  const shiftsHtml = shifts.map((shift, idx) => `
    <div class="sched-shift-row" data-shift-idx="${idx}">
      <input type="time" class="sched-shift-input"
             value="${String(shift.hour).padStart(2,'0')}:${String(shift.minute).padStart(2,'0')}"
             data-shift-idx="${idx}">
      <button type="button" class="settings-btn-ghost sched-shift-remove" data-shift-idx="${idx}">
        ${esc(L.settings_sched_shift_remove)}
      </button>
    </div>
  `).join('');

  return `
    <div class="settings-form">

      <!-- WERKDAGEN -->
      <div class="settings-field">
        <label class="settings-label">${esc(L.settings_sched_workdays_label)}</label>
        <div class="sched-day-pills" id="sched-workdays">
          ${workDaysHtml}
        </div>
        <p class="settings-help">${esc(L.settings_sched_workdays_help)}</p>
      </div>

      <!-- SHIFT-TIJDEN -->
      <div class="settings-field">
        <label class="settings-label">${esc(L.settings_sched_shifts_label)}</label>
        <div class="sched-shifts" id="sched-shifts">
          ${shiftsHtml}
        </div>
        ${shifts.length < 4
          ? `<button type="button" class="settings-btn" id="sched-shift-add-btn">${esc(L.settings_sched_shift_add)}</button>`
          : ''}
        <p class="settings-help">${esc(L.settings_sched_shifts_help)}</p>
      </div>

      <!-- BIG-DAY -->
      <div class="settings-field">
        <label class="settings-label">${esc(L.settings_sched_bigday_label)}</label>
        <div class="sched-day-pills" id="sched-bigday">
          ${bigDayHtml}
        </div>
        <p class="settings-help">${esc(L.settings_sched_bigday_help)}</p>
      </div>

      <!-- 2X PER WEEK -->
      <div class="settings-field">
        <label class="settings-label">${esc(L.settings_sched_twice_label)}</label>
        <div class="sched-day-pills" id="sched-twice">
          ${twiceHtml}
        </div>
        <p class="settings-help">${esc(L.settings_sched_twice_help)}</p>
      </div>

      <!-- ACTIES -->
      <div class="settings-actions">
        <button class="settings-btn-primary" onclick="saveScheduleSettings()">
          ${esc(L.settings_sched_save)}
        </button>
      </div>

    </div>
  `;
}
function renderSettingsFeatures(L) {
  const f = state.features || {};
  // 9 feature-toggles in een logische volgorde: kern → modules → integraties.
  // Sommige hebben waarschuwingen omdat uitzetten zichtbare gevolgen heeft.
  const features = [
    { key: 'cloudSync',     warning: 'settings_feat_warning_cloudSync' },
    { key: 'roles',         warning: null },
    { key: 'cleaningRound', warning: null },
    { key: 'notifications', warning: null },
    { key: 'qrCodes',       warning: null },
    { key: 'photos',        warning: null },
    { key: 'excelExport',   warning: null },
    { key: 'changelog',     warning: 'settings_feat_warning_changelog' },
    { key: 'assignedUsers', warning: null }
  ];

  const togglesHtml = features.map(item => {
    const isOn = f[item.key] !== false; // default true
    const label = L['settings_feat_' + item.key + '_label'] || item.key;
    const help = L['settings_feat_' + item.key + '_help'] || '';
    const warning = item.warning ? L[item.warning] : '';
    return `
      <div class="feat-row" data-feature="${esc(item.key)}">
        <div class="feat-row-text">
          <div class="feat-row-label">${esc(label)}</div>
          <div class="feat-row-help">${esc(help)}</div>
          ${warning ? `<div class="feat-row-warning">${esc(warning)}</div>` : ''}
        </div>
        <label class="feat-toggle" aria-label="${esc(label)}">
          <input type="checkbox"
                 class="feat-toggle-input"
                 data-feature="${esc(item.key)}"
                 ${isOn ? 'checked' : ''}>
          <span class="feat-toggle-slider"></span>
        </label>
      </div>
    `;
  }).join('');

  return `
    <div class="settings-form">
      <p class="settings-intro">${esc(L.settings_feat_intro)}</p>
      <div class="feat-list">
        ${togglesHtml}
      </div>
      <div class="settings-actions">
        <button class="settings-btn-primary" onclick="saveFeatureSettings()">
          ${esc(L.settings_feat_save)}
        </button>
      </div>
    </div>
  `;
}
function renderSettingsData(L) {
  const cd = state.customData || { soilingTypes: [], ppeItems: [], rooms: [] };
  const taskCount = (DATA.tasks || []).length + (state.customTasks || []).length;

  // Starter-templates — 4 vooraf gedefinieerde bedrijfstypes
  const starters = [
    { key: 'bakery',     label: L.settings_data_starter_bakery,     sub: L.settings_data_starter_bakery_sub,     icon: '🥖' },
    { key: 'restaurant', label: L.settings_data_starter_restaurant, sub: L.settings_data_starter_restaurant_sub, icon: '🍽️' },
    { key: 'office',     label: L.settings_data_starter_office,     sub: L.settings_data_starter_office_sub,     icon: '🏢' },
    { key: 'salon',      label: L.settings_data_starter_salon,      sub: L.settings_data_starter_salon_sub,      icon: '💇' }
  ];
  const startersHtml = starters.map(s => `
    <div class="data-starter-card">
      <div class="data-starter-icon">${s.icon}</div>
      <div class="data-starter-text">
        <div class="data-starter-label">${esc(s.label)}</div>
        <div class="data-starter-sub">${esc(s.sub)}</div>
      </div>
      <button class="settings-btn" onclick="loadStarterTemplate('${s.key}')">${esc(L.settings_data_starter_load)}</button>
    </div>
  `).join('');

  // Custom soiling-types lijst
  const soilingHtml = (cd.soilingTypes && cd.soilingTypes.length > 0)
    ? cd.soilingTypes.map((s, i) => `
        <div class="data-list-row">
          <input type="text" class="settings-input data-soiling-input" data-idx="${i}" value="${esc(s)}">
          <button class="settings-btn-ghost" onclick="removeSoilingType(${i})">×</button>
        </div>`).join('')
    : '<p class="settings-help" style="margin: 0;"><em>Geen custom types — standaardlijst wordt gebruikt.</em></p>';

  // Custom PBM-items
  const ppeHtml = (cd.ppeItems && cd.ppeItems.length > 0)
    ? cd.ppeItems.map((p, i) => `
        <div class="data-list-row data-ppe-row">
          <input type="text" class="settings-input data-ppe-emoji" data-idx="${i}" value="${esc(p.emoji || '')}" maxlength="4" style="width: 70px;">
          <input type="text" class="settings-input data-ppe-label" data-idx="${i}" value="${esc(p.label || '')}">
          <button class="settings-btn-ghost" onclick="removePpeItem(${i})">×</button>
        </div>`).join('')
    : '<p class="settings-help" style="margin: 0;"><em>Geen custom PBM — standaardlijst wordt gebruikt.</em></p>';

  // Ruimtes-beheer
  const roomsHtml = (cd.rooms && cd.rooms.length > 0)
    ? cd.rooms.map((r, i) => `
        <div class="data-list-row data-room-row">
          <input type="text" class="settings-input data-room-name" data-idx="${i}" value="${esc(r.name || '')}" placeholder="${esc(L.settings_data_rooms_name)}">
          <input type="text" class="settings-input data-room-icon" data-idx="${i}" value="${esc(r.icon || '')}" maxlength="4" style="width: 70px;" placeholder="${esc(L.settings_data_rooms_icon)}">
          <input type="color" class="settings-input data-room-color" data-idx="${i}" value="${esc(r.color || '#1d5b42')}" style="width: 50px; padding: 2px;">
          <button class="settings-btn-ghost" onclick="removeRoom(${i})">×</button>
        </div>`).join('')
    : '<p class="settings-help" style="margin: 0;"><em>Geen custom ruimtes — gedetecteerd uit bestaande taken.</em></p>';

  return `
    <div class="settings-form">
      <p class="settings-intro">${esc(L.settings_data_intro)}</p>

      <!-- EXPORT -->
      <div class="data-card">
        <h3 class="data-card-title">${esc(L.settings_data_export_title)}</h3>
        <p class="settings-help">${esc(L.settings_data_export_help)}</p>
        <button class="settings-btn" onclick="exportPlanAsTemplate()">${esc(L.settings_data_export_btn)} (${taskCount} taken)</button>
      </div>

      <!-- IMPORT -->
      <div class="data-card">
        <h3 class="data-card-title">${esc(L.settings_data_import_title)}</h3>
        <p class="settings-help">${esc(L.settings_data_import_help)}</p>
        <input type="file" id="data-import-input" accept="application/json,.json" hidden>
        <button class="settings-btn" onclick="document.getElementById('data-import-input').click()">${esc(L.settings_data_import_btn)}</button>
      </div>

      <!-- STARTERS -->
      <div class="data-card">
        <h3 class="data-card-title">${esc(L.settings_data_starters_title)}</h3>
        <p class="settings-help">${esc(L.settings_data_starters_help)}</p>
        <div class="data-starters-grid">${startersHtml}</div>
      </div>

      <!-- CUSTOM SOILING TYPES -->
      <div class="data-card">
        <h3 class="data-card-title">${esc(L.settings_data_soiling_title)}</h3>
        <p class="settings-help">${esc(L.settings_data_soiling_help)}</p>
        <div class="data-list" id="data-soiling-list">${soilingHtml}</div>
        <div class="data-list-actions">
          <button class="settings-btn" onclick="addSoilingType()">${esc(L.settings_data_soiling_add)}</button>
          ${(cd.soilingTypes && cd.soilingTypes.length > 0) ? `<button class="settings-btn-primary" onclick="saveSoilingTypes()">${esc(L.settings_data_soiling_save)}</button>` : ''}
        </div>
      </div>

      <!-- CUSTOM PPE -->
      <div class="data-card">
        <h3 class="data-card-title">${esc(L.settings_data_ppe_title)}</h3>
        <p class="settings-help">${esc(L.settings_data_ppe_help)}</p>
        <div class="data-list" id="data-ppe-list">${ppeHtml}</div>
        <div class="data-list-actions">
          <button class="settings-btn" onclick="addPpeItem()">${esc(L.settings_data_ppe_add)}</button>
          ${(cd.ppeItems && cd.ppeItems.length > 0) ? `<button class="settings-btn-primary" onclick="savePpeItems()">${esc(L.settings_data_ppe_save)}</button>` : ''}
        </div>
      </div>

      <!-- ROOMS -->
      <div class="data-card">
        <h3 class="data-card-title">${esc(L.settings_data_rooms_title)}</h3>
        <p class="settings-help">${esc(L.settings_data_rooms_help)}</p>
        <div class="data-list" id="data-rooms-list">${roomsHtml}</div>
        <div class="data-list-actions">
          <button class="settings-btn" onclick="addRoom()">${esc(L.settings_data_rooms_add)}</button>
          ${(cd.rooms && cd.rooms.length > 0) ? `<button class="settings-btn-primary" onclick="saveRooms()">${esc(L.settings_data_rooms_save)}</button>` : ''}
        </div>
      </div>

      <!-- RESET (gevaarlijke actie, onderaan) -->
      <div class="data-card data-card-danger">
        <h3 class="data-card-title">${esc(L.settings_data_reset_title)}</h3>
        <p class="settings-help">${esc(L.settings_data_reset_help)}</p>
        <button class="settings-btn-danger" onclick="resetPlanFromSettings()">${esc(L.settings_data_reset_btn)}</button>
      </div>

    </div>
  `;
}

function switchSettingsSection(key) {
  if (!SETTINGS_SECTIONS.includes(key)) return;
  if (state.settingsActiveSection === key) return;
  state.settingsActiveSection = key;
  saveState();
  if (state.activeTab !== 'settings') return;
  const c = document.getElementById('filters-and-content');
  if (c) {
    c.innerHTML = renderSettingsView();
    wireSettingsView();
  }
}

// Wire-helper voor settings-view. Wordt aangeroepen na elke render van
// een settings-sectie zodat input-events correct gekoppeld zijn.
function wireSettingsView() {
  const section = state.settingsActiveSection || 'branding';
  if (section === 'branding') wireBrandingSection();
  else if (section === 'schedule') wireScheduleSection();
  else if (section === 'features') wireFeaturesSection();
  else if (section === 'data') wireDataSection();
}

// =====================================================
// FASE 5: DATA-MANAGEMENT
// =====================================================
// Plan-reset, JSON-template-export/import, starter-templates voor 4
// bedrijfstypes, en custom vervuilingstypes/PBM-items/ruimtes.

function wireDataSection() {
  // Import-input handler (klik op knop trigger file-dialog)
  const importInput = document.getElementById('data-import-input');
  if (importInput) {
    importInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) handleTemplateImport(file);
      // Reset zodat dezelfde file opnieuw kan worden geselecteerd
      e.target.value = '';
    };
  }
}

// ===== PLAN EXPORT/IMPORT (sub-feature 5a) =====

// Exporteer huidige plan als JSON-template. Bevat alleen plan-structuur
// (taken, products, methods, custom data) — geen check-data, pending changes
// of foto's. Bedoeld als deelbaar template tussen vestigingen.
function exportPlanAsTemplate() {
  const L = T[state.lang];
  const template = {
    _type: 'cleaning-plan-template',
    _version: 1,
    _exportedAt: new Date().toISOString(),
    _appVersion: getLatestVersion(),
    name: (state.branding && state.branding.companyName) || (state.plans[state.activePlanId] && state.plans[state.activePlanId].name) || 'Schoonmaakplan',
    tasks: (DATA.tasks || []).slice(),
    customTasks: state.customTasks || [],
    products: DATA.products || [],
    methods: DATA.methods || [],
    versions: DATA.versions || [],
    taskOverrides: state.taskOverrides || {},
    taskNvtFields: state.taskNvtFields || {},
    deletedBuiltinIds: state.deletedBuiltinIds || [],
    branding: state.branding || {},
    schedule: state.schedule || {},
    customData: state.customData || { soilingTypes: [], ppeItems: [], rooms: [] }
  };
  const json = JSON.stringify(template, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Filename uit branding company name + datum
  const baseFn = L.settings_data_export_filename;
  const company = (state.branding && state.branding.companyName)
    ? '-' + state.branding.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : '';
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `${baseFn}${company}-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(L.settings_data_export_success, 'success');
}

// Importeer een template-bestand. Vraagt confirmation, valideert structuur,
// en past dan toe. Check-data en pendingChanges blijven bewaard (niet
// overschreven) zodat een import niet stilletjes werk wist.
async function handleTemplateImport(file) {
  const L = T[state.lang];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || parsed._type !== 'cleaning-plan-template' || !Array.isArray(parsed.tasks)) {
      showToast(L.settings_data_import_invalid, 'error');
      return;
    }
    if (!confirm(L.settings_data_import_confirm)) return;
    // Vervang DATA + state-velden
    DATA.tasks = parsed.tasks.slice();
    DATA.products = parsed.products || [];
    DATA.methods = parsed.methods || [];
    DATA.versions = parsed.versions || [];
    state.customTasks = parsed.customTasks || [];
    state.taskOverrides = parsed.taskOverrides || {};
    state.taskNvtFields = parsed.taskNvtFields || {};
    state.deletedBuiltinIds = parsed.deletedBuiltinIds || [];
    if (parsed.branding) state.branding = Object.assign({}, state.branding, parsed.branding);
    if (parsed.schedule) state.schedule = Object.assign({}, state.schedule, parsed.schedule);
    if (parsed.customData) state.customData = Object.assign({}, state.customData, parsed.customData);
    // Check-data NIET overschrijven — dat is per-installatie historiek
    saveState();
    applyBranding();
    showToast(L.settings_data_import_success.replace('{n}', DATA.tasks.length), 'success');
    renderApp();
  } catch (err) {
    console.error('Template import failed:', err);
    showToast(L.settings_data_import_invalid, 'error');
  }
}

// ===== PLAN-RESET =====

// Wis alles wat in plan-state zit behalve branding+schedule (die zijn
// "configuratie" en niet "data"). Dubbel-confirmatie omdat actie
// onomkeerbaar is.
function resetPlanFromSettings() {
  const L = T[state.lang];
  if (!confirm(L.settings_data_reset_confirm1)) return;
  if (!confirm(L.settings_data_reset_confirm2)) return;
  // Wis alle plan-content
  DATA.tasks = [];
  state.customTasks = [];
  state.taskOverrides = {};
  state.taskNvtFields = {};
  state.deletedBuiltinIds = [];
  state.checks = {};
  state.customChangelog = [];
  state.pendingChanges = {};
  state.customData = { soilingTypes: [], ppeItems: [], rooms: [] };
  // Onboarding niet resetten (gebruiker is duidelijk al verder)
  saveState();
  showToast(L.settings_data_reset_success, 'success');
  renderApp();
}

// ===== STARTER-TEMPLATES (sub-feature 5b) =====

// Vier vooraf samengestelde plannen voor verschillende branches. Ieder
// template heeft een minimale set van representatieve taken — de klant
// kan ze daarna aanpassen via de gewone task-edit flow. Doel: nieuwe
// Etsy-klant ziet meteen iets relevants voor zijn sector ipv lege lijst.
const STARTER_TEMPLATES = {
  bakery: {
    rooms: [
      { name: 'Productie', icon: '🥖', color: '#f59e0b' },
      { name: 'Verkoopruimte', icon: '🛒', color: '#3b82f6' },
      { name: 'Magazijn', icon: '📦', color: '#6366f1' }
    ],
    soilingTypes: ['vet', 'meel', 'deeg', 'kruimels', 'suiker'],
    ppeItems: [
      { emoji: '🧤', label: 'Handschoenen' },
      { emoji: '🥽', label: 'Veiligheidsbril' },
      { emoji: '👕', label: 'Werkkleding' }
    ],
    tasks: [
      { id: 'st-bk-1', ruimte: 'Productie', werkplek: 'Werkbank', onderdeel: 'Werkbladen reinigen', wanneer: 'Na gebruik', methode: 'Handmatig', middel: 'Allesreiniger', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Bakker', vervuiling: 'deeg, meel', vscore: 4, zscore: 3, afstand: 2 },
      { id: 'st-bk-2', ruimte: 'Productie', werkplek: 'Oven', onderdeel: 'Oven reinigen (binnenkant)', wanneer: 'Zaterdag', methode: 'Handmatig', middel: 'Ovenreiniger', freq: 'Wekelijks', freq_key: 'weekly', uitvoerend: 'Bakker', vervuiling: 'vet, aanslag', vscore: 5, zscore: 4, afstand: 3 },
      { id: 'st-bk-3', ruimte: 'Productie', werkplek: 'Vloer', onderdeel: 'Vloer dweilen', wanneer: '1x per dag', methode: 'Handmatig', middel: 'Vloerreiniger', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Bakker', vervuiling: 'meel, vet', vscore: 3, zscore: 2, afstand: 2 },
      { id: 'st-bk-4', ruimte: 'Verkoopruimte', werkplek: 'Vitrine', onderdeel: 'Vitrine reinigen', wanneer: '1x per dag', methode: 'Handmatig', middel: 'Glasreiniger', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Verkoop', vervuiling: 'kruimels, vingers', vscore: 2, zscore: 2, afstand: 1 },
      { id: 'st-bk-5', ruimte: 'Verkoopruimte', werkplek: 'Toonbank', onderdeel: 'Toonbank reinigen', wanneer: 'Na gebruik', methode: 'Handmatig', middel: 'Allesreiniger', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Verkoop', vervuiling: 'kruimels', vscore: 3, zscore: 2, afstand: 1 },
      { id: 'st-bk-6', ruimte: 'Magazijn', werkplek: 'Grondstoffen', onderdeel: 'Voorraadstelling controleren', wanneer: 'Tijdens productie', methode: 'Inspectie', middel: 'Geen', freq: 'Wekelijks', freq_key: 'weekly', uitvoerend: 'Bakker', vervuiling: 'meel', vscore: 2, zscore: 2, afstand: 2 }
    ]
  },
  restaurant: {
    rooms: [
      { name: 'Keuken', icon: '🍳', color: '#ef4444' },
      { name: 'Zaal', icon: '🍽️', color: '#3b82f6' },
      { name: 'Sanitair', icon: '🚻', color: '#06b6d4' },
      { name: 'Voorbereiding', icon: '🔪', color: '#f59e0b' }
    ],
    soilingTypes: ['vet', 'vleessap', 'olie', 'kruimels', 'sauzen'],
    ppeItems: [
      { emoji: '🧤', label: 'Handschoenen' },
      { emoji: '👕', label: 'Schort' }
    ],
    tasks: [
      { id: 'st-rs-1', ruimte: 'Keuken', werkplek: 'Werkbank', onderdeel: 'Werkbladen reinigen + desinfecteren', wanneer: 'Na gebruik', methode: 'Handmatig', middel: 'Desinfectie', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Kok', vervuiling: 'vleessap, vet', vscore: 5, zscore: 5, afstand: 3 },
      { id: 'st-rs-2', ruimte: 'Keuken', werkplek: 'Friteuse', onderdeel: 'Olie controleren + vervangen', wanneer: '1x per dag', methode: 'Handmatig', middel: 'Geen', freq: 'Wekelijks', freq_key: 'weekly', uitvoerend: 'Kok', vervuiling: 'olie', vscore: 4, zscore: 3, afstand: 3 },
      { id: 'st-rs-3', ruimte: 'Zaal', werkplek: 'Tafels', onderdeel: 'Tafels reinigen tussen gasten', wanneer: 'Na gebruik', methode: 'Handmatig', middel: 'Allesreiniger', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Bediening', vervuiling: 'kruimels, sauzen', vscore: 2, zscore: 2, afstand: 1 },
      { id: 'st-rs-4', ruimte: 'Sanitair', werkplek: 'WC', onderdeel: 'WC grondig reinigen', wanneer: '1x per dag', methode: 'Handmatig', middel: 'Sanitairreiniger', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Schoonmaker', vervuiling: 'urine, vuil', vscore: 5, zscore: 4, afstand: 3 },
      { id: 'st-rs-5', ruimte: 'Voorbereiding', werkplek: 'Snijplanken', onderdeel: 'Snijplanken in vaatwasser', wanneer: 'Na gebruik', methode: 'Vaatwasser', middel: 'Vaatwasmiddel', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Kok', vervuiling: 'vleessap, groenteresten', vscore: 5, zscore: 5, afstand: 3 }
    ]
  },
  office: {
    rooms: [
      { name: 'Werkplekken', icon: '💼', color: '#3b82f6' },
      { name: 'Vergaderzalen', icon: '👥', color: '#8b5cf6' },
      { name: 'Koffiehoek', icon: '☕', color: '#92400e' },
      { name: 'Sanitair', icon: '🚻', color: '#06b6d4' }
    ],
    soilingTypes: ['stof', 'koffie', 'vingerafdrukken', 'papier-resten'],
    ppeItems: [
      { emoji: '🧤', label: 'Handschoenen (optioneel)' }
    ],
    tasks: [
      { id: 'st-of-1', ruimte: 'Werkplekken', werkplek: 'Bureaus', onderdeel: 'Bureaus afnemen', wanneer: '1x per dag', methode: 'Handmatig', middel: 'Allesreiniger', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Schoonmaker', vervuiling: 'stof, vingerafdrukken', vscore: 2, zscore: 1, afstand: 1 },
      { id: 'st-of-2', ruimte: 'Werkplekken', werkplek: 'Vloer', onderdeel: 'Stofzuigen', wanneer: '1x per dag', methode: 'Stofzuiger', middel: 'Geen', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Schoonmaker', vervuiling: 'stof, vuil', vscore: 2, zscore: 1, afstand: 1 },
      { id: 'st-of-3', ruimte: 'Vergaderzalen', werkplek: 'Tafels', onderdeel: 'Tafels + stoelen op orde', wanneer: 'Na gebruik', methode: 'Handmatig', middel: 'Allesreiniger', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Iedereen', vervuiling: 'koffie, papier-resten', vscore: 1, zscore: 1, afstand: 1 },
      { id: 'st-of-4', ruimte: 'Koffiehoek', werkplek: 'Koffiemachine', onderdeel: 'Koffiemachine reinigen', wanneer: '1x per dag', methode: 'Handmatig', middel: 'Allesreiniger', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Iedereen', vervuiling: 'koffie', vscore: 2, zscore: 2, afstand: 2 },
      { id: 'st-of-5', ruimte: 'Sanitair', werkplek: 'WC', onderdeel: 'WC grondig reinigen', wanneer: '1x per dag', methode: 'Handmatig', middel: 'Sanitairreiniger', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Schoonmaker', vervuiling: 'urine, vuil', vscore: 4, zscore: 4, afstand: 3 },
      { id: 'st-of-6', ruimte: 'Werkplekken', werkplek: 'Ramen', onderdeel: 'Ramen lappen', wanneer: 'Maandag', methode: 'Handmatig', middel: 'Glasreiniger', freq: 'Maandelijks', freq_key: 'monthly', uitvoerend: 'Schoonmaker', vervuiling: 'stof, vingerafdrukken', vscore: 2, zscore: 1, afstand: 2 }
    ]
  },
  salon: {
    rooms: [
      { name: 'Salon-stoelen', icon: '💇', color: '#ec4899' },
      { name: 'Wasbak', icon: '🚿', color: '#06b6d4' },
      { name: 'Gereedschap', icon: '✂️', color: '#8b5cf6' },
      { name: 'Ontvangst', icon: '🛋️', color: '#3b82f6' }
    ],
    soilingTypes: ['haar', 'kleurresten', 'gel', 'vingerafdrukken'],
    ppeItems: [
      { emoji: '🧤', label: 'Handschoenen' },
      { emoji: '👕', label: 'Schort' }
    ],
    tasks: [
      { id: 'st-sl-1', ruimte: 'Salon-stoelen', werkplek: 'Stoel', onderdeel: 'Stoel + omgeving vegen', wanneer: 'Na gebruik', methode: 'Handmatig', middel: 'Geen', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Kapper', vervuiling: 'haar', vscore: 1, zscore: 1, afstand: 1 },
      { id: 'st-sl-2', ruimte: 'Salon-stoelen', werkplek: 'Spiegel', onderdeel: 'Spiegel poetsen', wanneer: '1x per dag', methode: 'Handmatig', middel: 'Glasreiniger', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Kapper', vervuiling: 'vingerafdrukken, haarproducten', vscore: 1, zscore: 1, afstand: 1 },
      { id: 'st-sl-3', ruimte: 'Wasbak', werkplek: 'Wasbak', onderdeel: 'Wasbak grondig reinigen + desinfecteren', wanneer: 'Na gebruik', methode: 'Handmatig', middel: 'Desinfectie', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Kapper', vervuiling: 'haar, kleurresten, shampoo', vscore: 3, zscore: 3, afstand: 2 },
      { id: 'st-sl-4', ruimte: 'Gereedschap', werkplek: 'Schaar/kam', onderdeel: 'Gereedschap desinfecteren', wanneer: 'Na gebruik', methode: 'Handmatig', middel: 'Desinfectie', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Kapper', vervuiling: 'haar, kleurresten', vscore: 4, zscore: 4, afstand: 3 },
      { id: 'st-sl-5', ruimte: 'Ontvangst', werkplek: 'Bank/stoelen', onderdeel: 'Wachtruimte stoffen', wanneer: '1x per dag', methode: 'Handmatig', middel: 'Allesreiniger', freq: 'Dagelijks', freq_key: 'daily', uitvoerend: 'Receptie', vervuiling: 'stof, vingerafdrukken', vscore: 1, zscore: 1, afstand: 1 }
    ]
  }
};

// Laad een starter-template — vervangt huidige plan na confirmation.
function loadStarterTemplate(key) {
  const L = T[state.lang];
  const tpl = STARTER_TEMPLATES[key];
  if (!tpl) return;
  if (!confirm(L.settings_data_starter_confirm)) return;
  // Volledige reset + laad nieuwe data
  DATA.tasks = (tpl.tasks || []).map(t => Object.assign({}, t));
  state.customTasks = [];
  state.taskOverrides = {};
  state.taskNvtFields = {};
  state.deletedBuiltinIds = [];
  state.checks = {};
  state.pendingChanges = {};
  // Custom data van het template
  state.customData = {
    soilingTypes: tpl.soilingTypes || [],
    ppeItems: tpl.ppeItems || [],
    rooms: tpl.rooms || []
  };
  saveState();
  showToast(L.settings_data_starter_loaded.replace('{n}', DATA.tasks.length), 'success');
  renderApp();
}

// ===== CUSTOM SOILING TYPES (sub-feature 5c) =====

function addSoilingType() {
  if (!state.customData) state.customData = { soilingTypes: [], ppeItems: [], rooms: [] };
  state.customData.soilingTypes = state.customData.soilingTypes || [];
  state.customData.soilingTypes.push('');
  rerenderDataSection();
}

function removeSoilingType(idx) {
  if (!state.customData || !state.customData.soilingTypes) return;
  state.customData.soilingTypes.splice(idx, 1);
  rerenderDataSection();
}

function saveSoilingTypes() {
  const L = T[state.lang];
  if (!state.customData) state.customData = { soilingTypes: [], ppeItems: [], rooms: [] };
  const inputs = document.querySelectorAll('.data-soiling-input');
  const types = [];
  inputs.forEach(inp => {
    const v = (inp.value || '').trim();
    if (v) types.push(v);
  });
  state.customData.soilingTypes = types;
  saveState();
  showToast(L.settings_data_soiling_saved, 'success');
  rerenderDataSection();
}

// ===== CUSTOM PPE ITEMS =====

function addPpeItem() {
  if (!state.customData) state.customData = { soilingTypes: [], ppeItems: [], rooms: [] };
  state.customData.ppeItems = state.customData.ppeItems || [];
  state.customData.ppeItems.push({ emoji: '', label: '' });
  rerenderDataSection();
}

function removePpeItem(idx) {
  if (!state.customData || !state.customData.ppeItems) return;
  state.customData.ppeItems.splice(idx, 1);
  rerenderDataSection();
}

function savePpeItems() {
  const L = T[state.lang];
  if (!state.customData) state.customData = { soilingTypes: [], ppeItems: [], rooms: [] };
  const emojiInputs = document.querySelectorAll('.data-ppe-emoji');
  const labelInputs = document.querySelectorAll('.data-ppe-label');
  const items = [];
  emojiInputs.forEach((emojiInp, i) => {
    const labelInp = labelInputs[i];
    if (!labelInp) return;
    const emoji = (emojiInp.value || '').trim();
    const label = (labelInp.value || '').trim();
    if (emoji && label) items.push({ emoji, label });
  });
  state.customData.ppeItems = items;
  saveState();
  showToast(L.settings_data_ppe_saved, 'success');
  rerenderDataSection();
}

// ===== ROOMS MANAGEMENT =====

function addRoom() {
  if (!state.customData) state.customData = { soilingTypes: [], ppeItems: [], rooms: [] };
  state.customData.rooms = state.customData.rooms || [];
  state.customData.rooms.push({ name: '', icon: '🏠', color: '#1d5b42' });
  rerenderDataSection();
}

function removeRoom(idx) {
  const L = T[state.lang];
  if (!state.customData || !state.customData.rooms) return;
  const room = state.customData.rooms[idx];
  if (!room) return;
  // Veiligheid: tel hoeveel taken deze ruimte gebruiken
  const inUseCount = (DATA.tasks || []).filter(t => t.ruimte === room.name).length
                  + (state.customTasks || []).filter(t => t.ruimte === room.name).length;
  if (inUseCount > 0) {
    showToast(L.settings_data_rooms_in_use.replace('{n}', inUseCount), 'error');
    return;
  }
  state.customData.rooms.splice(idx, 1);
  rerenderDataSection();
}

function saveRooms() {
  const L = T[state.lang];
  if (!state.customData) state.customData = { soilingTypes: [], ppeItems: [], rooms: [] };
  const nameInputs = document.querySelectorAll('.data-room-name');
  const iconInputs = document.querySelectorAll('.data-room-icon');
  const colorInputs = document.querySelectorAll('.data-room-color');
  const rooms = [];
  nameInputs.forEach((nameInp, i) => {
    const name = (nameInp.value || '').trim();
    if (!name) return;
    rooms.push({
      name,
      icon: (iconInputs[i] && iconInputs[i].value) || '🏠',
      color: (colorInputs[i] && colorInputs[i].value) || '#1d5b42'
    });
  });
  state.customData.rooms = rooms;
  saveState();
  showToast(L.settings_data_rooms_saved, 'success');
  rerenderDataSection();
}

// Re-render alleen de data-sectie (geen volledige app-render)
function rerenderDataSection() {
  if (state.activeTab !== 'settings') return;
  if (state.settingsActiveSection !== 'data') return;
  const c = document.getElementById('filters-and-content');
  if (c) {
    c.innerHTML = renderSettingsView();
    wireSettingsView();
  }
}

function wireFeaturesSection() {
  document.querySelectorAll('.feat-toggle-input').forEach(input => {
    input.onchange = () => {
      if (!state.features) state.features = {};
      state.features[input.dataset.feature] = input.checked;
    };
  });
}

function saveFeatureSettings() {
  const L = T[state.lang];
  if (!state.features) state.features = {};
  document.querySelectorAll('.feat-toggle-input').forEach(input => {
    state.features[input.dataset.feature] = input.checked;
  });
  saveState();
  applyFeatureSettings();
  showToast(L.settings_feat_saved, 'success');
  renderApp();
}

function applyFeatureSettings() {
  const f = state.features || {};
  // Notifications: cancel scheduled timers wanneer uitgeschakeld.
  if (!f.notifications && typeof cancelScheduledShiftNotifications === 'function') {
    cancelScheduledShiftNotifications();
  }
  // AssignedUsers: als feature uitgeschakeld, reset mine-only-filter zodat
  // gebruiker niet vastzit met een filter die hij niet kan uitschakelen.
  if (f.assignedUsers === false && state.todayShowMineOnly) {
    state.todayShowMineOnly = false;
  }
  // Notifications uitschakelen → ook notifEnabled false zetten zodat de
  // toggle-knop op Today consistent uitstaat (de feature-toggle gaat
  // hiërarchisch boven de per-device-voorkeur).
  if (f.notifications === false) {
    state.notifEnabled = false;
  }
}

// Helper: check of een feature is ingeschakeld. Standaard true (om
// backward-compat met installs die geen state.features hebben).
function isFeatureEnabled(key) {
  if (!state.features) return true;
  return state.features[key] !== false;
}

function wireScheduleSection() {
  // Workday-pills: multi-select toggle
  document.querySelectorAll('.sched-day-pill[data-pill-type="workday"]').forEach(pill => {
    pill.onclick = (e) => {
      e.preventDefault();
      pill.classList.toggle('is-active');
      pill.setAttribute('aria-pressed', pill.classList.contains('is-active') ? 'true' : 'false');
    };
  });

  // Big-day pills: single-select (radio-achtig). Klik op één deactiveert anderen.
  document.querySelectorAll('.sched-day-pill[data-pill-type="bigday"]').forEach(pill => {
    pill.onclick = (e) => {
      e.preventDefault();
      document.querySelectorAll('.sched-day-pill[data-pill-type="bigday"]').forEach(p => {
        p.classList.remove('is-active');
        p.setAttribute('aria-pressed', 'false');
      });
      pill.classList.add('is-active');
      pill.setAttribute('aria-pressed', 'true');
    };
  });

  // 2x-per-week pills: max 2 selecteerbaar. Bij overschrijden: deselect
  // de eerstgeklikte en activeer de nieuwste.
  document.querySelectorAll('.sched-day-pill[data-pill-type="twice"]').forEach(pill => {
    pill.onclick = (e) => {
      e.preventDefault();
      const active = [...document.querySelectorAll('.sched-day-pill[data-pill-type="twice"].is-active')];
      const isCurrentlyActive = pill.classList.contains('is-active');
      if (isCurrentlyActive) {
        // Deactivate
        pill.classList.remove('is-active');
        pill.setAttribute('aria-pressed', 'false');
      } else {
        // Activate. Als er al 2 actief zijn, deselecteer de oudste (eerste in lijst).
        if (active.length >= 2) {
          const oldest = active[0];
          oldest.classList.remove('is-active');
          oldest.setAttribute('aria-pressed', 'false');
        }
        pill.classList.add('is-active');
        pill.setAttribute('aria-pressed', 'true');
      }
    };
  });

  // Shift-remove
  document.querySelectorAll('.sched-shift-remove').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const row = btn.closest('.sched-shift-row');
      if (row) row.remove();
      // Re-render-toggle voor add-knop (terug zichtbaar als <4 shifts)
      maybeShowShiftAddBtn();
    };
  });

  // Shift-add
  const addBtn = document.getElementById('sched-shift-add-btn');
  if (addBtn) {
    addBtn.onclick = (e) => {
      e.preventDefault();
      const shiftsEl = document.getElementById('sched-shifts');
      if (!shiftsEl) return;
      const existing = shiftsEl.querySelectorAll('.sched-shift-row').length;
      if (existing >= 4) return;
      const L = T[state.lang];
      const row = document.createElement('div');
      row.className = 'sched-shift-row';
      row.dataset.shiftIdx = existing;
      row.innerHTML = `
        <input type="time" class="sched-shift-input" value="12:00" data-shift-idx="${existing}">
        <button type="button" class="settings-btn-ghost sched-shift-remove" data-shift-idx="${existing}">
          ${esc(L.settings_sched_shift_remove)}
        </button>
      `;
      shiftsEl.appendChild(row);
      // Re-wire de nieuwe remove-knop
      row.querySelector('.sched-shift-remove').onclick = (ev) => {
        ev.preventDefault();
        row.remove();
        maybeShowShiftAddBtn();
      };
      maybeShowShiftAddBtn();
    };
  }
}

// Helper: toon add-knop weer als er minder dan 4 shifts zijn,
// verberg als limiet bereikt.
function maybeShowShiftAddBtn() {
  const shiftsEl = document.getElementById('sched-shifts');
  const addBtn = document.getElementById('sched-shift-add-btn');
  if (!shiftsEl || !addBtn) return;
  const count = shiftsEl.querySelectorAll('.sched-shift-row').length;
  addBtn.style.display = count >= 4 ? 'none' : '';
}

// Save schedule: lees alle pills + shifts, valideer, schrijf naar
// state.schedule en pas applyScheduleSettings() toe (reschedule notifs).
function saveScheduleSettings() {
  const L = T[state.lang];
  // Workdays
  const workDays = [...document.querySelectorAll('.sched-day-pill[data-pill-type="workday"].is-active')]
    .map(p => parseInt(p.dataset.day, 10))
    .filter(d => !isNaN(d))
    .sort((a, b) => a - b);
  if (workDays.length === 0) {
    showToast(L.settings_sched_workdays_invalid, 'error');
    return;
  }
  // Big day
  const bigDayEl = document.querySelector('.sched-day-pill[data-pill-type="bigday"].is-active');
  const bigDay = bigDayEl ? parseInt(bigDayEl.dataset.day, 10) : 6;
  // 2x per week
  const twicePer = [...document.querySelectorAll('.sched-day-pill[data-pill-type="twice"].is-active')]
    .map(p => parseInt(p.dataset.day, 10))
    .filter(d => !isNaN(d))
    .sort((a, b) => a - b);
  if (twicePer.length !== 2) {
    showToast(L.settings_sched_twice_invalid, 'error');
    return;
  }
  // Shifts: parse time-strings "HH:MM" -> {hour, minute}
  const shifts = [...document.querySelectorAll('.sched-shift-input')]
    .map(inp => {
      const m = (inp.value || '').match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const h = parseInt(m[1], 10), mn = parseInt(m[2], 10);
      if (h < 0 || h > 23 || mn < 0 || mn > 59) return null;
      return { hour: h, minute: mn };
    })
    .filter(s => s !== null)
    .sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));

  state.schedule = {
    workDays,
    shifts,
    bigCleaningDay: bigDay,
    twicePerWeekDays: twicePer
  };
  saveState();
  applyScheduleSettings();
  showToast(L.settings_sched_saved, 'success');
}

// Pas de schedule toe op runtime-gedrag. Op dit moment: re-schedule de
// shift-notificaties met de nieuwe tijden. Hardcoded di+vr en zaterdag
// zullen we in fase 4 (kort) opvolgen met dynamische lookups vanuit
// state.schedule.twicePerWeekDays / bigCleaningDay.
function applyScheduleSettings() {
  // Re-schedule notifications met de nieuwe shift-tijden (cancel oude eerst)
  if (typeof cancelScheduledShiftNotifications === 'function') {
    cancelScheduledShiftNotifications();
  }
  if (state.notifEnabled && typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      typeof scheduleShiftNotifications === 'function') {
    scheduleShiftNotifications();
  }
}

function wireBrandingSection() {
  // Tekst-velden: live preview-update bij elke keystroke (geen save tot
  // user op "Opslaan" klikt).
  ['brand-company', 'brand-doc', 'brand-subtitle'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.oninput = () => {
      // Pak field-naam uit data-attribute, update live-preview node alleen
      updateBrandingPreview();
    };
  });

  // Logo-upload: light en dark variant
  const lightInput = document.getElementById('brand-logo-input');
  if (lightInput) {
    lightInput.onchange = (e) => handleBrandLogoUpload(e.target.files[0], false);
  }
  const darkInput = document.getElementById('brand-logo-dark-input');
  if (darkInput) {
    darkInput.onchange = (e) => handleBrandLogoUpload(e.target.files[0], true);
  }

  // Kleur-presets: klik op swatch → activeert + previews
  document.querySelectorAll('.brand-color-swatch').forEach(sw => {
    sw.onclick = (e) => {
      e.preventDefault();
      const hex = sw.dataset.hex;
      selectBrandColor(hex);
    };
  });

  // Custom color picker
  const customColor = document.getElementById('brand-color-custom');
  if (customColor) {
    customColor.oninput = () => {
      selectBrandColor(customColor.value);
    };
  }
}

// Werk de live-preview bij. Leest waarden direct uit de inputs (niet uit
// state.branding) zodat preview meedraait terwijl gebruiker typt.
function updateBrandingPreview() {
  const company = (document.getElementById('brand-company') || {}).value || '';
  const doc = (document.getElementById('brand-doc') || {}).value || '';
  const subtitle = (document.getElementById('brand-subtitle') || {}).value || '';
  const L = T[state.lang];

  const previewCompany = document.querySelector('.settings-preview-company');
  if (previewCompany) {
    previewCompany.textContent = company || L.app_title || 'Schoonmaakplan';
  }
  const previewSubtitle = document.querySelector('.settings-preview-subtitle');
  if (previewSubtitle) {
    previewSubtitle.textContent = subtitle + (doc ? ' · ' + doc : '');
  }
}

// Kies een accent-kleur — markeer actieve swatch + update live preview via
// CSS-variabelen op de :root. Save in state.branding gebeurt pas bij
// expliciete "Opslaan" klik.
function selectBrandColor(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  // Update swatch-active-state
  document.querySelectorAll('.brand-color-swatch').forEach(s => {
    s.classList.toggle('is-active', s.dataset.hex.toLowerCase() === hex.toLowerCase());
    s.setAttribute('aria-pressed', s.dataset.hex.toLowerCase() === hex.toLowerCase() ? 'true' : 'false');
  });
  // Update custom color input + hex-label zodat ze gesynced blijven
  const customInput = document.getElementById('brand-color-custom');
  if (customInput && customInput.value.toLowerCase() !== hex.toLowerCase()) {
    customInput.value = hex;
  }
  const hexLabel = document.querySelector('.brand-color-hex');
  if (hexLabel) hexLabel.textContent = hex.toUpperCase();
  // Live preview via CSS custom properties — alleen voor de preview-card.
  // Het echte applyBranding() loopt bij save zodat het hele app-thema
  // wijzigt (header gradient etc.).
  const previewEl = document.getElementById('brand-preview');
  if (previewEl) {
    previewEl.style.setProperty('--preview-accent', hex);
  }
}

// Upload + resize een logo. Max 200KB; auto-resize naar max 400px hoog via
// <canvas>. Resultaat is een base64 data-URL die we direct in state.branding
// kunnen stoppen en via plan-state syncen.
async function handleBrandLogoUpload(file, isDark) {
  const L = T[state.lang];
  if (!file) return;
  // Validatie: MIME-type
  if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) {
    showToast(L.settings_brand_logo_invalid, 'error');
    return;
  }
  // Validatie: bestandsgrootte (origineel — na resize is base64 alsnog groter)
  if (file.size > 200 * 1024) {
    showToast(L.settings_brand_logo_too_large, 'error');
    return;
  }
  try {
    let dataUrl;
    if (file.type === 'image/svg+xml') {
      // SVG: gewoon als base64 inline encoden, geen resize
      dataUrl = await readFileAsDataUrl(file);
    } else {
      // PNG/JPEG: resize via canvas naar max 400px hoog
      dataUrl = await resizeImageToDataUrl(file, 400);
    }
    if (isDark) {
      state.branding.logoDarkDataUrl = dataUrl;
    } else {
      state.branding.logoDataUrl = dataUrl;
    }
    // Re-render branding-sectie zodat preview-image meteen update
    const c = document.getElementById('filters-and-content');
    if (c) {
      c.innerHTML = renderSettingsView();
      wireSettingsView();
    }
  } catch (err) {
    console.error('Logo upload failed:', err);
    showToast(L.settings_brand_logo_invalid, 'error');
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Resize een Image naar max-height pixels via canvas en geef de base64
// dataURL terug. Behoudt aspect ratio. Output-type = PNG voor transparantie-
// behoud (vooral relevant voor logo's).
function resizeImageToDataUrl(file, maxHeight) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height;
        let h = img.height;
        let w = img.width;
        if (h > maxHeight) {
          h = maxHeight;
          w = Math.round(maxHeight * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // PNG voor transparantie-behoud
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function removeBrandLogo(isDark) {
  if (isDark) {
    state.branding.logoDarkDataUrl = '';
  } else {
    state.branding.logoDataUrl = '';
  }
  const c = document.getElementById('filters-and-content');
  if (c) {
    c.innerHTML = renderSettingsView();
    wireSettingsView();
  }
}

// Save: lees alle waarden uit de form, schrijf naar state.branding,
// persist via saveState() (= plan-state + cloud-sync), en pas dan
// applyBranding() toe op de hele app zodat header, accent-kleur etc.
// onmiddellijk wijzigen.
function saveBrandingSettings() {
  const L = T[state.lang];
  const company = (document.getElementById('brand-company') || {}).value || '';
  const doc = (document.getElementById('brand-doc') || {}).value || '';
  const subtitle = (document.getElementById('brand-subtitle') || {}).value || '';
  const customColor = (document.getElementById('brand-color-custom') || {}).value || '';

  state.branding = Object.assign({}, state.branding, {
    companyName: company.trim(),
    docCode: doc.trim(),
    subtitle: subtitle.trim(),
    accentColor: customColor || ''
    // logo-velden zijn al gesetteld door handleBrandLogoUpload
  });
  saveState();
  applyBranding();
  showToast(L.settings_brand_saved, 'success');
  // Re-render app-header zodat de nieuwe naam/logo onmiddellijk verschijnen
  renderApp();
}

// Pas branding toe op de hele app: CSS-vars voor accent-kleur, DOM-updates
// voor header. Wordt aangeroepen bij app-start (loadState) en bij elke
// save. Alle hardcoded "GTE"-strings worden via fallback-logica vervangen
// door state.branding-waardes wanneer aanwezig.
function applyBranding() {
  const b = state.branding || {};
  // Accent-kleur via CSS custom properties op :root. We zetten alleen
  // --brand-500 en --brand-700 — de andere varianten worden algoritmisch
  // afgeleid (lighter/darker stops berekend uit de hoofdkleur).
  if (b.accentColor && /^#[0-9a-f]{6}$/i.test(b.accentColor)) {
    const palette = derivePalette(b.accentColor);
    Object.entries(palette).forEach(([key, hex]) => {
      document.documentElement.style.setProperty('--brand-' + key, hex);
    });
  } else {
    // Standaard groen — verwijder eventuele overrides zodat de CSS-defaults
    // weer pakken.
    ['50','100','200','400','500','600','700','900'].forEach(k => {
      document.documentElement.style.removeProperty('--brand-' + k);
    });
  }
}

// Genereer brand-palette uit één hoofdkleur. We doen lichter/donkerder
// stops via simpele HSL-shift. Niet wetenschappelijk perfect maar visueel
// consistent genoeg voor knoppen/links/accents.
function derivePalette(hex) {
  const hsl = hexToHsl(hex);
  return {
    50:  hslToHex(hsl.h, Math.max(0, hsl.s - 5),  Math.min(98, hsl.l + 42)),
    100: hslToHex(hsl.h, Math.max(0, hsl.s - 5),  Math.min(95, hsl.l + 35)),
    200: hslToHex(hsl.h, hsl.s,                    Math.min(88, hsl.l + 22)),
    400: hslToHex(hsl.h, hsl.s,                    Math.min(70, hsl.l + 8)),
    500: hex,
    600: hslToHex(hsl.h, hsl.s,                    Math.max(15, hsl.l - 8)),
    700: hslToHex(hsl.h, hsl.s,                    Math.max(10, hsl.l - 15)),
    900: hslToHex(hsl.h, hsl.s,                    Math.max(5,  hsl.l - 25))
  };
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}

// =====================================================
// ONBOARDING-WIZARD (Etsy-customisation, niet-blokkerend)
// =====================================================
// Banner verschijnt bovenin de app voor admin/super-user wanneer:
//   - state.onboarding.complete is false EN
//   - state.onboarding.dismissed is false EN
//   - state.branding.companyName is leeg (anders is onboarding overbodig)
// Dismiss zet `dismissed=true`. Voltooien zet `complete=true`. Beide
// persisted in localStorage (per-device, niet cloud).

const ONB_PRESET_COLORS = [
  { name: 'green',  hex: '#1d5b42' },
  { name: 'blue',   hex: '#3b82f6' },
  { name: 'indigo', hex: '#6366f1' },
  { name: 'purple', hex: '#8b5cf6' },
  { name: 'pink',   hex: '#ec4899' },
  { name: 'red',    hex: '#ef4444' },
  { name: 'orange', hex: '#f97316' },
  { name: 'amber',  hex: '#f59e0b' }
];

function shouldShowOnboarding() {
  // Niet voor non-admin
  const local = !state.authUser;
  const admin = local || (typeof isAdmin === 'function' && isAdmin());
  if (!admin) return false;
  const onb = state.onboarding || {};
  if (onb.complete) return false;
  if (onb.dismissed) return false;
  // Als branding al ingevuld is (bv. plan geïmporteerd of via Settings),
  // markeer stil als voltooid en toon niet meer.
  const hasBranding = !!(state.branding && state.branding.companyName && state.branding.companyName.trim());
  if (hasBranding) {
    state.onboarding = Object.assign({}, onb, { complete: true });
    // Don't await — fire-and-forget save is fine voor deze flag.
    if (typeof saveState === 'function') saveState();
    return false;
  }
  return true;
}

function renderOnboardingBanner() {
  if (!shouldShowOnboarding()) return '';
  const L = T[state.lang];
  const step = (state.onboarding && state.onboarding.step) || 1;
  const stepLabel = L.onb_step_label.replace('{n}', String(step));
  const progressPct = (step / 5) * 100;

  return `
    <div class="onb-banner" id="onb-banner" role="region" aria-label="${esc(L.onb_banner_title)}">
      <div class="onb-banner-inner">
        <button class="onb-dismiss" onclick="dismissOnboarding()" aria-label="${esc(L.onb_dismiss_aria)}">×</button>
        <div class="onb-header">
          <div class="onb-header-text">
            <h3 class="onb-banner-title">${esc(L.onb_banner_title)}</h3>
            <p class="onb-banner-sub">${esc(L.onb_banner_sub)}</p>
          </div>
          <div class="onb-step-badge">${esc(stepLabel)}</div>
        </div>
        <div class="onb-progress" role="progressbar" aria-valuenow="${step}" aria-valuemin="1" aria-valuemax="5">
          <div class="onb-progress-fill" style="width: ${progressPct}%"></div>
        </div>
        <div class="onb-step-content" id="onb-step-content">
          ${renderOnboardingStep(step, L)}
        </div>
        <div class="onb-actions">
          ${step > 1 ? `<button class="settings-btn-ghost" onclick="onboardingPrev()">${esc(L.onb_back)}</button>` : '<span></span>'}
          <div class="onb-actions-right">
            ${step < 5 ? `<button class="settings-btn-ghost" onclick="onboardingSkip()">${esc(L.onb_skip)}</button>` : ''}
            ${step < 5
              ? `<button class="settings-btn-primary" onclick="onboardingNext()">${esc(L.onb_next)}</button>`
              : `<button class="settings-btn-primary" onclick="onboardingFinish()">${esc(L.onb_finish)}</button>`}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderOnboardingStep(step, L) {
  const b = state.branding || {};
  const s = state.schedule || { workDays: [1,2,3,4,5,6] };

  if (step === 1) {
    return `
      <h4 class="onb-step-title">${esc(L.onb_s1_title)}</h4>
      <p class="onb-step-help">${esc(L.onb_s1_help)}</p>
      <input type="text" id="onb-company-input" class="settings-input"
             value="${esc(b.companyName || '')}"
             placeholder="${esc(L.onb_s1_placeholder)}"
             maxlength="60" autofocus>
    `;
  }
  if (step === 2) {
    const currentColor = (b.accentColor || '#1d5b42').toLowerCase();
    const swatches = ONB_PRESET_COLORS.map(c => {
      const active = currentColor === c.hex.toLowerCase();
      return `<button type="button"
                      class="brand-color-swatch ${active ? 'is-active' : ''}"
                      data-onb-hex="${c.hex}"
                      style="background: ${c.hex}"
                      aria-label="${c.name}"
                      onclick="onboardingSelectColor('${c.hex}')"></button>`;
    }).join('');
    return `
      <h4 class="onb-step-title">${esc(L.onb_s2_title)}</h4>
      <p class="onb-step-help">${esc(L.onb_s2_help)}</p>
      <div class="brand-color-swatches onb-swatches">${swatches}</div>
    `;
  }
  if (step === 3) {
    const hasLogo = !!b.logoDataUrl;
    return `
      <h4 class="onb-step-title">${esc(L.onb_s3_title)}</h4>
      <p class="onb-step-help">${esc(L.onb_s3_help)}</p>
      <div class="brand-logo-uploader">
        <div class="brand-logo-preview ${hasLogo ? 'has-logo' : 'empty'}">
          ${hasLogo
            ? `<img src="${esc(b.logoDataUrl)}" alt="logo">`
            : `<span class="brand-logo-empty-icon" aria-hidden="true">🖼️</span>`}
        </div>
        <div class="brand-logo-controls">
          <input type="file" id="onb-logo-input" accept="image/png,image/jpeg,image/svg+xml" hidden>
          <button type="button" class="settings-btn" onclick="document.getElementById('onb-logo-input').click()">
            ${esc(L.settings_brand_logo_upload)}
          </button>
          ${hasLogo ? `<button type="button" class="settings-btn-ghost" onclick="onboardingRemoveLogo()">${esc(L.settings_brand_logo_remove)}</button>` : ''}
        </div>
      </div>
    `;
  }
  if (step === 4) {
    const workDays = Array.isArray(s.workDays) ? s.workDays : [1,2,3,4,5,6];
    const DAYS = [
      { idx: 1, label: L.weekday_short_mo },
      { idx: 2, label: L.weekday_short_tu },
      { idx: 3, label: L.weekday_short_we },
      { idx: 4, label: L.weekday_short_th },
      { idx: 5, label: L.weekday_short_fr },
      { idx: 6, label: L.weekday_short_sa },
      { idx: 0, label: L.weekday_short_su }
    ];
    const pillsHtml = DAYS.map(d => {
      const active = workDays.includes(d.idx);
      return `<button type="button"
                      class="sched-day-pill ${active ? 'is-active' : ''}"
                      data-onb-workday="${d.idx}"
                      onclick="onboardingToggleWorkday(${d.idx})">
        ${esc(d.label)}
      </button>`;
    }).join('');
    return `
      <h4 class="onb-step-title">${esc(L.onb_s4_title)}</h4>
      <p class="onb-step-help">${esc(L.onb_s4_help)}</p>
      <label class="settings-label">${esc(L.onb_s4_workdays)}</label>
      <div class="sched-day-pills">${pillsHtml}</div>
    `;
  }
  // Stap 5: voltooid
  return `
    <div class="onb-done">
      <div class="onb-done-icon" aria-hidden="true">🎉</div>
      <h4 class="onb-step-title">${esc(L.onb_s5_title)}</h4>
      <p class="onb-step-help">${esc(L.onb_s5_help)}</p>
    </div>
  `;
}

// ===== Wizard handlers =====

function onboardingPrev() {
  if (!state.onboarding) state.onboarding = { complete: false, dismissed: false, step: 1 };
  onboardingCommitCurrentStep();
  state.onboarding.step = Math.max(1, state.onboarding.step - 1);
  saveState();
  refreshOnboardingBanner();
}

function onboardingNext() {
  if (!state.onboarding) state.onboarding = { complete: false, dismissed: false, step: 1 };
  onboardingCommitCurrentStep();
  state.onboarding.step = Math.min(5, state.onboarding.step + 1);
  saveState();
  // Apply branding/schedule pas vanaf stap 2+ (na elke commit) zodat user
  // de wijzigingen meteen ziet doorvoeren.
  if (typeof applyBranding === 'function') applyBranding();
  refreshOnboardingBanner();
}

function onboardingSkip() {
  // Overslaan = direct naar stap 5 (klaar) maar zonder commit van huidige stap
  if (!state.onboarding) state.onboarding = { complete: false, dismissed: false, step: 1 };
  state.onboarding.step = 5;
  saveState();
  refreshOnboardingBanner();
}

function onboardingFinish() {
  const L = T[state.lang];
  onboardingCommitCurrentStep();
  state.onboarding = { complete: true, dismissed: false, step: 5 };
  saveState();
  if (typeof applyBranding === 'function') applyBranding();
  if (typeof showToast === 'function') showToast(L.onb_done_toast, 'success');
  // Re-render hele app (banner verdwijnt + header krijgt mogelijk nieuwe naam/kleur/logo)
  if (typeof renderApp === 'function') renderApp();
}

function dismissOnboarding() {
  if (!state.onboarding) state.onboarding = { complete: false, dismissed: false, step: 1 };
  state.onboarding.dismissed = true;
  saveState();
  // Re-render zonder banner
  if (typeof renderApp === 'function') renderApp();
}

// Commit huidige-stap-waardes naar state.branding/schedule. Wordt
// aangeroepen bij Next, Prev en Finish zodat tussentijdse keuzes niet
// verloren gaan als gebruiker terugbladert.
function onboardingCommitCurrentStep() {
  const step = (state.onboarding && state.onboarding.step) || 1;
  if (!state.branding) state.branding = {};
  if (!state.schedule) state.schedule = { workDays:[1,2,3,4,5,6], shifts:[{hour:6,minute:0},{hour:14,minute:0}], bigCleaningDay:6, twicePerWeekDays:[2,5] };

  if (step === 1) {
    const inp = document.getElementById('onb-company-input');
    if (inp) state.branding.companyName = (inp.value || '').trim();
  }
  // Stap 2-4 schrijven direct in state via hun onclick-handlers.
}

// Re-render alleen de banner (zonder hele app)
function refreshOnboardingBanner() {
  const banner = document.getElementById('onb-banner');
  if (!banner) return;
  // Vervang met opnieuw-gerenderde banner
  const newHtml = renderOnboardingBanner();
  if (!newHtml) {
    // shouldShowOnboarding zegt nu nee → verwijder banner uit DOM
    banner.parentNode.removeChild(banner);
    return;
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = newHtml;
  const newBanner = tmp.firstElementChild;
  banner.parentNode.replaceChild(newBanner, banner);
  wireOnboardingBanner();
}

// Wire-helper voor banner: file-input + autofocus + keyboard
function wireOnboardingBanner() {
  // Logo-upload (stap 3)
  const logoInput = document.getElementById('onb-logo-input');
  if (logoInput) {
    logoInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        if (file.size > 200 * 1024) {
          const L = T[state.lang];
          if (typeof showToast === 'function') showToast(L.settings_brand_logo_too_large, 'error');
          return;
        }
        let dataUrl;
        if (file.type === 'image/svg+xml') {
          dataUrl = await readFileAsDataUrl(file);
        } else {
          dataUrl = await resizeImageToDataUrl(file, 400);
        }
        if (!state.branding) state.branding = {};
        state.branding.logoDataUrl = dataUrl;
        saveState();
        refreshOnboardingBanner();
      } catch (err) {
        console.error('Onboarding logo upload failed:', err);
      }
    };
  }
  // Autofocus eerste input op stap 1 (mobile-toetsenbord opent automatisch)
  const companyInput = document.getElementById('onb-company-input');
  if (companyInput && (state.onboarding && state.onboarding.step === 1)) {
    // Kleine vertraging zodat de browser de banner heeft gerenderd
    setTimeout(() => { try { companyInput.focus(); } catch (e) {} }, 50);
  }
}

function onboardingSelectColor(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  if (!state.branding) state.branding = {};
  state.branding.accentColor = hex;
  saveState();
  if (typeof applyBranding === 'function') applyBranding();
  // Update swatch-active visueel zonder volledige re-render
  document.querySelectorAll('.onb-swatches .brand-color-swatch').forEach(s => {
    const isMe = (s.dataset.onbHex || '').toLowerCase() === hex.toLowerCase();
    s.classList.toggle('is-active', isMe);
  });
}

function onboardingRemoveLogo() {
  if (!state.branding) return;
  state.branding.logoDataUrl = '';
  saveState();
  refreshOnboardingBanner();
}

function onboardingToggleWorkday(dayIdx) {
  if (!state.schedule) state.schedule = { workDays:[1,2,3,4,5,6], shifts:[{hour:6,minute:0},{hour:14,minute:0}], bigCleaningDay:6, twicePerWeekDays:[2,5] };
  const wd = Array.isArray(state.schedule.workDays) ? state.schedule.workDays.slice() : [1,2,3,4,5,6];
  const idx = wd.indexOf(dayIdx);
  if (idx >= 0) {
    // Already on — toggle off (maar zorg dat minstens 1 dag actief blijft)
    if (wd.length <= 1) return;
    wd.splice(idx, 1);
  } else {
    wd.push(dayIdx);
  }
  wd.sort((a, b) => a - b);
  state.schedule.workDays = wd;
  saveState();
  // Visueel toggle de pill zonder volledige re-render
  const pill = document.querySelector(`[data-onb-workday="${dayIdx}"]`);
  if (pill) {
    pill.classList.toggle('is-active', wd.includes(dayIdx));
  }
}

function renderCoordinatorView() {
  const L = T[state.lang];
  const fk = state.coordinatorActiveFreq || 'daily';
  const allTasks = getAllTasks();
  // Tasks-by-freq cache zodat we niet 7x door alle taken hoeven
  const counts = {};
  allTasks.forEach(t => { counts[t.freq_key] = (counts[t.freq_key] || 0) + 1; });

  const subtabs = [
    { key: 'daily', label: L.tabs.daily },
    { key: 'weekly', label: L.tabs.weekly },
    { key: 'monthly', label: L.tabs.monthly },
    { key: 'bimonthly', label: L.tabs.bimonthly },
    { key: 'quarterly', label: L.tabs.quarterly },
    { key: 'semiannual', label: L.tabs.semiannual },
    { key: 'annual', label: L.tabs.annual }
  ];

  const subtabsHtml = subtabs.map(t => {
    const cnt = counts[t.key] || 0;
    return `<button class="coord-subtab ${fk === t.key ? 'active' : ''}"
                    onclick="switchCoordinatorFreq('${t.key}')"
                    aria-pressed="${fk === t.key}">
      <span class="coord-subtab-label">${esc(t.label)}</span>
      <span class="coord-subtab-count">${cnt}</span>
    </button>`;
  }).join('');

  // Hier komt de truc: zwap activeTab + filters tijdelijk zodat renderFiltersBar +
  // renderTaskView met de coordinator-eigen filter-state werken. We zetten ze
  // na render terug zodat het Dashboard en de freq-tabs hun eigen state houden.
  const realActive = state.activeTab;
  const realFilters = state.filters;
  const realFiltersOpen = state.filtersOpen;
  state.activeTab = fk;
  state.filters = state.coordFilters || { area: '', performer: '', search: '' };
  state.filtersOpen = !!state.coordFiltersOpen;
  let inner;
  try {
    inner = renderFiltersBar();
  } catch (e) {
    console.error('Coordinator renderFiltersBar failed:', e);
    inner = '<div class="empty-state">Render error — zie console.</div>';
  } finally {
    state.activeTab = realActive;
    state.filters = realFilters;
    state.filtersOpen = realFiltersOpen;
  }

  // Tel incompletes voor de afwerklijst-knop (snel: ééns per render).
  let incompleteCount = 0;
  allTasks.forEach(t => {
    for (const f of AFW_FIELDS) { if (isFieldMissing(t, f)) { incompleteCount++; break; } }
  });
  const afwBtnLabel = incompleteCount > 0
    ? L.afw_open_btn_count.replace('{n}', incompleteCount)
    : L.afw_open_btn;
  const afwBtnDisabled = incompleteCount === 0 ? 'disabled' : '';

  // Tel actieve filter-criteria voor het filter-button-badge.
  const cf = state.coordFilters || { area: '', performer: '', search: '' };
  let activeFilterCount = 0;
  if (cf.area) activeFilterCount++;
  if (cf.performer) activeFilterCount++;
  if (cf.search) activeFilterCount++;
  const filterBtnLabel = (state.lang === 'en' ? '🔎 Filters' : '🔎 Filters')
    + (activeFilterCount > 0 ? ` (${activeFilterCount})` : '');
  const filterBtnAriaLabel = state.lang === 'nl' ? 'Filters open/sluiten' : 'Toggle filters';

  // Super-user only: "Vink alles af" — vinkt in één keer alle taken van de
  // huidige frequentie-tab af voor de actieve periode-slot.
  const checkAllBtnHtml = isSuperuser()
    ? `<button class="coord-checkall-btn"
               onclick="coordCheckAllVisible()">${state.lang === 'nl' ? '✓ Vink alles af' : '✓ Check all'}</button>`
    : '';

  return `
    <div class="coord-view" id="coord-view">
      <header class="coord-header">
        <div class="coord-header-text">
          <h2 class="coord-header-title">🗂 ${esc(L.coord_header_title)}</h2>
          <p class="coord-header-sub">${esc(L.coord_header_sub)}</p>
        </div>
        <div class="coord-header-actions">
          <button class="coord-filter-btn ${state.coordFiltersOpen ? 'is-open' : ''} ${activeFilterCount > 0 ? 'has-active' : ''}"
                  onclick="toggleCoordFilters()"
                  aria-label="${esc(filterBtnAriaLabel)}"
                  aria-expanded="${state.coordFiltersOpen ? 'true' : 'false'}">
            ${esc(filterBtnLabel)}
          </button>
          <button class="coord-afw-btn ${incompleteCount > 0 ? 'has-incomplete' : ''}"
                  ${afwBtnDisabled}
                  onclick="openAfwerklijstModal()">${esc(afwBtnLabel)}</button>
          ${checkAllBtnHtml}
        </div>
      </header>
      <div class="coord-subtabs" role="tablist" aria-label="${esc(L.coord_subtab_aria)}">
        ${subtabsHtml}
      </div>
      <div class="coord-body">
        ${inner}
      </div>
    </div>
  `;
}

// Switch de actieve sub-tab binnen de Coördinator-view. Re-rendert alleen
// het content-area (geen full app re-render, geen sidebar/header-flicker).
function switchCoordinatorFreq(freqKey) {
  if (!['daily','weekly','monthly','bimonthly','quarterly','semiannual','annual'].includes(freqKey)) return;
  if (state.coordinatorActiveFreq === freqKey) return;
  state.coordinatorActiveFreq = freqKey;
  saveState();
  if (state.activeTab !== 'coordinator') return;
  // Re-render alleen de content. Dit gaat door dezelfde codepad als de
  // gewone freq-tab-switch zodat wireCheckboxes etc. correct worden
  // opnieuw aangeroepen.
  const c = document.getElementById('filters-and-content');
  if (c) {
    c.innerHTML = renderCoordinatorView();
    wireCoordFilterInputs();
    wireCheckboxes();
    updateBulkActionBar();
  }
  // Update aria-pressed / active states op de sub-tabs zonder volledige
  // re-render (gebeurt al door renderCoordinatorView, dit is een no-op-
  // safety voor zekerheid).
}

// Super-user only. Vinkt alle taken van de huidige Coördinator-frequentie-tab
// in één keer af voor de actieve periode-slot. Schrijft direct naar
// state.checks en slaat één keer op (saveState(true) debounct de cloud-push),
// i.p.v. setChecked() per taak — dat zou tientallen storage-writes triggeren.
function coordCheckAllVisible() {
  if (!isSuperuser()) return;
  const fk = state.coordinatorActiveFreq || 'daily';
  const tasks = getAllTasks().filter(t => t.freq_key === fk);
  if (!tasks.length) return;

  const confirmMsg = state.lang === 'nl'
    ? `Alle ${tasks.length} taken in deze tab afvinken?`
    : `Check off all ${tasks.length} tasks in this tab?`;
  if (!confirm(confirmMsg)) return;

  const slot = getCurrentSlot(fk);
  const historical = isViewingHistorical(fk);
  const key = historical ? getViewingPeriodKey(fk) : getStoragePeriodKey(fk);
  if (!state.checks[fk]) state.checks[fk] = {};
  if (!state.checks[fk][key]) state.checks[fk][key] = {};

  let changed = 0;
  tasks.forEach(t => {
    if (isChecked(fk, t.id, slot)) return; // al afgevinkt — niet overschrijven
    if (!state.checks[fk][key][t.id]) state.checks[fk][key][t.id] = {};
    const entry = { v: true, by: state.currentUser || '', at: new Date().toISOString() };
    if (historical) {
      entry.corrected = true;
      entry.correctedBy = (state.authUser && state.authUser.email) || state.currentUser || '';
      entry.correctedAt = new Date().toISOString();
    }
    state.checks[fk][key][t.id][slot] = entry;
    changed++;
  });

  if (!changed) return;
  saveState(true); // checks-only push
  if (state.activeTab !== 'coordinator') return;
  const c = document.getElementById('filters-and-content');
  if (c) {
    c.innerHTML = renderCoordinatorView();
    wireCoordFilterInputs();
    wireCheckboxes();
    updateBulkActionBar();
  }
}

// Toggle de zichtbaarheid van de filter-balk binnen de Coördinator-view.
// Apart van state.filtersOpen (die is voor de gewone freq-tabs).
function toggleCoordFilters() {
  state.coordFiltersOpen = !state.coordFiltersOpen;
  saveState();
  // Re-render alleen de coordinator-view zodat de filter-balk slide-in/
  // slide-out animatie door CSS getriggerd wordt.
  if (state.activeTab !== 'coordinator') return;
  const c = document.getElementById('filters-and-content');
  if (c) {
    c.innerHTML = renderCoordinatorView();
    wireCoordFilterInputs();
    wireCheckboxes();
    updateBulkActionBar();
  }
}

// Wire de filter-input-listeners binnen de Coördinator-view. Schrijft naar
// state.coordFilters (niet de globale state.filters) en re-rendert alleen
// het task-view-container met de coordinator-eigen filter-state actief.
// Apart helper omdat hij vanuit twee plekken wordt aangeroepen
// (renderContent voor coordinator én switchCoordinatorFreq).
function wireCoordFilterInputs() {
  document.querySelectorAll('.filter-input').forEach(el => {
    el.onchange = function() {
      const field = this.dataset.field;
      if (field === 'sortBy') {
        // sortBy blijft globaal (dezelfde keuze geldt voor freq-tabs én coord).
        state.sortBy = this.value;
        saveState();
      } else {
        // Schrijf naar coordFilters i.p.v. de globale state.filters.
        if (!state.coordFilters) state.coordFilters = { area: '', performer: '', search: '' };
        state.coordFilters[field] = this.value;
        saveState();
      }
      // Re-render task-view met coordinator-state actief (zwap).
      const realActive = state.activeTab;
      const realFilters = state.filters;
      state.activeTab = state.coordinatorActiveFreq;
      state.filters = state.coordFilters;
      try {
        const tvc = document.getElementById('task-view-container');
        if (tvc) tvc.innerHTML = renderTaskView();
      } finally {
        state.activeTab = realActive;
        state.filters = realFilters;
      }
      // Update filter-knop-badge in de header (kan gewijzigd zijn).
      const headerActions = document.querySelector('.coord-header-actions .coord-filter-btn');
      if (headerActions) {
        const cf = state.coordFilters || {};
        let n = 0;
        if (cf.area) n++;
        if (cf.performer) n++;
        if (cf.search) n++;
        const baseLabel = state.lang === 'en' ? '🔎 Filters' : '🔎 Filters';
        headerActions.textContent = baseLabel + (n > 0 ? ` (${n})` : '');
        headerActions.classList.toggle('has-active', n > 0);
      }
      wireCheckboxes();
      updateBulkActionBar();
    };
    if (el.tagName === 'INPUT') el.oninput = el.onchange;
  });
}

// =====================================================
// AFWERKLIJST (Coördinator-tool — incomplete-task editor)
// =====================================================
// Vindt taken waar ten minste één van wanneer/methode/middel ontbreekt en
// niet expliciet als NVT is gemarkeerd. Coördinatoren werken zich erdoor
// met een fill-out form per taak en kiezen per veld: invullen, NVT, of
// overslaan. Wijzigingen gaan via recordChange('edit') zodat ze in de
// pending-queue komen — consistent met hoe de gewone edit-modal werkt.

const AFW_FIELDS = ['wanneer', 'methode', 'middel'];

// Wordt het veld als ontbrekend gerekend? Een veld is "ontbrekend" wanneer
// (a) de taak het niet heeft of het is leeg/whitespace EN (b) het niet
// expliciet als NVT is gemarkeerd voor deze taak.
function isFieldMissing(task, field) {
  const nvt = (state.taskNvtFields && state.taskNvtFields[task.id]) || [];
  if (nvt.includes(field)) return false;
  const v = task[field];
  if (v === null || v === undefined) return true;
  return String(v).trim() === '';
}

// Geef de lijst incomplete taken terug, gesorteerd op ruimte → freq → row.
// Custom-tasks staan ook in de lijst — die kunnen ook ontbrekende velden
// hebben (bv. snel toegevoegd zonder middel).
function getIncompleteTasks() {
  const all = getAllTasks();
  const result = [];
  all.forEach(t => {
    const missing = AFW_FIELDS.filter(f => isFieldMissing(t, f));
    if (missing.length > 0) {
      result.push(Object.assign({}, t, { __missing: missing }));
    }
  });
  // Sort: ruimte alfabetisch → freq-order → row
  const FREQ_ORDER = ['daily','weekly','monthly','bimonthly','quarterly','semiannual','annual'];
  result.sort((a, b) => {
    const ar = (a.ruimte || '').toString();
    const br = (b.ruimte || '').toString();
    const cmp = ar.localeCompare(br);
    if (cmp !== 0) return cmp;
    const af = FREQ_ORDER.indexOf(a.freq_key);
    const bf = FREQ_ORDER.indexOf(b.freq_key);
    if (af !== bf) return (af === -1 ? 99 : af) - (bf === -1 ? 99 : bf);
    return (parseInt(a.row) || 0) - (parseInt(b.row) || 0);
  });
  return result;
}

// Open de afwerklijst-modal. Bevriest de huidige incomplete-lijst zodat
// na een save-actie (waarbij de taak compleet wordt) we niet plotseling
// een andere lijst hebben — we werken door met de oorspronkelijke set.
function openAfwerklijstModal() {
  const tasks = getIncompleteTasks();
  state.afwerklijst = {
    taskIds: tasks.map(t => t.id),
    currentIdx: 0,
    showAllFields: false,
    saved: 0,
    nvtMarked: 0,
    skipped: 0
  };
  // DOM mount
  let modal = document.getElementById('afwerklijst-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'afwerklijst-modal';
    modal.className = 'modal-backdrop afwerklijst-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.addEventListener('click', e => {
      if (e.target === modal) closeAfwerklijstModal();
    });
    document.body.appendChild(modal);
  }
  modal.innerHTML = renderAfwerklijst();
  modal.classList.add('show');
  wireAfwerklijst();
}

// Helper: re-render de afwerklijst-modal met orphan-cleanup. De combobox-
// dropdown wordt bij open naar document.body verplaatst (om te ontsnappen
// aan de modal-transform-context). Bij re-render moeten we eventueel
// achtergebleven body-children opruimen voordat we nieuwe HTML in de modal
// schrijven, anders accumuleren orphan-lists bij elke save-cycle.
function rerenderAfwerklijstModal() {
  const modal = document.getElementById('afwerklijst-modal');
  if (!modal) return;
  // Cleanup orphan combo-lists in body
  document.querySelectorAll('body > .afw-combo-list').forEach(orphan => {
    try { orphan.parentNode.removeChild(orphan); } catch (e) {}
  });
  // Cleanup scroll-listeners van oude comboboxes
  modal.querySelectorAll('.afw-combobox').forEach(cb => {
    if (cb._scrollListener) {
      window.removeEventListener('scroll', cb._scrollListener, true);
      window.removeEventListener('resize', cb._scrollListener);
      delete cb._scrollListener;
    }
  });
  modal.innerHTML = renderAfwerklijst();
  wireAfwerklijst();
}

function closeAfwerklijstModal() {
  const modal = document.getElementById('afwerklijst-modal');
  // Cleanup: verwijder de scroll/resize-listeners die elke combobox
  // heeft geregistreerd, anders accumuleren ze bij elke open/close-cycle.
  if (modal) {
    modal.querySelectorAll('.afw-combobox').forEach(cb => {
      if (cb._scrollListener) {
        window.removeEventListener('scroll', cb._scrollListener, true);
        window.removeEventListener('resize', cb._scrollListener);
        delete cb._scrollListener;
      }
    });
    modal.classList.remove('show');
  }
  // Verwijder eventueel-orphan combo-lists die naar document.body zijn
  // verplaatst maar nog niet teruggezet (kan gebeuren als de gebruiker
  // de modal sluit met dropdown nog open).
  document.querySelectorAll('body > .afw-combo-list').forEach(orphan => {
    try { orphan.parentNode.removeChild(orphan); } catch (e) {}
  });
  state.afwerklijst = null;
  // Re-render coordinator zodat de telling op de knop bijgewerkt is.
  if (state.activeTab === 'coordinator') {
    const c = document.getElementById('filters-and-content');
    if (c) c.innerHTML = renderCoordinatorView();
    wireCoordFilterInputs();
    wireCheckboxes();
    updateBulkActionBar();
  }
}

// Render de afwerklijst-modal. Twee staten: lijst-empty (alles compleet)
// of taakkaart met form. Voor de huidige taak tonen we eerst de
// ontbrekende velden, dan optioneel "Toon alle velden" om de andere drie
// (overige fields) ook te kunnen aanpassen.
// Bouw de option-list voor de Methode-dropdown in de afwerklijst.
// Combineert de canonieke methodes (DATA.methods) met alle methodes die
// daadwerkelijk in andere taken voorkomen — zo missen we niets dat in de
// praktijk gebruikt wordt (bv. "Extern", "Vaatwasser") maar dat niet in
// DATA.methods zit. Sortert op alfabet en deduplicareert case-insensitive.
// `currentVal` wordt geforceerd in de lijst zelfs als hij elders nergens
// voorkomt — anders verliest een save de bestaande waarde.
function buildMethodeOptions(currentVal) {
  const set = new Map(); // key: lowercase, value: original casing
  // Canonieke methodes
  (DATA.methods || []).forEach(m => {
    if (m && m.name) set.set(m.name.toLowerCase().trim(), m.name);
  });
  // Plus alles in gebruik in tasks
  getAllTasks().forEach(t => {
    if (t.methode) {
      const k = t.methode.toLowerCase().trim();
      if (!set.has(k)) set.set(k, t.methode);
    }
  });
  // Plus de huidige waarde (mocht hij ergens uit de boot vallen)
  if (currentVal) {
    const k = currentVal.toLowerCase().trim();
    if (!set.has(k)) set.set(k, currentVal);
  }
  // Sort alfabetisch
  const list = [...set.values()].sort((a, b) => a.localeCompare(b));
  return list;
}

// Bouw de option-list voor de Middel-dropdown. Idem maar met DATA.products
// + extra niet-chemische "tools" die als middel gebruikt worden in DATA
// (zoals Bezemmateriaal, Vochtige doek, NVT). Het edit-modal gebruikt
// dezelfde `extraTools`-lijst — we houden die hier in sync.
const AFW_EXTRA_TOOLS = ['Bezemmateriaal', 'Vochtige doek', 'Droge doek', 'Stofzuiger', 'Luchtdruk', 'Krabber', 'Water', 'NVT'];

function buildMiddelOptions(currentVal) {
  const set = new Map();
  // Canonieke producten
  (DATA.products || []).forEach(p => {
    if (p && p.name) set.set(p.name.toLowerCase().trim(), p.name);
  });
  // Plus alles in gebruik in tasks
  getAllTasks().forEach(t => {
    if (t.middel) {
      const k = t.middel.toLowerCase().trim();
      if (!set.has(k)) set.set(k, t.middel);
    }
  });
  // Plus de hardcoded tools-lijst (zorgt dat ze altijd zichtbaar zijn ook
  // als ze nergens in DATA voorkomen — synchroon met edit-modal)
  AFW_EXTRA_TOOLS.forEach(t => {
    const k = t.toLowerCase().trim();
    if (!set.has(k)) set.set(k, t);
  });
  // Plus de huidige waarde
  if (currentVal) {
    const k = currentVal.toLowerCase().trim();
    if (!set.has(k)) set.set(k, currentVal);
  }
  return [...set.values()].sort((a, b) => a.localeCompare(b));
}

// Render een searchable combobox voor de afwerklijst-form. Werkt voor
// methode, middel en wanneer-velden: input waar je in kan typen + een
// dropdown-lijst die verschijnt onder de input met gefilterde opties.
// Vrije tekst is toegestaan — wat de gebruiker uiteindelijk in `value`
// heeft staan wordt opgeslagen, ongeacht of het matcht met een optie.
//
// IMPLEMENTATIE-NOOT: de dropdown-list wordt NIET binnen de combobox-DOM
// gerenderd — hij zit in de combobox-template als <template>-achtige stub
// maar wordt door wireOneCombobox() bij open verplaatst naar document.body.
// Reden: de bovenliggende .modal heeft een `transform` voor de slide-in
// animatie, en `transform` maakt een nieuwe containing block voor fixed-
// positioned descendants — daardoor zou de fixed-list niet meer fixed
// t.o.v. de viewport zijn maar t.o.v. de modal. Door de list naar body
// te verhuizen ontsnappen we aan die transform-context.
function renderAfwCombobox(field, currentVal, options, isNvt, placeholder) {
  // We renderen alle opties direct in de DOM (display: none zolang de
  // dropdown gesloten is); JS filtert ze on-input. Voor de huidige set
  // (~25 opties max) is dit veel sneller dan elke keyup re-renderen.
  const optsHtml = options.map((opt, i) =>
    `<button type="button" class="afw-combo-option"
             data-value="${esc(opt)}"
             data-index="${i}"
             tabindex="-1"
             role="option">${esc(opt)}</button>`
  ).join('');
  return `
    <div class="afw-combobox ${isNvt ? 'is-disabled' : ''}" data-field="${esc(field)}">
      <input type="text"
             class="afw-field-input afw-combo-input"
             id="afw-input-${esc(field)}"
             data-field="${esc(field)}"
             value="${esc(currentVal)}"
             placeholder="${esc(placeholder || '')}"
             autocomplete="off"
             role="combobox"
             aria-autocomplete="list"
             aria-expanded="false"
             ${isNvt ? 'disabled' : ''}>
      <button type="button" class="afw-combo-toggle"
              tabindex="-1"
              aria-label="${esc(state.lang === 'nl' ? 'Toon opties' : 'Toggle options')}"
              ${isNvt ? 'disabled' : ''}>▾</button>
      <div class="afw-combo-list" role="listbox" hidden>
        ${optsHtml}
        <div class="afw-combo-no-match" hidden>${esc(state.lang === 'nl' ? 'Geen match — je tekst wordt opgeslagen als nieuwe waarde' : 'No matches — your text will be saved as new value')}</div>
      </div>
    </div>`;
}

// Bouw de datalist voor wanneer-veld in de afwerklijst — dezelfde canonieke
// volgorde als WANNEER_ORDER, plus alle waarden in gebruik in tasks.
function buildWanneerOptions() {
  const set = new Set(WANNEER_ORDER);
  getAllTasks().forEach(t => {
    if (t.wanneer && String(t.wanneer).trim()) set.add(String(t.wanneer).trim());
  });
  return [...set];
}

function renderAfwerklijst() {
  const L = T[state.lang];
  const session = state.afwerklijst;
  if (!session) return '';
  const total = session.taskIds.length;

  // Empty state: alles compleet of overgeslagen voorbij het einde
  if (total === 0 || session.currentIdx >= total) {
    return `
      <div class="modal afwerklijst-modal-inner">
        <div class="modal-header">
          <div>
            <h2>${esc(L.afw_modal_title)}</h2>
          </div>
          <button class="close" onclick="closeAfwerklijstModal()" aria-label="${esc(L.afw_btn_close)}">×</button>
        </div>
        <div class="modal-body">
          ${total === 0 ? `
            <div class="afw-empty-state">
              <div class="afw-empty-icon" aria-hidden="true">🎉</div>
              <h3 class="afw-empty-title">${esc(L.afw_no_incompletes_title)}</h3>
              <p class="afw-empty-sub">${esc(L.afw_no_incompletes_sub)}</p>
            </div>
          ` : `
            <div class="afw-empty-state">
              <div class="afw-empty-icon" aria-hidden="true">🎉</div>
              <h3 class="afw-empty-title">${esc(L.afw_finished_title)}</h3>
              <p class="afw-empty-sub">${L.afw_finished_sub
                .replace('{saved}', session.saved)
                .replace('{nvt}', session.nvtMarked)
                .replace('{skipped}', session.skipped)}</p>
            </div>
          `}
        </div>
        <div class="modal-footer">
          <button class="btn-save" onclick="closeAfwerklijstModal()">${esc(L.afw_btn_finish)}</button>
        </div>
      </div>`;
  }

  // Render form for the current task
  const taskId = session.taskIds[session.currentIdx];
  const task = getAllTasks().find(t => t.id === taskId);
  if (!task) {
    // Task bestaat niet meer — sla over
    return `
      <div class="modal afwerklijst-modal-inner">
        <div class="modal-header">
          <h2>${esc(L.afw_modal_title)}</h2>
          <button class="close" onclick="closeAfwerklijstModal()">×</button>
        </div>
        <div class="modal-body">
          <p>Task niet meer beschikbaar — slaan we over.</p>
        </div>
        <div class="modal-footer">
          <button class="btn-save" onclick="afwSkipTask()">${esc(L.afw_btn_skip)}</button>
        </div>
      </div>`;
  }

  const missing = AFW_FIELDS.filter(f => isFieldMissing(task, f));
  const nvt = (state.taskNvtFields && state.taskNvtFields[task.id]) || [];
  const showAll = !!session.showAllFields;
  // Auto-suggestie voor methode = "Extern": tip om middel als NVT te markeren
  const externHint = (task.methode || '').toLowerCase().includes('extern');
  const progressLabel = L.afw_progress.replace('{cur}', session.currentIdx + 1).replace('{total}', total);
  const progressPct = ((session.currentIdx) / total) * 100;
  const ctxLabel = L.afw_task_context
    .replace('{ruimte}', tr(task.ruimte || '—'))
    .replace('{onderdeel}', tr(trOnderdeel(task) || '—'));

  // Veld-rendering helper
  function renderField(field) {
    const isMissing = missing.includes(field);
    const isNvt = nvt.includes(field);
    const fieldLabel = ({
      wanneer: L.afw_field_wanneer,
      methode: L.afw_field_methode,
      middel: L.afw_field_middel
    })[field];
    const placeholderEx = ({
      wanneer: 'Tijdens productie · 1x per dag · Zaterdag · …',
      methode: 'Handmatig · Schrobben/machinaal · Inschuimen (LD1, MD5) · …',
      middel: 'Topaz LD1 · Sirifan Speed · Bezemmateriaal · …'
    })[field];
    const currentVal = String(task[field] || '').trim();

    // Bouw input-element. Alle drie velden gebruiken nu een searchable
    // combobox: input waar je in kan typen + dropdown-lijst eronder met
    // gefilterde opties. Vrije tekst is toegestaan zodat coördinatoren
    // ook nieuwe waarden kunnen invoeren die nergens in de bestaande
    // data voorkomen.
    let inputHtml;
    if (field === 'methode') {
      inputHtml = renderAfwCombobox('methode', currentVal, buildMethodeOptions(currentVal), isNvt, placeholderEx);
    } else if (field === 'middel') {
      inputHtml = renderAfwCombobox('middel', currentVal, buildMiddelOptions(currentVal), isNvt, placeholderEx);
    } else {
      // wanneer
      inputHtml = renderAfwCombobox('wanneer', currentVal, buildWanneerOptions(), isNvt, placeholderEx);
    }

    return `
      <div class="afw-field ${isMissing ? 'is-missing' : ''} ${isNvt ? 'is-nvt' : ''}" data-field="${esc(field)}">
        <div class="afw-field-header">
          <label class="afw-field-label" for="afw-input-${esc(field)}">${esc(fieldLabel)}</label>
          ${isMissing ? `<span class="afw-missing-pill">⚠ ${esc(L.afw_missing_label)}</span>` : ''}
          ${isNvt ? `<span class="afw-nvt-pill">${esc(L.afw_nvt_label)}</span>` : ''}
        </div>
        ${inputHtml}
        ${isNvt
          ? `<button type="button" class="afw-nvt-unmark-btn" onclick="afwUnmarkNvt('${esc(task.id)}','${esc(field)}')">${esc(L.afw_nvt_unmark_btn)}</button>`
          : (isMissing ? `<button type="button" class="afw-nvt-btn" onclick="afwMarkFieldNvt('${esc(task.id)}','${esc(field)}')">${esc(L.afw_btn_nvt)}</button>` : '')}
        ${(field === 'middel' && externHint && isMissing && !isNvt)
          ? `<div class="afw-extern-hint">💡 ${esc(L.afw_extern_hint)}</div>`
          : ''}
      </div>
    `;
  }

  // Bouw de field-set: eerst de ontbrekende velden (geprioriteerd), daarna
  // optioneel de overige velden van AFW_FIELDS.
  const fieldsToShow = showAll
    ? AFW_FIELDS
    : AFW_FIELDS.filter(f => missing.includes(f) || nvt.includes(f));
  const fieldsHtml = fieldsToShow.map(renderField).join('');

  return `
    <div class="modal afwerklijst-modal-inner">
      <div class="modal-header">
        <div class="afw-header-block">
          <h2>${esc(L.afw_modal_title)}</h2>
          <p class="afw-header-sub">${esc(L.afw_modal_sub)}</p>
        </div>
        <button class="close" onclick="closeAfwerklijstModal()" aria-label="${esc(L.afw_btn_close)}">×</button>
      </div>
      <div class="afw-progress-row">
        <span class="afw-progress-label">${esc(progressLabel)}</span>
        <div class="afw-progress-bar" role="progressbar" aria-valuenow="${session.currentIdx + 1}" aria-valuemin="1" aria-valuemax="${total}">
          <div class="afw-progress-fill" style="width: ${progressPct}%"></div>
        </div>
      </div>
      <div class="modal-body afw-body">
        <div class="afw-task-card">
          <div class="afw-task-context">${esc(ctxLabel)}</div>
          <div class="afw-task-title">${esc(trSubcat(task) || trOnderdeel(task) || task.id)}</div>
          ${task.werkplek ? `<div class="afw-task-meta">📍 ${esc(tr(task.werkplek))}</div>` : ''}
          <div class="afw-fields">
            ${fieldsHtml}
          </div>
          <div class="afw-toggle-all-row">
            <button class="afw-toggle-all-btn" onclick="afwToggleShowAll()">
              ${showAll ? esc(L.afw_show_compact_btn) : esc(L.afw_show_all_btn)}
            </button>
          </div>
        </div>
      </div>
      <div class="modal-footer afw-footer">
        <button class="btn-cancel afw-btn-skip" onclick="afwSkipTask()">${esc(L.afw_btn_skip)}</button>
        <button class="btn-save afw-btn-save" onclick="afwSaveAndNext()">${esc(L.afw_btn_save)}</button>
      </div>
    </div>
  `;
}

function wireAfwerklijst() {
  const modal = document.getElementById('afwerklijst-modal');
  if (!modal) return;

  // ===== Combobox-interactiviteit =====
  // Voor elk .afw-combobox-element wireren we input, toggle-knop, opties
  // en keyboard-events. State per combobox wordt op het DOM-element zelf
  // bijgehouden via dataset (highlight-index).
  const comboBoxes = modal.querySelectorAll('.afw-combobox');
  comboBoxes.forEach(cb => wireOneCombobox(cb));

  // ===== Auto-focus eerste lege combobox-input =====
  const firstEmpty = [...modal.querySelectorAll('.afw-combo-input')]
    .find(inp => !inp.disabled && (!inp.value || inp.value.trim() === ''));
  if (firstEmpty) {
    // Kleine timeout zodat het renderpad eerst klaar is
    setTimeout(() => firstEmpty.focus(), 30);
  }
}

// Wire één combobox (input + toggle + lijst). Houdt highlight-state lokaal.
function wireOneCombobox(cb) {
  const input = cb.querySelector('.afw-combo-input');
  const toggle = cb.querySelector('.afw-combo-toggle');
  const list = cb.querySelector('.afw-combo-list');
  const noMatch = cb.querySelector('.afw-combo-no-match');
  const options = [...cb.querySelectorAll('.afw-combo-option')];
  if (!input || !list) return;

  let highlightIdx = -1;

  // Verplaats de list naar document.body bij open — ontsnapt aan de
  // transform-containing-block van de modal. Onthou de oorspronkelijke
  // parent zodat we 'm bij sluiten kunnen terugzetten.
  const originalListParent = list.parentNode;

  function placeComboList() {
    // Bereken positie van de input op het scherm en plaats de fixed-list
    // daar direct onder. Als er onvoldoende ruimte onder is (bv. dichtbij
    // de viewport-bottom), open dan boven de input.
    const rect = input.getBoundingClientRect();
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const listMaxH = 240;
    list.style.left = rect.left + 'px';
    list.style.width = rect.width + 'px';
    if (spaceBelow >= Math.min(listMaxH, 160) || spaceBelow >= spaceAbove) {
      // Onder
      list.style.top = rect.bottom + 'px';
      list.style.bottom = '';
      list.style.maxHeight = Math.min(listMaxH, spaceBelow - 8) + 'px';
      list.classList.remove('opens-up');
      list.classList.add('opens-down');
    } else {
      // Boven
      list.style.top = '';
      list.style.bottom = (vh - rect.top) + 'px';
      list.style.maxHeight = Math.min(listMaxH, spaceAbove - 8) + 'px';
      list.classList.remove('opens-down');
      list.classList.add('opens-up');
    }
  }

  function openList() {
    // Verhuis list naar body BEFORE we plaatsen — anders meet getBoundingClientRect
    // de input wel correct, maar plaatst fixed-positioning relatief tot de
    // modal's transform-context (= verkeerd).
    if (list.parentNode !== document.body) {
      document.body.appendChild(list);
    }
    list.hidden = false;
    placeComboList();
    input.setAttribute('aria-expanded', 'true');
    cb.classList.add('is-open');
    filterOptions(input.value);
    // Scroll de geselecteerde optie in beeld als aanwezig
    const cur = options.find(o => o.dataset.value === input.value);
    if (cur) {
      highlightIdx = options.indexOf(cur);
      updateHighlight();
      try { cur.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    }
  }

  function closeList() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    cb.classList.remove('is-open');
    highlightIdx = -1;
    options.forEach(o => o.classList.remove('is-highlighted'));
    // Zet de list terug naar zijn originele parent zodat hij netjes met
    // de modal mee wordt opgeruimd wanneer renderAfwerklijst opnieuw
    // wordt aangeroepen. Anders blijft hij als wees in document.body
    // hangen na een re-render.
    if (originalListParent && list.parentNode === document.body) {
      try { originalListParent.appendChild(list); } catch (e) {}
    }
  }

  function filterOptions(q) {
    const query = (q || '').toLowerCase().trim();
    let visibleCount = 0;
    options.forEach(opt => {
      const v = opt.dataset.value.toLowerCase();
      // Match: substring (case-insensitive). Lege query toont alles.
      const matches = !query || v.includes(query);
      opt.hidden = !matches;
      if (matches) visibleCount++;
    });
    // No-match-bericht alleen tonen als gebruiker echt iets heeft getypt
    // dat nergens matcht — anders kan het verwarrend zijn bij een lege
    // input die net is geopend.
    if (noMatch) {
      noMatch.hidden = !(query && visibleCount === 0);
    }
    // Reset highlight bij elke filter — gebruiker kan dan met ↓ door de
    // (gefilterde) lijst lopen.
    highlightIdx = -1;
    updateHighlight();
  }

  function updateHighlight() {
    const visibleOpts = options.filter(o => !o.hidden);
    options.forEach(o => o.classList.remove('is-highlighted'));
    if (highlightIdx >= 0 && highlightIdx < visibleOpts.length) {
      const target = visibleOpts[highlightIdx];
      target.classList.add('is-highlighted');
      try { target.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    }
  }

  // Sentinel om te voorkomen dat selectValue() per ongeluk de lijst weer
  // opent via de input/focus events die direct na value-set worden gefired.
  let _justSelected = false;

  function selectValue(val) {
    _justSelected = true;
    input.value = val;
    closeList();
    // Geen input-event dispatchen — er zijn geen externe listeners op
    // afw-combo-input die dat nodig hebben, en het zou alleen maar de
    // input-listener triggeren die opnieuw openList() zou aanroepen.
    // Reset sentinel op next tick zodat normale typing meteen weer werkt.
    setTimeout(() => { _justSelected = false; }, 50);
  }

  // Input typen → open lijst + filter (alleen wanneer er werkelijk wordt
  // getypt — focus alleen opent de lijst NIET, dat is opzettelijk: de lijst
  // hoort alleen te verschijnen op expliciete actie van de gebruiker, niet
  // bij auto-focus van het eerste lege veld bij modal-open).
  input.addEventListener('input', () => {
    if (_justSelected) return; // selectie net gedaan, niet heropenen
    if (list.hidden) openList();
    else filterOptions(input.value);
  });

  // Toggle-knop ▾ → open/sluit. Dit is de PRIMAIRE manier om de lijst
  // te openen — een gebruiker die alleen wil bladeren zonder te typen
  // klikt hierop.
  if (toggle) {
    toggle.addEventListener('mousedown', e => {
      // Mousedown ipv click zodat de input niet z'n focus verliest tussen
      // de toggle-klik en het openen van de lijst.
      e.preventDefault();
      if (list.hidden) {
        input.focus();
        openList();
      } else {
        closeList();
      }
    });
  }

  // Klik op een optie → selecteer en sluit. Géén input.focus() na
  // selecteren want dat zou de focus-listener triggeren die de lijst
  // weer opent. We laten focus waar de browser hem heen verplaatst —
  // dat is in de praktijk de body, en de gebruiker kan met klik op de
  // input opnieuw beginnen, of doorgaan naar het volgende veld.
  options.forEach(opt => {
    opt.addEventListener('mousedown', e => {
      // Mousedown vóór blur, anders sluit de blur-handler de lijst voordat
      // de click-handler wordt aangeroepen → niets gebeurt.
      e.preventDefault();
      selectValue(opt.dataset.value);
    });
  });

  // Keyboard navigation
  input.addEventListener('keydown', e => {
    const visibleOpts = options.filter(o => !o.hidden);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.hidden) openList();
      if (visibleOpts.length === 0) return;
      highlightIdx = Math.min(highlightIdx + 1, visibleOpts.length - 1);
      if (highlightIdx === -1) highlightIdx = 0;
      updateHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) openList();
      if (visibleOpts.length === 0) return;
      highlightIdx = Math.max(highlightIdx - 1, 0);
      updateHighlight();
    } else if (e.key === 'Enter') {
      // Als een optie gemarkeerd is, selecteer die. Anders: behoud wat
      // de gebruiker heeft getypt en ga door naar volgende taak.
      if (!list.hidden && highlightIdx >= 0 && visibleOpts[highlightIdx]) {
        e.preventDefault();
        selectValue(visibleOpts[highlightIdx].dataset.value);
      } else {
        e.preventDefault();
        closeList();
        // Save & next via gebruikelijk pad
        if (typeof afwSaveAndNext === 'function') afwSaveAndNext();
      }
    } else if (e.key === 'Escape') {
      if (!list.hidden) {
        e.preventDefault();
        closeList();
      } else {
        // Esc op gesloten lijst → sluit de hele modal
        closeAfwerklijstModal();
      }
    } else if (e.key === 'Tab') {
      // Tab sluit zonder te selecteren — gebruiker behoudt wat hij typte
      closeList();
    }
  });

  // Klik buiten de combobox → sluit lijst (gebruikt blur op input via
  // delay zodat optie-klikken nog kan registreren)
  input.addEventListener('blur', () => {
    // Kleine delay zodat een mousedown op een optie nog kan firen
    setTimeout(() => {
      if (!cb.contains(document.activeElement)) closeList();
    }, 150);
  });

  // Sluit dropdown bij scroll of resize — fixed-positioning kan anders
  // achterblijven op een verkeerde plek terwijl de input meebeweegt.
  // We registreren een capture-listener op alle scrollende voorouders;
  // window-resize is altijd globaal.
  const onScrollOrResize = () => {
    if (!list.hidden) {
      // Update positie in plaats van direct sluiten — minder agressief
      placeComboList();
    }
  };
  // Listen op window én op modal-body (interne scroll). Capture phase
  // pakt scrolls op alle nested scrollende elementen.
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
  // We laten deze listeners aan; zonder removal-pad accumuleren ze tot de
  // gebruiker de modal sluit. Bij modal-close roepen we cleanup aan.
  // Bewaar een referentie zodat closeAfwerklijstModal ze kan verwijderen.
  cb._scrollListener = onScrollOrResize;
}

function afwToggleShowAll() {
  if (!state.afwerklijst) return;
  state.afwerklijst.showAllFields = !state.afwerklijst.showAllFields;
  rerenderAfwerklijstModal();
}

function afwAdvance() {
  if (!state.afwerklijst) return;
  state.afwerklijst.currentIdx++;
  rerenderAfwerklijstModal();
}

function afwSkipTask() {
  if (!state.afwerklijst) return;
  state.afwerklijst.skipped++;
  afwAdvance();
}

// Sla de form-waarden op voor de huidige taak. Past taskOverrides aan
// (built-in) of customTasks (custom). Roept recordChange('edit') aan zodat
// de wijziging in de pending-queue komt — consistent met de gewone
// edit-modal. Ga daarna naar de volgende taak.
function afwSaveAndNext() {
  const session = state.afwerklijst;
  if (!session) return;
  const taskId = session.taskIds[session.currentIdx];
  const task = getAllTasks().find(t => t.id === taskId);
  if (!task) {
    afwAdvance();
    return;
  }
  // Verzamel form-waarden — alleen de inputs die in de DOM staan
  const inputs = document.querySelectorAll('#afwerklijst-modal .afw-field-input');
  const updates = {};
  let hasChange = false;
  inputs.forEach(inp => {
    if (inp.disabled) return;
    const field = inp.dataset.field;
    const val = inp.value.trim();
    const cur = (task[field] === null || task[field] === undefined) ? '' : String(task[field]).trim();
    if (val !== cur) {
      updates[field] = val === '' ? null : val;
      hasChange = true;
    }
  });
  if (!hasChange) {
    // Niets gewijzigd — gewoon door naar volgende.
    afwAdvance();
    return;
  }
  // Snapshot voor recordChange
  const beforeTask = Object.assign({}, task);
  // Apply updates: voor custom in customTasks, voor built-in in taskOverrides.
  // Voor built-in moet de override de volledige overridable-state bevatten,
  // want elders in de codebase wordt het object gebruikt als "snapshot van
  // alle overridden velden". We mergen de huidige task met de updates.
  const customIdx = state.customTasks.findIndex(t => t.id === taskId);
  if (customIdx >= 0) {
    state.customTasks[customIdx] = Object.assign({}, state.customTasks[customIdx], updates);
  } else {
    const orig = DATA.tasks.find(t => t.id === taskId) || {};
    const existingOv = state.taskOverrides[taskId] || {};
    // Volledige merged snapshot: origineel ← bestaande override ← onze updates
    const merged = Object.assign({}, orig, existingOv, updates);
    // Bewaar alleen de overridable velden; we willen geen andere props lekken.
    const OVERRIDABLE_FIELDS = ['ruimte','werkplek','onderdeel','subcat','onderdeel_en','subcat_en','uitvoerend','vervuiling','wanneer','methode','middel','vscore','zscore','afstand','freq','freq_key','imageUrl','assigned_user_id'];
    const ov = {};
    OVERRIDABLE_FIELDS.forEach(f => {
      if (merged[f] !== undefined) ov[f] = merged[f];
    });
    state.taskOverrides[taskId] = ov;
  }
  // Track in pending changelog
  const afterTask = Object.assign({}, getAllTasks().find(t => t.id === taskId));
  recordChange('edit', taskId, { before: beforeTask, after: afterTask });
  session.saved++;
  // saveState wordt door recordChange aangeroepen — hier expliciet om de
  // cloud-push direct te triggeren.
  saveState();
  showToast(T[state.lang].afw_saved_toast, 'success');
  afwAdvance();
}

// Markeer een veld op een taak als NVT. Voorkomt dat de taak opnieuw
// als incomplete wordt gerapporteerd voor dat specifieke veld.
function afwMarkFieldNvt(taskId, field) {
  if (!state.taskNvtFields) state.taskNvtFields = {};
  const arr = state.taskNvtFields[taskId] || [];
  if (!arr.includes(field)) arr.push(field);
  state.taskNvtFields[taskId] = arr;
  saveState();
  showToast(T[state.lang].afw_nvt_toast, 'info');
  // Tel mee in de sessie en re-render (het veld verdwijnt uit "missing")
  if (state.afwerklijst) state.afwerklijst.nvtMarked++;
  rerenderAfwerklijstModal();
}

function afwUnmarkNvt(taskId, field) {
  if (!state.taskNvtFields) return;
  const arr = state.taskNvtFields[taskId] || [];
  state.taskNvtFields[taskId] = arr.filter(f => f !== field);
  if (state.taskNvtFields[taskId].length === 0) delete state.taskNvtFields[taskId];
  saveState();
  rerenderAfwerklijstModal();
}

// =====================================================
// SCHOONMAAKRONDE-MODUS (PUNT 6)
// =====================================================
// Een "ronde" is een doorloop van een ingeklapte takenlijst, één taak per
// scherm. De gebruiker werkt zich erdoor met vorige/volgende-knoppen, vinkt
// af, slaat over of pauzeert. State leeft op state.activeRound en wordt
// lokaal gepersisteerd (overleeft browser-refresh, NIET gesyncd naar cloud).
//
// Sortering: op wanneer-bucket (canonieke volgorde uit WANNEER_ORDER), dan
// alfabetisch op ruimte. Zo krijgen werknemers eerst alle "Tijdens productie"
// werk in dezelfde ruimte achter elkaar, dan de volgende ruimte, enz.

// Sorteer een takenlijst voor de ronde: eerst op wanneer-bucket, daarna op
// ruimte (alfabetisch), daarna op taak-id voor stabiliteit. De input-array
// wordt niet gemuteerd; een nieuwe array wordt geretourneerd.
function sortTasksForRound(tasks) {
  return [...tasks].sort((a, b) => {
    const aw = wanneerSortIndex(normalizeWanneer(a.wanneer));
    const bw = wanneerSortIndex(normalizeWanneer(b.wanneer));
    if (aw !== bw) return aw - bw;
    const ar = (a.ruimte || '').toString();
    const br = (b.ruimte || '').toString();
    const cmp = ar.localeCompare(br);
    if (cmp !== 0) return cmp;
    return (a.id || '').toString().localeCompare((b.id || '').toString());
  });
}

// Start een nieuwe ronde met de gegeven takenlijst. Sorteert, bevriest IDs,
// initialiseert state.activeRound, persisteert lokaal en opent de overlay.
function startCleaningRound(tasks) {
  const L = T[state.lang];
  if (!Array.isArray(tasks) || tasks.length === 0) {
    showToast(L.round_no_tasks, 'info');
    return;
  }
  const sorted = sortTasksForRound(tasks);
  state.activeRound = {
    taskIds: sorted.map(t => t.id),
    currentIdx: 0,
    startedAt: new Date().toISOString(),
    checkedIds: [],
    skippedIds: [],
    notes: {}
  };
  saveState(); // lokaal opslaan zodat refresh de ronde herstelt
  openRoundOverlay();
}

// Wrapper voor de Today-view — bevroren snapshot van getTasksDueToday.
// Past het "alleen mijn taken"-filter toe als dat aan staat (PUNT 10) zodat
// de ronde dezelfde scope heeft als wat de gebruiker op de Today-view ziet.
function startCleaningRoundFromToday() {
  let tasks = getTasksDueToday();
  // Filter Zaterdag-specifieke taken uit op niet-zaterdagen. Reden: een
  // taak met `wanneer: "Zaterdag"` is bewust gepland voor de zaterdag-
  // schoonmaak (vaak met chemie, machines uit, hele werkplek toegankelijk)
  // — die kun je niet uitvoeren op een doordeweekse dag. Achterstand wordt
  // hier ook uitgefilterd: een gemiste zaterdag-taak moet wachten tot de
  // volgende zaterdag, niet in een doordeweekse ronde belanden.
  //
  // Op de grote-schoonmaak-dag zelf doen we het tegenovergestelde: we
  // sluiten weekly-taken uit die NIET voor die dag bedoeld zijn (zoals
  // "2x per week" = di+vr) — die horen ook niet thuis in de zaterdag-ronde.
  //
  // bigCleaningDay en twicePerWeekDays komen uit state.schedule
  // (configureerbaar in Instellingen → Werkrooster). Default = za / di+vr.
  const today = new Date().getDay();
  const bigDay = (state.schedule && typeof state.schedule.bigCleaningDay === 'number')
    ? state.schedule.bigCleaningDay : 6;
  const twicePerDays = (state.schedule && Array.isArray(state.schedule.twicePerWeekDays))
    ? state.schedule.twicePerWeekDays : [2, 5];
  const isBigDay = today === bigDay;
  const isTwicePerDay = twicePerDays.includes(today);
  tasks = tasks.filter(t => {
    if (t.freq_key !== 'weekly') return true;
    const wkey = normalizeWanneer(t.wanneer);
    if (isBigDay) {
      // Op de big-day: geen "2x per week"-taken (die zijn voor andere dagen)
      return wkey !== '2x per week';
    } else if (isTwicePerDay) {
      // Op een 2x-per-week-dag: geen Zaterdag-only taken
      return wkey !== 'Zaterdag';
    } else {
      // Andere werkdag: geen Zaterdag-only EN geen 2x-per-week
      return wkey !== 'Zaterdag' && wkey !== '2x per week';
    }
  });

  if (state.todayShowMineOnly && state.currentUser && isFeatureEnabled('assignedUsers')) {
    const me = String(state.currentUser).toLowerCase();
    tasks = tasks.filter(t => t.assigned_user_id && String(t.assigned_user_id).toLowerCase() === me);
  }
  startCleaningRound(tasks);
}

// Open of her-open de ronde-overlay. Als geen actieve ronde bestaat, no-op.
function openRoundOverlay() {
  if (!state.activeRound || !Array.isArray(state.activeRound.taskIds)) return;
  // Overlay zit in #round-overlay-container — als hij nog niet bestaat,
  // creëren we hem on-demand. Eén overlay-element wordt hergebruikt over
  // meerdere rondes.
  let overlay = document.getElementById('round-overlay');
  if (!overlay) {
    const container = document.createElement('div');
    container.id = 'round-overlay-container';
    document.body.appendChild(container);
    overlay = document.createElement('div');
    overlay.id = 'round-overlay';
    overlay.className = 'round-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    container.appendChild(overlay);
  }
  overlay.innerHTML = renderRoundOverlay();
  overlay.classList.add('show');
  document.body.classList.add('round-active');
  wireRoundOverlay();
  // Focus op de hoofd-actie-knop voor toetsenbordnavigatie
  setTimeout(() => {
    const checkBtn = overlay.querySelector('.round-btn-check');
    if (checkBtn) checkBtn.focus();
  }, 50);
}

// Hervat een gepauzeerde ronde — alias voor openRoundOverlay vanuit de
// Vandaag-view-banner zodat de naam in markup leesbaar blijft.
function resumeCleaningRound() {
  if (!state.activeRound) {
    showToast(T[state.lang].round_no_tasks, 'info');
    return;
  }
  openRoundOverlay();
}

// Sluit de overlay zonder de ronde te beëindigen — auto-pauze. State blijft
// bewaard zodat heropenen via de Vandaag-banner gewoon werkt.
function pauseRoundOverlay() {
  const overlay = document.getElementById('round-overlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
  document.body.classList.remove('round-active');
  // Re-render de Today-view zodat de Hervat-knop verschijnt.
  if (state.activeTab === 'today') {
    const c = document.getElementById('filters-and-content');
    if (c) c.innerHTML = renderTodayView();
    wireCheckboxes();
  }
}

// Beëindig de ronde definitief — wist state.activeRound, sluit overlay,
// toont een korte voltooid-bevestiging.
function finishCleaningRound() {
  const round = state.activeRound;
  if (!round) {
    pauseRoundOverlay();
    return;
  }
  const done = (round.checkedIds || []).length;
  const total = round.taskIds.length;
  const L = T[state.lang];
  state.activeRound = null;
  saveState();
  // Toon korte completion-state in de overlay; gebruiker sluit handmatig.
  // We wikkelen het in een .round-content zodat op desktop de modal-styling
  // (rounded corners, shadow) ook hier toegepast wordt — anders zou de
  // finished-state als losse content midden op een dimmed backdrop staan.
  const overlay = document.getElementById('round-overlay');
  if (overlay) {
    overlay.innerHTML = `
      <div class="round-content round-content-finished">
        <div class="round-finished" role="status" aria-live="polite">
          <div class="round-finished-icon">🎉</div>
          <h2 class="round-finished-title">${esc(L.round_finished_title)}</h2>
          <p class="round-finished-sub">${esc(L.round_finished_sub.replace('{done}', done).replace('{total}', total))}</p>
          <button class="round-btn round-btn-finish-close" onclick="closeRoundFinishedOverlay()">${esc(L.round_finished_close)}</button>
        </div>
      </div>
    `;
  } else {
    pauseRoundOverlay();
  }
}

// Sluit de "Ronde voltooid"-overlay nadat finishCleaningRound is aangeroepen.
function closeRoundFinishedOverlay() {
  const overlay = document.getElementById('round-overlay');
  if (overlay) overlay.classList.remove('show');
  document.body.classList.remove('round-active');
  if (state.activeTab === 'today') {
    const c = document.getElementById('filters-and-content');
    if (c) c.innerHTML = renderTodayView();
    wireCheckboxes();
  }
}

// Render de overlay-inhoud voor de huidige taak in state.activeRound.
function renderRoundOverlay() {
  const L = T[state.lang];
  const round = state.activeRound;
  if (!round) return '';
  const idx = round.currentIdx;
  const total = round.taskIds.length;
  const taskId = round.taskIds[idx];
  const allTasks = getAllTasks();
  const task = allTasks.find(t => t.id === taskId);

  const progressPct = total > 0 ? ((idx) / total) * 100 : 0;
  const progressLabel = L.round_progress.replace('{cur}', idx + 1).replace('{total}', total);

  // Header: voortgangsbalk + titel + pauze-knop
  let html = `
    <div class="round-content">
      <header class="round-header">
        <div class="round-header-top">
          <div class="round-title-block">
            <span class="round-title">${esc(L.round_title)}</span>
            <span class="round-progress-label">${esc(progressLabel)}</span>
          </div>
          <button class="round-close-btn" onclick="pauseRoundOverlay()" aria-label="${esc(L.round_btn_close)}" title="${esc(L.round_btn_close)}">×</button>
        </div>
        <div class="round-progress-bar" role="progressbar" aria-valuenow="${idx + 1}" aria-valuemin="1" aria-valuemax="${total}">
          <div class="round-progress-fill" style="width: ${progressPct}%"></div>
        </div>
      </header>
  `;

  if (!task) {
    // Schaduw-taak: ID staat in ronde maar getAllTasks vindt 'm niet meer
    // (kan gebeuren als een custom task tussen rondes is verwijderd).
    html += `
      <div class="round-card round-card-missing">
        <p>${esc(L.round_no_tasks)}</p>
      </div>
      <footer class="round-footer">
        ${renderRoundNavButtons(idx, total)}
      </footer>
    </div>`;
    return html;
  }

  // Bouw card-body op met ALLE taakdetails: foto, methode, middel, PBM, area.
  const fk = task.freq_key;
  const slotIdx = getCurrentSlot(fk);
  const checked = isChecked(fk, task.id, slotIdx);
  const areaMeta = getAreaMeta(task.ruimte);
  const middel = renderProductLink(task.middel);
  const pbm = renderPbmIcons(task);
  const note = (round.notes && round.notes[task.id]) || '';

  html += `
    <article class="round-card ${checked ? 'task-done' : ''}" data-task-id="${esc(task.id)}" style="--area-color: ${areaMeta.color};">
      <div class="round-card-pills">
        <span class="area-badge" style="--area-color: ${areaMeta.color};">
          <span class="area-icon" aria-hidden="true">${areaMeta.icon}</span>${esc(tr(task.ruimte))}
        </span>
        <span class="today-freq-pill">${esc(todayFreqLabel(fk))}</span>
      </div>
      <h2 class="round-card-title">${esc(trOnderdeel(task))}</h2>
      ${task.subcat ? `<p class="round-card-desc">${esc(trSubcat(task))}</p>` : ''}
      ${task.werkplek ? `<p class="round-card-meta">📍 ${esc(tr(task.werkplek))}</p>` : ''}
      ${task.imageUrl ? `
        <div class="round-card-image-wrap">
          <img src="${esc(task.imageUrl)}"
               alt="${esc(trOnderdeel(task))}"
               class="round-card-image"
               decoding="async"
               loading="eager"
               fetchpriority="high" />
        </div>` : ''}
      <dl class="round-card-details">
        ${task.wanneer ? `
          <div class="round-detail">
            <dt>${esc(L.round_label_when)}</dt>
            <dd>${esc(tr(task.wanneer))}</dd>
          </div>` : ''}
        ${task.methode ? `
          <div class="round-detail">
            <dt>${esc(L.round_label_method)}</dt>
            <dd>${esc(tr(task.methode))}</dd>
          </div>` : ''}
        ${task.middel ? `
          <div class="round-detail">
            <dt>${esc(L.round_label_product)}</dt>
            <dd>${middel}</dd>
          </div>` : ''}
        ${pbm ? `
          <div class="round-detail">
            <dt>${esc(L.round_label_pbm)}</dt>
            <dd>${pbm}</dd>
          </div>` : ''}
      </dl>
      <div class="round-note-block">
        <label class="round-note-label" for="round-note-input">${esc(L.round_label_note)}</label>
        <textarea id="round-note-input" class="round-note-input" rows="2"
          placeholder="${esc(L.round_note_placeholder)}"
          data-task-id="${esc(task.id)}">${esc(note)}</textarea>
      </div>
    </article>
    <footer class="round-footer">
      ${renderRoundNavButtons(idx, total, task, checked)}
    </footer>
  </div>`;
  return html;
}

// Render de actie-knoppen onderin de overlay: vorige, afvink, skip, volgende.
function renderRoundNavButtons(idx, total, task, checked) {
  const L = T[state.lang];
  const isLast = idx >= total - 1;
  const isFirst = idx <= 0;
  const checkLabel = checked ? L.round_btn_uncheck : L.round_btn_check;
  return `
    <button class="round-btn round-btn-prev" ${isFirst ? 'disabled' : ''}
            onclick="roundGoTo(${idx - 1})" aria-label="${esc(L.round_btn_prev)}">
      ${esc(L.round_btn_prev)}
    </button>
    ${task ? `
      <button class="round-btn round-btn-skip" onclick="roundSkip()"
              aria-label="${esc(L.round_btn_skip)}">
        ${esc(L.round_btn_skip)}
      </button>
      <button class="round-btn round-btn-check ${checked ? 'is-checked' : ''}"
              onclick="roundToggleCheck()"
              aria-label="${esc(checkLabel)}">
        ${esc(checkLabel)}
      </button>` : ''}
    ${isLast
      ? `<button class="round-btn round-btn-finish" onclick="finishCleaningRound()" aria-label="${esc(L.round_btn_finish)}">
           ${esc(L.round_btn_finish)}
         </button>`
      : `<button class="round-btn round-btn-next" onclick="roundGoTo(${idx + 1})" aria-label="${esc(L.round_btn_next)}">
           ${esc(L.round_btn_next)}
         </button>`}
  `;
}

// Wire interactieve elementen na render — vooral de note-textarea zodat
// typen meteen naar state.activeRound.notes weggeschreven wordt.
function wireRoundOverlay() {
  const noteEl = document.getElementById('round-note-input');
  if (noteEl) {
    noteEl.oninput = function() {
      const tid = this.dataset.taskId;
      if (!state.activeRound) return;
      if (!state.activeRound.notes) state.activeRound.notes = {};
      state.activeRound.notes[tid] = this.value;
      // Persist debounced — opslaan na korte stilte zodat we niet bij elke
      // toetsaanslag naar storage schrijven.
      if (wireRoundOverlay._noteTimer) clearTimeout(wireRoundOverlay._noteTimer);
      wireRoundOverlay._noteTimer = setTimeout(() => saveState(), 400);
    };
  }
  // Toetsenbord-shortcuts in de overlay: Esc = pauze, ←/→ = vorige/volgende.
  // We binden op het document maar verwijderen bij sluiten via een markering.
  if (!wireRoundOverlay._keyHandler) {
    wireRoundOverlay._keyHandler = (e) => {
      // Niet kapen wanneer gebruiker in de note-textarea typt
      const inText = document.activeElement &&
        (document.activeElement.tagName === 'TEXTAREA' ||
         document.activeElement.tagName === 'INPUT');
      if (inText) return;
      if (!document.body.classList.contains('round-active')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        pauseRoundOverlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (state.activeRound && state.activeRound.currentIdx > 0) {
          roundGoTo(state.activeRound.currentIdx - 1);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (state.activeRound && state.activeRound.currentIdx < state.activeRound.taskIds.length - 1) {
          roundGoTo(state.activeRound.currentIdx + 1);
        }
      } else if (e.key === ' ' || e.key === 'Enter') {
        // Alleen wanneer focus niet op een knop staat (anders normale klik)
        if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
        e.preventDefault();
        roundToggleCheck();
      }
    };
    document.addEventListener('keydown', wireRoundOverlay._keyHandler);
  }

  // Pre-fetch foto's van de 2 volgende + 1 vorige taak op de achtergrond,
  // zodat de browser ze al in cache heeft tegen de tijd dat de gebruiker
  // doornavigeert. new Image().src triggert een gewone GET; de response wordt
  // gewoon in de HTTP-cache opgeslagen, vrijwel kosteloos.
  prefetchRoundNeighborImages();
}

// Helper: laad de afbeeldingen van naburige taken in een ronde alvast in de
// browser-cache. Idempotent — als de browser de URL al kent doet 'ie niks.
function prefetchRoundNeighborImages() {
  try {
    const round = state.activeRound;
    if (!round || !round.taskIds || !round.taskIds.length) return;
    const idx = round.currentIdx || 0;
    const total = round.taskIds.length;
    const allTasks = getAllTasks();
    // Eerstvolgende twee + vorige (totaal 3 buren). Twee vooruit omdat de
    // gebruiker meestal voorwaarts navigeert.
    const offsets = [1, 2, -1];
    if (!prefetchRoundNeighborImages._cache) {
      prefetchRoundNeighborImages._cache = new Set();
    }
    const cache = prefetchRoundNeighborImages._cache;
    offsets.forEach(off => {
      const target = idx + off;
      if (target < 0 || target >= total) return;
      const tid = round.taskIds[target];
      const t = allTasks.find(x => x.id === tid);
      if (!t || !t.imageUrl) return;
      if (cache.has(t.imageUrl)) return;
      cache.add(t.imageUrl);
      const img = new Image();
      img.decoding = 'async';
      img.src = t.imageUrl;
    });
  } catch (e) {
    // Prefetch is een optimalisatie — een fout hier mag de UI niet breken.
    console.warn('Round image prefetch failed:', e);
  }
}

// Navigeer naar een bepaalde index in de ronde.
function roundGoTo(idx) {
  if (!state.activeRound) return;
  const total = state.activeRound.taskIds.length;
  if (idx < 0 || idx >= total) return;
  state.activeRound.currentIdx = idx;
  saveState();
  const overlay = document.getElementById('round-overlay');
  if (overlay) {
    overlay.innerHTML = renderRoundOverlay();
    wireRoundOverlay();
    // Scroll de overlay-content naar boven
    const content = overlay.querySelector('.round-content');
    if (content) content.scrollTop = 0;
  }
}

// Toggle afvink-status van de huidige taak in de ronde. Hergebruikt
// toggleCheck zodat de cloud-sync (scheduleChecksPushToCloud) automatisch
// pakt — geen extra cloud-werk.
function roundToggleCheck() {
  if (!state.activeRound) return;
  const idx = state.activeRound.currentIdx;
  const taskId = state.activeRound.taskIds[idx];
  const task = getAllTasks().find(t => t.id === taskId);
  if (!task) return;
  const fk = task.freq_key;
  const slotIdx = getCurrentSlot(fk);
  toggleCheck(fk, taskId, slotIdx);
  // Update lokale ronde-tracker zodat checkedIds bijgehouden blijft.
  const checked = isChecked(fk, taskId, slotIdx);
  if (!state.activeRound.checkedIds) state.activeRound.checkedIds = [];
  const ix = state.activeRound.checkedIds.indexOf(taskId);
  if (checked && ix === -1) state.activeRound.checkedIds.push(taskId);
  if (!checked && ix !== -1) state.activeRound.checkedIds.splice(ix, 1);
  // Verwijder uit skippedIds als hij daar toevallig staat
  if (state.activeRound.skippedIds) {
    const sx = state.activeRound.skippedIds.indexOf(taskId);
    if (sx !== -1) state.activeRound.skippedIds.splice(sx, 1);
  }
  saveState(true); // checks-only flag → push naar cloud via bestaande pad
  // Re-render alleen de footer (knop-label verandert) en card (state styling).
  const overlay = document.getElementById('round-overlay');
  if (overlay) {
    overlay.innerHTML = renderRoundOverlay();
    wireRoundOverlay();
  }
  // Auto-advance naar volgende taak als afgevinkt en niet de laatste.
  if (checked && idx < state.activeRound.taskIds.length - 1) {
    setTimeout(() => roundGoTo(idx + 1), 350);
  }
}

// Markeer als overgeslagen en ga naar de volgende. Slaat NIET de check toe.
function roundSkip() {
  if (!state.activeRound) return;
  const idx = state.activeRound.currentIdx;
  const taskId = state.activeRound.taskIds[idx];
  if (!state.activeRound.skippedIds) state.activeRound.skippedIds = [];
  if (!state.activeRound.skippedIds.includes(taskId)) {
    state.activeRound.skippedIds.push(taskId);
  }
  saveState();
  if (idx < state.activeRound.taskIds.length - 1) {
    roundGoTo(idx + 1);
  } else {
    finishCleaningRound();
  }
}

function renderEmptyState() {
  const L = T[state.lang];
  // Different empty-state copy depending on whether the user has a filter
  // active (so the suggestion can be specific) or just no tasks for this
  // tab (rare but possible).
  const hasFilter = state.filters && (
    state.filters.area || state.filters.performer || state.filters.search
  );
  if (hasFilter) {
    return `
      <div class="empty-state empty-filter">
        <div class="empty-state-icon" aria-hidden="true">🔍</div>
        <div class="empty-state-title">${L.empty_filter_title}</div>
        <div class="empty-state-sub">${L.empty_filter_sub}</div>
        <button class="empty-state-action" onclick="clearAllFilters()">${L.empty_filter_clear}</button>
      </div>
    `;
  }
  return `
    <div class="empty-state empty-no-tasks">
      <div class="empty-state-icon" aria-hidden="true">📭</div>
      <div class="empty-state-title">${L.empty_no_tasks_title}</div>
      <div class="empty-state-sub">${L.empty_no_tasks_sub}</div>
    </div>
  `;
}

// Helper invoked by the "Wis filters" button on the empty-filter state.
function clearAllFilters() {
  state.filters = { area: '', performer: '', search: '' };
  renderApp();
}

// Translation table for cleaning-product description/application fields
// shown in the Middel (Agent) modal. Product names and codes (Sirifan Speed,
// LD1, MD5, P3-Steril etc.) intentionally stay in their original form — they
// are brand/SKU identifiers, not localised concepts.
const CONTENT_TR_PRODUCT_FIELD = {
  // beschrijving (description)
  "Sproeidesinfectiemiddel": "Spray disinfectant",
  "Neutraal reinigingsmiddel. Kan handmatig en ook schuimend gebruikt worden.": "Neutral cleaning agent. Can be used manually and as foam.",
  "Medium alkalisch reinigingsmiddel. Goede ontvetter. Kan handmatig en ook schuimend gebruikt worden": "Medium alkaline cleaning agent. Good degreaser. Can be used manually and as foam.",
  "Alkalische schuimreiniger bollenetjes": "Alkaline foam cleaner for intermediate prover nets",
  "Desinfectiemiddel CIP installatie op basis van perazijnzuur en waterstofperoxide": "Disinfectant for CIP installation based on peracetic acid and hydrogen peroxide",
  "Reiniging + desinfectie combinatie voor handmatige op hogedruk reiniging": "Cleaning + disinfection combination for manual or high-pressure cleaning",
  "Sterk alkalisch reinigingsmiddel": "Strong alkaline cleaning agent",
  "Geconcentreerd naglansmiddel vaatwasser": "Concentrated dishwasher rinse aid",
  "Sterk geconcentreerd vaatwasmiddel met metaalbeschermer": "Highly concentrated dishwasher detergent with metal protection",
  "Chloor alkalische schuimreinigingsmiddel": "Chlorinated alkaline foam cleaner",
  "Universeel toepasbaar automatische en handmatige reiniging van oppervlakken bijv. Vloeren": "Universally applicable automatic and manual cleaning of surfaces, e.g. floors",
  "RVS onderhoudsproduct": "Stainless steel maintenance product",
  "Compleet ovenreinigingsmiddel": "Complete oven cleaning agent",
  "Reinigingsmiddel tbv handen TD werkplaats": "Hand cleaning agent for technical workshop",
  "Neutraal desinfectiemiddel tbv handen": "Neutral hand disinfectant",
  "Neutraal reinigingsmiddel tbv handen": "Neutral hand cleaning agent",
  // toepassing (application)
  "Desinfectie van materialen": "Disinfection of materials",
  "Handmatige schoonmaak. Algemeen voor oppervlakte. Voor lichte vervuilingen": "Manual cleaning. General-purpose for surfaces. For light soiling.",
  "Handmatige schoonmaak voor vette/sterkere vervuiling": "Manual cleaning for greasy/heavier soiling",
  "Reiniging van bollenetjes": "Cleaning of intermediate prover nets",
  "Circulatie desinfectie van CIP-set": "Circulation disinfection of CIP set",
  "Handmatige schoonmaak of machinale schoonmaak voor algemene vervuiling + desinfectie": "Manual or machine cleaning for general soiling + disinfection",
  "Circulatie reinigingsmiddel voor CIP-set": "Circulation cleaning agent for CIP set",
  "Automatische dosering vaatwasser": "Automatic dosing dishwasher",
  "Schuimreiniging van rijskast": "Foam cleaning of proofer",
  "Vloerreiniging, mop of schrob-zuigmachine": "Floor cleaning, mop or scrub-suction machine",
  "Verwijderen vingerafdrukken, vuil of (water)vlekken": "Removes fingerprints, dirt or (water) stains",
  "Oven, in- en uitgang": "Oven, inlet and outlet",
  "reinigingsmiddel tbv handen": "Hand cleaning agent",
  "Handen desinfectie": "Hand disinfection",
  // opmerking (remark) — short notes that appear on the MSDS card
  "Bijtend, draag juiste PBM's": "Corrosive, wear proper PPE",
  "Kracht product. Niet op Aluminium, Goed naspoelen met water": "Strong product. Not on aluminium. Rinse well with water.",
  "Niet op Aluminium": "Not on aluminium",
  "Alleen voor Ovens, Goed naspoelen met water": "Ovens only. Rinse well with water.",
  // meetwijze (measurement method) — short technical labels, mostly stay the same
  "onverdund": "undiluted",
  "kaliumjodide": "potassium iodide",
  "Peroxide": "Peroxide",
  "Quat": "Quat",
  "pH": "pH"
};

// Translate a product field value (description/application/remark/measurement
// method). Returns original if no translation exists, so missing entries
// degrade gracefully.
function trProductField(s) {
  if (!s) return s;
  if (state.lang === 'nl') return s;
  const trimmed = String(s).trim();
  return CONTENT_TR_PRODUCT_FIELD[trimmed] || s;
}

// =====================================================
// STATE
// =====================================================
let state = {
  lang: 'nl',
  darkMode: false, // toggled via the moon/sun button in the header; persisted in storage
  // 'today' is the default landing view: a smart per-shift list of work due today
  // (current daily slot + overdue items + weekly/etc tasks whose current slot
  // isn't checked off yet). Frequency-specific tabs ('daily', 'weekly', etc.)
  // remain available for the full per-frequency overview.
  activeTab: 'today',
  filters: { area: '', performer: '', search: '' },
  // Sort mode applied to the task table within the active frequency tab.
  // 'default' keeps the original row order from the source data; 'area' sorts
  // alphabetically by room (then werkplek) so all "Lijn 1" tasks group
  // together; 'soiling' sorts by V×Z×A risk score descending so the
  // highest-risk tasks float to the top — most useful when scanning for
  // priority work. Persisted in storage.
  sortBy: 'default',
  // Whether the filter bar is currently expanded. Default closed so the
  // screen isn't cluttered. User toggles via the filter button in the tabs row.
  filtersOpen: false,
  checks: {},       // { freqKey: { periodId: { taskId: { slot: bool } } } }
  customChangelog: [], // user-added changelog entries
  customTasks: [],  // user-added cleaning tasks
  taskOverrides: {}, // { taskId: {...edited fields...} } — persisted edits to built-in tasks
  pendingChanges: {}, // { taskId: { type: 'add'|'edit'|'delete', before, after } } — queue for next changelog commit
  editUnlocked: false, // session-only: true once the correct password is entered
  editingTaskId: null, // when not null, the task modal is open in EDIT mode
  loaded: false,
  // Which period is being VIEWED per frequency tab.
  // null = the current (live) period. Any other value = a historical period key
  // from state.checks[freqKey]. In historical mode the UI is read-only.
  viewingPeriod: {},
  // Built-in tasks that have been marked for deletion (persisted). Built-in
  // tasks can't be physically removed from DATA, so we filter them out in
  // getAllTasks() and persist the list so they stay gone across reloads.
  // Restoring happens via discardPending() while the delete is still queued.
  deletedBuiltinIds: [],
  // Currently selected task IDs for bulk actions (session-only, not persisted).
  selectedTaskIds: [],
  // Display-name of the user currently using the app. Used as the audit-trail
  // "by" value on every check. Persisted via window.storage so it survives
  // page reloads. Empty string means "anonymous" — checks still work.
  currentUser: "",
  // Firebase authenticated user (null = not signed in). Set by the auth
  // state listener once Firebase initializes. When set, currentUser is
  // automatically derived from this (email or displayName).
  authUser: null,
  // Role of the currently logged-in user: 'superuser', 'admin', or 'user'.
  // Determined by the role document at /users/{uid} in Firestore. Cached
  // here so render functions can quickly check what to show.
  userRole: 'user',
  // Map of all known users (uid -> {email, role}) for the user-management
  // panel. Only populated/used when the current user is a superuser.
  allUsers: {},
  // True when the browser has fired 'beforeinstallprompt' — meaning the app
  // can be installed as a PWA. Exposed via the sidebar.
  canInstallPwa: false,
  // Map of supplier MSDS links keyed by product name (lowercase).
  // Each entry: { url, productName, updatedBy, updatedAt }.
  // Synced via Firestore /msdsLinks/{productKey} when cloud-connected.
  msdsLinks: {},
  // Jaarlijkse keuringen (inspections). Map keyed by record id. Each entry:
  // { id, onderdeel, bedrijf, contact, laatste, volgende, inplan,
  //   updatedBy, updatedAt }. Lokaal opgeslagen + gesynced via Firestore
  // /inspections/{id} wanneer cloud-connected (zelfde patroon als msdsLinks).
  inspections: {},
  // Welke keuring-items in de lijst-view momenteel uitgeklapt zijn (id -> true).
  // Sessie-only, niet persisted; bepaalt of een rij open getoond wordt na render.
  inspOpenIds: {},
  // Which product is currently displayed in the MSDS modal? Used so the
  // live listener knows which row to re-render on remote changes.
  msdsCurrentProduct: null,
  // True once the auth listener has run at least once. Before this, we don't
  // know whether the user is signed in or not, so we show a loading spinner
  // instead of either the login form or the main app.
  authReady: false,
  // True when a Firestore real-time listener is active and we're receiving
  // shared data. False = local-only mode.
  cloudConnected: false,
  // Multi-plan support:
  // state.plans stores each plan's data + per-plan state. The currently active
  // plan's state is duplicated into the top-level fields above (checks,
  // customTasks, etc.) so existing code continues to work without changes.
  // On plan switch, we serialize the active plan's state back into state.plans
  // then copy the target plan's state into the top-level.
  activePlanId: 'original',
  plans: {}, // { id: { name, data: {tasks,products,methods,versions}, checks, customTasks, taskOverrides, customChangelog, pendingChanges } }

  // ===== Persoonlijke toewijzing + notificaties (PUNT 10) =====
  // Filter op Today-view: toon alleen taken toegewezen aan state.currentUser.
  // Persisted lokaal zodat de keuze een refresh overleeft.
  todayShowMineOnly: false,
  // True wanneer de gebruiker notificatie-toestemming heeft gegeven én ze
  // willen ontvangen. Toestemming wordt apart bijgehouden via Notification.permission.
  notifEnabled: false,
  // Welke frequentie de Coördinator-tab actief toont (sub-tab binnen de
  // coördinator-view). Default 'daily'. Persisted lokaal.
  coordinatorActiveFreq: 'daily',

  // Aparte filter-state voor de Coördinator-view, los van state.filters
  // (die is gedeeld tussen Dashboard en de freq-tabs). Een coördinator die
  // "Lijn 2 zaterdag" filtert om planning te checken zou daarmee niet z'n
  // dashboard-overzicht moeten beïnvloeden. Persistance via localStorage.
  coordFilters: { area: '', performer: '', search: '' },
  coordFiltersOpen: false,

  // ===== Afwerklijst (Coördinator-tool) =====
  // Per-taak een lijst van veldnamen die opzettelijk leeg zijn ("NVT").
  // Voorkomt dat dezelfde taken steeds opnieuw als incompleet worden
  // gerapporteerd. Gesynchroniseerd via cloud (zit in plan-state) zodat
  // alle coördinatoren dezelfde NVT-markeringen zien.
  // Vorm: { [taskId]: ['middel', 'wanneer', ...] }
  taskNvtFields: {},
  // Lopende afwerklijst-sessie (alleen UI-state; niet gepersisteerd).
  // Bevat de bevroren lijst van taak-IDs en huidige positie.
  afwerklijst: null,

  // ===== Schoonmaakronde-modus (PUNT 6) =====
  // Wanneer een gebruiker op "Begin ronde" klikt, wordt deze gevuld met de
  // bevroren lijst van taken voor die ronde. De ronde overleeft het sluiten
  // van de overlay — bij heropenen van Vandaag-view biedt de UI "Hervat ronde".
  // Schema:
  //   { taskIds: string[],            // bevroren volgorde, in canonieke wanneer→ruimte sortering
  //     currentIdx: number,           // huidige positie (0-based)
  //     startedAt: ISO-datum-string,  // start van de ronde voor weergave
  //     checkedIds: string[],         // taken die in deze ronde zijn afgevinkt
  //     skippedIds: string[],         // taken die zijn overgeslagen
  //     notes: { [taskId]: string }   // optionele opmerkingen per taak
  //   }
  // Niet gepersisteerd naar de cloud — leeft alleen op het lokale device.
  // Wel gepersisteerd in localStorage zodat de ronde een browser-refresh overleeft.
  activeRound: null,

  // Actieve sectie binnen de Instellingen-tab. Persisted in localStorage.
  settingsActiveSection: 'branding',

  // ===== Custom data (fase 5c, cloud-gesynced via plan-state) =====
  // Sector-specifieke aanpassingen van vervuilingstypes, PBM-items en
  // ruimtes met visuele eigenschappen. Leeg betekent: gebruik defaults
  // uit DATA/i18n. Zodra de admin iets toevoegt, vervangen deze lijsten
  // de defaults volledig.
  customData: {
    soilingTypes: [],     // ["vet", "meel", "haar", ...] — leeg = gebruik defaults
    ppeItems: [],         // [{emoji:"🧤", label:"Handschoenen"}, ...]
    rooms: []             // [{name:"Lijn 1", icon:"⚙️", color:"#1d5b42"}, ...]
  },

  // ===== Onboarding (per-device, niet cloud-sync) =====
  // Niet-blokkerende banner bovenin app bij eerste opstart van een nieuw
  // plan. State leeft in localStorage zodat elke Etsy-klant per device
  // eenmalig wordt begroet. Wordt automatisch dismissed wanneer
  // state.branding.companyName ingevuld raakt — een gebruiker die direct
  // via Instellingen branding invult heeft de banner niet meer nodig.
  onboarding: {
    complete: false,      // zet true bij voltooien stap 5 OF wanneer branding al gevuld bij eerste load
    dismissed: false,     // gebruiker klikte op × (kan later via settings opnieuw)
    step: 1               // huidige stap (1..5)
  },

  // ===== Branding (cloud-gesynced via plan-state) =====
  // Per-bedrijf instellingen die alle gebruikers van een plan delen.
  // Standaardwaardes komen uit oorspronkelijke "GTE-bakkerij"-hardcoded
  // strings, maar zijn nu vervangbaar voor Etsy-klanten.
  branding: {
    companyName: '',           // bv. "Bakkerij Janssen" — leeg = gebruik default uit i18n
    docCode: '',               // bv. "BJ-D-01-01" — leeg = "GTE-D-09-99"
    subtitle: '',              // bv. "Schoonmaakplan productie"
    logoDataUrl: '',           // base64 PNG/SVG (max 200KB)
    logoDarkDataUrl: '',       // optioneel donker-mode logo
    accentColor: ''            // hex code (bv. "#1d5b42") — leeg = brand-green default
  },

  // ===== Schedule (cloud-gesynced via plan-state) =====
  // Werkdagen, shifts, dag-specifieke wanneer-mappings. Voor bedrijven
  // met andere week-patronen dan de huidige bakkerij (ma-za, 06:00+14:00).
  schedule: {
    // Welke dagen het bedrijf actief is. 0=zon, 6=za. Default ma-za (bakkerij).
    workDays: [1, 2, 3, 4, 5, 6],
    // Shift-momenten voor notificaties. Default 06:00 + 14:00.
    shifts: [{ hour: 6, minute: 0 }, { hour: 14, minute: 0 }],
    // Op welke dag-index de "Zaterdag"-wanneer-taken vallen. Sommige
    // bedrijven doen grote schoonmaak op zondag of vrijdag. Default 6 (za).
    bigCleaningDay: 6,
    // Op welke dagen "2x per week"-taken vallen. Default di+vr.
    twicePerWeekDays: [2, 5]
  },

  // ===== Features (lokaal per device — geen cloud-sync) =====
  // Aan/uit-schakelaars per installatie. Een 1-persoons-bedrijf wil
  // bijvoorbeeld geen rollen-systeem of cloud-sync. Persisted in
  // localStorage zodat elk device z'n eigen voorkeur kan hebben.
  features: {
    cloudSync: true,           // Firestore listener actief
    roles: true,               // admin/super-user gating zichtbaar
    cleaningRound: true,       // 🚀 Begin ronde-knop op Vandaag
    notifications: true,       // shift-notificaties + bell-icon
    qrCodes: true,             // QR-codes-tab + scan-functionaliteit
    photos: true,              // foto-upload + thumbnail-views
    excelExport: true,         // Exporteer Excel-knop in sidebar
    changelog: true,           // Versiebeheer-tab + recordChange-trail
    assignedUsers: true        // Toegewezen-aan-veld + "Mijn taken"-filter
  }
};

// Serialize the currently-active plan's state into state.plans[activePlanId].
// Call this BEFORE switching to a different plan.
function saveActivePlanState() {
  const id = state.activePlanId;
  if (!state.plans[id]) state.plans[id] = { name: id, data: {} };
  const p = state.plans[id];
  p.checks = state.checks;
  p.customTasks = state.customTasks;
  p.taskOverrides = state.taskOverrides;
  p.taskNvtFields = state.taskNvtFields || {};
  // Branding + schedule horen bij het plan — alle collega's zien dezelfde
  // bedrijfsnaam, logo, kleur. Features zijn per-device (zie localStorage).
  p.branding = state.branding || {};
  p.schedule = state.schedule || {};
  p.customData = state.customData || { soilingTypes: [], ppeItems: [], rooms: [] };
  p.customChangelog = state.customChangelog;
  p.pendingChanges = state.pendingChanges;
  p.deletedBuiltinIds = state.deletedBuiltinIds || [];
  p.data = {
    tasks: DATA.tasks,
    products: DATA.products,
    methods: DATA.methods,
    versions: DATA.versions
  };
}

// Load state for a plan into the top-level fields (and DATA). The previously
// active plan's state must already be saved via saveActivePlanState().
// Snapshot of the embedded DATA at app startup. Used as last-resort fallback
// whenever a loaded plan turns out to have no tasks (e.g. corrupted storage,
// failed cloud sync). Without this snapshot, switchPlan to such a plan would
// leave the UI completely empty.
const EMBEDDED_DATA_BACKUP = {
  tasks: DATA.tasks.slice(),
  products: DATA.products.slice(),
  methods: DATA.methods.slice(),
  versions: DATA.versions.slice()
};

function loadPlanState(planId) {
  const p = state.plans[planId];
  if (!p) return false;
  state.activePlanId = planId;
  state.checks = p.checks || {};
  state.customTasks = p.customTasks || [];
  state.taskOverrides = p.taskOverrides || {};
  state.taskNvtFields = p.taskNvtFields || {};
  // Branding + schedule uit plan-state laden, met defaults uit het globale
  // state-object zodat een leeg plan niet zonder branding zit.
  state.branding = Object.assign({
    companyName: '', docCode: '', subtitle: '',
    logoDataUrl: '', logoDarkDataUrl: '', accentColor: ''
  }, p.branding || {});
  state.schedule = Object.assign({
    workDays: [1, 2, 3, 4, 5, 6],
    shifts: [{ hour: 6, minute: 0 }, { hour: 14, minute: 0 }],
    bigCleaningDay: 6,
    twicePerWeekDays: [2, 5]
  }, p.schedule || {});
  state.customData = Object.assign({
    soilingTypes: [],
    ppeItems: [],
    rooms: []
  }, p.customData || {});
  state.customChangelog = p.customChangelog || [];
  state.pendingChanges = p.pendingChanges || {};
  state.deletedBuiltinIds = p.deletedBuiltinIds || [];
  state.selectedTaskIds = [];
  // Defensive: if the stored plan data is empty or missing (corrupted state,
  // failed cloud-write) and this is the "original" plan, fall back to the
  // embedded backup so the user always sees the standard cleaning plan.
  const storedTasks = (p.data && p.data.tasks) || [];
  if (storedTasks.length === 0 && planId === 'original') {
    console.warn('Plan "' + planId + '" has no tasks — falling back to embedded data');
    DATA.tasks = EMBEDDED_DATA_BACKUP.tasks.slice();
    DATA.products = EMBEDDED_DATA_BACKUP.products.slice();
    DATA.methods = EMBEDDED_DATA_BACKUP.methods.slice();
    DATA.versions = EMBEDDED_DATA_BACKUP.versions.slice();
    // Also write the fallback back into the plan so subsequent loads find it
    p.data = {
      tasks: DATA.tasks.slice(),
      products: DATA.products.slice(),
      methods: DATA.methods.slice(),
      versions: DATA.versions.slice()
    };
  } else {
    DATA.tasks = storedTasks;
    DATA.products = (p.data && p.data.products) || [];
    DATA.methods = (p.data && p.data.methods) || [];
    DATA.versions = (p.data && p.data.versions) || [];
  }
  return true;
}

function switchPlan(planId) {
  if (!state.plans[planId] || planId === state.activePlanId) return;
  saveActivePlanState();
  loadPlanState(planId);
  // Reset UI-level filters because they reference areas/performers that may
  // not exist in the new plan.
  state.filters = { area: '', performer: '', search: '' };
  state.activeTab = 'today';
  saveState();
  renderApp();
  // Re-subscribe to the new plan's cloud document
  if (state.cloudConnected) subscribeToActivePlan();
}

// =====================================================
// STORAGE (uses window.storage if available, else falls back to memory)
// =====================================================
const STORAGE_KEY_CHECKS = "cleaning_checks_v1";
const STORAGE_KEY_CHANGELOG = "cleaning_changelog_v1";
const STORAGE_KEY_LANG = "cleaning_lang_v1";
const STORAGE_KEY_CUSTOM_TASKS = "cleaning_custom_tasks_v1";
const STORAGE_KEY_OVERRIDES = "cleaning_overrides_v1";
const STORAGE_KEY_PENDING = "cleaning_pending_v1";
const STORAGE_KEY_PLANS = "cleaning_plans_v2"; // multi-plan storage
const STORAGE_KEY_USER = "cleaning_user_v1";
const STORAGE_KEY_SORT = "cleaning_sort_v1";
const STORAGE_KEY_ROUND = "cleaning_round_v1"; // active cleaning round (PUNT 6)
const STORAGE_KEY_FEATURES = "cleaning_features_v1"; // per-device feature toggles

async function saveState(checksOnly) {
  try {
    if (typeof window !== 'undefined' && window.storage && window.storage.set) {
      // Keep legacy keys in sync (so older versions could still read them)
      await window.storage.set(STORAGE_KEY_CHECKS, JSON.stringify(state.checks));
      await window.storage.set(STORAGE_KEY_CHANGELOG, JSON.stringify(state.customChangelog));
      await window.storage.set(STORAGE_KEY_CUSTOM_TASKS, JSON.stringify(state.customTasks));
      await window.storage.set(STORAGE_KEY_OVERRIDES, JSON.stringify(state.taskOverrides));
      await window.storage.set(STORAGE_KEY_PENDING, JSON.stringify(state.pendingChanges));
      await window.storage.set(STORAGE_KEY_LANG, state.lang);
      await window.storage.set(STORAGE_KEY_USER, state.currentUser || "");
      await window.storage.set(STORAGE_KEY_SORT, state.sortBy || 'default');
      // Schoonmaakronde — alleen lokaal opslaan, niet pushen naar cloud
      // (één gebruiker = één ronde tegelijk; dit is per-device staat).
      try {
        if (state.activeRound) {
          await window.storage.set(STORAGE_KEY_ROUND, JSON.stringify(state.activeRound));
        } else {
          await window.storage.delete(STORAGE_KEY_ROUND);
        }
      } catch (e) { /* ignore — niet kritiek */ }
      // Today-filter "alleen mijn taken" + notif-keuze (PUNT 10) lokaal.
      try {
        await window.storage.set('cleaning_today_mine_v1', state.todayShowMineOnly ? '1' : '0');
        await window.storage.set('cleaning_notif_v1', state.notifEnabled ? '1' : '0');
        await window.storage.set('cleaning_coord_freq_v1', state.coordinatorActiveFreq || 'daily');
        // Coördinator-eigen filters apart van de globale state.filters opslaan
        await window.storage.set('cleaning_coord_filters_v1', JSON.stringify(state.coordFilters || { area: '', performer: '', search: '' }));
        // Feature-toggles per device opslaan (los van plan-state)
        await window.storage.set(STORAGE_KEY_FEATURES, JSON.stringify(state.features || {}));
        await window.storage.set('cleaning_settings_section_v1', state.settingsActiveSection || 'branding');
        // Onboarding-state lokaal opslaan (per-device, niet cloud-sync)
        await window.storage.set('cleaning_onboarding_v1', JSON.stringify(state.onboarding || { complete: false, dismissed: false, step: 1 }));
        // Jaarlijkse keuringen lokaal opslaan (ook gesynced via Firestore,
        // maar lokale kopie zorgt dat ze ook offline / local-only blijven).
        await window.storage.set('cleaning_inspections_v1', JSON.stringify(state.inspections || {}));
      } catch (e) { /* ignore */ }
      // Multi-plan storage: snapshot the active plan's state into state.plans,
      // then serialize the whole plans map.
      saveActivePlanState();
      await window.storage.set(STORAGE_KEY_PLANS, JSON.stringify({
        activePlanId: state.activePlanId,
        plans: state.plans
      }));
    }
  } catch (e) {
    console.warn("storage.set failed:", e);
  }
  // Push to Firestore when connected. For checkbox-only changes we skip the
  // plan push so the plan listener never fires, preventing the DATA.tasks
  // replacement that causes sig-mismatches and visible page re-renders.
  if (state.cloudConnected && state.authUser) {
    if (checksOnly) {
      scheduleChecksPushToCloud();
    } else {
      schedulePushToCloud();
    }
  }
}

async function loadState() {
  try {
    if (typeof window !== 'undefined' && window.storage && window.storage.get) {
      try {
        const r = await window.storage.get(STORAGE_KEY_CHECKS);
        if (r && r.value) state.checks = JSON.parse(r.value);
      } catch(e) {}
      try {
        const r2 = await window.storage.get(STORAGE_KEY_CHANGELOG);
        if (r2 && r2.value) state.customChangelog = JSON.parse(r2.value);
      } catch(e) {}
      try {
        const rct = await window.storage.get(STORAGE_KEY_CUSTOM_TASKS);
        if (rct && rct.value) state.customTasks = JSON.parse(rct.value);
      } catch(e) {}
      try {
        const rov = await window.storage.get(STORAGE_KEY_OVERRIDES);
        if (rov && rov.value) state.taskOverrides = JSON.parse(rov.value);
      } catch(e) {}
      try {
        const rpc = await window.storage.get(STORAGE_KEY_PENDING);
        if (rpc && rpc.value) state.pendingChanges = JSON.parse(rpc.value);
      } catch(e) {}
      try {
        const r3 = await window.storage.get(STORAGE_KEY_LANG);
        if (r3 && r3.value && ['nl','en','pl','ro'].includes(r3.value)) state.lang = r3.value;
      } catch(e) {}
      try {
        const ru = await window.storage.get(STORAGE_KEY_USER);
        if (ru && ru.value) state.currentUser = ru.value;
      } catch(e) {}
      try {
        const rs = await window.storage.get(STORAGE_KEY_SORT);
        if (rs && rs.value) state.sortBy = rs.value;
      } catch(e) {}
      // Schoonmaakronde — herstel een onderbroken ronde (PUNT 6).
      try {
        const rr = await window.storage.get(STORAGE_KEY_ROUND);
        if (rr && rr.value) {
          const round = JSON.parse(rr.value);
          // Defensieve check: minimum schema valide
          if (round && Array.isArray(round.taskIds) && round.taskIds.length > 0) {
            state.activeRound = round;
          }
        }
      } catch(e) {}
      // Today-filter "alleen mijn taken" + notif-keuze (PUNT 10).
      try {
        const rmine = await window.storage.get('cleaning_today_mine_v1');
        if (rmine && rmine.value === '1') state.todayShowMineOnly = true;
      } catch(e) {}
      try {
        const rnotif = await window.storage.get('cleaning_notif_v1');
        if (rnotif && rnotif.value === '1') state.notifEnabled = true;
      } catch(e) {}
      try {
        const rcf = await window.storage.get('cleaning_coord_freq_v1');
        if (rcf && rcf.value && ['daily','weekly','monthly','bimonthly','quarterly','semiannual','annual'].includes(rcf.value)) {
          state.coordinatorActiveFreq = rcf.value;
        }
      } catch(e) {}
      try {
        const rcfilt = await window.storage.get('cleaning_coord_filters_v1');
        if (rcfilt && rcfilt.value) {
          const parsed = JSON.parse(rcfilt.value);
          if (parsed && typeof parsed === 'object') {
            state.coordFilters = {
              area: String(parsed.area || ''),
              performer: String(parsed.performer || ''),
              search: String(parsed.search || '')
            };
          }
        }
      } catch(e) {}
      try {
        const rfeat = await window.storage.get(STORAGE_KEY_FEATURES);
        if (rfeat && rfeat.value) {
          const parsed = JSON.parse(rfeat.value);
          if (parsed && typeof parsed === 'object') {
            // Merge over defaults zodat nieuwe features niet als undefined
            // landen wanneer een oudere localStorage-versie geladen wordt.
            state.features = Object.assign({}, state.features, parsed);
          }
        }
      } catch(e) {}
      try {
        const rsect = await window.storage.get('cleaning_settings_section_v1');
        if (rsect && rsect.value && ['branding','schedule','features','data'].includes(rsect.value)) {
          state.settingsActiveSection = rsect.value;
        }
      } catch(e) {}
      try {
        const ronb = await window.storage.get('cleaning_onboarding_v1');
        if (ronb && ronb.value) {
          const parsed = JSON.parse(ronb.value);
          if (parsed && typeof parsed === 'object') {
            state.onboarding = {
              complete: !!parsed.complete,
              dismissed: !!parsed.dismissed,
              step: Math.max(1, Math.min(5, parseInt(parsed.step, 10) || 1))
            };
          }
        }
      } catch(e) {}
      try {
        const rinsp = await window.storage.get('cleaning_inspections_v1');
        if (rinsp && rinsp.value) {
          const parsed = JSON.parse(rinsp.value);
          if (parsed && typeof parsed === 'object') state.inspections = parsed;
        }
      } catch(e) {}
    }
  } catch (e) {
    console.warn("storage.get failed:", e);
  }
  // Try loading multi-plan data from v2 storage. If present, it overrides
  // the legacy top-level state loaded above.
  try {
    if (typeof window !== 'undefined' && window.storage && window.storage.get) {
      const rp = await window.storage.get(STORAGE_KEY_PLANS);
      if (rp && rp.value) {
        const parsed = JSON.parse(rp.value);
        if (parsed && parsed.plans) {
          state.plans = parsed.plans;
          state.activePlanId = parsed.activePlanId || 'original';
          // If original plan exists in v2 storage, load it (otherwise we fall back
          // to whatever the initial DATA placeholder loaded).
          if (state.plans[state.activePlanId]) {
            loadPlanState(state.activePlanId);
          }
        }
      }
    }
  } catch (e) {
    console.warn("plans storage.get failed:", e);
  }
  // Bootstrap: ensure the 'original' plan exists, seeded from the currently-loaded
  // DATA + top-level state (which came either from legacy storage or the embedded
  // DATA blob).
  if (!state.plans['original']) {
    state.plans['original'] = {
      name: 'Origineel',
      data: {
        tasks: DATA.tasks,
        products: DATA.products,
        methods: DATA.methods,
        versions: DATA.versions
      },
      checks: state.checks,
      customTasks: state.customTasks,
      taskOverrides: state.taskOverrides,
      taskNvtFields: state.taskNvtFields || {},
      branding: state.branding || {},
      schedule: state.schedule || {},
      customData: state.customData || { soilingTypes: [], ppeItems: [], rooms: [] },
      customChangelog: state.customChangelog,
      pendingChanges: state.pendingChanges,
      deletedBuiltinIds: state.deletedBuiltinIds || []
    };
  }
  state.loaded = true;
}

// =====================================================
// PERIOD / DATE HELPERS
// =====================================================
function getPeriodId(freqKey, date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-11
  const dayIdx = d.getDay(); // 0=Sun..6=Sat
  
  switch(freqKey) {
    case 'daily': {
      // key = YYYY-MM-DD, this resets each day
      const mm = String(m+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      return `${y}-${mm}-${dd}`;
    }
    case 'weekly': {
      // ISO week approximation (Sunday-start week)
      const onejan = new Date(y, 0, 1);
      const diffDays = Math.floor((d - onejan) / 86400000);
      const weekNum = Math.floor((diffDays + onejan.getDay()) / 7) + 1;
      return `${y}-W${String(weekNum).padStart(2,'0')}`;
    }
    case 'monthly': return `${y}-${String(m+1).padStart(2,'0')}`;
    case 'quarterly': return `${y}-Q${Math.floor(m/3)+1}`;
    case 'semiannual': return `${y}-H${Math.floor(m/6)+1}`;
    case 'annual': return `${y}`;
    case 'bimonthly': return `${y}-B${Math.floor(m/2)+1}`;
  }
  return `${y}-unknown`;
}

function getPeriodLabel(freqKey, date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const L = T[state.lang];
  switch(freqKey) {
    case 'daily': return d.toLocaleDateString(getDateLocale());
    case 'weekly': {
      const onejan = new Date(y, 0, 1);
      const diffDays = Math.floor((d - onejan) / 86400000);
      const weekNum = Math.floor((diffDays + onejan.getDay()) / 7) + 1;
      return `${y} · ${L.period_info_week} ${weekNum}`;
    }
    case 'monthly': return `${L.months[m]} ${y}`;
    case 'quarterly': return `${L.quarters[Math.floor(m/3)]} ${y}`;
    case 'semiannual': return `${L.halves[Math.floor(m/6)]} ${y}`;
    case 'annual': return `${y}`;
    case 'bimonthly': return `${L.bimonths[Math.floor(m/2)]} ${y}`;
  }
  return '';
}

// Get the "slot index" used in each frequency:
// daily: 0=morning, 1=afternoon, 2=night
// weekly: 0=Sun..6=Sat (current day highlighted)
// monthly: 0..11 (current month highlighted)
// quarterly: 0..3
// semiannual: 0..1
// annual: 0
// bimonthly: 0..5
function getCurrentSlot(freqKey) {
  const d = new Date();
  const m = d.getMonth();
  switch(freqKey) {
    // Daily has only one slot now (a single done/not-done toggle).
    case 'daily': return 0;
    case 'weekly': return d.getDay();
    case 'monthly': return m;
    case 'quarterly': return Math.floor(m/3);
    case 'semiannual': return Math.floor(m/6);
    case 'annual': return 0;
    case 'bimonthly': return Math.floor(m/2);
  }
  return 0;
}

function getSlotCount(freqKey) {
  // Daily was previously split into morning/afternoon/night (3 slots) but the
  // user prefers a single "done for today" toggle — timing within the day
  // doesn't matter as long as the task got done. Other frequencies unchanged.
  return { daily:1, weekly:7, monthly:12, quarterly:4, semiannual:2, annual:1, bimonthly:6 }[freqKey] || 1;
}

function getSlotLabels(freqKey) {
  const L = T[state.lang];
  switch(freqKey) {
    // Daily collapses to a single "Gedaan / Done" label — see getSlotCount.
    case 'daily': return [state.lang === 'nl' ? 'Gedaan' : 'Done'];
    case 'weekly': return L.days;
    case 'monthly': return L.months;
    case 'quarterly': return ["Q1","Q2","Q3","Q4"];
    case 'semiannual': return ["H1","H2"];
    case 'annual': return [state.lang==='nl'?'Gedaan':'Done'];
    case 'bimonthly': return L.bimonths;
  }
  return [];
}

// De afdeling werkt niet op zondag. Voor de wekelijkse view is slot 0
// (getDay()===0 = zondag) daarom altijd verborgen. We laten de slot in de
// data wel bestaan zodat de bestaande slot-indices (di=2, za=6, etc.) intact
// blijven — we renderen 'm alleen niet.
function isSundaySlot(freqKey, i) {
  return freqKey === 'weekly' && i === 0;
}

// Check state access
// Returns true if at least one slot in `slots` is "checked" (handles both boolean and object form)
function anySlotChecked(slots) {
  if (!slots) return false;
  for (const k in slots) {
    const e = slots[k];
    if (e === true) return true;
    if (e && typeof e === 'object' && e.v) return true;
  }
  return false;
}

function isChecked(freqKey, taskId, slotIdx) {
  const key = getViewingPeriodKey(freqKey);
  const periodStore = (state.checks[freqKey] && state.checks[freqKey][key]) || {};
  const taskSlots = periodStore[taskId] || {};
  // For daily we collapsed 3 slots into 1. To handle legacy data where the
  // task was only checked in slot 1 or 2 (afternoon/night) before this
  // change, we treat ANY slot as checked when asked about slot 0 of a daily.
  // toggleCheck() clears all three slots when un-checking, so this stays
  // consistent on subsequent interactions.
  if (freqKey === 'daily' && slotIdx === 0) {
    return anySlotChecked(taskSlots);
  }
  const entry = taskSlots[slotIdx];
  // Supports two storage shapes:
  // - boolean (legacy): true means checked
  // - object (new): { v: true, by: 'name', at: 'iso-date' } means checked
  if (entry === true) return true;
  if (entry && typeof entry === 'object' && entry.v) return true;
  return false;
}

// Returns true when the given slot was checked off retroactively by a
// superuser (correctedBy/correctedAt fields on the entry). Used by render
// code to mark such checks visually with a small badge.
function isCorrection(freqKey, taskId, slotIdx) {
  const key = getViewingPeriodKey(freqKey);
  const periodStore = (state.checks[freqKey] && state.checks[freqKey][key]) || {};
  const taskSlots = periodStore[taskId] || {};
  // For daily we collapsed 3 slots into 1 — check any slot
  if (freqKey === 'daily' && slotIdx === 0) {
    for (const k in taskSlots) {
      const e = taskSlots[k];
      if (e && typeof e === 'object' && e.corrected) return true;
    }
    return false;
  }
  const entry = taskSlots[slotIdx];
  return !!(entry && typeof entry === 'object' && entry.corrected);
}

function getStoragePeriodKey(freqKey) {
  const d = new Date();
  const y = d.getFullYear();
  switch(freqKey) {
    case 'daily': return getPeriodId('daily'); // per day
    case 'weekly': return getPeriodId('weekly'); // per week
    default: return `${y}`; // per year
  }
}

// Return the period the user is currently looking at — either the live/current one
// (default) or a user-selected historical period.
function getViewingPeriodKey(freqKey) {
  const viewing = state.viewingPeriod && state.viewingPeriod[freqKey];
  return viewing || getStoragePeriodKey(freqKey);
}

function isViewingHistorical(freqKey) {
  const viewing = state.viewingPeriod && state.viewingPeriod[freqKey];
  return !!(viewing && viewing !== getStoragePeriodKey(freqKey));
}

// Classify a period key relative to the current moment.
// Returns 'past', 'current', or 'future'. Uses lexicographic string comparison
// which works correctly for all our key formats (YYYY-MM-DD, YYYY-Wnn, YYYY).
function classifyPeriod(freqKey, periodKey) {
  const current = getStoragePeriodKey(freqKey);
  if (periodKey === current) return 'current';
  if (periodKey < current) return 'past';
  return 'future';
}

// Generate a list of period keys for a given frequency, covering the past N
// and (optionally) future M periods relative to now. Used to expose empty
// periods in the selector so users can browse back and see which tasks were
// missed, even if no checks were recorded.
// Determine whether a task is overdue: it had at least one slot in the previous
// period and NONE of those slots was checked. For daily/weekly, "previous"
// means the period directly before the current one. For monthly+, where slots
// represent months/quarters/etc within a year, we consider the previous slot
// inside the current year (or last year if we're at slot 0 of January).
//
// IMPORTANT: a task is no longer overdue once the user has checked it off in
// the CURRENT period. The badge represents "you have catching up to do" —
// once the user has checked the current period, they've caught up, and
// continuing to flag the task would be confusing ("I just did it, why is it
// still red?"). For daily/weekly the current period is one slot (today/this week);
// for monthly+ we look specifically at the current slot in the year. Older
// missed slots in the same year still count as overdue for monthly+ — that's
// genuine work behind, not just "I haven't done it today".
// Determine whether a task is overdue. The rule, in plain language: a task
// is overdue when the MOST RECENT period that should have been done was
// missed, AND the user also hasn't done it in the current period yet.
//
// Why "most recent only" and not "any past period this year"? Old missed
// periods (e.g. January and February for a monthly task viewed in May) are
// not catchable — the user isn't going to clean three extra times to make
// up for them. Flagging those as ongoing overdue is just noise. So once a
// later period (April) IS checked, the slate is wiped clean and any earlier
// gaps are forgiven. The current period (May) becomes the next thing to do.
//
// Behaviour summary:
//   - Daily / Weekly: overdue when both yesterday/last-week AND today/this-
//     week are unchecked.
//   - Monthly+: overdue when both the most recent past slot AND the current
//     slot are unchecked. Older gaps are ignored once a more recent slot is
//     checked.
//   - Viewing a historical period: never overdue (overdue is only "now").
function isTaskOverdue(task) {
  if (!task) return false;
  if (isViewingHistorical(task.freq_key)) return false;
  const fk = task.freq_key;
  const currentKey = getStoragePeriodKey(fk);
  const currentSlots = (state.checks[fk] && state.checks[fk][currentKey] && state.checks[fk][currentKey][task.id]) || {};
  if (fk === 'daily') {
    // For daily the storage key itself rotates each period, so any checked
    // slot in the current key means the user is caught up for now.
    if (anySlotChecked(currentSlots)) return false;
    // Sunday is a non-working day for the cleaning department — no work is
    // expected and there's nothing to be overdue on. Skip the check.
    if (new Date().getDay() === 0) return false;
    // Find the most recent WORKING day (skipping Sundays). We look back up
    // to 7 days; in practice the gap is at most 2 (Saturday before Monday).
    let prevKey = null;
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (d.getDay() === 0) continue; // skip Sundays
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      prevKey = `${y}-${m}-${dd}`;
      break;
    }
    if (!prevKey) return false;
    const slots = (state.checks[fk] && state.checks[fk][prevKey] && state.checks[fk][prevKey][task.id]) || {};
    return !anySlotChecked(slots);
  }
  if (fk === 'weekly') {
    // For weekly the storage key itself rotates each period, so any checked
    // slot in the current key means the user is caught up for now.
    if (anySlotChecked(currentSlots)) return false;
    // Look at the IMMEDIATELY preceding period only.
    const keys = generatePeriodKeys(fk, 1, 0);
    if (keys.length < 2) return false;
    const prevKey = keys[0];
    const slots = (state.checks[fk] && state.checks[fk][prevKey] && state.checks[fk][prevKey][task.id]) || {};
    return !anySlotChecked(slots);
  }
  // ---- Monthly+ ----
  // All slots for monthly+ frequencies live under a single yearly key, with
  // slot indices representing the position within the year (0=Jan, 11=Dec
  // for monthly; 0=Q1, 3=Q4 for quarterly, etc.).
  const yearKey = getStoragePeriodKey(fk);
  const slots = (state.checks[fk] && state.checks[fk][yearKey] && state.checks[fk][yearKey][task.id]) || {};
  const currentSlot = getCurrentSlot(fk);
  // Helper — is a given slot index a "real" period for this frequency?
  // Quarterly only ticks at end-of-quarter (months 2/5/8/11), semiannual at
  // end-of-half-year (5/11), annual at year-end (11), bimonthly at every
  // odd month (1/3/5/7/9/11). Monthly = every month.
  function isRealSlot(i) {
    if (i < 0 || i >= getSlotCount(fk)) return false;
    if (fk === 'quarterly')  return i % 3 === 2;
    if (fk === 'semiannual') return i % 6 === 5;
    if (fk === 'annual')     return i === 11;
    if (fk === 'bimonthly')  return i % 2 === 1;
    return true; // monthly
  }
  function isSlotChecked(i) {
    const e = slots[i];
    return e === true || (e && typeof e === 'object' && e.v);
  }
  // If the current slot is already checked, the user is caught up.
  if (isSlotChecked(currentSlot)) return false;
  // Walk backwards from "just before now" to find the most recent slot that
  // would have been a real period. That's the only one that decides overdue;
  // anything older is forgiven.
  for (let i = currentSlot - 1; i >= 0; i--) {
    if (!isRealSlot(i)) continue;
    return !isSlotChecked(i);
  }
  // No prior real slot exists in this year (e.g. it's January for a monthly
  // task, or pre-Q1 for quarterly) — nothing to be overdue on.
  return false;
}

// Walk every task across every frequency and return those that are currently
// overdue. Used by the centralised overdue overview modal — instead of
// scattering "Achterstand" labels through the rows, we surface one count and
// a single drill-down list. `preFetchedTasks` is optional; passing it lets
// the caller (e.g. renderTabs) reuse a single getAllTasks() result.
function getAllOverdueTasks(preFetchedTasks) {
  const out = [];
  const tasks = preFetchedTasks || getAllTasks();
  tasks.forEach(t => {
    if (isTaskOverdue(t)) out.push(t);
  });
  return out;
}

// Group overdue tasks by frequency in display order so the overview modal
// shows them in the same sequence as the tabs.
function getOverdueGrouped() {
  const FREQ_ORDER = ['daily','weekly','monthly','bimonthly','quarterly','semiannual','annual'];
  const groups = {};
  FREQ_ORDER.forEach(k => { groups[k] = []; });
  getAllOverdueTasks().forEach(t => {
    if (groups[t.freq_key]) groups[t.freq_key].push(t);
    else { (groups[t.freq_key] = groups[t.freq_key] || []).push(t); }
  });
  return { order: FREQ_ORDER, groups: groups };
}

function generatePeriodKeys(freqKey, pastN, futureN) {
  futureN = futureN || 0;
  const keys = [];
  if (freqKey === 'daily') {
    for (let i = -pastN; i <= futureN; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      if (d.getDay() === 0) continue; // zondag: afdeling werkt niet
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      keys.push(`${y}-${m}-${dd}`);
    }
  } else if (freqKey === 'weekly') {
    for (let i = -pastN; i <= futureN; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i * 7);
      keys.push(getPeriodId('weekly', d));
    }
  } else {
    // Yearly keys for monthly+, bimonthly, quarterly, semiannual, annual
    const y = new Date().getFullYear();
    for (let i = -pastN; i <= futureN; i++) keys.push(String(y + i));
  }
  // Dedupe (weekly can produce duplicates near year boundaries)
  return Array.from(new Set(keys));
}

function setChecked(freqKey, taskId, slotIdx, val) {
  // Refuse to write when the user is browsing a historical period — UNLESS
  // they're a superuser. Superusers can correct forgotten check-offs after
  // the fact (operator forgot to tick something at end of shift). The
  // correction is tagged with a `correctedAt`/`correctedBy` audit field so
  // it's traceable later.
  const historical = isViewingHistorical(freqKey);
  if (historical && !isSuperuser()) {
    showToast(T[state.lang].historical_readonly, 'info');
    return;
  }
  // When in correction mode, write to the period actually being viewed —
  // not the current "today" key. Without this, a superuser ticking a box
  // in last week's view would silently update *this* week's data.
  const key = historical ? getViewingPeriodKey(freqKey) : getStoragePeriodKey(freqKey);
  if (!state.checks[freqKey]) state.checks[freqKey] = {};
  if (!state.checks[freqKey][key]) state.checks[freqKey][key] = {};
  if (!state.checks[freqKey][key][taskId]) state.checks[freqKey][key][taskId] = {};
  if (val) {
    // Store as object with audit trail: who and when. Backwards-compatible with
    // legacy boolean storage — isChecked treats both shapes as "checked".
    const entry = {
      v: true,
      by: state.currentUser || '',
      at: new Date().toISOString()
    };
    // Mark superuser-applied late corrections so reports / changelogs can
    // distinguish them from real-time check-offs.
    if (historical) {
      entry.corrected = true;
      entry.correctedBy = (state.authUser && state.authUser.email) || state.currentUser || '';
      entry.correctedAt = new Date().toISOString();
    }
    state.checks[freqKey][key][taskId][slotIdx] = entry;
  } else {
    state.checks[freqKey][key][taskId][slotIdx] = false;
  }
  saveState(true); // checks only — don't push plan to Firestore
}

// Helper: extract the value from a check entry (handles both boolean and object form)
function getCheckMeta(freqKey, taskId, slotIdx) {
  const key = getViewingPeriodKey(freqKey);
  const periodStore = (state.checks[freqKey] && state.checks[freqKey][key]) || {};
  const taskSlots = periodStore[taskId] || {};
  const entry = taskSlots[slotIdx];
  if (!entry) return null;
  if (entry === true) return { v: true, by: '', at: '' }; // legacy boolean
  if (typeof entry === 'object') return entry;
  return null;
}

// Get the note text on a check entry, or null if there is none.
function getCheckNote(freqKey, taskId, slotIdx) {
  const meta = getCheckMeta(freqKey, taskId, slotIdx);
  return (meta && meta.note) ? meta.note : null;
}

// Save or clear a note on an existing check entry. No-op if the slot is not
// checked yet (we don't store notes on unchecked tasks). Passing an empty
// string deletes the note field entirely so storage stays clean.
function setCheckNote(freqKey, taskId, slotIdx, noteText) {
  const historical = isViewingHistorical(freqKey);
  if (historical && !isSuperuser()) return;
  const key = historical ? getViewingPeriodKey(freqKey) : getStoragePeriodKey(freqKey);
  const periodStore = state.checks[freqKey] && state.checks[freqKey][key];
  if (!periodStore) return;
  const taskSlots = periodStore[taskId];
  if (!taskSlots) return;
  const entry = taskSlots[slotIdx];
  if (!entry) return; // not checked — nothing to annotate
  // Upgrade legacy boolean to object so we can attach the note
  if (entry === true) {
    taskSlots[slotIdx] = { v: true, by: state.currentUser || '', at: new Date().toISOString() };
  }
  const trimmed = noteText.trim();
  if (trimmed) {
    taskSlots[slotIdx].note = trimmed;
  } else {
    delete taskSlots[slotIdx].note;
  }
  saveState(true); // checks only
}

function toggleCheck(freqKey, taskId, slotIdx) {
  // Markeer dat we zojuist LOKAAL hebben afgevinkt. De cloud-listener gebruikt
  // dit om de echo van onze eigen schrijfactie NIET te re-renderen (de UI is
  // al chirurgisch bijgewerkt) — dat voorkomt de zichtbare flikkering.
  lastLocalCheckAt = Date.now();
  // Daily tasks are now a single "done for today" toggle. The on-disk data
  // may still contain values in legacy slots 1 and 2 (from before this
  // change) — we explicitly clear them whenever the user un-checks the
  // task, so an un-check actually un-checks. When checking, we just write
  // slot 0 like normal — anySlotChecked() in render code handles the read.
  if (freqKey === 'daily') {
    const cur = isChecked(freqKey, taskId, 0);
    setChecked(freqKey, taskId, 0, !cur);
    if (cur) {
      // We just un-checked. Wipe any legacy slot 1/2 values so the task
      // doesn't immediately appear "done" again via anySlotChecked().
      // Use viewing key so a superuser un-checking a historical day clears
      // the right period's legacy slots.
      const key = getViewingPeriodKey(freqKey);
      const periodStore = (state.checks[freqKey] && state.checks[freqKey][key]) || null;
      if (periodStore && periodStore[taskId]) {
        delete periodStore[taskId][1];
        delete periodStore[taskId][2];
        saveState(true); // checks only
      }
    }
    return;
  }
  const cur = isChecked(freqKey, taskId, slotIdx);
  setChecked(freqKey, taskId, slotIdx, !cur);
}

// =====================================================
// RENDERING
// =====================================================
// Return the version number shown prominently in the header (subtitle).
// Priority: the most recently committed user entry, then the newest built-in entry.
// This mirrors the ordering in the changelog view exactly.
function getLatestVersion() {
  const customEntries = state.customChangelog || [];
  if (customEntries.length > 0 && customEntries[0].version) {
    return customEntries[0].version;
  }
  const sortedDataVersions = [...(DATA.versions || [])].sort((a, b) => {
    const da = (a.date || '').toString();
    const db = (b.date || '').toString();
    return db.localeCompare(da);
  });
  if (sortedDataVersions.length > 0) return sortedDataVersions[0].version || '?';
  return '?';
}

function renderApp() {
  document.documentElement.lang = state.lang;
  const L = T[state.lang];
  // Onboarding-banner mounten (zonodig). Banner is niet-blokkerend en
  // verschijnt bovenin de app voor admin-gebruikers met onafgeronde
  // onboarding. renderOnboardingBanner() returnt '' wanneer niet nodig.
  const onbMount = document.getElementById('onboarding-mount');
  if (onbMount) {
    const html = renderOnboardingBanner();
    if (onbMount.innerHTML !== html) {
      onbMount.innerHTML = html;
      if (html) wireOnboardingBanner();
    }
  }
  // Branding-fallback: gebruik state.branding.companyName als die is
  // ingevuld, anders de hardcoded i18n-default. Idem voor de subtitel.
  const b = state.branding || {};
  const titleEl = document.getElementById('app-title');
  if (titleEl) {
    titleEl.textContent = (b.companyName && b.companyName.trim()) ? b.companyName : L.app_title;
  }
  // Subtitle shows the latest version — either the newest user-committed
  // changelog entry (if any exists) or the latest built-in DATA.versions entry.
  // Use a dedicated text-only span so the cloud-status badge sibling is preserved.
  const latest = getLatestVersion();
  const subtitleEl = document.getElementById('app-subtitle');
  if (subtitleEl) {
    // Ensure there's a text node we can update. Cloud-status used to live
    // inside subtitle; since the header restructure (sage design) it's a
    // sibling under .header-right, so we only manage the text span here.
    let textSpan = document.getElementById('app-subtitle-text');
    if (!textSpan && subtitleEl.innerHTML !== undefined) {
      subtitleEl.innerHTML = '<span id="app-subtitle-text"></span>';
      textSpan = document.getElementById('app-subtitle-text');
    }
    if (textSpan) {
      // Branding-subtitle: toon alleen de beschrijvende subtitle-tekst.
      // De documentcode + versie staan al in de mono-badge naast de titel,
      // dus die herhalen we hier NIET (anders staat alles dubbel).
      const customSub = b.subtitle && b.subtitle.trim();
      if (customSub) {
        textSpan.textContent = customSub;
      } else {
        textSpan.textContent = L.app_subtitle.replace('{v}', latest);
      }
    }
  }
  // Brand-code (small mono badge next to the title — shows doc-code + version)
  const codeEl = document.getElementById('app-version-code');
  if (codeEl) {
    const customDoc = b.docCode && b.docCode.trim();
    codeEl.textContent = (customDoc ? customDoc + ' · ' : 'GTE-D-09-99 · ') + 'v' + latest;
  }
  // Logo-override: vervang de hardcoded brand-logo <img> src als er een
  // custom logo is ingesteld. Donker-mode logo krijgt voorrang in dark mode.
  const logoEl = document.querySelector('.brand-logo');
  if (logoEl && (b.logoDataUrl || b.logoDarkDataUrl)) {
    const isDark = document.body && document.body.classList && document.body.classList.contains('dark-mode');
    const customLogo = (isDark && b.logoDarkDataUrl) ? b.logoDarkDataUrl
                      : (b.logoDataUrl || b.logoDarkDataUrl);
    if (customLogo) {
      logoEl.src = customLogo;
      logoEl.alt = b.companyName || 'logo';
    }
  }
  // Export button moved to sidebar — the standalone header element no longer
  // exists. Skip its label update; renderSidebar() handles the sidebar copy.
  // Header language picker: a <select> with one option per supported language.
  // Reflect the active language as the selected option.
  const langSel = document.getElementById('lang-select');
  if (langSel) langSel.value = state.lang;
  // Back-compat: if an older single-button markup is still present, keep it
  // working by showing the next-language label.
  const langBtn = document.getElementById('lang-btn');
  if (langBtn) langBtn.innerHTML = L.lang_btn;
  // Edit-mode toggle is now a sidebar item — see renderSidebar() for its
  // localized label and icon. No header element to update here anymore.
  const updateBtn = document.getElementById('update-btn');
  if (updateBtn) {
    const count = pendingChangeCount();
    // Visible when: there are pending changes OR editing is unlocked
    if (count > 0 || state.editUnlocked) {
      updateBtn.style.display = '';
      if (count > 0) {
        updateBtn.innerHTML = `⟳ ${L.update_btn} <span class="update-badge">${count}</span>`;
        updateBtn.classList.add('btn-has-changes');
        updateBtn.title = L.update_btn_title_has.replace('{n}', count);
      } else {
        updateBtn.innerHTML = `⟳ ${L.update_btn}`;
        updateBtn.classList.remove('btn-has-changes');
        updateBtn.title = L.update_btn_title_empty;
      }
    } else {
      updateBtn.style.display = 'none';
    }
  }
  // The Dashboard, Versiebeheer, Help, Back-up, Herstel, QR-codes en Importeer
  // knoppen leven sinds de sidebar-refactor in renderSidebar(). Hun localizatie
  // gebeurt daar bij het openen van de sidebar. Onderstaande dode label-updates
  // zijn dus niet meer nodig en zijn opgeruimd.
  // Localize bulk-bar buttons (static HTML has NL defaults)
  const clearBtn = document.getElementById('bulk-clear-btn');
  if (clearBtn) clearBtn.innerHTML = '✕ ' + L.bulk_deselect_all;
  const delBtn = document.getElementById('bulk-delete-btn');
  if (delBtn) delBtn.innerHTML = '🗑 ' + L.bulk_delete_button;
  updateUserButtonLabel();
  updateCloudStatusBadge();
  renderHeaderStats();
  updateEditModeBanner();
  applyRoleBasedVisibility();
  renderPlanTabs();
  renderTabs();
  renderContent();
  // Apply the anti-flash fade-in class to the content container. This makes
  // genuine full re-renders (add task, bulk delete, plan switch) feel like
  // a smooth update instead of a hard page flash. The class auto-removes
  // when the short animation finishes.
  const _contentEl = document.getElementById('filters-and-content');
  if (_contentEl) {
    _contentEl.classList.remove('refreshing');
    void _contentEl.offsetWidth; // force reflow so animation re-runs
    _contentEl.classList.add('refreshing');
    setTimeout(() => _contentEl.classList.remove('refreshing'), 250);
  }
  // Body classes used by CSS to show/hide the floating action button (FAB).
  // We hide the FAB on tabs where adding a task makes no sense. The FAB itself
  // calls openAddTaskModal() which works regardless of edit-mode, matching
  // the desktop "+" button in the filter bar.
  if (document.body && document.body.classList) {
    document.body.classList.toggle('tab-today', state.activeTab === 'today');
    document.body.classList.toggle('tab-all', state.activeTab === 'all');
    document.body.classList.toggle('tab-coordinator', state.activeTab === 'coordinator');
    document.body.classList.toggle('tab-settings', state.activeTab === 'settings');
    document.body.classList.toggle('tab-dashboard', state.activeTab === 'dashboard');
    document.body.classList.toggle('tab-changelog', state.activeTab === 'changelog');
    document.body.classList.toggle('tab-products', state.activeTab === 'products');
    document.body.classList.toggle('tab-methods', state.activeTab === 'methods');
    document.body.classList.toggle('tab-beheer', state.activeTab === 'beheer');
    document.body.classList.toggle('tab-inspections', state.activeTab === 'inspections');
  }
  // Measure the actual heights of the sticky top elements and push them into
  // CSS variables, so every subsequent sticky element (plan-tabs → tabs →
  // sticky-controls) stacks cleanly below the previous one without overlap,
  // even when buttons wrap onto multiple rows on narrow viewports.
  // We call it twice immediately + twice delayed for iOS Safari which needs
  // multiple layout passes before offsetHeight values stabilise.
  updateStickyOffsets();
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(updateStickyOffsets);
    // Extra passes for iOS Safari — layout may not be stable after 1 RAF
    setTimeout(updateStickyOffsets, 100);
    setTimeout(updateStickyOffsets, 400);
  }
}

// Measure header, plan-tabs and freq-tabs heights and expose them as CSS
// variables consumed by the sticky-stack rules. Safe to call repeatedly.
function updateStickyOffsets() {
  if (!document || !document.documentElement || !document.documentElement.style) return;
  const root = document.documentElement;
  const qs = document.querySelector ? document.querySelector.bind(document) : null;
  const gi = document.getElementById ? document.getElementById.bind(document) : null;
  const header = qs ? qs('header') : null;
  const planTabs = gi ? gi('plan-tabs') : null;
  const tabs = qs ? qs('.tabs') : null;
  if (header && typeof header.offsetHeight === 'number' && header.offsetHeight > 0) {
    root.style.setProperty('--sticky-header-h', header.offsetHeight + 'px');
  }
  if (planTabs && typeof planTabs.offsetHeight === 'number') {
    root.style.setProperty('--sticky-plan-tabs-h', planTabs.offsetHeight + 'px');
  }
  if (tabs && typeof tabs.offsetHeight === 'number' && tabs.offsetHeight > 0) {
    root.style.setProperty('--sticky-tabs-h', tabs.offsetHeight + 'px');
  }
  // Mobile fixed-bars sizing — measure total bar height for body padding.
  // Only meaningful when body has the .mobile-fixed-bars class. Includes
  // the filter bar (.sticky-controls) only when it's actually visible
  // (not collapsed) since hidden elements should not consume body padding.
  if (document.body && document.body.classList && document.body.classList.contains('mobile-fixed-bars')) {
    const hh = (header && header.offsetHeight) || 0;
    const ph = (planTabs && planTabs.offsetHeight) || 0;
    // Tabs zijn verborgen op today-view (body.tab-today .tabs { display:none }).
    // In dat geval geeft offsetHeight 0 terug — dat is correct want ze nemen
    // geen ruimte in. We meten ALTIJD de echte waarde zodat de var up-to-date is.
    const th = (tabs && tabs.offsetHeight) || 0;
    const stickyControls = document.querySelector ? document.querySelector('.sticky-controls') : null;
    const isCollapsed = stickyControls && stickyControls.classList &&
      stickyControls.classList.contains('filters-collapsed');
    const sh = (!isCollapsed && stickyControls && stickyControls.offsetHeight) || 0;
    const onbMount = document.getElementById('onboarding-mount');
    const oh = (onbMount && onbMount.offsetHeight) || 0;
    root.style.setProperty('--mobile-onb-h', oh + 'px');
    if (hh > 0) root.style.setProperty('--mobile-header-h', hh + 'px');
    root.style.setProperty('--mobile-plan-tabs-h', ph + 'px');
    root.style.setProperty('--mobile-tabs-h', th + 'px');
    // Altijd zetten zodra we de header-hoogte weten — ook als tabs verborgen
    // zijn (th===0 op today-tab). De oude guard `th > 0` zorgde ervoor dat op
    // today-tab --mobile-bars-total-h nooit werd gezet, waardoor de fallback
    // van 60px actief bleef en de content te laag begon.
    if (hh > 0) {
      root.style.setProperty('--mobile-bars-total-h', (hh + ph + th + sh + oh) + 'px');
    }
  }
}

// Decide whether to enable the mobile fixed-bars layout. We use it when the
// viewport is narrow AND the device looks touch-based. Re-evaluated on every
// resize / orientation change.
function evaluateMobileFixedBars() {
  if (typeof document === 'undefined' || !document.body || !document.body.classList) return;
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const isMobileWidth = window.matchMedia('(max-width: 720px)').matches;
  // Touch detection: hover:none + pointer:coarse is the modern way to detect
  // primary touch input. Some tablets in portrait might match this too — that's fine,
  // they'll get the mobile-friendly layout.
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const shouldUseMobile = isMobileWidth && isTouch;
  document.body.classList.toggle('mobile-fixed-bars', shouldUseMobile);
  // Trigger a measurement after class change so the CSS variables are set
  if (shouldUseMobile) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => updateStickyOffsets());
    } else {
      updateStickyOffsets();
    }
  }
}

// =====================================================
// MOBILE TOUCH GESTURES
// =====================================================
// Three gestures handled here, all guarded so they only fire on touch devices:
//  1. Pull-to-refresh — drag down at the very top of the page to re-sync
//  2. Swipe between frequency tabs — horizontal swipe on empty task area
//  3. Swipe-to-check on a task card — horizontal swipe on a card toggles
//     the current period's check
//
// All three use the same low-level touchstart/move/end listeners on document.
// We dispatch based on where the touch *started* and the direction of movement.

const SWIPE_THRESHOLD_PX = 70;     // minimum distance to trigger a horizontal swipe
const SWIPE_VERTICAL_TOLERANCE = 35; // |dy| must be less than this to count as horizontal
const PTR_PULL_THRESHOLD_PX = 70;  // minimum pull distance to trigger refresh
const PTR_MAX_PULL_PX = 120;       // visual cap so the indicator doesn't fly off screen

let touchState = null; // { startX, startY, startedOnCard, cardEl, lastX, lastY, mode }

function isTouchDevice() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

// Frequency tabs in display order — used for swipe-left/right navigation.
// Matches the order in renderTabs(). Dashboard/changelog are intentionally
// excluded so swipes don't accidentally jump out of the task workflow.
const SWIPE_TAB_ORDER = ['daily', 'weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'];

function setupMobileGestures() {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  // Pull-to-refresh visual indicator — created once, reused.
  let ptrIndicator = document.getElementById('ptr-indicator');
  if (!ptrIndicator) {
    ptrIndicator = document.createElement('div');
    ptrIndicator.id = 'ptr-indicator';
    ptrIndicator.className = 'ptr-indicator';
    ptrIndicator.innerHTML = '<span class="ptr-spinner">↓</span>';
    document.body.appendChild(ptrIndicator);
  }

  document.addEventListener('touchstart', (e) => {
    if (!isTouchDevice()) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    // Skip gestures when the touch starts on interactive controls — checking
    // these here is cleaner than blacklisting in touchend.
    // Task cards are explicitly included here so that a horizontal swipe
    // *on* a card never causes a tab-switch and never moves the card.
    // The swipe-to-check feature has been removed at the user's request:
    // cards must stay completely fixed in place.
    const onControl = e.target.closest && (
      e.target.closest('button') ||
      e.target.closest('input') ||
      e.target.closest('select') ||
      e.target.closest('a') ||
      e.target.closest('.task-card-check') ||
      e.target.closest('.check-box') ||
      e.target.closest('.modal') ||
      e.target.closest('.sidebar') ||
      e.target.closest('.round-overlay') || // ronde-overlay heeft eigen scroll — nooit PTR/tab-swipe hijacken
      e.target.closest('.task-card') || // <-- cards themselves: never swipe
      e.target.closest('.tabs') || // don't hijack horizontal scroll on the tabs row
      e.target.closest('.plan-tabs-bar') ||
      e.target.closest('.fab-add-task')
    );
    touchState = {
      startX: t.clientX,
      startY: t.clientY,
      lastX: t.clientX,
      lastY: t.clientY,
      onControl: !!onControl,
      atTop: window.scrollY <= 1,  // captured at start so PTR only triggers when truly at top
      mode: null  // 'h' (horizontal swipe — tab change), 'ptr' (pull to refresh), or 'scroll'
    };
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!touchState || !isTouchDevice()) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touchState.startX;
    const dy = t.clientY - touchState.startY;
    touchState.lastX = t.clientX;
    touchState.lastY = t.clientY;
    // Decide the gesture mode once we've moved enough — the first 8px of any
    // touch is treated as undetermined to avoid jittery dispatch.
    if (!touchState.mode) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // Pull-to-refresh: started at top of page, dragging down with a clearly
      // vertical motion. Skip if started on a control.
      if (touchState.atTop && dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.5 && !touchState.onControl) {
        touchState.mode = 'ptr';
      }
      // Horizontal swipe (tab change): clearly horizontal motion. Skip if
      // started on a control or on a swipe-blocked element (cards included).
      else if (Math.abs(dx) > Math.abs(dy) * 1.4 && !touchState.onControl) {
        touchState.mode = 'h';
      } else {
        // Vertical scroll — leave it to the browser
        touchState.mode = 'scroll';
      }
    }
    // Pull-to-refresh visual feedback: show a small indicator that grows
    // and rotates as the user pulls down.
    if (touchState.mode === 'ptr' && dy > 0) {
      const pull = Math.min(dy, PTR_MAX_PULL_PX);
      const pct = pull / PTR_PULL_THRESHOLD_PX;
      ptrIndicator.classList.add('visible');
      ptrIndicator.style.transform = `translateX(-50%) translateY(${pull * 0.6}px) rotate(${pct * 360}deg)`;
      ptrIndicator.classList.toggle('ready', pull >= PTR_PULL_THRESHOLD_PX);
      // Prevent the page from rubber-banding while we're showing our own UI
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });  // passive: false because PTR may preventDefault

  document.addEventListener('touchend', () => {
    if (!touchState) return;
    const ts = touchState;
    touchState = null;  // clear early so re-renders inside handlers don't re-trigger
    const dx = ts.lastX - ts.startX;
    const dy = ts.lastY - ts.startY;
    // ---- Pull-to-refresh ----
    if (ts.mode === 'ptr') {
      const pulled = dy >= PTR_PULL_THRESHOLD_PX;
      ptrIndicator.classList.remove('ready', 'visible');
      ptrIndicator.style.transform = '';
      if (pulled) manualSync();
      return;
    }
    // ---- Tab swipe (left/right) ----
    if (ts.mode === 'h') {
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dy) > SWIPE_VERTICAL_TOLERANCE) return;
      const idx = SWIPE_TAB_ORDER.indexOf(state.activeTab);
      if (idx === -1) return; // Not on a frequency tab — skip
      // Right swipe → previous tab; Left swipe → next tab
      const newIdx = dx > 0 ? idx - 1 : idx + 1;
      if (newIdx >= 0 && newIdx < SWIPE_TAB_ORDER.length) {
        switchTab(SWIPE_TAB_ORDER[newIdx]);
      }
    }
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    if (!touchState) return;
    if (ptrIndicator) {
      ptrIndicator.classList.remove('ready', 'visible');
      ptrIndicator.style.transform = '';
    }
    touchState = null;
  }, { passive: true });
}

function renderTabs() {
  const L = T[state.lang];
  const tabs = [
    { key: 'daily', label: L.tabs.daily },
    { key: 'weekly', label: L.tabs.weekly },
    { key: 'monthly', label: L.tabs.monthly },
    { key: 'bimonthly', label: L.tabs.bimonthly },
    { key: 'quarterly', label: L.tabs.quarterly },
    { key: 'semiannual', label: L.tabs.semiannual },
    { key: 'annual', label: L.tabs.annual }
  ];
  const container = document.getElementById('tabs');
  // Determine if any filter is active so we can show a colored dot on the
  // filter button — gives a visual hint when filters are hiding tasks.
  const f = state.filters || {};
  const filtersActive = !!(f.area || f.performer || (f.search && f.search.trim()));
  // Cache the full task list ONCE per render. Without this, getAllTasks()
  // gets called 15+ times during a single renderTabs (per-tab counts, per-tab
  // dept stats, overdue scan) — each rebuild iterates DATA.tasks. Caching
  // turns that into a single iteration upfront.
  const allTasks = getAllTasks();
  // Pre-bucket tasks by frequency so per-tab lookups are O(1).
  const tasksByFreq = {};
  allTasks.forEach(t => {
    if (!tasksByFreq[t.freq_key]) tasksByFreq[t.freq_key] = [];
    tasksByFreq[t.freq_key].push(t);
  });
  const tabsHtml = tabs.map(t => {
    const tasksInTab = tasksByFreq[t.key] || [];
    const count = t.isChangelog ? null : tasksInTab.length;
    let progressBars = '';
    if (!t.isChangelog && count > 0) {
      // Get per-department stats so the user can see whether Facilitair or
      // Operator is keeping up. Each bar fills proportionally to the
      // department's done/total ratio. Tooltip shows the raw numbers.
      const s = getTabProgressStats(t.key, tasksInTab);
      const fpct = s.facilitair.total > 0 ? (s.facilitair.done / s.facilitair.total) * 100 : 0;
      const opct = s.operator.total   > 0 ? (s.operator.done   / s.operator.total)   * 100 : 0;
      // Build tooltip — only mention departments that actually have tasks
      const tipParts = [`${L.done}: ${s.done}/${s.total}`];
      if (s.facilitair.total > 0) tipParts.push(`${L.dept_facilitair}: ${s.facilitair.done}/${s.facilitair.total}`);
      if (s.operator.total > 0)   tipParts.push(`${L.dept_operator}: ${s.operator.done}/${s.operator.total}`);
      if (s.overig.total > 0)     tipParts.push(`${L.dept_overig}: ${s.overig.done}/${s.overig.total}`);
      const tip = tipParts.join(' · ');
      // Two stacked thin bars; each only rendered when the dept has tasks in
      // this tab, so a daily tab with only Operator tasks won't show an empty
      // Facilitair bar (which would be misleading — looks like 0%).
      const facBar = s.facilitair.total > 0
        ? `<span class="dept-bar dept-bar-fac" title="${esc(tip)}"><span class="dept-bar-fill" style="width:${fpct.toFixed(1)}%"></span></span>`
        : '';
      const opBar = s.operator.total > 0
        ? `<span class="dept-bar dept-bar-op" title="${esc(tip)}"><span class="dept-bar-fill" style="width:${opct.toFixed(1)}%"></span></span>`
        : '';
      progressBars = `<span class="tab-progress" title="${esc(tip)}">${facBar}${opBar}</span>`;
    }
    const cnt = t.isChangelog ? '' : `<span class="tab-count">${count}</span>`;
    return `<button class="tab ${state.activeTab === t.key ? 'active' : ''}" data-tab-key="${t.key}" onclick="switchTab('${t.key}')">
      <span class="tab-label-row">${t.label}${cnt}</span>
      ${progressBars}
    </button>`;
  }).join('');
  // "Alle" tab — read-only overzicht van álle punten over alle frequenties
  // heen, voor de kwaliteitsfunctionaris om snel in te zoeken. Geen
  // dept-progressbars want voortgang is per-periode/per-frequentie en
  // betekenisloos voor een cross-frequentie lijst. Telt alle taken.
  const allCount = allTasks.length;
  const allTabHtml = `<button class="tab ${state.activeTab === 'all' ? 'active' : ''}" data-tab-key="all" onclick="switchTab('all')">
      <span class="tab-label-row">${L.tabs.all}<span class="tab-count">${allCount}</span></span>
    </button>`;
  // Filter toggle — pinned to the right of the tabs row. Has a small
  // colored dot indicator when any filter is active.
  const filterBtn = `<button class="tabs-filter-btn ${state.filtersOpen ? 'active' : ''}"
    onclick="toggleFiltersOpen()" title="${L.filter_toggle_tooltip}" aria-label="${L.filter_toggle_tooltip}">
    <span class="tabs-filter-icon">🔍</span>
    <span class="tabs-filter-label">${L.filter_btn}</span>
    ${filtersActive ? '<span class="tabs-filter-dot" aria-hidden="true"></span>' : ''}
  </button>`;
  // Overdue overview button — only rendered when there's actually overdue
  // work to show. Sits to the LEFT of the filter button so it's the first
  // thing the eye hits on the right side of the tabs row. The count gives
  // immediate awareness; clicking opens the central overview modal.
  // Pass the cached task list so the overdue scan reuses it.
  const overdueCount = getAllOverdueTasks(allTasks).length;
  const overdueBtn = overdueCount > 0
    ? `<button class="tabs-overdue-btn"
        onclick="openOverdueOverviewModal()"
        title="${L.overdue_overview_tooltip}"
        aria-label="${L.overdue_overview_tooltip}">
        <span class="tabs-overdue-icon" aria-hidden="true">⚠</span>
        <span class="tabs-overdue-label">${L.overdue_overview_btn}</span>
        <span class="tabs-overdue-count">${overdueCount}</span>
      </button>`
    : '';
  // Auxiliary tabs (reference data + admin). Sit after the main frequency
  // tabs with a vertical separator. Each is "muted" until active.
  const auxTabs = [
    { key: 'methods',   label: 'Methodieken' },
    { key: 'products',  label: 'Middelen' },
    { key: 'inspections', label: 'Keuringen' },
    { key: 'beheer',    label: 'Beheer' },
    { key: 'changelog', label: 'Versiebeheer' },
  ];
  const auxHtml = auxTabs.map(t => {
    let badge = '';
    if (t.key === 'inspections') {
      const n = getInspectionsNeedingAction().length;
      if (n > 0) badge = `<span class="tab-aux-badge" aria-label="${n} in te plannen">${n}</span>`;
    }
    return `<button class="tab tab--aux ${state.activeTab === t.key ? 'active' : ''}" data-tab-key="${t.key}" onclick="switchTab('${t.key}')">
      <span class="tab-label-row">${esc(t.label)}${badge}</span>
    </button>`;
  }).join('');
  container.innerHTML = `<div class="tabs-scroll">${allTabHtml}<span class="freqs-sep" aria-hidden="true"></span>${tabsHtml}<span class="freqs-sep" aria-hidden="true"></span>${auxHtml}</div>${overdueBtn}${filterBtn}`;
}

// Lightweight version of the tab progress update — used after toggling a
// checkbox. Avoids re-rendering the entire tabs HTML (which causes a visible
// flash because the sticky-positioned tabs row gets fully replaced). Instead
// we surgically update just the dept-bar fill widths and tooltips on the
// affected tab. This is much faster and produces zero layout flicker.
function updateTabProgress(freqKey) {
  const L = T[state.lang];
  const tabBtn = document.querySelector(`.tab[data-tab-key="${freqKey}"]`);
  if (!tabBtn) return;
  const s = getTabProgressStats(freqKey);
  // Build the same tooltip string renderTabs uses, so hovering shows fresh numbers
  const tipParts = [`${L.done}: ${s.done}/${s.total}`];
  if (s.facilitair.total > 0) tipParts.push(`${L.dept_facilitair}: ${s.facilitair.done}/${s.facilitair.total}`);
  if (s.operator.total > 0)   tipParts.push(`${L.dept_operator}: ${s.operator.done}/${s.operator.total}`);
  if (s.overig.total > 0)     tipParts.push(`${L.dept_overig}: ${s.overig.done}/${s.overig.total}`);
  const tip = tipParts.join(' · ');
  const progressEl = tabBtn.querySelector('.tab-progress');
  if (progressEl) progressEl.setAttribute('title', tip);
  const facFill = tabBtn.querySelector('.dept-bar-fac .dept-bar-fill');
  if (facFill && s.facilitair.total > 0) {
    const fpct = (s.facilitair.done / s.facilitair.total) * 100;
    facFill.style.width = fpct.toFixed(1) + '%';
    const facBar = facFill.parentElement;
    if (facBar) facBar.setAttribute('title', tip);
  }
  const opFill = tabBtn.querySelector('.dept-bar-op .dept-bar-fill');
  if (opFill && s.operator.total > 0) {
    const opct = (s.operator.done / s.operator.total) * 100;
    opFill.style.width = opct.toFixed(1) + '%';
    const opBar = opFill.parentElement;
    if (opBar) opBar.setAttribute('title', tip);
  }
}

// Lightweight refresh of overdue indicators after a task is checked off.
// Avoids the page-flashing renderApp() that used to happen when overdue
// state changed: only the affected row/card and the global "Achterstand"
// button are touched.
//
// Three things may need updating:
//   1. The per-row red dot (.overdue-badge) on the table row or mobile card
//   2. The .task-overdue class on the same row/card (controls background tint)
// Surgically inject or remove the "all done!" hero banner based on whether
// every task in the current frequency is now checked off. Called after each
// checkbox toggle so the banner reacts instantly — without a full renderApp().
function updateHeroBanner(freqKey) {
  if (isViewingHistorical(freqKey)) return;
  if (!['daily','weekly','monthly','bimonthly','quarterly','semiannual','annual'].includes(freqKey)) return;

  const allTasksForFreq = getAllTasks().filter(t => t.freq_key === freqKey);
  if (allTasksForFreq.length === 0) return;

  const currentPeriodKey = getStoragePeriodKey(freqKey);
  const currentSlotIdx = getCurrentSlot(freqKey);
  const allDone = allTasksForFreq.every(t => {
    const periodStore = (state.checks[freqKey] && state.checks[freqKey][currentPeriodKey]) || {};
    const slots = periodStore[t.id] || {};
    const entry = slots[currentSlotIdx];
    return (entry === true) || (entry && typeof entry === 'object' && entry.v === true);
  });

  const containerId = `hero-banner-${freqKey}`;
  let container = document.getElementById(containerId);
  if (!container) {
    const anchor = document.querySelector('.task-table-wrapper, .task-cards-wrapper');
    if (!anchor) return;
    container = document.createElement('div');
    container.id = containerId;
    anchor.parentNode.insertBefore(container, anchor);
  }
  if (allDone) {
    if (!container.querySelector('.hero-all-done')) {
      container.innerHTML = renderAllDoneHero(allTasksForFreq.length, freqKey);
    }
  } else {
    container.innerHTML = '';
  }
}

//   3. The global count chip in the tabs row (.tabs-overdue-btn / .tabs-overdue-count)
//
// We re-evaluate isTaskOverdue() for the specific task, then patch the DOM
// directly. No renderApp, no renderTabs — zero visual flicker.
function updateOverdueStatus(taskId) {
  const task = getAllTasks().find(t => t.id === taskId);
  if (!task) return;
  const overdue = isTaskOverdue(task);
  // ---- 1+2. Per-row badge and class on table row ----
  const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
  if (row) {
    row.classList.toggle('task-overdue', overdue);
    // Badge lives inside the .loc-area-row container in the location/area cell,
    // alongside the area-badge / custom-badge / edited-badge.
    const locAreaRow = row.querySelector('.loc-area-row');
    if (locAreaRow) {
      let badge = locAreaRow.querySelector('.overdue-badge');
      if (overdue && !badge) {
        const L = T[state.lang];
        badge = document.createElement('span');
        badge.className = 'overdue-badge';
        badge.title = L.overdue_tooltip;
        badge.setAttribute('aria-label', L.overdue_label);
        badge.textContent = '⚠';
        locAreaRow.appendChild(badge);
      } else if (!overdue && badge) {
        badge.remove();
      }
    }
  }
  // ---- 1+2. Per-card badge and class on mobile card ----
  const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
  if (card) {
    card.classList.toggle('task-overdue', overdue);
    const locEl = card.querySelector('.task-card-location');
    if (locEl) {
      let badge = locEl.querySelector('.overdue-badge');
      if (overdue && !badge) {
        const L = T[state.lang];
        badge = document.createElement('span');
        badge.className = 'overdue-badge';
        badge.title = L.overdue_tooltip;
        badge.setAttribute('aria-label', L.overdue_label);
        badge.textContent = '⚠';
        // Add a leading space so it doesn't bunch up against the werkplek text
        locEl.appendChild(document.createTextNode(' '));
        locEl.appendChild(badge);
      } else if (!overdue && badge) {
        // Also remove the trailing whitespace text node we may have added
        const prev = badge.previousSibling;
        badge.remove();
        if (prev && prev.nodeType === 3 && /^\s+$/.test(prev.nodeValue)) prev.remove();
      }
    }
  }
  // ---- 3. Global "Achterstand X" button in the tabs row ----
  // Recount across all tasks (cheap — just reads cached state.checks).
  // We can't avoid scanning all tasks since *any* of them could have just
  // become overdue or stopped being overdue, but it's a single pass.
  const totalOverdue = getAllOverdueTasks().length;
  let btn = document.querySelector('.tabs-overdue-btn');
  const tabsContainer = document.getElementById('tabs');
  if (totalOverdue > 0) {
    if (btn) {
      // Update existing button — just patch the count
      const countEl = btn.querySelector('.tabs-overdue-count');
      if (countEl) countEl.textContent = totalOverdue;
    } else if (tabsContainer) {
      // Button doesn't exist yet (count was 0) — build it and insert it
      // before the filter button to keep the same layout as renderTabs().
      const L = T[state.lang];
      btn = document.createElement('button');
      btn.className = 'tabs-overdue-btn';
      btn.setAttribute('onclick', 'openOverdueOverviewModal()');
      btn.title = L.overdue_overview_tooltip;
      btn.setAttribute('aria-label', L.overdue_overview_tooltip);
      btn.innerHTML =
        '<span class="tabs-overdue-icon" aria-hidden="true">⚠</span>' +
        '<span class="tabs-overdue-label">' + L.overdue_overview_btn + '</span>' +
        '<span class="tabs-overdue-count">' + totalOverdue + '</span>';
      const filterBtn = tabsContainer.querySelector('.tabs-filter-btn');
      if (filterBtn) {
        tabsContainer.insertBefore(btn, filterBtn);
      } else {
        tabsContainer.appendChild(btn);
      }
    }
  } else if (btn) {
    // Count dropped to 0 — remove the button entirely (matches renderTabs behavior)
    btn.remove();
  }
}

// Toggle the filter bar open/closed. The filter bar is always present in the
// DOM (see renderFiltersBar); we toggle the `.open` class on it for a smooth
// CSS transition. The parent `.sticky-controls` carries a `.filters-collapsed`
// class which (together with a `:has()` rule in CSS) hides the wrapper when
// nothing is showing — we toggle it with the right timing so transitions can
// actually run instead of being skipped by an instant display-none flip.
function toggleFiltersOpen() {
  state.filtersOpen = !state.filtersOpen;
  renderTabs(); // updates the filter button's active state
  const stickyParent = document.querySelector('#filters-and-content .sticky-controls');
  const existingBar = document.querySelector('#filters-and-content .filters-bar');
  if (existingBar && stickyParent) {
    if (state.filtersOpen) {
      // OPEN: drop the parent's collapsed class first so the wrapper is
      // visible, then on the next frame add `.open` so the bar slides down.
      stickyParent.classList.remove('filters-collapsed');
      requestAnimationFrame(() => {
        existingBar.classList.add('open');
      });
    } else {
      // CLOSE: remove `.open` first to play the slide-up, then re-collapse
      // the parent wrapper after the transition has finished.
      existingBar.classList.remove('open');
      setTimeout(() => {
        stickyParent.classList.add('filters-collapsed');
      }, 320);
    }
    // Re-measure after the CSS transition finishes so mobile body padding is right
    setTimeout(() => updateStickyOffsets(), 360);
  } else {
    // No filter bar present (dashboard/changelog) — fall back to re-rendering
    renderContent();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => updateStickyOffsets());
    } else {
      updateStickyOffsets();
    }
  }
  // If we just opened it on desktop, focus the search field for fast filtering
  if (state.filtersOpen) {
    setTimeout(() => {
      const search = document.querySelector('.filter-input[data-field="search"]');
      if (search && typeof search.focus === 'function') search.focus();
    }, 50);
  }
}

function getAllTasks() {
  const overrides = state.taskOverrides || {};
  const pending = state.pendingChanges || {};
  const deleted = new Set(state.deletedBuiltinIds || []);
  const builtins = DATA.tasks
    .filter(t => !deleted.has(t.id))
    .map(t => {
      const ov = overrides[t.id];
      if (!ov) return t;
      const hasPendingEdit = pending[t.id] && pending[t.id].type === 'edit';
      return Object.assign({}, t, ov, hasPendingEdit ? { edited: true } : {});
    });
  return builtins.concat(state.customTasks || []);
}

// =====================================================
// CHANGE TRACKING
// =====================================================
// Records a change in state.pendingChanges, which is later committed to the
// changelog via the "Update" button. The before/after objects should be
// snapshots (deep-copied) of the task state before and after the change.
function recordChange(type, taskId, opts) {
  opts = opts || {};
  const existing = state.pendingChanges[taskId];
  if (type === 'add') {
    state.pendingChanges[taskId] = { type: 'add', after: opts.after };
  } else if (type === 'edit') {
    if (existing && existing.type === 'add') {
      // Was a pending add — just update 'after'
      state.pendingChanges[taskId] = { type: 'add', after: opts.after };
    } else if (existing && existing.type === 'edit') {
      // Already tracking an edit — keep the ORIGINAL 'before'
      state.pendingChanges[taskId] = { type: 'edit', before: existing.before, after: opts.after };
    } else {
      // First edit — capture the provided 'before' snapshot
      state.pendingChanges[taskId] = { type: 'edit', before: opts.before, after: opts.after };
    }
  } else if (type === 'delete') {
    if (existing && existing.type === 'add') {
      // Added then deleted in the same cycle — net zero
      delete state.pendingChanges[taskId];
    } else {
      const before = (existing && existing.before) ? existing.before : opts.before;
      state.pendingChanges[taskId] = { type: 'delete', before: before };
    }
  }
  saveState();
}

// Compute field-level differences between two task objects.
function computeDiffs(before, after) {
  const fields = ['ruimte','werkplek','onderdeel','subcat','uitvoerend','vervuiling','wanneer','freq','methode','middel','vscore','zscore','afstand'];
  const diffs = [];
  for (const f of fields) {
    const bv = (before && before[f] != null) ? String(before[f]) : '';
    const av = (after && after[f] != null) ? String(after[f]) : '';
    if (bv !== av) diffs.push({ field: f, old: bv, new: av });
  }
  return diffs;
}

function pendingChangeCount() {
  return Object.keys(state.pendingChanges || {}).length;
}

function suggestNextVersion() {
  const all = (state.customChangelog || []).concat(DATA.versions || []);
  let maxNum = 10;
  for (const v of all) {
    const m = (v.version || '').toString().match(/v(\d+)/i);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
  }
  return 'v' + (maxNum + 1);
}

function countDoneInTab(freqKey) {
  // A task counts as "done" for the viewed period if at least one relevant slot is checked.
  const tasksInTab = getAllTasks().filter(t => t.freq_key === freqKey);
  const key = getViewingPeriodKey(freqKey);
  const periodStore = (state.checks[freqKey] && state.checks[freqKey][key]) || {};
  const currentSlot = getCurrentSlot(freqKey);
  let count = 0;
  for (const t of tasksInTab) {
    const taskSlots = periodStore[t.id] || {};
    if (freqKey === 'daily' || freqKey === 'weekly') {
      if (anySlotChecked(taskSlots)) count++;
    } else {
      if (taskSlots[currentSlot]) count++;
    }
  }
  return count;
}

// Like countDoneInTab, but groups tasks by uitvoerend (department) so the UI
// can show a separate progress bar per department on each tab. Anything that
// isn't Facilitair/Operator falls into "overig" (typically external firms).
// `preFilteredTasks` is an optional caller-supplied list of tasks already
// filtered to this freq — passing it lets renderTabs skip a redundant
// getAllTasks() call per tab.
function getTabProgressStats(freqKey, preFilteredTasks) {
  const tasksInTab = preFilteredTasks
    || getAllTasks().filter(t => t.freq_key === freqKey);
  const key = getViewingPeriodKey(freqKey);
  const periodStore = (state.checks[freqKey] && state.checks[freqKey][key]) || {};
  const currentSlot = getCurrentSlot(freqKey);
  // Bucket helper — match by lowercase substring so "Facilitair", "facilitair"
  // and any future variant all land in the same bucket. "Operator" identifies
  // line operators; everything else (Externe firma, Extern schoonmaakbedrijf,
  // etc.) goes into "overig".
  const bucketOf = (perf) => {
    const p = (perf || '').toLowerCase();
    if (p.includes('facilitair')) return 'facilitair';
    if (p.includes('operator')) return 'operator';
    return 'overig';
  };
  const stats = {
    total: 0, done: 0,
    facilitair: { total: 0, done: 0 },
    operator:   { total: 0, done: 0 },
    overig:     { total: 0, done: 0 }
  };
  for (const t of tasksInTab) {
    const bucket = bucketOf(t.uitvoerend);
    stats.total++;
    stats[bucket].total++;
    const taskSlots = periodStore[t.id] || {};
    let isDone = false;
    if (freqKey === 'daily' || freqKey === 'weekly') {
      isDone = anySlotChecked(taskSlots);
    } else {
      isDone = !!taskSlots[currentSlot];
    }
    if (isDone) {
      stats.done++;
      stats[bucket].done++;
    }
  }
  return stats;
}

function switchTab(key) {
  // No-op when clicking the already-active tab — avoids unnecessary re-render
  // and keeps the fade-in animation reserved for genuine tab changes.
  if (state.activeTab === key) return;
  // Auto-pauze van een actieve schoonmaakronde wanneer de gebruiker via
  // sidebar of swipe naar een andere tab gaat. De ronde-state blijft
  // bewaard (state.activeRound) — alleen de overlay sluit. Op de Today-
  // view ziet de gebruiker dan een Hervat-knop. Zonder deze auto-pauze
  // zou de full-screen overlay (z-index 1000) over de nieuwe view blijven
  // liggen en de hamburger blokkeren.
  if (state.activeRound && document.body && document.body.classList.contains('round-active')) {
    pauseRoundOverlay();
  }
  state.activeTab = key;
  state.selectedTaskIds = []; // clear selection when switching tabs
  // Only re-render the parts that actually depend on activeTab. The header,
  // sidebar, plan-tabs, edit-banner and cloud-status all stay the same when
  // switching frequency tabs — re-rendering them caused a visible page flash.
  renderTabs();
  renderContent();
  // Body classes for the FAB visibility (dashboard/changelog/products/today hide it).
  if (document.body && document.body.classList) {
    document.body.classList.toggle('tab-today', state.activeTab === 'today');
    document.body.classList.toggle('tab-all', state.activeTab === 'all');
    document.body.classList.toggle('tab-coordinator', state.activeTab === 'coordinator');
    document.body.classList.toggle('tab-settings', state.activeTab === 'settings');
    document.body.classList.toggle('tab-dashboard', state.activeTab === 'dashboard');
    document.body.classList.toggle('tab-changelog', state.activeTab === 'changelog');
    document.body.classList.toggle('tab-products', state.activeTab === 'products');
    document.body.classList.toggle('tab-methods', state.activeTab === 'methods');
    document.body.classList.toggle('tab-beheer', state.activeTab === 'beheer');
    document.body.classList.toggle('tab-inspections', state.activeTab === 'inspections');
  }
  // Trigger a one-shot fade+slide animation on the freshly rendered content.
  // Using requestAnimationFrame + class toggle ensures the animation re-runs
  // on every tab switch (otherwise the browser would skip identical class lists).
  const c = document.getElementById('filters-and-content');
  if (c) {
    c.classList.remove('tab-content-fadein');
    // Force reflow so the next class-add restarts the animation
    void c.offsetWidth;
    c.classList.add('tab-content-fadein');
  }
  // Re-measure sticky offsets na tab-wissel. We wachten één RAF zodat de
  // browser de nieuwe body-klassen (o.a. tab-today die .tabs verbergt) heeft
  // verwerkt en offsetHeight correct 0 geeft voor verborgen elementen.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(updateStickyOffsets);
    setTimeout(updateStickyOffsets, 150); // extra pass voor iOS Safari
  } else {
    updateStickyOffsets();
  }
  window.scrollTo(0, 0);
}

function renderContent() {
  const container = document.getElementById('filters-and-content');
  if (state.activeTab === 'today') {
    container.innerHTML = renderTodayView();
    wireCheckboxes();
    updateBulkActionBar();
    return;
  }
  if (state.activeTab === 'coordinator') {
    container.innerHTML = renderCoordinatorView();
    wireCoordFilterInputs();
    wireCheckboxes();
    updateBulkActionBar();
    return;
  }
  if (state.activeTab === 'settings') {
    container.innerHTML = renderSettingsView();
    wireSettingsView();
    updateBulkActionBar();
    return;
  }
  if (state.activeTab === 'all') {
    container.innerHTML = renderAllView();
    wireAllViewFilters();
    updateBulkActionBar();
    return;
  }
  if (state.activeTab === 'changelog') {
    container.innerHTML = renderChangelogView();
    updateBulkActionBar();
    return;
  }
  if (state.activeTab === 'dashboard') {
    container.innerHTML = renderDashboard();
    updateBulkActionBar();
    return;
  }
  if (state.activeTab === 'products') {
    container.innerHTML = renderProductsView();
    updateBulkActionBar();
    return;
  }
  if (state.activeTab === 'methods') {
    container.innerHTML = renderMethodsView();
    updateBulkActionBar();
    return;
  }
  if (state.activeTab === 'beheer') {
    container.innerHTML = renderBeheerView();
    updateBulkActionBar();
    return;
  }
  if (state.activeTab === 'inspections') {
    container.innerHTML = renderInspectionsView();
    updateBulkActionBar();
    return;
  }
  // renderFiltersBar already embeds the task view inside #task-view-container,
  // so we MUST NOT concatenate renderTaskView() again — that would duplicate the table.
  container.innerHTML = renderFiltersBar();
  // Wire filters
  document.querySelectorAll('.filter-input').forEach(el => {
    el.onchange = function() {
      const field = this.dataset.field;
      // sortBy lives on state directly (not under state.filters) because it
      // affects ordering, not visibility. Same handler still works for both.
      if (field === 'sortBy') {
        state.sortBy = this.value;
        saveState(); // persist so the choice survives refresh
      } else {
        state.filters[field] = this.value;
      }
      document.getElementById('task-view-container').innerHTML = renderTaskView();
      wireCheckboxes();
      updateBulkActionBar();
    };
    if (el.tagName === 'INPUT') el.oninput = el.onchange;
  });
  wireCheckboxes();
  updateBulkActionBar();
}

function renderFiltersBar() {
  const L = T[state.lang];
  const freqKey = state.activeTab;
  const tasksInTab = getAllTasks().filter(t => t.freq_key === freqKey);
  const areas = [...new Set(tasksInTab.map(t => t.ruimte).filter(Boolean))].sort();
  const performers = [...new Set(tasksInTab.map(t => t.uitvoerend).filter(Boolean))].sort();
  // The filter bar is ALWAYS present in the DOM so that toggling it produces
  // a smooth slide-in/slide-out CSS transition. The `.open` class controls
  // whether it is visible (max-height/opacity/transform handled in CSS).
  const filtersInner = `<div class="filters-bar ${state.filtersOpen ? 'open' : ''}">
    <div class="filter-group">
      <label>${L.filter_area}</label>
      <select class="filter-input" data-field="area">
        <option value="">${L.filter_all}</option>
        ${areas.map(a => `<option value="${esc(a)}" ${state.filters.area===a?'selected':''}>${esc(tr(a))}</option>`).join('')}
      </select>
    </div>
    <div class="filter-group">
      <label>${L.filter_performer}</label>
      <select class="filter-input" data-field="performer">
        <option value="">${L.filter_all}</option>
        ${performers.map(p => `<option value="${esc(p)}" ${state.filters.performer===p?'selected':''}>${esc(tr(p))}</option>`).join('')}
      </select>
    </div>
    <div class="filter-group">
      <label>${L.filter_search}</label>
      <input type="text" class="filter-input" data-field="search" value="${esc(state.filters.search)}" placeholder="...">
    </div>
    <div class="filter-group">
      <label>${L.sort_label}</label>
      <select class="filter-input" data-field="sortBy">
        <option value="default" ${(state.sortBy||'default')==='default'?'selected':''}>${L.sort_default}</option>
        <option value="area" ${state.sortBy==='area'?'selected':''}>${L.sort_area}</option>
        <option value="soiling" ${state.sortBy==='soiling'?'selected':''}>${L.sort_soiling}</option>
      </select>
    </div>
    <div class="filter-group" style="margin-left: auto; gap: 8px;">
      <button class="add-btn-bar" onclick="openAddTaskModal()" title="${L.add_task_title}">+ ${L.add_task_btn}</button>
      <button class="btn" style="background: #f1f5f9; color: #475569; border-color: #cbd5e1;" onclick="resetCurrentPeriod()">↻ ${L.reset_all}</button>
    </div>
    </div>`;
  return `<div class="sticky-controls ${state.filtersOpen ? '' : 'filters-collapsed'}">
    ${filtersInner}
    <div id="bulk-action-bar" class="bulk-action-bar" style="display:none;">
      <span id="bulk-count" class="bulk-count"></span>
      <button class="btn" onclick="clearSelection()" id="bulk-clear-btn">✕ ${L.bulk_deselect_all}</button>
      <button class="btn btn-danger" onclick="openBulkDeleteModal()" id="bulk-delete-btn">🗑 ${L.bulk_delete_button}</button>
    </div>
  </div>
  <div class="main-content">
    ${renderPeriodSelector(freqKey)}
    <div id="task-view-container">${renderTaskView()}</div>
  </div>`;
}

// Build a human-readable label for a given period key within a frequency tab.
function formatPeriodKey(freqKey, periodKey) {
  if (!periodKey) return periodKey;
  if (freqKey === 'daily') {
    // YYYY-MM-DD → "Maandag 24 apr 2026" (volledige dagnaam vooraan)
    const m = periodKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const d = new Date(+m[1], +m[2] - 1, +m[3]);
      const months = T[state.lang].month_names_short || ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
      let weekday = '';
      try {
        weekday = d.toLocaleDateString(state.lang || 'nl', { weekday: 'long' });
        weekday = weekday.charAt(0).toUpperCase() + weekday.slice(1) + ' ';
      } catch (e) { weekday = ''; }
      return `${weekday}${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
  } else if (freqKey === 'weekly') {
    // YYYY-Wnn → "Week 17, 2026"
    const m = periodKey.match(/^(\d{4})-W(\d+)$/);
    if (m) return `${T[state.lang].week_label || 'Week'} ${parseInt(m[2])}, ${m[1]}`;
  } else {
    // Yearly key for monthly+
    return periodKey;
  }
  return periodKey;
}

// Render the period selector bar. Shows the current period as a dropdown that,
// when opened, lists past periods so users can review what was (or wasn't) done.
// Future periods are only shown when edit-unlocked, and remain read-only to
// prevent cheating by pre-checking tasks. New periods naturally appear at their
// scheduled boundary (e.g. midnight for daily) via the 60-second auto-refresh.
function renderPeriodSelector(freqKey) {
  const L = T[state.lang];
  const currentKey = getStoragePeriodKey(freqKey);
  const viewingKey = getViewingPeriodKey(freqKey);
  const isHist = isViewingHistorical(freqKey);
  
  // How many past periods to offer per frequency (covers "missed tasks" browsing)
  const PAST_COUNTS = { daily: 30, weekly: 12, monthly: 2, bimonthly: 2,
                        quarterly: 2, semiannual: 2, annual: 2 };
  const pastCount = PAST_COUNTS[freqKey] || 12;
  // Future periods only visible when the user is authenticated (edit-unlocked).
  // For regular users this prevents "cheating" by pre-checking future tasks.
  const FUTURE_COUNTS = { daily: 7, weekly: 4, monthly: 1, bimonthly: 1,
                          quarterly: 1, semiannual: 1, annual: 1 };
  const futureCount = state.editUnlocked ? (FUTURE_COUNTS[freqKey] || 1) : 0;
  
  // Combine generated periods with any stored periods that pre-date our window
  const generated = generatePeriodKeys(freqKey, pastCount, futureCount);
  const stored = Object.keys((state.checks && state.checks[freqKey]) || {});
  let allKeys = Array.from(new Set([...generated, ...stored]));

  // Zondag uit de dagelijkse datum-dropdown: de afdeling werkt niet op zondag.
  // Verbergt ook eventueel opgeslagen oude zondag-sleutels.
  if (freqKey === 'daily') {
    allKeys = allKeys.filter(k => {
      const m = k.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return true;
      return new Date(+m[1], +m[2] - 1, +m[3]).getDay() !== 0;
    });
  }
  
  // Strip future periods unless the user is authenticated
  if (!state.editUnlocked) {
    allKeys = allKeys.filter(k => classifyPeriod(freqKey, k) !== 'future');
  }
  
  // Newest first
  allKeys.sort((a, b) => b.localeCompare(a));
  
  // Option HTML
  const opts = allKeys.map(k => {
    const label = formatPeriodKey(freqKey, k);
    const cls = classifyPeriod(freqKey, k);
    let suffix = '';
    if (cls === 'current') suffix = ` (${L.period_current})`;
    else if (cls === 'future') suffix = ` (${L.period_future})`;
    const selected = (k === viewingKey) ? ' selected' : '';
    return `<option value="${esc(k)}"${selected}>${esc(label)}${suffix}</option>`;
  }).join('');
  
  // Build context-aware warning banner for non-current periods
  let histBanner = '';
  if (isHist) {
    const cls = classifyPeriod(freqKey, viewingKey);
    const isFuture = (cls === 'future');
    // Superusers can edit historical periods (correction mode) — show a
    // different banner to make that clear, so they know they CAN tick
    // boxes here and any change is traceable as a late correction.
    const isSuperuserCorrection = !isFuture && isSuperuser();
    let title, body, cssMod, icon;
    if (isFuture) {
      title = L.future_banner_title;
      body = L.future_banner_body;
      cssMod = 'future';
      icon = '🔮';
    } else if (isSuperuserCorrection) {
      title = L.correction_banner_title;
      body = L.correction_banner_body;
      cssMod = 'correction';
      icon = '📝';
    } else {
      title = L.historical_banner_title;
      body = L.historical_banner_body;
      cssMod = 'past';
      icon = '⚠️';
    }
    histBanner = `<div class="historical-banner ${cssMod}">
      ${icon} <strong>${title}</strong> · ${body}
      <button class="btn" style="margin-left:auto; background:#f1f5f9; color:#475569; border-color:#cbd5e1;" onclick="returnToCurrentPeriod()">↩ ${L.return_current}</button>
    </div>`;
  }
  
  return `<div class="period-info ${isHist ? 'hist' : ''}">
      <span class="period-info-icon" aria-hidden="true">🗓️</span>
      <strong class="period-info-label">${getPeriodLabel(freqKey)}</strong>
      <span class="period-info-hint">· ${L.period_auto_reset}</span>
      <div class="period-picker">
        <label class="period-picker-label">${L.view_period}:</label>
        <select class="period-picker-select" onchange="selectViewingPeriod('${esc(freqKey)}', this.value)">
          ${opts}
        </select>
        <button class="btn print-btn" onclick="printCurrentPeriod()" title="${L.print_tooltip}">🖨️ ${L.print_btn}</button>
      </div>
    </div>
    ${histBanner}`;
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function selectViewingPeriod(freqKey, periodKey) {
  const currentKey = getStoragePeriodKey(freqKey);
  if (!state.viewingPeriod) state.viewingPeriod = {};
  if (periodKey === currentKey) {
    delete state.viewingPeriod[freqKey];
  } else {
    state.viewingPeriod[freqKey] = periodKey;
  }
  renderContent();
}

function returnToCurrentPeriod() {
  const freqKey = state.activeTab;
  if (state.viewingPeriod) delete state.viewingPeriod[freqKey];
  renderContent();
}

function allVisibleSelected(tasks) {
  if (!tasks || tasks.length === 0) return false;
  return tasks.every(t => isTaskSelected(t.id));
}

function filteredTasks() {
  const freqKey = state.activeTab;
  const q = (state.filters.search || '').toLowerCase().trim();
  const list = getAllTasks().filter(t => {
    if (t.freq_key !== freqKey) return false;
    if (state.filters.area && t.ruimte !== state.filters.area) return false;
    if (state.filters.performer && t.uitvoerend !== state.filters.performer) return false;
    if (q) {
      const hay = [t.ruimte, t.werkplek, t.onderdeel, t.subcat, t.middel, t.methode, t.vervuiling].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  // Apply sort. Use a stable secondary key (row number) so tasks with equal
  // primary sort values keep a predictable order. 'default' uses row number
  // directly so the result matches the source-document order.
  const sortBy = state.sortBy || 'default';
  if (sortBy === 'area') {
    list.sort((a, b) => {
      const r = (a.ruimte || '').localeCompare(b.ruimte || '');
      if (r !== 0) return r;
      const w = (a.werkplek || '').localeCompare(b.werkplek || '');
      if (w !== 0) return w;
      return (a.row || 0) - (b.row || 0);
    });
  } else if (sortBy === 'soiling') {
    // Risk score = vscore × zscore × afstand, descending. Tasks with missing
    // scores fall to the bottom (treated as 0).
    const score = t => {
      const v = parseFloat(t.vscore) || 0;
      const z = parseFloat(t.zscore) || 0;
      const a = parseFloat(t.afstand) || 0;
      return v * z * a;
    };
    list.sort((a, b) => {
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return (a.row || 0) - (b.row || 0);
    });
  }
  // 'default' = source row order, which is the natural order returned by getAllTasks()
  return list;
}

// ============================================================
// "ALLE" VIEW — read-only cross-frequency overzicht
// ============================================================
// Eén doorzoekbare lijst van álle punten over alle frequenties heen.
// Op verzoek van de kwaliteitsfunctionaris: makkelijk opzoeken zonder per
// frequentie-tab te hoeven klikken. Bewust READ-ONLY (geen afvink-vakjes):
// afvinken gebeurt per periode/per frequentie en is hier betekenisloos —
// dit is een naslag-/zoeklijst. De frequentie is per rij zichtbaar via een
// eigen "Frequentie"-kolom.

// Net als filteredTasks(), maar zonder freq_key-filter zodat álle taken
// meekomen. Area/performer/search blijven gelijk. Sorteert primair op
// frequentie (dagelijks → jaarlijks) en daarbinnen op de actieve sortBy.
function filteredAllTasks() {
  const q = (state.filters.search || '').toLowerCase().trim();
  const list = getAllTasks().filter(t => {
    if (state.filters.area && t.ruimte !== state.filters.area) return false;
    if (state.filters.performer && t.uitvoerend !== state.filters.performer) return false;
    if (q) {
      const hay = [t.ruimte, t.werkplek, t.onderdeel, t.subcat, t.middel, t.methode, t.vervuiling].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const FREQ_ORDER = ['daily', 'weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'];
  const freqRank = t => {
    const i = FREQ_ORDER.indexOf(t.freq_key);
    return i === -1 ? 99 : i;
  };
  const sortBy = state.sortBy || 'default';
  // Secundaire sleutel volgt dezelfde logica als filteredTasks().
  const secondary = (a, b) => {
    if (sortBy === 'area') {
      const r = (a.ruimte || '').localeCompare(b.ruimte || '');
      if (r !== 0) return r;
      const w = (a.werkplek || '').localeCompare(b.werkplek || '');
      if (w !== 0) return w;
      return (a.row || 0) - (b.row || 0);
    }
    if (sortBy === 'soiling') {
      const score = t => (parseFloat(t.vscore) || 0) * (parseFloat(t.zscore) || 0) * (parseFloat(t.afstand) || 0);
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return (a.row || 0) - (b.row || 0);
    }
    return (a.row || 0) - (b.row || 0);
  };
  list.sort((a, b) => {
    const fr = freqRank(a) - freqRank(b);
    if (fr !== 0) return fr;
    return secondary(a, b);
  });
  return list;
}

function renderAllView() {
  const L = T[state.lang];
  const allTasks = getAllTasks();
  // Dropdown-opties uit ÁLLE taken (niet per frequentie).
  const areas = [...new Set(allTasks.map(t => t.ruimte).filter(Boolean))].sort();
  const performers = [...new Set(allTasks.map(t => t.uitvoerend).filter(Boolean))].sort();
  const filtersInner = `<div class="filters-bar ${state.filtersOpen ? 'open' : ''}">
    <div class="filter-group">
      <label>${L.filter_area}</label>
      <select class="filter-input all-filter-input" data-field="area">
        <option value="">${L.filter_all}</option>
        ${areas.map(a => `<option value="${esc(a)}" ${state.filters.area===a?'selected':''}>${esc(tr(a))}</option>`).join('')}
      </select>
    </div>
    <div class="filter-group">
      <label>${L.filter_performer}</label>
      <select class="filter-input all-filter-input" data-field="performer">
        <option value="">${L.filter_all}</option>
        ${performers.map(p => `<option value="${esc(p)}" ${state.filters.performer===p?'selected':''}>${esc(tr(p))}</option>`).join('')}
      </select>
    </div>
    <div class="filter-group">
      <label>${L.filter_search}</label>
      <input type="text" class="filter-input all-filter-input" data-field="search" value="${esc(state.filters.search)}" placeholder="...">
    </div>
    <div class="filter-group">
      <label>${L.sort_label}</label>
      <select class="filter-input all-filter-input" data-field="sortBy">
        <option value="default" ${(state.sortBy||'default')==='default'?'selected':''}>${L.sort_default}</option>
        <option value="area" ${state.sortBy==='area'?'selected':''}>${L.sort_area}</option>
        <option value="soiling" ${state.sortBy==='soiling'?'selected':''}>${L.sort_soiling}</option>
      </select>
    </div>
  </div>`;
  return `<div class="sticky-controls ${state.filtersOpen ? '' : 'filters-collapsed'}">
    ${filtersInner}
  </div>
  <div class="main-content">
    <div id="all-view-container">${renderAllTable()}</div>
  </div>`;
}

// Read-only tabel met een Frequentie-kolom. Hergebruikt dezelfde cel-helpers
// als renderTaskView (getAreaMeta, trOnderdeel, renderScoreCell, …) maar zonder
// per-periode afvink-kolommen.
function renderAllTable() {
  const L = T[state.lang];
  const freqLabels = {
    daily: L.tabs.daily, weekly: L.tabs.weekly, monthly: L.tabs.monthly,
    bimonthly: L.tabs.bimonthly, quarterly: L.tabs.quarterly,
    semiannual: L.tabs.semiannual, annual: L.tabs.annual
  };
  const tasks = filteredAllTasks();
  if (tasks.length === 0) {
    return `<div class="task-table-wrapper">${renderEmptyState()}</div>`;
  }
  let html = `<div class="task-table-wrapper"><table class="all-table">
    <thead>
      <tr>
        <th class="col-row">#</th>
        <th class="col-frequency">${L.headers.frequency}</th>
        <th class="col-location">${L.headers.location}</th>
        <th class="col-task">${L.headers.task}</th>
        <th class="col-performer">${L.headers.performer}</th>
        <th class="col-method">${L.headers.method}</th>
        <th class="col-product">${L.headers.product}</th>
        <th class="col-score" title="${L.score_tooltip}">${L.headers.score}</th>
      </tr>
    </thead><tbody>`;
  tasks.forEach(t => {
    const areaMeta = getAreaMeta(t.ruimte);
    html += `<tr data-task-id="${t.id}" style="--area-color: ${areaMeta.color};">
      <td><span class="row-num">${t.row}</span></td>
      <td><span class="freq-badge freq-${esc(t.freq_key || '')}">${esc(freqLabels[t.freq_key] || t.freq_key || '')}</span></td>
      <td>
        <div class="loc-area-row">
          <span class="area-badge" style="--area-color: ${areaMeta.color};"><span class="area-icon" aria-hidden="true">${areaMeta.icon}</span>${esc(tr(t.ruimte))}</span>
        </div>
        ${t.werkplek ? `<div class="loc-werkplek">${esc(tr(t.werkplek))}</div>` : ''}
      </td>
      <td>
        <div class="task-title">
          ${esc(trOnderdeel(t))}
          ${t.imageUrl ? `<button class="task-image-btn" data-image-url="${esc(t.imageUrl)}" data-image-caption="${esc(trOnderdeel(t))}" data-task-id="${esc(t.id)}" title="${L.image_view_tooltip}" aria-label="${L.image_view_tooltip}">📷</button>` : ''}
        </div>
        ${t.subcat ? `<div class="task-desc">${esc(trSubcat(t))}</div>` : ''}
        ${t.vervuiling ? `<div class="task-sub">🔹 ${esc(tr(t.vervuiling))}</div>` : ''}
        ${t.wanneer ? `<div class="task-sub">⏱ ${esc(tr(t.wanneer))}</div>` : ''}
      </td>
      <td>${t.uitvoerend ? `<span class="performer-badge ${t.uitvoerend.toLowerCase().includes('operator')?'operator':t.uitvoerend.toLowerCase().includes('extern')||t.uitvoerend.toLowerCase().includes('externe')?'extern':''}">${esc(tr(t.uitvoerend))}</span>` : ''}</td>
      <td><span style="font-size:12px;">${esc(tr(t.methode) || '')}</span></td>
      <td>${renderProductLink(t.middel)}${renderPbmIcons(t)}</td>
      <td>${renderScoreCell(t)}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  // Mobiele kaart-weergave (read-only) — CSS verbergt de tabel < 720px.
  html += `<div class="task-cards-mobile all-cards-mobile">`;
  tasks.forEach(t => {
    const areaMeta = getAreaMeta(t.ruimte);
    html += `<div class="task-card" data-task-id="${t.id}" style="--area-color: ${areaMeta.color};">
      <div class="task-card-head">
        <span class="area-badge" style="--area-color: ${areaMeta.color};"><span class="area-icon" aria-hidden="true">${areaMeta.icon}</span>${esc(tr(t.ruimte))}</span>
        <span class="freq-badge freq-${esc(t.freq_key || '')}">${esc(freqLabels[t.freq_key] || t.freq_key || '')}</span>
      </div>
      <div class="task-card-title">${esc(trOnderdeel(t))}</div>
      ${t.werkplek ? `<div class="task-card-sub">${esc(tr(t.werkplek))}</div>` : ''}
      ${t.uitvoerend ? `<div class="task-card-sub"><span class="performer-badge ${t.uitvoerend.toLowerCase().includes('operator')?'operator':t.uitvoerend.toLowerCase().includes('extern')||t.uitvoerend.toLowerCase().includes('externe')?'extern':''}">${esc(tr(t.uitvoerend))}</span></div>` : ''}
      ${t.methode ? `<div class="task-card-sub">${esc(tr(t.methode))}</div>` : ''}
    </div>`;
  });
  html += `</div>`;
  return html;
}

// Bind filter-inputs op de Alle-view; re-rendert alleen de tabel-container.
function wireAllViewFilters() {
  document.querySelectorAll('.all-filter-input').forEach(el => {
    el.onchange = function() {
      const field = this.dataset.field;
      if (field === 'sortBy') {
        state.sortBy = this.value;
        saveState();
      } else {
        state.filters[field] = this.value;
      }
      const c = document.getElementById('all-view-container');
      if (c) c.innerHTML = renderAllTable();
    };
    if (el.tagName === 'INPUT') el.oninput = el.onchange;
  });
}

function renderTaskView() {
  const L = T[state.lang];
  const freqKey = state.activeTab;
  const tasks = filteredTasks();
  if (tasks.length === 0) {
    return `<div class="task-table-wrapper">${renderEmptyState()}</div>`;
  }
  const slotCount = getSlotCount(freqKey);
  const slotLabels = getSlotLabels(freqKey);
  const currentSlot = getCurrentSlot(freqKey);
  const currentClass = freqKey === 'daily' ? 'today' : 'current';

  // S3: detect "all done for now" state. Rules:
  // 1. Only fires for the current period (not historical views)
  // 2. Checks ALL tasks for this frequency (not just filtered ones) so
  //    a partial filter can't trigger a false positive
  // 3. Checks only the CURRENT slot — for monthly tasks the period key is
  //    the full year (2026) with 12 slots; "any slot checked" would fire
  //    after January is done even though May is still empty
  let allDone = false;
  if (!isViewingHistorical(freqKey) && tasks.length > 0) {
    const allTasksForFreq = getAllTasks().filter(t => t.freq_key === freqKey);
    const currentPeriodKey = getStoragePeriodKey(freqKey);
    // getCurrentSlot returns which column represents "now" (e.g. slot 4 = May
    // for monthly, slot 0 for daily, the current day-of-week index for weekly)
    const currentSlotIdx = getCurrentSlot(freqKey);
    allDone = allTasksForFreq.length > 0 && allTasksForFreq.every(t => {
      const periodStore = (state.checks[freqKey] && state.checks[freqKey][currentPeriodKey]) || {};
      const slots = periodStore[t.id] || {};
      // Check only the slot that represents the current period
      const entry = slots[currentSlotIdx];
      return (entry === true) || (entry && typeof entry === 'object' && entry.v === true);
    });
  }
  const heroBanner = `<div id="hero-banner-${freqKey}">${allDone ? renderAllDoneHero(tasks.length, freqKey) : ''}</div>`;

  let html = heroBanner + `<div class="task-table-wrapper"><table>
    <thead>
      <tr>
        ${state.editUnlocked ? `<th class="col-bulk-select"><div class="bulk-select-cb ${allVisibleSelected(tasks) ? 'checked' : ''}" onclick="toggleSelectAllVisible()" title="${L.bulk_select_all}"></div></th>` : ''}
        <th class="col-row">#</th>
        <th class="col-location">${L.headers.location}</th>
        <th class="col-task">${L.headers.task}</th>
        <th class="col-performer">${L.headers.performer}</th>
        <th class="col-method">${L.headers.method}</th>
        <th class="col-product">${L.headers.product}</th>
        <th class="col-score" title="${L.score_tooltip}">${L.headers.score}</th>`;
  
  for (let i = 0; i < slotCount; i++) {
    if (isSundaySlot(freqKey, i)) continue;
    const cls = (i === currentSlot) ? currentClass : '';
    html += `<th class="check-col-header ${cls}">${esc(slotLabels[i])}</th>`;
  }
  html += `</tr></thead><tbody>`;
  
  tasks.forEach(t => {
    let anyChecked = false;
    for (let i = 0; i < slotCount; i++) if (isChecked(freqKey, t.id, i)) { anyChecked = true; break; }
    const isSel = isTaskSelected(t.id);
    const overdue = isTaskOverdue(t);
    const areaMeta = getAreaMeta(t.ruimte);
    html += `<tr class="${anyChecked ? 'task-done' : ''} ${isSel ? 'row-selected' : ''} ${overdue ? 'task-overdue' : ''}" data-task-id="${t.id}" style="--area-color: ${areaMeta.color};">
      ${state.editUnlocked ? `<td class="col-bulk-select"><div class="bulk-select-cb ${isSel ? 'checked' : ''}" onclick="toggleTaskSelection('${t.id}')" title="${L.bulk_select_row}"></div></td>` : ''}
      <td>
        <span class="row-num">${t.row}</span>
        ${state.editUnlocked || t.custom ? `<div class="row-actions">
          ${state.editUnlocked ? `<button class="row-edit-btn" onclick="openEditTaskModal('${t.id}')" title="${L.edit_task_tooltip}">✏️</button>` : ''}
          ${t.custom ? `<button class="row-delete-btn" onclick="deleteCustomTask('${t.id}')" title="${L.delete_task_tooltip}">🗑</button>` : ''}
        </div>` : ''}
      </td>
      <td>
        <div class="loc-area-row">
          <span class="area-badge" style="--area-color: ${areaMeta.color};"><span class="area-icon" aria-hidden="true">${areaMeta.icon}</span>${esc(tr(t.ruimte))}</span>
          ${t.edited ? `<span class="edited-badge" title="${L.edited_tooltip}">${L.edited_label}</span>` : ''}
          ${overdue ? `<span class="overdue-badge" title="${L.overdue_tooltip}" aria-label="${L.overdue_label}">⚠</span>` : ''}
        </div>
        ${t.werkplek ? `<div class="loc-werkplek">${esc(tr(t.werkplek))}</div>` : ''}
      </td>
      <td>
        <div class="task-title">
          ${esc(trOnderdeel(t))}
          ${t.imageUrl ? `<button class="task-image-btn" data-image-url="${esc(t.imageUrl)}" data-image-caption="${esc(trOnderdeel(t))}" data-task-id="${esc(t.id)}" title="${L.image_view_tooltip}" aria-label="${L.image_view_tooltip}">📷</button>` : ''}
        </div>
        ${t.subcat ? `<div class="task-desc">${esc(trSubcat(t))}</div>` : ''}
        ${t.vervuiling ? `<div class="task-sub">🔹 ${esc(tr(t.vervuiling))}</div>` : ''}
        ${t.wanneer ? `<div class="task-sub">⏱ ${esc(tr(t.wanneer))}</div>` : ''}
      </td>
      <td>${t.uitvoerend ? `<span class="performer-badge ${t.uitvoerend.toLowerCase().includes('operator')?'operator':t.uitvoerend.toLowerCase().includes('extern')||t.uitvoerend.toLowerCase().includes('externe')?'extern':''}">${esc(tr(t.uitvoerend))}</span>` : ''}</td>
      <td><span style="font-size:12px;">${esc(tr(t.methode) || '')}</span></td>
      <td>${renderProductLink(t.middel)}${renderPbmIcons(t)}</td>
      <td>${renderScoreCell(t)}</td>`;
    for (let i = 0; i < slotCount; i++) {
      if (isSundaySlot(freqKey, i)) continue;
      const checked = isChecked(freqKey, t.id, i);
      const isCurrent = (i === currentSlot);
      // Afvink-tooltip (wie/wanneer afgevinkt + correctie-info) is bewust
      // verwijderd van de check-box; de bijbehorende berekening (meta/tooltip/
      // extraTip/finalTip) is hier weggehaald. `corrected` blijft nodig voor
      // de visuele 'corrected'-markering op de check-box.
      const corrected = isCorrection(freqKey, t.id, i);
      // Note button: shown when checked. 💬 with filled colour when a note
      // exists, a muted + icon when none. Allows any user to annotate why
      // something was done differently, partially, or with caveats.
      const note = checked ? getCheckNote(freqKey, t.id, i) : null;
      const noteBtn = checked
        ? `<button class="check-note-btn ${note ? 'has-note' : ''}"
             data-freq="${freqKey}" data-task="${t.id}" data-slot="${i}"
             title="${note ? esc(L.note_edit_tooltip + ': ' + note) : esc(L.note_add_tooltip)}"
             aria-label="${note ? esc(L.note_edit_tooltip) : esc(L.note_add_tooltip)}">
             ${note ? '💬' : '<span class="check-note-plus">+</span>'}
           </button>`
        : '';
      html += `<td class="check-cell ${isCurrent ? 'check-col-group first' : 'check-col-group'}">
        <div class="check-cell-inner">
          <div class="check-box ${checked ? 'checked' : ''} ${corrected ? 'corrected' : ''}" 
               data-freq="${freqKey}" data-task="${t.id}" data-slot="${i}"
               role="checkbox" aria-checked="${checked}" tabindex="0"></div>
          ${noteBtn}
        </div>
      </td>`;
    }
    html += `</tr>`;
  });
  html += `</tbody></table></div>`;
  // Append a mobile-only card view. CSS hides the table on small screens
  // and shows the cards instead. Renders the same data but optimized for
  // touch and narrow viewports — one card per task with large checkboxes.
  html += renderTaskCardsMobile(tasks, freqKey, slotCount, slotLabels, currentSlot);
  return html;
}

// Mobile-friendly card view of the same task data. Activated on viewports
// narrower than 720px via CSS. Bigger touch targets, no horizontal scroll.
function renderTaskCardsMobile(tasks, freqKey, slotCount, slotLabels, currentSlot) {
  const L = T[state.lang];
  let html = '<div class="task-cards-wrapper">';
  tasks.forEach(t => {
    let anyChecked = false;
    for (let i = 0; i < slotCount; i++) if (isChecked(freqKey, t.id, i)) { anyChecked = true; break; }
    const overdue = isTaskOverdue(t);
    const v = parseFloat(t.vscore) || 0;
    const z = parseFloat(t.zscore) || 0;
    const a = parseFloat(t.afstand) || 0;
    const score = v * z * a;
    let scoreTier = '';
    if (score >= 25) scoreTier = 'high';
    else if (score >= 10) scoreTier = 'med';
    else if (score > 0) scoreTier = 'low';
    const cardAreaMeta = getAreaMeta(t.ruimte);
    html += `<div class="task-card ${anyChecked ? 'task-done' : ''} ${overdue ? 'task-overdue' : ''}" data-task-id="${t.id}" style="--area-color: ${cardAreaMeta.color};">
      <div class="task-card-header">
        <div class="task-card-num">#${t.row}</div>
        <div class="task-card-titles">
          <div class="task-card-location"><span class="area-icon" aria-hidden="true">${cardAreaMeta.icon}</span>${esc(tr(t.ruimte) || '')}${t.werkplek ? ' · ' + esc(tr(t.werkplek)) : ''}${overdue ? ` <span class="overdue-badge" title="${L.overdue_tooltip}" aria-label="${L.overdue_label}">⚠</span>` : ''}</div>
          <div class="task-card-task">
            ${esc(trOnderdeel(t) || '')}${t.subcat ? ' — ' + esc(trSubcat(t)) : ''}
            ${t.imageUrl ? `<button class="task-image-btn" data-image-url="${esc(t.imageUrl)}" data-image-caption="${esc(trOnderdeel(t))}" data-task-id="${esc(t.id)}" title="${L.image_view_tooltip}" aria-label="${L.image_view_tooltip}">📷</button>` : ''}
          </div>
        </div>
        ${score > 0 ? `<div class="task-card-score score-${scoreTier}">${score}</div>` : ''}
        ${(state.editUnlocked || t.custom) ? `<div class="task-card-actions">
          ${state.editUnlocked ? `<button class="card-edit-btn" onclick="openEditTaskModal('${t.id}')" title="${L.edit_task_tooltip}" aria-label="${L.edit_task_tooltip}">✏️</button>` : ''}
          ${t.custom ? `<button class="card-delete-btn" onclick="deleteCustomTask('${t.id}')" title="${L.delete_task_tooltip}" aria-label="${L.delete_task_tooltip}">🗑</button>` : ''}
        </div>` : ''}
      </div>
      <div class="task-card-meta">
        ${t.uitvoerend ? `<span class="task-card-tag">👤 ${esc(tr(t.uitvoerend))}</span>` : ''}
        ${t.methode ? `<span class="task-card-tag">⚙ ${esc(tr(t.methode))}</span>` : ''}
        ${t.middel ? `<span class="task-card-tag task-card-product" onclick="openMsds('${esc(t.middel).replace(/'/g, "\\'")}')">🧪 ${esc(t.middel)}</span>` : ''}
      </div>
      <div class="task-card-checks">`;
    for (let i = 0; i < slotCount; i++) {
      if (isSundaySlot(freqKey, i)) continue;
      const checked = isChecked(freqKey, t.id, i);
      const corrected = isCorrection(freqKey, t.id, i);
      const isCurrent = (i === currentSlot);
      const cardNote = checked ? getCheckNote(freqKey, t.id, i) : null;
      html += `<div class="task-card-check-wrap">
        <div class="task-card-check ${checked ? 'checked' : ''} ${corrected ? 'corrected' : ''} ${isCurrent ? 'current' : ''}"
          data-freq="${freqKey}" data-task="${t.id}" data-slot="${i}"
          role="checkbox" aria-checked="${checked}" tabindex="0">
          <span class="check-icon">${checked ? '✓' : ''}</span>
          <span class="check-label">${esc(slotLabels[i])}</span>
        </div>
        ${checked ? `<button class="check-note-btn card-note-btn ${cardNote ? 'has-note' : ''}"
          data-freq="${freqKey}" data-task="${t.id}" data-slot="${i}"
          title="${cardNote ? esc(L.note_edit_tooltip) : esc(L.note_add_tooltip)}"
          aria-label="${cardNote ? esc(L.note_edit_tooltip) : esc(L.note_add_tooltip)}">
          ${cardNote ? '💬' : '<span class="check-note-plus">+</span>'}
        </button>` : ''}
        ${cardNote ? `<div class="card-note-preview" title="${esc(cardNote)}">${esc(cardNote.length > 40 ? cardNote.slice(0, 40) + '…' : cardNote)}</div>` : ''}
      </div>`;
    }
    html += `</div></div>`;
  });
  html += '</div>';
  return html;
}

function renderProductLink(middel) {
  if (!middel) return `<span style="color:#94a3b8; font-size:12px;">${T[state.lang].no_product}</span>`;
  const L = T[state.lang];
  const product = DATA.products.find(p => p.name && p.name.toLowerCase() === middel.toLowerCase());
  // Clickable when there's product info, or a supplier MSDS link, or the
  // current user is an admin (so they can add a link for tools that aren't
  // formally in DATA.products).
  const hasMsdsLink = !!(state.msdsLinks && state.msdsLinks[msdsKey(middel)]);
  const local = !state.authUser;
  const admin = local || isAdmin();
  const clickable = !!product || hasMsdsLink || admin;
  const cls = clickable ? 'product-link' : 'product-link no-msds';
  const onclick = clickable ? `onclick="openMsds('${esc(middel).replace(/'/g, "\\'")}')"` : '';
  const tooltip = product ? 'MSDS' : hasMsdsLink ? L.msds_open_link : admin ? L.msds_link_add : L.no_msds;
  return `<span class="${cls}" ${onclick} title="${esc(tooltip)}">${esc(middel)}${clickable?' ℹ':''}</span>`;
}

// Render small inline PPE/PBM icons next to the product name based on the
// product's hazard profile and the task's risk score. Returns an empty string
// when no protective equipment is needed (e.g. tools like "Vochtige doek").
function renderPbmIcons(task) {
  if (!task) return '';
  const L = T[state.lang];
  const product = DATA.products.find(p => p.name && task.middel &&
    p.name.toLowerCase() === task.middel.toLowerCase());
  const icons = [];
  // Heuristic mapping: hazard keywords → recommended PPE.
  // Note: safety-glasses (🥽) icon is intentionally not included anywhere —
  // not used by the cleaning department, so showing it would be misleading.
  if (product) {
    const hazards = inferHazards(product);
    const text = ((product.beschrijving || '') + ' ' + (product.toepassing || '') +
                  ' ' + (product.opmerking || '')).toLowerCase();
    // Gloves for any chemical product
    icons.push({ icon: '🧤', label: L.pbm_gloves });
    // Mask for vapours / dust / disinfectant
    if (hazards.some(h => /vapor|damp|stof|dust/i.test(h)) ||
        /desinfect|stof|dust|damp|vapor/i.test(text)) {
      icons.push({ icon: '😷', label: L.pbm_mask });
    }
  }
  // High-risk tasks always need a mask regardless of product
  const v = parseFloat(task.vscore) || 0;
  const z = parseFloat(task.zscore) || 0;
  const a = parseFloat(task.afstand) || 0;
  const score = v * z * a;
  if (score >= 25) {
    if (!icons.find(i => i.icon === '😷')) icons.push({ icon: '😷', label: L.pbm_mask });
  }
  if (icons.length === 0) return '';
  return '<div class="pbm-icons">' + icons.map(i =>
    `<span class="pbm-icon" title="${esc(i.label)}">${i.icon}</span>`
  ).join('') + '</div>';
}

function renderScoreCell(t) {
  const L = T[state.lang];
  const v = t.vscore, z = t.zscore, a = t.afstand;
  // Numeric score only when all three are numeric
  const vn = (typeof v === 'number') ? v : parseFloat(v);
  const zn = (typeof z === 'number') ? z : parseFloat(z);
  const an = (typeof a === 'number') ? a : parseFloat(a);
  const hasAll = !isNaN(vn) && !isNaN(zn) && !isNaN(an);
  if (!hasAll) {
    return `<span class="score-cell empty">—</span>`;
  }
  const score = vn * zn * an;
  // Color based on risk tier: low (green) ≤ 9, medium (amber) 10-24, high (red) ≥ 25
  let tier = 'low';
  if (score >= 25) tier = 'high';
  else if (score >= 10) tier = 'med';
  const fmt = (x) => Number.isInteger(x) ? x : x.toString().replace('.', ',');
  const tooltip = `${L.score_v}: ${fmt(vn)} × ${L.score_z}: ${fmt(zn)} × ${L.score_a}: ${fmt(an)} = ${fmt(score)}`;
  return `<div class="score-cell score-${tier}" title="${tooltip}">
    <div class="score-value">${fmt(score)}</div>
    <div class="score-breakdown">${fmt(vn)}·${fmt(zn)}·${fmt(an)}</div>
  </div>`;
}

function wireCheckboxes() {
  document.querySelectorAll('.check-box').forEach(el => {
    const handler = () => {
      const freq = el.dataset.freq;
      const task = el.dataset.task;
      const slot = parseInt(el.dataset.slot);
      toggleCheck(freq, task, slot);
      const isNowChecked = isChecked(freq, task, slot);
      el.classList.toggle('checked', isNowChecked);
      el.setAttribute('aria-checked', isNowChecked);
      // Trigger the bounce/flash animation by toggling a one-shot class.
      // Removing the class first forces a reflow so the same animation can
      // run twice in a row (e.g. user double-clicks to toggle off then on).
      const animClass = isNowChecked ? 'just-checked' : 'just-unchecked';
      el.classList.remove('just-checked', 'just-unchecked');
      void el.offsetWidth; // force reflow
      el.classList.add(animClass);
      setTimeout(() => el.classList.remove(animClass), 600);
      const row = el.closest('tr');
      if (row) {
        let anyChecked = false;
        row.querySelectorAll('.check-box').forEach(cb => {
          if (cb.classList.contains('checked')) anyChecked = true;
        });
        row.classList.toggle('task-done', anyChecked);
      }
      // Surgically update just this tab's progress bars — no full re-render,
      // so the sticky tabs row doesn't flash.
      updateTabProgress(freq);
      // Same idea for overdue indicators: refresh the per-row badge and the
      // global count chip without a full renderApp.
      updateOverdueStatus(task);
      // Check if the "all done!" hero banner should appear or disappear now.
      // Done surgically — inject/remove only the hero div, never re-render the table.
      updateHeroBanner(freq);
      // Today-view: als we daar zijn, fade kaart uit en update group/header.
      // No-op wanneer #today-view niet in de DOM staat.
      updateTodayAfterCheck(task);
      // Pre-seed the cloud-listener's diff signature with our just-applied
      // state. When Firestore echoes our write back via the snapshot listener,
      // the signature will match and the listener will skip its renderApp() —
      // preventing the visible page flash that used to follow each toggle.
      if (typeof stableStringify === 'function') {
        lastRenderedChecksSig = stableStringify(state.checks);
      }
    };
    el.onclick = handler;
    el.onkeydown = (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handler(); }
    };
  });
  // Mobile card checks — same logic, different DOM nesting
  document.querySelectorAll('.task-card-check').forEach(el => {
    const handler = () => {
      const freq = el.dataset.freq;
      const task = el.dataset.task;
      const slot = parseInt(el.dataset.slot);
      toggleCheck(freq, task, slot);
      const isNowChecked = isChecked(freq, task, slot);
      el.classList.toggle('checked', isNowChecked);
      el.setAttribute('aria-checked', isNowChecked);
      const iconEl = el.querySelector('.check-icon');
      if (iconEl) iconEl.textContent = isNowChecked ? '✓' : '';
      // Bounce/flash animation — same logic as table checkboxes
      const animClass = isNowChecked ? 'just-checked' : 'just-unchecked';
      el.classList.remove('just-checked', 'just-unchecked');
      void el.offsetWidth;
      el.classList.add(animClass);
      setTimeout(() => el.classList.remove(animClass), 600);
      const card = el.closest('.task-card');
      if (card) {
        let anyChecked = false;
        card.querySelectorAll('.task-card-check').forEach(cb => {
          if (cb.classList.contains('checked')) anyChecked = true;
        });
        card.classList.toggle('task-done', anyChecked);
      }
      // Surgically update just this tab's progress bars — no full re-render,
      // so the sticky tabs row doesn't flash.
      updateTabProgress(freq);
      // Refresh overdue indicators (badge + global count) for this task only.
      updateOverdueStatus(task);
      // Inject/remove the "all done!" hero banner without re-rendering the table.
      updateHeroBanner(freq);
      // Pre-seed the cloud-listener's diff signature — see the matching
      // comment in the table handler above.
      if (typeof stableStringify === 'function') {
        lastRenderedChecksSig = stableStringify(state.checks);
      }
    };
    el.onclick = handler;
    el.onkeydown = (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handler(); }
    };
  });
}

// Holds the frequency key that's waiting for reset confirmation.
// Populated when resetCurrentPeriod opens the modal, consumed by confirmReset.
let __pendingResetFreq = null;

function resetCurrentPeriod() {
  const L = T[state.lang];
  const freqKey = state.activeTab;
  if (freqKey === 'changelog') return;
  const key = getStoragePeriodKey(freqKey);
  const periodStore = (state.checks[freqKey] && state.checks[freqKey][key]) || {};
  
  // Count what would be lost
  let checkCount = 0;
  let taskCount = 0;
  for (const tid in periodStore) {
    let any = false;
    for (const slot in periodStore[tid]) {
      if (periodStore[tid][slot]) { checkCount++; any = true; }
    }
    if (any) taskCount++;
  }
  
  // If there's nothing to reset, don't bother the user with a modal
  if (checkCount === 0) {
    showToast(L.reset_nothing_to_reset, 'success');
    return;
  }
  
  __pendingResetFreq = freqKey;
  
  const tabLabels = {
    daily: L.tabs.daily, weekly: L.tabs.weekly, monthly: L.tabs.monthly,
    quarterly: L.tabs.quarterly, semiannual: L.tabs.semiannual,
    annual: L.tabs.annual, bimonthly: L.tabs.bimonthly
  };
  
  document.getElementById('reset-modal-title').textContent = '⚠ ' + L.reset_modal_title;
  document.getElementById('reset-modal-subtitle').textContent = L.reset_modal_subtitle;
  document.getElementById('btn-reset-cancel').textContent = L.form_btn_cancel;
  document.getElementById('btn-reset-confirm').innerHTML = '🗑 ' + L.reset_confirm_btn;
  
  const body = document.getElementById('reset-modal-body');
  body.innerHTML = `
    <div class="reset-warning-box">
      <div class="reset-warning-icon">⚠</div>
      <div class="reset-warning-text">
        <strong>${L.reset_warning_title}</strong>
        <p>${L.reset_warning_body}</p>
      </div>
    </div>
    <div class="reset-info-list">
      <div class="reset-info-row">
        <span class="reset-info-label">${L.reset_info_tab}</span>
        <span class="reset-info-value">${esc(tabLabels[freqKey] || '?')}</span>
      </div>
      <div class="reset-info-row">
        <span class="reset-info-label">${L.reset_info_period}</span>
        <span class="reset-info-value">${esc(getPeriodLabel(freqKey))}</span>
      </div>
      <div class="reset-info-row">
        <span class="reset-info-label">${L.reset_info_tasks}</span>
        <span class="reset-info-value reset-info-big">${taskCount}</span>
      </div>
      <div class="reset-info-row">
        <span class="reset-info-label">${L.reset_info_checks}</span>
        <span class="reset-info-value reset-info-big">${checkCount}</span>
      </div>
    </div>
    <div class="reset-final-warning">${L.reset_final_warning}</div>
  `;
  
  document.getElementById('reset-modal').classList.add('show');
}

function closeResetModal() {
  document.getElementById('reset-modal').classList.remove('show');
  __pendingResetFreq = null;
}

function confirmReset() {
  const L = T[state.lang];
  const freqKey = __pendingResetFreq;
  if (!freqKey) { closeResetModal(); return; }
  const key = getStoragePeriodKey(freqKey);
  // Snapshot the existing checks so the user can undo. We deep-copy because
  // saveState() may mutate or persist the live state.checks objects.
  let snapshot = null;
  if (state.checks[freqKey] && state.checks[freqKey][key]) {
    try { snapshot = JSON.parse(JSON.stringify(state.checks[freqKey][key])); }
    catch (e) { snapshot = null; }
    delete state.checks[freqKey][key];
    saveState();
  }
  closeResetModal();
  renderApp();
  // Show toast with Undo action — only when there was actually something to undo
  if (snapshot && Object.keys(snapshot).length > 0) {
    showToast(L.reset_done, 'success', {
      actionLabel: L.undo_label,
      onAction: () => {
        if (!state.checks[freqKey]) state.checks[freqKey] = {};
        state.checks[freqKey][key] = snapshot;
        saveState();
        renderApp();
        showToast(L.undo_restored, 'success');
      }
    });
  } else {
    showToast(L.reset_done, 'success');
  }
}

// =====================================================
// CHANGELOG VIEW
// =====================================================
function renderChangelogView() {
  const L = T[state.lang];
  const today = new Date().toISOString().split('T')[0];
  const customEntries = state.customChangelog || [];
  // Order: user-added entries first (newest on top — customChangelog uses unshift),
  // then built-in DATA.versions sorted newest-first by date.
  const sortedDataVersions = [...DATA.versions].sort((a, b) => {
    const da = (a.date || '').toString();
    const db = (b.date || '').toString();
    return db.localeCompare(da);
  });
  const allEntries = [...customEntries, ...sortedDataVersions];
  const pendingCount = pendingChangeCount();
  // Admin-gating: when the user is signed in but doesn't have admin rights,
  // they can VIEW the changelog but not commit pending changes, add entries,
  // or delete entries. In local-only mode (no auth) we keep the old behavior.
  const canEditChangelog = !state.authUser || isAdmin();
  
  return `<div class="main-content">
    <div class="changelog-view">
      ${(pendingCount > 0 && canEditChangelog) ? `<div class="period-info" style="background:#fff7ed; border-color:#fed7aa; color:#9a3412; margin-bottom: 16px;">
        <span>📝</span>
        <strong>${pendingCount} ${pendingCount === 1 ? L.update_pending_one : L.update_pending_many}</strong>
        <button class="btn" onclick="openUpdateModal()" style="background:#f97316; color:white; border-color:#ea580c; margin-left:auto; font-weight:600;">⟳ ${L.update_open_btn}</button>
      </div>` : ''}
      
      ${canEditChangelog ? `<div class="add-changelog">
        <h3>${L.changelog_add_title}</h3>
        <div class="form-row">
          <input type="text" id="cl-version" placeholder="${L.changelog_version}" maxlength="10">
          <input type="date" id="cl-date" value="${today}">
        </div>
        <textarea id="cl-desc" placeholder="${L.changelog_description}"></textarea>
        <button class="btn-green" onclick="addChangelogEntry()">${L.changelog_add_btn}</button>
      </div>` : `<div class="period-info" style="margin-bottom: 16px; background:#f8fafc;">
        <span>👁️</span>
        <span style="color:#475569;">${L.changelog_readonly_notice}</span>
      </div>`}
      <h2 style="color:#1d5b42; margin-bottom: 14px; font-size: 18px;">${L.changelog_title}</h2>
      ${allEntries.map((v, idx) => {
        const isCustom = customEntries.includes(v);
        const customIdx = customEntries.indexOf(v);
        const dateStr = v.date ? formatDate(v.date) : '';
        const isAuto = !!v.auto;
        return `<div class="version-entry ${isAuto ? 'auto-entry' : ''}">
          <div class="version-header">
            <h3>${esc(v.version)}${isAuto ? `<span class="auto-badge">${L.auto_label}</span>` : ''}</h3>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              ${v.author ? `<span class="version-author">👤 ${esc(v.author)}</span>` : ''}
              <span class="version-date">${dateStr}</span>
              ${(isCustom && canEditChangelog) ? `<button class="btn-delete" onclick="deleteChangelogEntry(${customIdx})">🗑 ${L.changelog_delete}</button>` : ''}
            </div>
          </div>
          ${renderVersionChanges(v)}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function renderVersionChanges(v) {
  const L = T[state.lang];
  const changes = v.changes || [];
  if (changes.length === 0) return '';
  
  // Detect if this version uses structured changes (objects) or legacy (strings)
  const isStructured = changes.some(c => typeof c === 'object' && c !== null);
  
  if (!isStructured) {
    // Legacy: plain string list
    return `<ul class="version-changes">
      ${changes.map(c => `<li>${esc(c)}</li>`).join('')}
    </ul>`;
  }
  
  const FIELD_LABELS = {
    ruimte: L.form_ruimte, werkplek: L.form_werkplek, onderdeel: L.form_onderdeel,
    subcat: L.form_subcat, uitvoerend: L.form_uitvoerend,
    vervuiling: L.form_vervuiling, wanneer: L.form_wanneer,
    freq: L.form_freq, methode: L.form_methode, middel: L.form_middel,
    vscore: L.score_v_full, zscore: L.score_z_full, afstand: L.score_a_full
  };
  
  return `<ul class="structured-changes">
    ${changes.map(c => {
      if (typeof c === 'string') {
        return `<li class="ch-note"><div class="ch-body">${esc(c)}</div></li>`;
      }
      if (c.type === 'note') {
        return `<li class="ch-note"><div class="ch-body">💬 ${esc(c.text || '')}</div></li>`;
      }
      if (c.type === 'add') {
        return `<li class="ch-add">
          <span class="change-badge badge-add">➕ ${L.change_type_add}</span>
          <div class="ch-body">
            <strong>${esc(c.summary || '')}</strong>
            ${c.freq ? `<div class="ch-meta">⏱ ${esc(c.freq)}</div>` : ''}
          </div>
        </li>`;
      }
      if (c.type === 'edit') {
        const diffHtml = (c.diffs || []).map(d => `
          <li>
            <strong>${esc(FIELD_LABELS[d.field] || d.field)}:</strong>
            <span class="diff-old">${esc(d.old || '—')}</span>
            <span class="diff-arrow">→</span>
            <span class="diff-new">${esc(d.new || '—')}</span>
          </li>
        `).join('');
        return `<li class="ch-edit">
          <span class="change-badge badge-edit">✏️ ${L.change_type_edit}</span>
          <div class="ch-body">
            <strong>${esc(c.summary || '')}</strong>
            ${diffHtml ? `<ul class="diff-list">${diffHtml}</ul>` : ''}
          </div>
        </li>`;
      }
      if (c.type === 'delete') {
        return `<li class="ch-delete">
          <span class="change-badge badge-delete">🗑 ${L.change_type_delete}</span>
          <div class="ch-body">
            <strong style="text-decoration: line-through;">${esc(c.summary || '')}</strong>
            ${c.freq ? `<div class="ch-meta">⏱ ${esc(c.freq)}</div>` : ''}
          </div>
        </li>`;
      }
      return '';
    }).join('')}
  </ul>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(getDateLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

function addChangelogEntry() {
  const L = T[state.lang];
  // Defense-in-depth: even though the UI hides this for non-admins, also
  // refuse the action if it gets called via console / DevTools. The Firestore
  // security rules are the final authority but bouncing here gives a friendly
  // error instead of an unhelpful "permission denied".
  if (state.authUser && !isAdmin()) {
    showToast(L.role_denied_admin_required, 'error');
    return;
  }
  const ver = document.getElementById('cl-version').value.trim();
  const date = document.getElementById('cl-date').value;
  const desc = document.getElementById('cl-desc').value.trim();
  if (!ver || !desc) {
    showToast(state.lang==='nl'?'Versie en beschrijving zijn verplicht':'Version and description are required','error');
    return;
  }
  const lines = desc.split('\n').map(s=>s.trim()).filter(Boolean);
  state.customChangelog.unshift({ version: ver, date: date, changes: lines });
  saveState();
  document.getElementById('cl-version').value = '';
  document.getElementById('cl-desc').value = '';
  renderContent();
  showToast(L.changelog_add_success, 'success');
}

function deleteChangelogEntry(idx) {
  const L = T[state.lang];
  if (state.authUser && !isAdmin()) {
    showToast(L.role_denied_admin_required, 'error');
    return;
  }
  if (!confirm(L.changelog_delete_confirm)) return;
  state.customChangelog.splice(idx, 1);
  saveState();
  renderContent();
}

// =====================================================
// ADD / EDIT / DELETE TASK
// =====================================================
function updateScorePreview() {
  const v = parseFloat(document.getElementById('add-vscore').value);
  const z = parseFloat(document.getElementById('add-zscore').value);
  const a = parseFloat(document.getElementById('add-afstand').value);
  const display = document.getElementById('add-score-display');
  if (!display) return;
  if (!isNaN(v) && !isNaN(z) && !isNaN(a)) {
    const s = v * z * a;
    display.textContent = Number.isInteger(s) ? s : s.toFixed(1).replace('.0', '');
    display.classList.remove('empty');
  } else {
    display.textContent = '—';
    display.classList.add('empty');
  }
}

// Fill each of the three score <select> elements with labelled options.
// If a task already has a non-standard value (e.g. 1.5 or "Handmatig" from
// legacy data), that value is prepended so editing doesn't silently lose it.
function populateScoreDropdowns(editTask) {
  const L = T[state.lang];
  ['vscore', 'zscore', 'afstand'].forEach(field => {
    const sel = document.getElementById('add-' + field);
    if (!sel) return;
    const levels = L.score_levels[field] || [];
    const currentVal = (editTask && editTask[field] != null && editTask[field] !== '') ? String(editTask[field]) : '';
    const standardValues = levels.map(l => String(l.v));
    let html = `<option value="">${esc(L.score_level_empty)}</option>`;
    // Preserve existing non-standard value (e.g. 1.5 from legacy data)
    if (currentVal && !standardValues.includes(currentVal)) {
      html += `<option value="${esc(currentVal)}">${esc(currentVal)} (${L.score_legacy_marker})</option>`;
    }
    levels.forEach(l => {
      html += `<option value="${l.v}">${l.v} — ${esc(l.label)}</option>`;
    });
    sel.innerHTML = html;
    sel.value = currentVal;
  });
  updateScorePreview();
}

function toggleScoreInfo() {
  const panel = document.getElementById('score-info-panel');
  const btn = document.getElementById('score-info-btn');
  if (!panel || !btn) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  btn.classList.toggle('info-btn-active', !isOpen);
}

function openAddTaskModal(editTask) {
  const L = T[state.lang];
  const isEdit = !!editTask;
  
  // Update labels / placeholders for current language
  document.getElementById('add-task-title').textContent = isEdit ? L.edit_task_title : L.add_task_title;
  document.getElementById('add-task-subtitle').textContent = isEdit ? L.edit_task_subtitle : L.add_task_subtitle;
  document.getElementById('lbl-add-ruimte').innerHTML = L.form_ruimte + ' <span class="required">*</span>';
  document.getElementById('lbl-add-werkplek').textContent = L.form_werkplek;
  document.getElementById('lbl-add-onderdeel').innerHTML = L.form_onderdeel + ' <span class="required">*</span>';
  document.getElementById('lbl-add-subcat').innerHTML = L.form_subcat + ' <span class="required">*</span>';
  // Optional EN-translation labels — added so users can fill in an English
  // version when creating/editing a task. Empty values fall back to the NL
  // text via trOnderdeel/trSubcat at render time.
  const lblOndEn = document.getElementById('lbl-add-onderdeel-en');
  const lblSubEn = document.getElementById('lbl-add-subcat-en');
  if (lblOndEn) lblOndEn.innerHTML = L.form_onderdeel_en + ' <span class="optional-hint">' + L.form_optional_hint + '</span>';
  if (lblSubEn) lblSubEn.innerHTML = L.form_subcat_en + ' <span class="optional-hint">' + L.form_optional_hint + '</span>';
  // Image-upload field labels (admins only — visibility handled in setupTaskImageField)
  const lblImage = document.getElementById('lbl-add-image');
  if (lblImage) lblImage.innerHTML = L.image_label + ' <span class="optional-hint">' + L.image_label_hint + '</span>';
  const pickBtn = document.getElementById('add-image-pick-btn');
  if (pickBtn) pickBtn.textContent = L.image_pick;
  const clearBtn = document.getElementById('add-image-clear-btn');
  if (clearBtn) clearBtn.textContent = L.image_clear;
  document.getElementById('lbl-add-uitvoerend').textContent = L.form_uitvoerend;
  document.getElementById('lbl-add-vervuiling').textContent = L.form_vervuiling;
  document.getElementById('lbl-add-wanneer').textContent = L.form_wanneer;
  // Toegewezen-aan label + placeholder + datalist (PUNT 10)
  const lblAssign = document.getElementById('lbl-add-assigned-user');
  if (lblAssign) {
    lblAssign.innerHTML = L.assigned_user_label + ' <span class="optional-hint">' + (L.optional_hint || 'optioneel') + '</span>';
  }
  const inpAssign = document.getElementById('add-assigned-user');
  if (inpAssign) inpAssign.placeholder = L.assigned_user_placeholder || (state.lang === 'en' ? 'name — empty = anyone' : 'naam — leeg = iedereen');
  // Vul datalist met bekende namen: huidige user + alle toegewezen-namen die
  // al in DATA voorkomen + alle email-prefixes uit state.allUsers (indien
  // beschikbaar als superuser). Dedupliceren en sorteren.
  const datalist = document.getElementById('known-users-datalist');
  if (datalist) {
    const knownNames = new Set();
    if (state.currentUser) knownNames.add(state.currentUser);
    getAllTasks().forEach(t => { if (t.assigned_user_id) knownNames.add(String(t.assigned_user_id)); });
    Object.values(state.allUsers || {}).forEach(u => {
      if (u && u.email) {
        const name = String(u.email).split('@')[0];
        knownNames.add(name);
      }
    });
    datalist.innerHTML = [...knownNames].sort().map(n => `<option value="${esc(n)}">`).join('');
  }
  document.getElementById('lbl-add-freq').innerHTML = L.form_freq + ' <span class="required">*</span>';
  document.getElementById('lbl-add-methode').innerHTML = L.form_methode + ' <span class="required">*</span>';
  document.getElementById('lbl-add-middel').textContent = L.form_middel;
  document.getElementById('lbl-add-scores').textContent = L.form_scores;
  document.getElementById('lbl-add-vscore').textContent = L.score_v;
  document.getElementById('lbl-add-zscore').textContent = L.score_z;
  document.getElementById('lbl-add-afstand').textContent = L.score_a;
  document.getElementById('lbl-add-scoretotal').textContent = L.score_total_label;
  document.getElementById('hint-scores').textContent = L.form_hint_scores;
  document.getElementById('info-v-title').textContent = L.score_v_full;
  document.getElementById('info-v-text').textContent = L.info_v_text;
  document.getElementById('info-z-title').textContent = L.score_z_full;
  document.getElementById('info-z-text').textContent = L.info_z_text;
  document.getElementById('info-a-title').textContent = L.score_a_full;
  document.getElementById('info-a-text').textContent = L.info_a_text;
  document.getElementById('info-formula').textContent = L.info_formula;
  document.getElementById('score-info-btn').title = L.info_btn_tooltip;
  // Start with info panel collapsed each time modal opens
  const infoPanel = document.getElementById('score-info-panel');
  const infoBtn = document.getElementById('score-info-btn');
  if (infoPanel) infoPanel.style.display = 'none';
  if (infoBtn) infoBtn.classList.remove('info-btn-active');
  document.getElementById('hint-methode').textContent = L.form_hint_methode;
  document.getElementById('hint-middel').textContent = L.form_hint_middel;
  document.getElementById('btn-cancel-task').textContent = L.form_btn_cancel;
  document.getElementById('btn-save-task').textContent = isEdit ? L.edit_btn_save : L.form_btn_save;
  document.getElementById('add-vervuiling').placeholder = L.form_placeholder_vervuiling;
  document.getElementById('add-wanneer').placeholder = L.form_placeholder_wanneer;
  
  // Populate datalists with existing values (for auto-complete)
  const ruimtes = [...new Set(getAllTasks().map(t => t.ruimte).filter(Boolean))].sort();
  const werkplekken = [...new Set(getAllTasks().map(t => t.werkplek).filter(Boolean))].sort();
  document.getElementById('suggest-ruimtes').innerHTML = ruimtes.map(r => `<option value="${esc(r)}">`).join('');
  document.getElementById('suggest-werkplek').innerHTML = werkplekken.map(w => `<option value="${esc(w)}">`).join('');
  
  // Populate Methode dropdown (from Methodieken). Also add any current value not in list
  // so that legacy tasks with methods like "Handmatige desinfectie" still display correctly.
  const methodeSel = document.getElementById('add-methode');
  const methodNames = DATA.methods.map(m => m.name);
  let methodOpts = DATA.methods.map(m => `<option value="${esc(m.name)}">${esc(m.code)} · ${esc(m.name)}</option>`);
  if (isEdit && editTask.methode && !methodNames.includes(editTask.methode)) {
    methodOpts.unshift(`<option value="${esc(editTask.methode)}">${esc(editTask.methode)} (bestaand)</option>`);
  }
  methodeSel.innerHTML = methodOpts.join('');
  
  // Populate Middel dropdown (from Middelen, plus common tools, plus none)
  const extraTools = ['Bezemmateriaal', 'Vochtige doek', 'Droge doek', 'Stofzuiger', 'Luchtdruk', 'Krabber', 'Water', 'NVT'];
  const middelSel = document.getElementById('add-middel');
  const opts = [`<option value="">${L.form_middel_none}</option>`];
  DATA.products.forEach(p => {
    if (p.name) opts.push(`<option value="${esc(p.name)}">${esc(p.name)}</option>`);
  });
  extraTools.forEach(t => opts.push(`<option value="${esc(t)}">${esc(t)}</option>`));
  // Ensure current middel is available in list
  if (isEdit && editTask.middel) {
    const exists = DATA.products.some(p => p.name === editTask.middel) || extraTools.includes(editTask.middel);
    if (!exists) {
      opts.splice(1, 0, `<option value="${esc(editTask.middel)}">${esc(editTask.middel)} (bestaand)</option>`);
    }
  }
  middelSel.innerHTML = opts.join('');
  
  if (isEdit) {
    // Pre-fill fields from the task being edited
    document.getElementById('add-ruimte').value = editTask.ruimte || '';
    document.getElementById('add-werkplek').value = editTask.werkplek || '';
    document.getElementById('add-onderdeel').value = editTask.onderdeel || '';
    document.getElementById('add-subcat').value = editTask.subcat || '';
    document.getElementById('add-uitvoerend').value = editTask.uitvoerend || '';
    document.getElementById('add-vervuiling').value = editTask.vervuiling || '';
    document.getElementById('add-wanneer').value = editTask.wanneer || '';
    const assignEl = document.getElementById('add-assigned-user');
    if (assignEl) assignEl.value = editTask.assigned_user_id || '';
    document.getElementById('add-freq').value = editTask.freq_key || 'daily';
    document.getElementById('add-methode').value = editTask.methode || '';
    document.getElementById('add-middel').value = editTask.middel || '';
    // Optional EN translations — empty if the task was added before this
    // feature existed, in which case the user can fill them in now.
    const onEnEl = document.getElementById('add-onderdeel-en');
    const subEnEl = document.getElementById('add-subcat-en');
    if (onEnEl) onEnEl.value = editTask.onderdeel_en || '';
    if (subEnEl) subEnEl.value = editTask.subcat_en || '';
    populateScoreDropdowns(editTask);
  } else {
    // Clear text fields (score dropdowns are handled by populateScoreDropdowns below)
    ['add-ruimte','add-werkplek','add-onderdeel','add-subcat','add-vervuiling','add-wanneer','add-onderdeel-en','add-subcat-en','add-assigned-user'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('add-uitvoerend').value = '';
    if (middelSel.options.length) middelSel.value = '';
    populateScoreDropdowns(null);
    
    // Preselect current tab's frequency
    const freqKeyToFreqText = {
      daily: 'daily', weekly: 'weekly', monthly: 'monthly',
      bimonthly: 'bimonthly', quarterly: 'quarterly',
      semiannual: 'semiannual', annual: 'annual'
    };
    if (state.activeTab !== 'changelog' && freqKeyToFreqText[state.activeTab]) {
      document.getElementById('add-freq').value = freqKeyToFreqText[state.activeTab];
    }
    state.editingTaskId = null;
  }
  // Image-upload field — only relevant for admins/superusers, hidden for
  // regular users. The pending image is held in state.pendingTaskImage and
  // committed (uploaded to Storage) when the user saves the task.
  setupTaskImageField(isEdit ? editTask : null);
  
  document.getElementById('add-task-modal').classList.add('show');
  updateScorePreview();
  setTimeout(() => document.getElementById('add-ruimte').focus(), 100);
}

function openEditTaskModal(taskId) {
  const L = T[state.lang];
  // Defense-in-depth — the edit button is normally only visible when unlocked,
  // but guard in case this function is called programmatically.
  if (!state.editUnlocked) {
    showToast(L.edit_locked_hint, 'error');
    return;
  }
  const task = getAllTasks().find(t => t.id === taskId);
  if (!task) return;
  state.editingTaskId = taskId;
  openAddTaskModal(task);
}

function toggleEditMode() {
  const L = T[state.lang];
  if (state.editUnlocked) {
    state.editUnlocked = false;
    showToast(L.edit_mode_locked, 'success');
    refreshAfterEditModeChange();
    return;
  }
  // If the user is signed into Firebase as admin/superuser, the role check
  // already proves they have edit rights — no need for a redundant password.
  // The password modal is only used in offline/local mode where there's no
  // Firebase identity to rely on.
  if (state.authUser && isAdmin()) {
    state.editUnlocked = true;
    showToast(L.edit_password_ok, 'success');
    refreshAfterEditModeChange();
    return;
  }
  // Local-mode fallback: ask for the legacy password
  openPasswordModal();
}

// Lightweight UI refresh after edit-mode is toggled. Avoids the full
// renderApp() that was previously called here — toggling edit-mode only
// affects a few specific UI surfaces (the edit banner, role-gated buttons,
// the bulk-action bar) so we update just those, preventing the visible
// page flash that a full re-render produces.
function refreshAfterEditModeChange() {
  updateEditModeBanner();
  applyRoleBasedVisibility();
  updateBulkActionBar();
  // Re-render the task view so per-row edit affordances (the pencil icon,
  // delete button) appear/disappear. We DON'T re-render the header, sidebar,
  // tabs or filter bar — none of them depend on editUnlocked at the structural
  // level (only via CSS that already responds to applyRoleBasedVisibility).
  const taskView = document.getElementById('task-view-container');
  if (taskView && state.activeTab !== 'changelog' && state.activeTab !== 'dashboard') {
    taskView.innerHTML = renderTaskView();
    wireCheckboxes();
  } else if (state.activeTab === 'changelog') {
    // Changelog view exposes editing-related controls; refresh just that pane.
    const c = document.getElementById('filters-and-content');
    if (c) c.innerHTML = renderChangelogView();
  }
  // Save state so the change persists across reloads.
  saveState();
}

// =====================================================
// PASSWORD MODAL — replaces browser prompt() for edit mode
// =====================================================

function openPasswordModal() {
  const L = T[state.lang];
  // Detect whether we're in a real browser DOM or a test-environment mock.
  // Test mocks create elements lazily via getElementById but they don't have
  // a real classList with _classes internal set — that's how we tell them apart.
  const modalEl = typeof document !== 'undefined' && document.getElementById
    ? document.getElementById('password-modal') : null;
  const hasRealDom = !!(modalEl &&
    modalEl.classList &&
    typeof modalEl.classList.contains === 'function' &&
    !modalEl.classList._classes); // _classes only exists on our fake mock els
  if (!hasRealDom) {
    // Legacy path used by automated tests (they inject via __promptQueue)
    const pwd = typeof prompt === 'function' ? prompt(L.edit_password_prompt) : null;
    if (pwd === null) return;
    if (pwd !== EDIT_PASSWORD) {
      showToast(L.edit_password_wrong, 'error');
      return;
    }
    state.editUnlocked = true;
    showToast(L.edit_password_ok, 'success');
    refreshAfterEditModeChange();
    return;
  }
  // Localize
  const titleEl = document.getElementById('password-modal-title');
  const subEl = document.getElementById('password-modal-subtitle');
  const labelEl = document.getElementById('password-modal-label');
  const cancelBtn = document.getElementById('password-cancel-btn');
  const submitBtn = document.getElementById('password-submit-btn');
  if (titleEl) titleEl.textContent = '🔒 ' + (L.password_modal_title || 'Wijzigen ontgrendelen');
  if (subEl) subEl.textContent = L.password_modal_subtitle || 'Voer het wachtwoord in om taken te kunnen bewerken';
  if (labelEl) labelEl.textContent = L.password_modal_label || 'Wachtwoord';
  if (cancelBtn) cancelBtn.textContent = L.cancel_btn || 'Annuleren';
  if (submitBtn) submitBtn.textContent = L.password_modal_submit || 'Ontgrendelen';
  // Reset state
  const input = document.getElementById('password-modal-input');
  const error = document.getElementById('password-modal-error');
  if (input) {
    input.value = '';
    input.type = 'password';
    input.classList.remove('error');
  }
  if (error) error.style.display = 'none';
  // Reset toggle button icon
  const toggleBtn = document.getElementById('password-toggle-btn');
  if (toggleBtn) toggleBtn.textContent = '👁';
  // Show
  const modal = document.getElementById('password-modal');
  if (modal) modal.classList.add('show');
  // Focus the input after a short delay (so the modal animation completes)
  setTimeout(() => {
    const inp = document.getElementById('password-modal-input');
    if (inp) inp.focus();
  }, 80);
}

function closePasswordModal() {
  const modal = document.getElementById('password-modal');
  if (modal) modal.classList.remove('show');
}

function submitPasswordModal() {
  const L = T[state.lang];
  const input = document.getElementById('password-modal-input');
  const error = document.getElementById('password-modal-error');
  if (!input) return;
  const pwd = input.value;
  if (!pwd) {
    // Shake + error for empty input
    input.classList.remove('error');
    void input.offsetWidth; // force reflow so animation restarts
    input.classList.add('error');
    if (error) {
      error.textContent = L.password_modal_empty || 'Voer een wachtwoord in';
      error.style.display = 'flex';
    }
    input.focus();
    return;
  }
  if (pwd !== EDIT_PASSWORD) {
    // Wrong password — shake animation + clear field
    input.classList.remove('error');
    void input.offsetWidth;
    input.classList.add('error');
    input.value = '';
    if (error) {
      error.textContent = L.edit_password_wrong || 'Onjuist wachtwoord';
      error.style.display = 'flex';
    }
    input.focus();
    return;
  }
  // Correct — unlock
  closePasswordModal();
  state.editUnlocked = true;
  showToast(L.edit_password_ok, 'success');
  refreshAfterEditModeChange();
}

function togglePasswordVisibility() {
  const input = document.getElementById('password-modal-input');
  const btn = document.getElementById('password-toggle-btn');
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  if (btn) btn.textContent = isHidden ? '🙈' : '👁';
  input.focus();
}

// =====================================================
// UPDATE MODAL — commits pending changes to the changelog
// =====================================================
function openUpdateModal() {
  const L = T[state.lang];
  const changes = state.pendingChanges || {};
  const count = Object.keys(changes).length;
  
  // Always reset footer to default state (in case it was in warning state)
  const footer = document.getElementById('update-modal-footer');
  footer.classList.remove('is-warning');
  footer.innerHTML = `
    <button class="btn-cancel" onclick="cancelUpdate()" id="btn-cancel-update">${L.form_btn_cancel}</button>
    <button class="btn-save" onclick="commitUpdate()" id="btn-commit-update">${L.update_commit_btn}</button>
  `;
  
  document.getElementById('update-modal-title').textContent = L.update_modal_title;
  document.getElementById('update-modal-subtitle').textContent = L.update_modal_subtitle;
  
  const body = document.getElementById('update-modal-body');
  if (count === 0) {
    body.innerHTML = `<div class="empty-state" style="padding: 30px 20px;">
      <div style="font-size: 40px; margin-bottom: 10px;">📝</div>
      <div style="font-size: 15px; color: #475569; font-weight: 500; margin-bottom: 6px;">${L.update_no_changes_title}</div>
      <div style="font-size: 13px; color: #94a3b8;">${L.update_no_changes_hint}</div>
    </div>`;
    document.getElementById('btn-commit-update').style.display = 'none';
  } else {
    document.getElementById('btn-commit-update').style.display = '';
    // Build summary of changes
    const items = [];
    for (const taskId in changes) {
      const c = changes[taskId];
      items.push(renderPendingChangeItem(taskId, c));
    }
    const today = new Date().toISOString().split('T')[0];
    body.innerHTML = `
      <div class="update-summary-header">
        <div class="summary-count">
          <span class="count-bubble">${count}</span>
          <span>${count === 1 ? L.update_summary_one : L.update_summary_many.replace('{n}', count)}</span>
        </div>
      </div>
      
      <div class="pending-list">
        ${items.join('')}
      </div>
      
      <div class="update-meta">
        <div class="form-field">
          <label>${L.changelog_version} <span class="required">*</span></label>
          <input type="text" id="update-version" value="${esc(suggestNextVersion())}" maxlength="10">
        </div>
        <div class="form-field">
          <label>${L.changelog_date}</label>
          <input type="date" id="update-date" value="${today}">
        </div>
        <div class="form-field full-width">
          <label>${L.update_author_label} <span class="required">*</span></label>
          <input type="text" id="update-author" placeholder="${L.update_author_placeholder}" autocomplete="off">
        </div>
        <div class="form-field full-width">
          <label>${L.update_note_label}</label>
          <textarea id="update-note" placeholder="${L.update_note_placeholder}" style="min-height: 60px;"></textarea>
        </div>
      </div>
    `;
  }
  document.getElementById('update-modal').classList.add('show');
}

function renderPendingChangeItem(taskId, c) {
  const L = T[state.lang];
  const FIELD_LABELS = {
    ruimte: L.form_ruimte, werkplek: L.form_werkplek, onderdeel: L.form_onderdeel,
    subcat: L.form_subcat, uitvoerend: L.form_uitvoerend,
    vervuiling: L.form_vervuiling, wanneer: L.form_wanneer,
    freq: L.form_freq, methode: L.form_methode, middel: L.form_middel,
    vscore: L.score_v_full, zscore: L.score_z_full, afstand: L.score_a_full
  };
  if (c.type === 'add') {
    const t = c.after;
    return `<div class="pending-item change-add">
      <span class="change-badge badge-add">➕ ${L.change_type_add}</span>
      <div class="pending-body">
        <div class="pending-title">${esc(t.ruimte)} › ${esc(t.onderdeel)}</div>
        <div class="pending-sub">${esc(t.subcat || '')} · <em>${esc(t.freq)}</em>${t.methode ? ' · ' + esc(t.methode) : ''}</div>
      </div>
    </div>`;
  }
  if (c.type === 'edit') {
    const diffs = computeDiffs(c.before, c.after);
    const t = c.after;
    const diffHtml = diffs.map(d => `
      <li>
        <strong>${esc(FIELD_LABELS[d.field] || d.field)}:</strong>
        <span class="diff-old">${esc(d.old || '—')}</span>
        <span class="diff-arrow">→</span>
        <span class="diff-new">${esc(d.new || '—')}</span>
      </li>
    `).join('');
    return `<div class="pending-item change-edit">
      <span class="change-badge badge-edit">✏️ ${L.change_type_edit}</span>
      <div class="pending-body">
        <div class="pending-title">${esc(t.ruimte)} › ${esc(t.onderdeel)}</div>
        ${diffs.length ? `<ul class="diff-list">${diffHtml}</ul>` : `<div class="pending-sub" style="font-style:italic;">${L.update_no_field_changes}</div>`}
      </div>
    </div>`;
  }
  if (c.type === 'delete') {
    const t = c.before || {};
    return `<div class="pending-item change-delete">
      <span class="change-badge badge-delete">🗑 ${L.change_type_delete}</span>
      <div class="pending-body">
        <div class="pending-title" style="text-decoration: line-through;">${esc(t.ruimte || '?')} › ${esc(t.onderdeel || '?')}</div>
        <div class="pending-sub">${esc(t.subcat || '')}${t.freq ? ' · <em>' + esc(t.freq) + '</em>' : ''}</div>
      </div>
    </div>`;
  }
  return '';
}

function closeUpdateModal() {
  document.getElementById('update-modal').classList.remove('show');
}

// "Annuleren" button in the update modal: if there are pending changes,
// show an inline warning asking the user whether to discard or keep them.
// If there are no pending changes, just close normally.
function cancelUpdate() {
  const L = T[state.lang];
  const count = pendingChangeCount();
  if (count === 0) {
    closeUpdateModal();
    return;
  }
  const footer = document.getElementById('update-modal-footer');
  footer.classList.add('is-warning');
  const warningText = count === 1
    ? L.update_cancel_warning_one
    : L.update_cancel_warning_many.replace('{n}', count);
  footer.innerHTML = `
    <div class="update-warning-text">
      <span class="warning-icon">⚠</span>
      <span>${warningText}</span>
    </div>
    <button class="btn-discard" onclick="discardPending()">🗑 ${L.update_discard_btn}</button>
    <button class="btn-keep" onclick="keepPending()">✓ ${L.update_keep_btn}</button>
  `;
}

function discardPending() {
  const L = T[state.lang];
  // Actually roll back each pending change so task data returns to its pre-change state.
  // The mirror of recordChange():
  //   - 'add'    → remove the added custom task
  //   - 'edit'   → restore the 'before' snapshot
  //                (custom → write back to customTasks; built-in → restore override)
  //   - 'delete' → re-insert the deleted custom task using the 'before' snapshot
  const OVERRIDABLE_FIELDS = ['ruimte','werkplek','onderdeel','subcat','onderdeel_en','subcat_en','uitvoerend','vervuiling','wanneer','methode','middel','vscore','zscore','afstand','freq','freq_key','imageUrl','assigned_user_id'];
  for (const taskId in state.pendingChanges) {
    const c = state.pendingChanges[taskId];
    if (c.type === 'add') {
      state.customTasks = state.customTasks.filter(t => t.id !== taskId);
      // Also clear any checks that were set on this just-added task
      for (const fk in state.checks) {
        for (const pk in state.checks[fk]) {
          if (state.checks[fk][pk][taskId]) delete state.checks[fk][pk][taskId];
        }
      }
    } else if (c.type === 'edit') {
      const customIdx = state.customTasks.findIndex(t => t.id === taskId);
      if (customIdx >= 0) {
        // Custom task — restore its 'before' snapshot completely
        state.customTasks[customIdx] = Object.assign({}, c.before);
      } else {
        // Built-in task — restore override to reflect 'before' state.
        // If 'before' matches the original DATA task, remove the override entirely.
        const orig = DATA.tasks.find(t => t.id === taskId);
        if (orig) {
          const beforeMatchesOriginal = OVERRIDABLE_FIELDS.every(f => {
            const bv = (c.before && c.before[f] != null) ? c.before[f] : null;
            const ov = (orig[f] != null) ? orig[f] : null;
            return bv === ov;
          });
          if (beforeMatchesOriginal) {
            delete state.taskOverrides[taskId];
          } else {
            // There was a previously-committed override; restore to that state
            const restoredOv = {};
            OVERRIDABLE_FIELDS.forEach(f => {
              restoredOv[f] = (c.before && c.before[f] != null) ? c.before[f] : null;
            });
            state.taskOverrides[taskId] = restoredOv;
          }
        } else {
          delete state.taskOverrides[taskId];
        }
      }
    } else if (c.type === 'delete') {
      // Re-insert the deleted custom task
      if (c.before) {
        const isCustom = !!(c.before.custom);
        if (isCustom) {
          state.customTasks.push(Object.assign({}, c.before));
        } else {
          // Built-in task: remove it from the deleted-list so getAllTasks surfaces it again
          if (state.deletedBuiltinIds) {
            state.deletedBuiltinIds = state.deletedBuiltinIds.filter(id => id !== taskId);
          }
        }
      }
    }
  }
  state.pendingChanges = {};
  saveState();
  closeUpdateModal();
  renderApp();
  showToast(L.update_discard_success, 'success');
}

function keepPending() {
  const L = T[state.lang];
  closeUpdateModal();
  showToast(L.update_keep_success, 'success');
}

function commitUpdate() {
  const L = T[state.lang];
  if (state.authUser && !isAdmin()) {
    showToast(L.role_denied_admin_required, 'error');
    return;
  }
  const version = (document.getElementById('update-version').value || '').trim();
  const date = document.getElementById('update-date').value || new Date().toISOString().split('T')[0];
  const author = (document.getElementById('update-author').value || '').trim();
  const note = (document.getElementById('update-note').value || '').trim();
  
  if (!version) {
    showToast(L.update_version_required, 'error');
    return;
  }
  if (!author) {
    showToast(L.update_author_required, 'error');
    return;
  }
  
  const pending = state.pendingChanges || {};
  if (Object.keys(pending).length === 0) {
    showToast(L.update_no_changes_title, 'error');
    return;
  }
  
  // Build structured change list
  const changes = [];
  if (note) {
    changes.push({ type: 'note', text: note });
  }
  for (const taskId in pending) {
    const c = pending[taskId];
    if (c.type === 'add') {
      const t = c.after || {};
      changes.push({
        type: 'add',
        summary: `${t.ruimte || ''} › ${t.onderdeel || ''}` + (t.subcat ? ' — ' + t.subcat : ''),
        freq: t.freq || ''
      });
    } else if (c.type === 'edit') {
      const diffs = computeDiffs(c.before, c.after);
      const t = c.after || {};
      changes.push({
        type: 'edit',
        summary: `${t.ruimte || ''} › ${t.onderdeel || ''}`,
        diffs: diffs
      });
    } else if (c.type === 'delete') {
      const t = c.before || {};
      changes.push({
        type: 'delete',
        summary: `${t.ruimte || ''} › ${t.onderdeel || ''}` + (t.subcat ? ' — ' + t.subcat : ''),
        freq: t.freq || ''
      });
    }
  }
  
  const entry = {
    version: version,
    date: date,
    author: author,
    auto: true,
    changes: changes
  };
  state.customChangelog.unshift(entry);
  state.pendingChanges = {};
  saveState();
  closeUpdateModal();
  state.activeTab = 'changelog';
  renderApp();
  showToast(L.update_success, 'success');
}

function closeAddTaskModal() {
  document.getElementById('add-task-modal').classList.remove('show');
  state.editingTaskId = null;
}

async function saveNewTask() {
  const L = T[state.lang];
  const ruimte = document.getElementById('add-ruimte').value.trim();
  const werkplek = document.getElementById('add-werkplek').value.trim();
  const onderdeel = document.getElementById('add-onderdeel').value.trim();
  const subcat = document.getElementById('add-subcat').value.trim();
  // Optional English translations — null when blank so they're not stored
  // unnecessarily and don't override the lookup-table fallback.
  const onderdeelEnEl = document.getElementById('add-onderdeel-en');
  const subcatEnEl = document.getElementById('add-subcat-en');
  const onderdeelEn = onderdeelEnEl ? onderdeelEnEl.value.trim() : '';
  const subcatEn = subcatEnEl ? subcatEnEl.value.trim() : '';
  const uitvoerend = document.getElementById('add-uitvoerend').value.trim();
  const vervuiling = document.getElementById('add-vervuiling').value.trim();
  const wanneer = document.getElementById('add-wanneer').value.trim();
  const assignEl = document.getElementById('add-assigned-user');
  const assignedUser = assignEl ? assignEl.value.trim() : '';
  const freqKey = document.getElementById('add-freq').value;
  const methode = document.getElementById('add-methode').value.trim();
  const middel = document.getElementById('add-middel').value.trim();
  const vscoreRaw = document.getElementById('add-vscore').value.trim();
  const zscoreRaw = document.getElementById('add-zscore').value.trim();
  const afstandRaw = document.getElementById('add-afstand').value.trim();
  const vscore = vscoreRaw === '' ? null : (isNaN(parseFloat(vscoreRaw)) ? null : parseFloat(vscoreRaw));
  const zscore = zscoreRaw === '' ? null : (isNaN(parseFloat(zscoreRaw)) ? null : parseFloat(zscoreRaw));
  const afstand = afstandRaw === '' ? null : (isNaN(parseFloat(afstandRaw)) ? null : parseFloat(afstandRaw));
  
  if (!ruimte || !onderdeel || !subcat || !methode || !freqKey) {
    showToast(L.form_required_error, 'error');
    return;
  }
  
  // Map freq_key back to Dutch frequency label for the export column
  const freqLabelMap = {
    daily: 'Dagelijks', weekly: 'Wekelijks', monthly: 'Maandelijks',
    bimonthly: 'Elke 2 maanden', quarterly: 'Per kwartaal',
    semiannual: 'Halfjaarlijks', annual: 'Jaarlijks'
  };

  // Resolve the task ID first — needed for image upload path. For edits we
  // keep the existing id; for new tasks we generate a fresh c<n> id here so
  // we can reference it during upload.
  let taskId;
  if (state.editingTaskId) {
    taskId = state.editingTaskId;
  } else {
    let nextId = 1;
    while (state.customTasks.some(t => t.id === 'c' + nextId)) nextId++;
    taskId = 'c' + nextId;
  }

  // Handle the pending image: upload a new one, delete an existing one if
  // cleared, or keep the current one. We do this BEFORE storing the task
  // metadata so a failed upload doesn't leave the task in a half-saved state.
  let imageUrl = null;
  const p = state.pendingTaskImage || {};
  if (p.cleared) {
    // User explicitly removed the image
    try { await deleteTaskImage(taskId); } catch (e) { console.warn('Image delete failed:', e); }
    imageUrl = null;
  } else if (p.file) {
    // New image to upload
    try {
      showToast(L.image_uploading, 'info');
      imageUrl = await uploadTaskImage(taskId, p.file);
    } catch (err) {
      console.error('Image upload failed:', err);
      showToast(L.image_upload_failed, 'error');
      return; // bail out — don't save the task with a broken image reference
    }
  } else {
    // Keep existing
    imageUrl = p.existingUrl || null;
  }
  
  // ==== EDIT MODE: update an existing task ====
  if (state.editingTaskId) {
    const editId = state.editingTaskId;
    // Snapshot BEFORE state for changelog tracking
    const beforeTask = Object.assign({}, getAllTasks().find(t => t.id === editId));
    
    const updatedFields = {
      ruimte: ruimte,
      werkplek: werkplek || null,
      onderdeel: onderdeel,
      subcat: subcat,
      onderdeel_en: onderdeelEn || null,
      subcat_en: subcatEn || null,
      uitvoerend: uitvoerend || null,
      vervuiling: vervuiling || null,
      wanneer: wanneer || null,
      methode: methode,
      middel: middel || null,
      vscore: vscore,
      zscore: zscore,
      afstand: afstand,
      freq: freqLabelMap[freqKey],
      freq_key: freqKey,
      imageUrl: imageUrl,
      assigned_user_id: assignedUser || null
    };
    const customIdx = state.customTasks.findIndex(t => t.id === editId);
    if (customIdx >= 0) {
      // It's a custom task — update it in place, preserve row & id & custom flag
      state.customTasks[customIdx] = Object.assign({}, state.customTasks[customIdx], updatedFields);
    } else {
      // Built-in task — store as override
      state.taskOverrides[editId] = updatedFields;
    }
    // Track change for the changelog
    const afterTask = Object.assign({}, getAllTasks().find(t => t.id === editId));
    recordChange('edit', editId, { before: beforeTask, after: afterTask });
    
    state.editingTaskId = null;
    saveState();
    closeAddTaskModal();
    state.activeTab = freqKey;
    renderApp();
    showToast(L.edit_save_success, 'success');
    return;
  }
  
  // ==== ADD MODE: create a new custom task ====
  // Assign a row number beyond the highest existing (for export ordering)
  const maxRow = Math.max(...DATA.tasks.map(t => t.row), ...state.customTasks.map(t => t.row || 0));
  const newRow = maxRow + 1;
  
  const task = {
    id: taskId,
    row: newRow,
    ruimte: ruimte,
    werkplek: werkplek || null,
    onderdeel: onderdeel,
    subcat: subcat,
    onderdeel_en: onderdeelEn || null,
    subcat_en: subcatEn || null,
    uitvoerend: uitvoerend || null,
    vervuiling: vervuiling || null,
    wanneer: wanneer || null,
    methode: methode,
    middel: middel || null,
    vscore: vscore,
    zscore: zscore,
    afstand: afstand,
    freq: freqLabelMap[freqKey],
    freq_key: freqKey,
    imageUrl: imageUrl,
    assigned_user_id: assignedUser || null,
    custom: true
  };
  state.customTasks.push(task);
  recordChange('add', taskId, { after: Object.assign({}, task) });
  saveState();
  closeAddTaskModal();
  // Switch tab to the frequency of the new task if different
  state.activeTab = freqKey;
  renderApp();
  showToast(L.form_save_success, 'success');
}

// =====================================================
// BULK SELECTION & DELETE (visible only when edit mode is unlocked)
// =====================================================

function isTaskSelected(taskId) {
  return (state.selectedTaskIds || []).indexOf(taskId) !== -1;
}

function toggleTaskSelection(taskId) {
  if (!state.selectedTaskIds) state.selectedTaskIds = [];
  const idx = state.selectedTaskIds.indexOf(taskId);
  if (idx >= 0) state.selectedTaskIds.splice(idx, 1);
  else state.selectedTaskIds.push(taskId);
  updateBulkActionBar();
  // Update the row's visual state without re-rendering whole table
  const row = document.querySelector('tr[data-task-id="' + taskId + '"]');
  if (row) {
    row.classList.toggle('row-selected', isTaskSelected(taskId));
    const cb = row.querySelector('.bulk-select-cb');
    if (cb) cb.classList.toggle('checked', isTaskSelected(taskId));
  }
}

// Toggle all CURRENTLY VISIBLE tasks on/off
function toggleSelectAllVisible() {
  const visibleIds = filteredTasks().map(t => t.id);
  const allSelected = visibleIds.every(id => isTaskSelected(id));
  if (allSelected) {
    // Deselect all visible
    state.selectedTaskIds = (state.selectedTaskIds || []).filter(id => !visibleIds.includes(id));
  } else {
    // Add missing visible ones
    if (!state.selectedTaskIds) state.selectedTaskIds = [];
    visibleIds.forEach(id => {
      if (!state.selectedTaskIds.includes(id)) state.selectedTaskIds.push(id);
    });
  }
  renderContent();
}

function clearSelection() {
  state.selectedTaskIds = [];
  renderContent();
}

function updateBulkActionBar() {
  const bar = document.getElementById('bulk-action-bar');
  if (!bar) return;
  const count = (state.selectedTaskIds || []).length;
  const L = T[state.lang];
  if (count > 0 && state.editUnlocked) {
    bar.style.display = '';
    const countEl = document.getElementById('bulk-count');
    if (countEl) countEl.textContent = count + ' ' + (count === 1 ? L.bulk_selected_one : L.bulk_selected_many);
  } else {
    bar.style.display = 'none';
  }
}

// Open the bulk-delete confirmation modal
function openBulkDeleteModal() {
  if (!state.editUnlocked) return;
  const L = T[state.lang];
  const ids = state.selectedTaskIds || [];
  if (ids.length === 0) return;
  const tasks = getAllTasks().filter(t => ids.includes(t.id));
  // Build a task list (cap at 10 shown, with "and N more…")
  const MAX = 10;
  const shown = tasks.slice(0, MAX);
  const more = tasks.length - shown.length;
  const listHtml = shown.map(t => {
    const label = [t.ruimte, t.werkplek, t.onderdeel, t.subcat].filter(Boolean).join(' · ');
    return '<li><span style="color:#64748b;font-size:11px;font-family:Menlo,monospace;margin-right:8px;">' + esc(t.id) + '</span>' + esc(label) + '</li>';
  }).join('');
  const moreLine = more > 0 ? '<li style="color:#64748b;font-style:italic;">' + L.bulk_and_n_more.replace('{n}', more) + '</li>' : '';
  document.getElementById('bulk-delete-modal-title').textContent = L.bulk_delete_title;
  document.getElementById('bulk-delete-modal-subtitle').textContent = L.bulk_delete_subtitle.replace('{n}', tasks.length);
  document.getElementById('bulk-delete-modal-body').innerHTML =
    '<div class="bulk-delete-warning"><strong>⚠️ ' + esc(L.bulk_delete_warning_title) + '</strong><br>' + esc(L.bulk_delete_warning_body) + '</div>' +
    '<ul class="bulk-delete-list">' + listHtml + moreLine + '</ul>';
  document.getElementById('bulk-delete-modal').classList.add('show');
}

// =====================================================
// HELP / HANDLEIDING MODAL
// =====================================================
// =====================================================
// DASHBOARD — compliance overview, top problems, performer breakdown
// =====================================================

// S9: SVG sparkline renderer. Takes [{date, pct, isSunday, ...}] points and
// produces a small inline chart with a smooth area fill plus a dot on the
// last point so today's value is emphasised. No external library — kept
// lightweight and matches the rest of the design system.
function renderSparkline(points) {
  if (!points || points.length === 0) return '';
  const W = 240, H = 48, pad = 4;
  const stepX = (W - pad * 2) / (points.length - 1);
  const xy = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = H - pad - ((p.pct / 100) * (H - pad * 2));
    return [x, y];
  });
  const linePath = xy.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  const areaPath = linePath + ` L${xy[xy.length-1][0]},${H - pad} L${xy[0][0]},${H - pad} Z`;
  // Last point gets emphasised
  const [lx, ly] = xy[xy.length - 1];
  // Title for tooltip — list each day with %
  const fmt = getDateLocale();
  const title = points.map(p =>
    `${p.date.toLocaleDateString(fmt, { weekday: 'short', day: '2-digit', month: 'short' })}: ${p.pct}%`
  ).join('\n');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="sparkline-svg" role="img">
    <title>${esc(title)}</title>
    <defs>
      <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--brand-500)" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="var(--brand-500)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#sparkfill)" />
    <path d="${linePath}" fill="none" stroke="var(--brand-500)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${lx}" cy="${ly}" r="2.8" fill="var(--brand-500)" stroke="white" stroke-width="1.5"/>
  </svg>`;
}

// S9: SVG donut chart for department distribution. Three slices max (this
// matches our facilitair/operator/overig split). Renders as concentric arcs
// with a centered total in the hole. Calculates arc paths manually using
// trigonometry — no library needed for what's effectively three slices.
function renderDonutChart(counts, totalAll, L) {
  if (!totalAll) {
    return `<div class="donut-empty">${L.dashboard_no_data || 'Geen data'}</div>`;
  }
  const slices = [
    { key: 'facilitair', value: counts.facilitair, color: 'var(--brand-500)', label: L.dept_facilitair },
    { key: 'operator',   value: counts.operator,   color: 'var(--dept-operator)', label: L.dept_operator },
    { key: 'overig',     value: counts.overig,     color: 'var(--dept-overig)', label: L.dept_overig }
  ].filter(s => s.value > 0);

  const cx = 80, cy = 80, r = 60, ir = 42; // outer/inner radius
  const TAU = Math.PI * 2;
  let angle = -Math.PI / 2; // start at 12 o'clock
  const arcs = slices.map(s => {
    const sweep = TAU * (s.value / totalAll);
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    const large = sweep > Math.PI ? 1 : 0;
    // Special case: if a slice is 100% the start and end points coincide,
    // SVG arc will draw nothing — fall back to two half-arcs.
    if (s.value === totalAll) {
      // Two semicircle arcs to make a full ring
      return `<path fill="${s.color}"
        d="M ${cx} ${cy - r}
           A ${r} ${r} 0 1 1 ${cx} ${cy + r}
           A ${r} ${r} 0 1 1 ${cx} ${cy - r}
           M ${cx} ${cy - ir}
           A ${ir} ${ir} 0 1 0 ${cx} ${cy + ir}
           A ${ir} ${ir} 0 1 0 ${cx} ${cy - ir} Z"
        fill-rule="evenodd">
        <title>${esc(s.label)}: ${s.value} (100%)</title>
      </path>`;
    }
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const xi0 = cx + ir * Math.cos(a0), yi0 = cy + ir * Math.sin(a0);
    const xi1 = cx + ir * Math.cos(a1), yi1 = cy + ir * Math.sin(a1);
    const pct = Math.round((s.value / totalAll) * 100);
    return `<path fill="${s.color}"
      d="M ${x0} ${y0}
         A ${r} ${r} 0 ${large} 1 ${x1} ${y1}
         L ${xi1} ${yi1}
         A ${ir} ${ir} 0 ${large} 0 ${xi0} ${yi0} Z">
      <title>${esc(s.label)}: ${s.value} (${pct}%)</title>
    </path>`;
  }).join('');

  const legend = slices.map(s => {
    const pct = Math.round((s.value / totalAll) * 100);
    return `<div class="donut-legend-item">
      <span class="donut-legend-swatch" style="background:${s.color};"></span>
      <span class="donut-legend-label">${esc(s.label)}</span>
      <span class="donut-legend-value">${s.value} <span class="donut-legend-pct">(${pct}%)</span></span>
    </div>`;
  }).join('');

  return `<div class="donut-chart-row">
    <svg viewBox="0 0 160 160" class="donut-svg" role="img" aria-label="${L.dashboard_dept_distribution}">
      ${arcs}
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-total" font-size="22" font-weight="700">${totalAll}</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-total-label" font-size="10">${L.dashboard_total_tasks || 'taken'}</text>
    </svg>
    <div class="donut-legend">${legend}</div>
  </div>`;
}

function renderDashboard() {
  const L = T[state.lang];
  const allTasks = getAllTasks();
  const FREQS = ['daily','weekly','monthly','bimonthly','quarterly','semiannual','annual'];
  
  // Compute compliance per frequency (current period)
  const compliance = FREQS.map(fk => {
    const tasks = allTasks.filter(t => t.freq_key === fk);
    if (tasks.length === 0) return { freq: fk, total: 0, done: 0, pct: 0 };
    const done = countDoneInTab(fk);
    return { freq: fk, total: tasks.length, done: done, pct: Math.round(done * 100 / tasks.length) };
  });
  const totalAll = compliance.reduce((s, c) => s + c.total, 0);
  const doneAll = compliance.reduce((s, c) => s + c.done, 0);
  const pctAll = totalAll > 0 ? Math.round(doneAll * 100 / totalAll) : 0;
  
  // Overdue tasks
  const overdueTasks = allTasks.filter(t => isTaskOverdue(t));
  
  // Top-5 most-skipped tasks (looking at past stored periods)
  const skipCounts = {};
  allTasks.forEach(t => { skipCounts[t.id] = { task: t, skipped: 0, periods: 0 }; });
  // Look at last 4 weeks for daily/weekly tasks
  ['daily', 'weekly'].forEach(fk => {
    const keys = generatePeriodKeys(fk, fk === 'daily' ? 28 : 4, 0);
    // Skip current period
    const currentKey = getStoragePeriodKey(fk);
    keys.filter(k => k !== currentKey).forEach(k => {
      const periodStore = (state.checks[fk] && state.checks[fk][k]) || {};
      allTasks.filter(t => t.freq_key === fk).forEach(t => {
        if (!skipCounts[t.id]) return;
        skipCounts[t.id].periods++;
        const slots = periodStore[t.id] || {};
        if (!anySlotChecked(slots)) skipCounts[t.id].skipped++;
      });
    });
  });
  const topSkipped = Object.values(skipCounts)
    .filter(s => s.skipped > 0 && s.periods >= 2)
    .sort((a, b) => b.skipped - a.skipped)
    .slice(0, 5);
  
  // Performer breakdown — count tasks per uitvoerder
  const performerStats = {};
  allTasks.forEach(t => {
    const p = t.uitvoerend || '?';
    if (!performerStats[p]) performerStats[p] = { total: 0, byFreq: {} };
    performerStats[p].total++;
  });
  const performers = Object.entries(performerStats)
    .map(([name, s]) => ({ name, total: s.total }))
    .sort((a, b) => b.total - a.total);
  
  // Risk distribution
  const riskCounts = { low: 0, mid: 0, high: 0 };
  allTasks.forEach(t => {
    const v = parseFloat(t.vscore) || 0;
    const z = parseFloat(t.zscore) || 0;
    const a = parseFloat(t.afstand) || 0;
    const score = v * z * a;
    if (score >= 25) riskCounts.high++;
    else if (score >= 10) riskCounts.mid++;
    else riskCounts.low++;
  });
  
  // Color helper for compliance %
  const colorForPct = pct => pct >= 80 ? '#1d5b42' : pct >= 50 ? '#f59e0b' : '#dc2626';
  
  // Build HTML
  const freqLabels = {
    daily: L.tabs.daily, weekly: L.tabs.weekly, monthly: L.tabs.monthly,
    bimonthly: L.tabs.bimonthly, quarterly: L.tabs.quarterly,
    semiannual: L.tabs.semiannual, annual: L.tabs.annual
  };

  // === S9: Build chart data ===
  // 1. 14-day sparkline of daily completion ratio
  const sparklineData = (() => {
    const dailyTasks = allTasks.filter(t => t.freq_key === 'daily');
    if (dailyTasks.length === 0) return null;
    const points = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${mo}-${dd}`;
      const periodStore = (state.checks.daily && state.checks.daily[key]) || {};
      let done = 0;
      dailyTasks.forEach(t => {
        const slots = periodStore[t.id] || {};
        if (anySlotChecked(slots)) done++;
      });
      const pct = Math.round(done * 100 / dailyTasks.length);
      points.push({ date: d, pct, done, total: dailyTasks.length, isSunday: d.getDay() === 0 });
    }
    return points;
  })();

  // 2. Donut: department distribution of all tasks
  const deptCounts = { facilitair: 0, operator: 0, overig: 0 };
  allTasks.forEach(t => {
    const u = (t.uitvoerend || '').toLowerCase();
    if (u.includes('facilitair')) deptCounts.facilitair++;
    else if (u.includes('operator')) deptCounts.operator++;
    else deptCounts.overig++;
  });

  return `<div class="dashboard">
    <div class="dashboard-header">
      <h2>📊 ${L.dashboard_title}</h2>
      <p class="dashboard-subtitle">${L.dashboard_subtitle}</p>
    </div>
    
    <div class="dashboard-grid">
      <!-- KPI: Overall compliance -->
      <div class="dashboard-card kpi-big">
        <div class="kpi-label">${L.dashboard_compliance}</div>
        <div class="kpi-value" style="color: ${colorForPct(pctAll)};">${pctAll}%</div>
        <div class="kpi-sub">${doneAll} / ${totalAll} ${L.dashboard_tasks_done}</div>
        ${sparklineData ? `<div class="kpi-spark" aria-label="${L.dashboard_spark_label}">${renderSparkline(sparklineData)}</div>` : ''}
        <div class="kpi-bar"><div class="kpi-bar-fill" style="width:${pctAll}%; background:${colorForPct(pctAll)};"></div></div>
      </div>
      
      <!-- KPI: Overdue count -->
      <div class="dashboard-card kpi-big ${overdueTasks.length > 0 ? 'kpi-alert' : ''}">
        <div class="kpi-label">${L.dashboard_overdue}</div>
        <div class="kpi-value" style="color: ${overdueTasks.length > 0 ? '#dc2626' : '#1d5b42'};">${overdueTasks.length}</div>
        <div class="kpi-sub">${overdueTasks.length === 1 ? L.overdue_count_one : L.overdue_count_many}</div>
        ${overdueTasks.length > 0 ? `<button class="btn" style="margin-top:8px; font-size:12px;" onclick="filterOverdueAndSwitch()">${L.dashboard_view_overdue}</button>` : ''}
      </div>

      <!-- S9: Department distribution donut chart -->
      <div class="dashboard-card">
        <h3>${L.dashboard_dept_distribution}</h3>
        <div class="donut-wrap">
          ${renderDonutChart(deptCounts, totalAll, L)}
        </div>
      </div>
      
      <!-- Risk distribution -->
      <div class="dashboard-card">
        <h3>${L.dashboard_risk}</h3>
        <div class="risk-bars">
          <div class="risk-bar-row">
            <span class="risk-label" style="background:#3b8a6a;">${L.dashboard_risk_low}</span>
            <span class="risk-count">${riskCounts.low}</span>
            <div class="risk-bar"><div class="risk-bar-fill" style="width:${totalAll > 0 ? (riskCounts.low * 100 / totalAll) : 0}%; background:#3b8a6a;"></div></div>
          </div>
          <div class="risk-bar-row">
            <span class="risk-label" style="background:#f59e0b;">${L.dashboard_risk_mid}</span>
            <span class="risk-count">${riskCounts.mid}</span>
            <div class="risk-bar"><div class="risk-bar-fill" style="width:${totalAll > 0 ? (riskCounts.mid * 100 / totalAll) : 0}%; background:#f59e0b;"></div></div>
          </div>
          <div class="risk-bar-row">
            <span class="risk-label" style="background:#dc2626;">${L.dashboard_risk_high}</span>
            <span class="risk-count">${riskCounts.high}</span>
            <div class="risk-bar"><div class="risk-bar-fill" style="width:${totalAll > 0 ? (riskCounts.high * 100 / totalAll) : 0}%; background:#dc2626;"></div></div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Compliance per frequency -->
    <div class="dashboard-card" style="margin-top: 16px;">
      <h3>${L.dashboard_per_freq}</h3>
      <table class="dashboard-table">
        <thead>
          <tr>
            <th>${L.dashboard_freq_col}</th>
            <th style="text-align:right;">${L.dashboard_done_col}</th>
            <th style="text-align:right;">${L.dashboard_total_col}</th>
            <th>${L.dashboard_progress_col}</th>
          </tr>
        </thead>
        <tbody>
          ${compliance.filter(c => c.total > 0).map(c => `
            <tr>
              <td><a href="javascript:void(0)" onclick="switchTab('${c.freq}')">${freqLabels[c.freq]}</a></td>
              <td style="text-align:right; font-weight:600;">${c.done}</td>
              <td style="text-align:right; color:#64748b;">${c.total}</td>
              <td>
                <div class="dashboard-progress">
                  <div class="dashboard-progress-fill" style="width:${c.pct}%; background:${colorForPct(c.pct)};"></div>
                  <span class="dashboard-progress-label">${c.pct}%</span>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    
    <div class="dashboard-grid-2">
      <!-- Top skipped -->
      <div class="dashboard-card">
        <h3>${L.dashboard_top_skipped}</h3>
        ${topSkipped.length === 0 ? `<p class="dashboard-empty">${L.dashboard_no_skipped}</p>` : `
          <ol class="dashboard-list">
            ${topSkipped.map(s => `
              <li>
                <div class="skip-row">
                  <div class="skip-task">
                    <strong>${esc(tr(s.task.subcat || s.task.onderdeel))}</strong>
                    <span class="skip-meta">${esc(tr(s.task.ruimte))} · ${esc(s.task.werkplek || '')}</span>
                  </div>
                  <div class="skip-stats">
                    <span class="skip-count">${s.skipped}/${s.periods}</span>
                    <span class="skip-label">${L.dashboard_periods_skipped}</span>
                  </div>
                </div>
              </li>`).join('')}
          </ol>`}
      </div>
      
      <!-- Per-performer breakdown -->
      <div class="dashboard-card">
        <h3>${L.dashboard_per_performer}</h3>
        <table class="dashboard-table">
          <thead>
            <tr><th>${L.dashboard_performer_col}</th><th style="text-align:right;">${L.dashboard_tasks_col}</th></tr>
          </thead>
          <tbody>
            ${performers.slice(0, 8).map(p => `
              <tr>
                <td>${esc(tr(p.name))}</td>
                <td style="text-align:right; font-weight:600;">${p.total}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

// =====================================================
// PRODUCTS VIEW (Middelen overzicht)
// =====================================================
// Lists every cleaning agent from DATA.products with a button to view its
// MSDS. The same MSDS modal that's used elsewhere is reused here, so any
// MSDS link uploaded by an admin shows up immediately. Each card surfaces
// the description and primary application so users can find the right
// product without opening every modal.
function renderProductsView() {
  const L = T[state.lang];
  // Sort products alphabetically — easier to scan when looking for a specific one.
  const products = (DATA.products || []).slice().sort((a, b) =>
    (a.name || '').localeCompare(b.name || '')
  );
  if (!products.length) {
    return `<div class="products-view">
      <div class="empty-state">${L.products_empty || 'Geen middelen gevonden.'}</div>
    </div>`;
  }
  // Build the cards. Each shows: name, optional translated description and
  // application, and an MSDS-button that's emphasised when a link is already
  // uploaded (so it visually invites a click).
  const cards = products.map(p => {
    const name = p.name || '';
    const key = msdsKey(name);
    const hasLink = !!(state.msdsLinks && state.msdsLinks[key]);
    const desc = p.beschrijving ? trProductField(p.beschrijving) : '';
    const usage = p.toepassing ? trProductField(p.toepassing) : '';
    // Two distinct button states: uploaded (primary, green) vs. info-only
    // (neutral, grey). The label changes too so the user knows what to expect.
    const btnLabel = hasLink ? L.products_view_msds : L.products_open_msds;
    const btnIcon = hasLink ? '📄' : '📋';
    const btnClass = hasLink ? 'products-msds-btn has-link' : 'products-msds-btn';
    const badge = hasLink
      ? `<span class="products-msds-badge">${L.products_msds_uploaded}</span>`
      : '';
    return `
      <div class="products-card">
        <div class="products-card-head">
          <h3>${esc(name)}</h3>
          ${badge}
        </div>
        ${desc ? `<div class="products-card-section"><strong>${L.msds_description}:</strong> ${esc(desc)}</div>` : ''}
        ${usage ? `<div class="products-card-section"><strong>${L.msds_usage}:</strong> ${esc(usage)}</div>` : ''}
        <div class="products-card-actions">
          <button class="${btnClass}" onclick="openMsds('${esc(name)}')">
            ${btnIcon} ${esc(btnLabel)}
          </button>
        </div>
      </div>
    `;
  }).join('');
  return `
    <div class="products-view">
      <div class="products-header">
        <h2>${L.products_title}</h2>
        <p class="products-subtitle">${L.products_subtitle}</p>
      </div>
      <div class="products-grid">
        ${cards}
      </div>
    </div>
  `;
}

// =====================================================
// METHODIEKEN VIEW — cleaning methods (sage design refresh)
// =====================================================
// Uses DATA.methods (canonical methods library) — same structure used by the
// "method" dropdown in the task editor. Each method has: code, name,
// description (array of step lines). Renders as a table à la design's
// MethodsView, with expandable step lists per method.

function renderMethodsView() {
  const methods = (DATA.methods || []).slice().sort((a, b) =>
    (a.code || '').localeCompare(b.code || '')
  );
  if (!methods.length) {
    return `<div class="aux-view">
      <div class="empty-state">Geen methodieken gedefinieerd.</div>
    </div>`;
  }
  const rows = methods.map(m => {
    const steps = Array.isArray(m.description) ? m.description : [];
    const stepsHtml = steps.length
      ? `<details class="method-steps-details">
           <summary>Toon stappenplan (${steps.length}) ↓</summary>
           <div class="method-step-list">
             ${steps.map((s, i) => `
               <div class="method-step">
                 <span class="method-step-num">${i + 1}</span>
                 <span>${esc(s)}</span>
               </div>
             `).join('')}
           </div>
         </details>`
      : '<span class="aux-empty">—</span>';
    return `
      <tr>
        <td class="aux-code">${esc(m.code || '')}</td>
        <td>
          <div class="aux-name">${esc(m.name || '')}</div>
          ${steps.length ? `<div class="aux-meta">${steps.length} ${steps.length === 1 ? 'stap' : 'stappen'}</div>` : ''}
        </td>
        <td>${stepsHtml}</td>
      </tr>
    `;
  }).join('');
  return `
    <div class="aux-view">
      <div class="aux-header">
        <div>
          <h2>Methodieken</h2>
          <p class="aux-subtitle">Canonieke schoonmaakmethoden — gebruikt in alle taken</p>
        </div>
        <span class="chip chip--sage">${methods.length} methoden</span>
      </div>
      <div class="aux-table-wrap">
        <table class="aux-table">
          <thead>
            <tr>
              <th style="width: 90px;">Code</th>
              <th>Methodiek</th>
              <th>Stappenplan</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// =====================================================
// BEHEER VIEW — admin actions grid (sage design refresh)
// =====================================================
// Card grid linking to existing admin actions. Each card is a button calling
// an existing function. Role-gated: non-admins see fewer cards.

function renderBeheerView() {
  const L = T[state.lang] || T.nl;
  const local = !state.authUser;
  const admin = local || isAdmin();
  const superuser = local || isSuperuser();

  // Card definitions. `gated` keeps the card visible only when the predicate
  // is true. Order matters — most common actions first.
  const cards = [
    {
      icon: '📋',
      title: 'QR-codes printen',
      body: 'Genereer printbare QR-codes per ruimte of werkplek voor snel openen op locatie.',
      onclick: 'openQrCodesModal()',
      gated: true,
    },
    {
      icon: '📊',
      title: 'Excel importeren',
      body: 'Voeg taken uit een spreadsheet toe — kolommen worden automatisch herkend.',
      onclick: "document.getElementById('import-file-input').click()",
      gated: admin,
    },
    {
      icon: '💾',
      title: 'Backup downloaden',
      body: 'Download een volledige JSON-snapshot van het plan voor archief of restore.',
      onclick: 'exportBackup()',
      gated: admin,
    },
    {
      icon: '📥',
      title: 'Backup terugzetten',
      body: 'Laad een eerder backup-bestand terug. Overschrijft de huidige staat.',
      onclick: "document.getElementById('restore-file-input').click()",
      gated: admin,
    },
    {
      icon: '👥',
      title: 'Accountbeheer',
      body: 'Wijs rollen toe — user, admin of super-user. Alleen super-users zien dit.',
      onclick: 'openUserManagementModal()',
      gated: superuser,
    },
    {
      icon: '✏️',
      title: 'Wijzigingsmodus',
      body: state.editUnlocked
        ? 'Wijzigingsmodus is actief — klik om uit te schakelen.'
        : 'Ontgrendel met wachtwoord om taken te bewerken, toe te voegen of te verwijderen.',
      onclick: 'toggleEditMode()',
      gated: admin,
      active: !!state.editUnlocked,
    },
    {
      icon: '🔄',
      title: 'Wijzigingen doorvoeren',
      body: 'Bekijk wijzigingen sinds laatste versie en voer ze door naar de changelog.',
      onclick: 'openUpdateModal()',
      gated: admin,
    },
    {
      icon: '⚠️',
      title: 'Periode resetten',
      body: 'Alle vinkjes van de huidige periode wissen. Onomkeerbaar — gebruik alleen na een verkeerde import.',
      onclick: 'resetCurrentPeriod()',
      gated: admin,
      danger: true,
    },
  ].filter(c => c.gated);

  const cardHtml = cards.map(c => `
    <button class="beheer-card${c.danger ? ' beheer-card--danger' : ''}${c.active ? ' beheer-card--active' : ''}" onclick="${c.onclick}">
      <div class="beheer-card-icon">${c.icon}</div>
      <h4>${esc(c.title)}</h4>
      <p>${esc(c.body)}</p>
    </button>
  `).join('');

  return `
    <div class="aux-view">
      <div class="aux-header">
        <div>
          <h2>Beheer</h2>
          <p class="aux-subtitle">Admin-acties — import, backup, accountbeheer, reset</p>
        </div>
        ${admin ? '<span class="chip chip--sage">Admin</span>' : '<span class="chip chip--ghost">Alleen-lezen</span>'}
      </div>
      <div class="beheer-grid">
        ${cardHtml}
      </div>
    </div>
  `;
}

// Helper: switch to overdue filter view
function filterOverdueAndSwitch() {
  // Find first frequency with overdue tasks and switch to it
  const allTasks = getAllTasks();
  const FREQS = ['daily','weekly','monthly','bimonthly','quarterly','semiannual','annual'];
  for (const fk of FREQS) {
    if (allTasks.filter(t => t.freq_key === fk && isTaskOverdue(t)).length > 0) {
      switchTab(fk);
      return;
    }
  }
}

// =====================================================
// USER PROFILE — accountability for who checked off what
// =====================================================

// =====================================================
// QR CODES — printable codes per area/workplace for on-site scanning
// =====================================================

function openQrCodesModal() {
  const L = T[state.lang];
  // Localize labels
  const t = document.getElementById('qr-modal-title');
  if (t) t.textContent = L.qr_modal_title;
  const s = document.getElementById('qr-modal-subtitle');
  if (s) s.textContent = L.qr_modal_subtitle;
  const ml = document.getElementById('qr-mode-label');
  if (ml) ml.textContent = L.qr_generate_for;
  const sel = document.getElementById('qr-mode-select');
  if (sel) {
    sel.options[0].textContent = L.qr_per_area;
    sel.options[1].textContent = L.qr_per_workplace;
  }
  const closeBtn = document.getElementById('qr-close-btn');
  if (closeBtn) closeBtn.textContent = L.help_close;
  const printBtn = document.getElementById('qr-print-btn');
  if (printBtn) printBtn.textContent = '🖨 ' + L.qr_print;
  renderQrCodesGrid();
  document.getElementById('qr-codes-modal').classList.add('show');
}

function closeQrCodesModal() {
  document.getElementById('qr-codes-modal').classList.remove('show');
}

// Build SVG-string for a QR code using qrcode-generator library.
// Returns null if library isn't loaded (gracefully shows fallback message).
function buildQrSvg(text, size) {
  size = size || 160;
  if (typeof qrcode !== 'function') return null;
  try {
    // Type 0 = auto-detect best version, error correction level M
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const moduleCount = qr.getModuleCount();
    const cellSize = size / moduleCount;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
    svg += `<rect width="${size}" height="${size}" fill="white"/>`;
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qr.isDark(r, c)) {
          svg += `<rect x="${(c * cellSize).toFixed(2)}" y="${(r * cellSize).toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#1e293b"/>`;
        }
      }
    }
    svg += `</svg>`;
    return svg;
  } catch (e) {
    console.warn('QR generation failed:', e);
    return null;
  }
}

// Build the deep-link URL for a QR code. The URL hash is parsed in init()
// to auto-set filters when the user lands on the page from a scan.
function buildQrUrl(params) {
  const base = window.location.origin + window.location.pathname;
  const parts = [];
  if (params.ruimte) parts.push('ruimte=' + encodeURIComponent(params.ruimte));
  if (params.werkplek) parts.push('werkplek=' + encodeURIComponent(params.werkplek));
  if (params.uitvoerend) parts.push('uitvoerend=' + encodeURIComponent(params.uitvoerend));
  if (params.freq) parts.push('freq=' + encodeURIComponent(params.freq));
  return base + '#' + parts.join('&');
}

function renderQrCodesGrid() {
  const L = T[state.lang];
  const grid = document.getElementById('qr-codes-grid');
  if (!grid) return;
  const sel = document.getElementById('qr-mode-select');
  const mode = sel ? sel.value : 'ruimte';
  const allTasks = getAllTasks();
  // Build entries depending on mode
  let entries;
  if (mode === 'werkplek') {
    // Group by ruimte+werkplek combination
    const map = new Map();
    allTasks.forEach(t => {
      if (!t.ruimte || !t.werkplek) return;
      const key = t.ruimte + '||' + t.werkplek;
      if (!map.has(key)) map.set(key, { ruimte: t.ruimte, werkplek: t.werkplek, count: 0 });
      map.get(key).count++;
    });
    entries = Array.from(map.values()).sort((a, b) =>
      a.ruimte.localeCompare(b.ruimte) || a.werkplek.localeCompare(b.werkplek));
  } else {
    // Group by ruimte only
    const map = new Map();
    allTasks.forEach(t => {
      if (!t.ruimte) return;
      if (!map.has(t.ruimte)) map.set(t.ruimte, { ruimte: t.ruimte, count: 0 });
      map.get(t.ruimte).count++;
    });
    entries = Array.from(map.values()).sort((a, b) => a.ruimte.localeCompare(b.ruimte));
  }
  
  if (entries.length === 0) {
    grid.innerHTML = `<p style="color:#64748b; padding:20px; text-align:center;">${L.qr_no_data}</p>`;
    return;
  }
  
  // Check library availability
  if (typeof qrcode !== 'function') {
    grid.innerHTML = `<p style="color:#dc2626; padding:20px; text-align:center;">${L.qr_lib_missing}</p>`;
    return;
  }
  
  let html = '';
  entries.forEach(e => {
    const url = buildQrUrl({ ruimte: e.ruimte, werkplek: e.werkplek });
    const svg = buildQrSvg(url, 180);
    const heading = e.werkplek
      ? `<div class="qr-card-area">${esc(tr(e.ruimte))}</div><div class="qr-card-workplace">${esc(tr(e.werkplek))}</div>`
      : `<div class="qr-card-area" style="font-size: 16px;">${esc(tr(e.ruimte))}</div>`;
    html += `<div class="qr-card">
      ${heading}
      <div class="qr-image">${svg || `<div style="color:#dc2626;">${L.qr_lib_missing}</div>`}</div>
      <div class="qr-card-meta">${e.count} ${e.count === 1 ? L.qr_task_one : L.qr_task_many}</div>
    </div>`;
  });
  grid.innerHTML = html;
}

function printQrCodes() {
  // Open a new window with print-friendly content
  const grid = document.getElementById('qr-codes-grid');
  if (!grid || !grid.innerHTML) return;
  const L = T[state.lang];
  const w = window.open('', '_blank');
  if (!w) {
    showToast(L.qr_print_blocked, 'error');
    return;
  }
  // Title from header (current plan name + period info)
  const planName = (state.plans && state.plans[state.activePlanId] && state.plans[state.activePlanId].name) || 'Schoonmaakplan';
  // We must avoid emitting a literal closing-script-tag token in our template
  // string, because it would prematurely close the outer script block (and
  // break our test harness's regex extraction). Build the inner content as
  // separate pieces so the closing tag never appears as a single literal token.
  const closeTag = '<' + '/script>';
  w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(planName)} — QR-codes</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; padding: 20px; color: #1e293b; }
  h1 { font-size: 18px; margin: 0 0 4px; color: #1d5b42; }
  .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
  .qr-codes-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .qr-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; text-align: center; page-break-inside: avoid; }
  .qr-card-area { font-weight: 700; font-size: 14px; color: #1d5b42; }
  .qr-card-workplace { font-size: 12px; color: #475569; margin-top: 2px; }
  .qr-image { margin: 10px 0; }
  .qr-image svg { width: 100%; height: auto; max-width: 180px; }
  .qr-card-meta { font-size: 11px; color: #64748b; }
  @media print {
    body { padding: 0; }
    .qr-card { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<h1>${esc(planName)} — QR-codes</h1>
<div class="subtitle">${L.qr_print_subtitle}</div>
<div class="qr-codes-grid">${grid.innerHTML}</div>
<script>setTimeout(function(){ window.print(); }, 300);` + closeTag + `
</body></html>`);
  w.document.close();
}

function openUserModal() {
  const L = T[state.lang];
  // Hide signout row when running offline
  const signoutRow = document.getElementById('user-signout-row');
  if (signoutRow) signoutRow.style.display = state.authUser ? '' : 'none';
  // Localize labels
  const titleEl = document.getElementById('user-modal-title');
  if (titleEl) titleEl.textContent = L.user_modal_title;
  const subEl = document.getElementById('user-modal-subtitle');
  if (subEl) subEl.textContent = L.user_modal_subtitle;
  const labelEl = document.getElementById('user-name-label');
  if (labelEl) labelEl.textContent = L.user_name_label;
  const anonBtn = document.getElementById('user-anon-btn');
  if (anonBtn) anonBtn.textContent = L.user_anon_btn;
  const saveBtn = document.getElementById('user-save-btn');
  if (saveBtn) saveBtn.textContent = L.user_save_btn;
  const input = document.getElementById('user-name-input');
  if (input) {
    input.placeholder = L.user_name_placeholder;
    input.value = state.currentUser || '';
    setTimeout(() => input.focus(), 50);
    input.onkeydown = function(e) {
      if (e.key === 'Enter') saveCurrentUser();
      if (e.key === 'Escape') closeUserModal();
    };
  }
  // List existing names found in audit-trail data, as quick-pick
  const existing = collectExistingUsers();
  const listEl = document.getElementById('user-existing-list');
  if (listEl) {
    if (existing.length > 0) {
      listEl.innerHTML = L.user_existing_label + ': ' + existing.map(n =>
        `<a href="javascript:void(0)" onclick="document.getElementById('user-name-input').value='${esc(n)}'" style="color:#1d5b42; text-decoration:underline; margin-right:8px;">${esc(n)}</a>`
      ).join('');
    } else {
      listEl.innerHTML = '';
    }
  }
  document.getElementById('user-modal').classList.add('show');
}

function closeUserModal() {
  document.getElementById('user-modal').classList.remove('show');
}

function saveCurrentUser() {
  const input = document.getElementById('user-name-input');
  const name = input ? input.value.trim() : '';
  setCurrentUser(name);
}

function setCurrentUser(name) {
  state.currentUser = name || '';
  saveState();
  closeUserModal();
  // Update the header button label immediately
  updateUserButtonLabel();
  const L = T[state.lang];
  showToast(name ? L.user_set_success.replace('{name}', name) : L.user_anon_set, 'success');
}

function updateUserButtonLabel() {
  const btn = document.getElementById('user-btn');
  if (!btn) return;
  const L = T[state.lang];
  const name = state.currentUser || L.user_anon_label;
  // New header pill: avatar + name spans (set both if they exist; fall back
  // to setting the whole button text for old layouts).
  const avatarEl = document.getElementById('user-avatar');
  const nameEl   = document.getElementById('user-name-label');
  if (avatarEl && nameEl) {
    // Build a 2-letter avatar from the name (or "?" when anonymous).
    const initials = (state.currentUser && state.currentUser.trim())
      ? state.currentUser.trim().split(/\s+/).map(p => p[0]).slice(0,2).join('').toUpperCase()
      : '?';
    avatarEl.textContent = initials;
    nameEl.textContent = name;
  } else {
    btn.innerHTML = '👤 ' + esc(name);
  }
  btn.title = state.currentUser ? L.user_btn_title_set.replace('{name}', state.currentUser) : L.user_btn_title_unset;
}

// Walk all stored checks across all plans+periods to find names previously used.
// Returns deduplicated, sorted list. Useful as quick-pick when a returning
// user wants to identify themselves the same way.
function collectExistingUsers() {
  const names = new Set();
  const scan = (checksObj) => {
    if (!checksObj) return;
    for (const fk in checksObj) {
      for (const pk in checksObj[fk]) {
        for (const tid in checksObj[fk][pk]) {
          const slots = checksObj[fk][pk][tid] || {};
          for (const k in slots) {
            const e = slots[k];
            if (e && typeof e === 'object' && e.by) names.add(e.by);
          }
        }
      }
    }
  };
  scan(state.checks);
  if (state.plans) {
    for (const pid in state.plans) {
      scan((state.plans[pid] || {}).checks);
    }
  }
  return Array.from(names).sort();
}

// =====================================================
// USER MANAGEMENT MODAL (superuser only)
// =====================================================

function openUserManagementModal() {
  if (!isSuperuser()) return;
  const hint = document.getElementById('su-email-hint');
  if (hint) hint.textContent = SUPERUSER_EMAIL;
  renderUserManagementList();
  document.getElementById('user-mgmt-modal').classList.add('show');
}

function closeUserManagementModal() {
  document.getElementById('user-mgmt-modal').classList.remove('show');
}

function renderUserManagementList() {
  const container = document.getElementById('user-mgmt-list');
  if (!container) return;
  const users = state.allUsers || {};
  const uids = Object.keys(users).sort((a, b) => {
    // Sort superusers first, then admins, then users
    const order = { superuser: 0, admin: 1, user: 2 };
    const da = order[users[a].role] || 3;
    const db = order[users[b].role] || 3;
    if (da !== db) return da - db;
    return (users[a].email || '').localeCompare(users[b].email || '');
  });
  if (uids.length === 0) {
    container.innerHTML = '<p style="color:#64748b; padding: 20px; text-align: center;">Nog geen accounts geregistreerd.</p>';
    return;
  }
  let html = '<table class="user-mgmt-table"><thead><tr><th>E-mail</th><th>Rol</th><th>Wijzigen</th></tr></thead><tbody>';
  uids.forEach(uid => {
    const u = users[uid];
    const isSelf = uid === (state.authUser && state.authUser.uid);
    const isSu = u.role === 'superuser';
    const roleLabel = u.role === 'superuser' ? '🛡 Super-user'
                    : u.role === 'admin' ? '🔧 Admin'
                    : '👤 User';
    const roleClass = 'role-badge role-' + (u.role || 'user');
    let actions;
    if (isSu) {
      actions = '<span style="color:#64748b; font-size:12px; font-style: italic;">vast</span>';
    } else if (isSelf) {
      actions = '<span style="color:#64748b; font-size:12px; font-style: italic;">jij — niet wijzigbaar</span>';
    } else {
      actions = `
        <button class="btn-mini ${u.role === 'user' ? 'active' : ''}" onclick="changeUserRole('${esc(uid)}', 'user')">User</button>
        <button class="btn-mini ${u.role === 'admin' ? 'active' : ''}" onclick="changeUserRole('${esc(uid)}', 'admin')">Admin</button>
      `;
    }
    html += `<tr>
      <td>${esc(u.email || '(onbekend)')}</td>
      <td><span class="${roleClass}">${roleLabel}</span></td>
      <td>${actions}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// =====================================================
// MSDS LINK (URL to supplier's safety data sheet)
// =====================================================
// Instead of hosting MSDS files ourselves, we store a link to the supplier's
// official MSDS page. Admins can paste the URL once; users see a button that
// opens it in a new tab. Links are kept in Firestore at /msdsLinks/{productKey}
// so they sync across all users in real time.

function msdsKey(productName) {
  return (productName || '').toString().trim().toLowerCase().replace(/[\\\/.#$\[\]]/g, '_');
}

// Subscribe to /msdsLinks for live updates when an admin adds or changes
// a link — every user sees the new URL within a second or two.
let unsubscribeMsdsLinksListener = null;
function subscribeToMsdsLinks() {
  if (!fbDb || !state.authUser) return;
  if (unsubscribeMsdsLinksListener) {
    try { unsubscribeMsdsLinksListener(); } catch(e) {}
  }
  unsubscribeMsdsLinksListener = fbDb.collection('msdsLinks').onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      const key = change.doc.id;
      if (change.type === 'removed') {
        delete state.msdsLinks[key];
      } else {
        state.msdsLinks[key] = change.doc.data();
      }
    });
    // If the MSDS modal is open for this product, refresh just the link block
    const modal = document.getElementById('msds-modal');
    if (modal && modal.classList && modal.classList.contains('show') && state.msdsCurrentProduct) {
      const row = document.getElementById('msds-link-row');
      if (row) row.innerHTML = renderMsdsLinkBlock(state.msdsCurrentProduct);
    }
  }, err => console.error('MSDS links listener error:', err));
}

// Save (or update) the MSDS link for a product. Admin/superuser only.
async function saveMsdsLink(productName) {
  const L = T[state.lang];
  if (state.authUser && !isAdmin()) {
    showToast(L.role_denied_admin_required, 'error');
    return;
  }
  const input = document.getElementById('msds-link-input');
  if (!input) return;
  let url = input.value.trim();
  if (!url) {
    showToast(L.msds_link_empty, 'error');
    input.focus();
    return;
  }
  // Auto-prefix https:// if user pasted a bare domain
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  // Validate that it looks like a URL (must contain a dot in the host)
  try {
    const u = new URL(url);
    if (!u.hostname.includes('.')) throw new Error('no host');
  } catch (e) {
    showToast(L.msds_link_invalid, 'error');
    input.focus();
    return;
  }
  const key = msdsKey(productName);
  const entry = {
    url: url,
    productName: productName,
    updatedBy: state.currentUser || (state.authUser && state.authUser.email) || '',
    updatedAt: new Date().toISOString()
  };
  state.msdsLinks[key] = entry;
  if (fbDb && state.authUser) {
    try {
      await fbDb.collection('msdsLinks').doc(key).set(entry);
    } catch (err) {
      console.error('MSDS link save failed:', err);
      showToast(L.msds_link_save_failed, 'error');
      return;
    }
  }
  showToast(L.msds_link_saved, 'success');
  // Refresh the modal block
  const row = document.getElementById('msds-link-row');
  if (row) row.innerHTML = renderMsdsLinkBlock(productName);
}

// Remove the link entirely. Admin/superuser only.
async function deleteMsdsLink(productName) {
  const L = T[state.lang];
  if (state.authUser && !isAdmin()) {
    showToast(L.role_denied_admin_required, 'error');
    return;
  }
  if (!confirm(L.msds_link_delete_confirm)) return;
  const key = msdsKey(productName);
  delete state.msdsLinks[key];
  if (fbDb && state.authUser) {
    try {
      await fbDb.collection('msdsLinks').doc(key).delete();
    } catch (err) {
      console.error('MSDS link delete failed:', err);
    }
  }
  showToast(L.msds_link_deleted, 'success');
  const row = document.getElementById('msds-link-row');
  if (row) row.innerHTML = renderMsdsLinkBlock(productName);
}

// =====================================================
// JAARLIJKSE KEURINGEN (inspections)
// =====================================================
// Een door de gebruiker beheerde lijst van onderdelen met keuringsdata.
// Per onderdeel: keuringsbedrijf, contactgegevens, laatste/volgende
// keuringsdatum en een inplanvenster (vanaf wanneer de volgende keuring
// aangevraagd moet worden). Lokaal opgeslagen + gesynced via Firestore
// /inspections/{id}, exact hetzelfde patroon als msdsLinks hierboven.

// Losse vertaal-tabel voor de keuringen-UI (klein genoeg om hier te houden;
// valt terug op NL → EN als een taal een sleutel mist).
const INSP_T = {
  nl: {
    title: 'Jaarlijkse keuringen', sub: 'Beheer keuringen per onderdeel: laatste en volgende datum, plus wanneer je de volgende aanvraagt.',
    add: '+ Keuring toevoegen', empty: 'Nog geen keuringen toegevoegd.', empty_hint: 'Klik op "Keuring toevoegen" om te beginnen.',
    onderdeel: 'Onderdeel', bedrijf: 'Keuringsbedrijf', contact: 'Contactgegevens',
    laatste: 'Laatste keuring', volgende: 'Volgende keuring', inplan: 'Inplannen vanaf',
    inplan_help: 'Vanaf wanneer moet je de volgende keuring aanvragen?',
    st_expired: 'Verlopen', st_plan: 'Nu inplannen', st_ok: 'Op schema', st_none: 'Geen datum',
    d_late: '{n} dagen te laat', d_today: 'vandaag', d_in: 'over {n} dagen', d_plan_in: 'inplannen over {n} dagen',
    modal_add: 'Keuring toevoegen', modal_edit: 'Keuring bewerken',
    save: 'Opslaan', cancel: 'Annuleren', del: 'Verwijderen', del_confirm: 'Deze keuring verwijderen?',
    required: 'Vul minimaal de naam van het onderdeel in.', saved: 'Keuring opgeslagen', deleted: 'Keuring verwijderd',
    contact_ph: 'Contactpersoon, telefoon, e-mail…', edit: 'Bewerken', denied: 'Hiervoor heb je beheerrechten nodig.',
    btn_email: 'E-mail aanvraag', btn_call: 'Bellen',
    st_requested: 'Aangevraagd', btn_request: 'Markeer als aangevraagd', btn_requested: 'Aangevraagd', requested_on: 'Aangevraagd op {datum}', toast_marked: 'Gemarkeerd als aangevraagd', toast_unmarked: 'Aanvraag-markering verwijderd',
    reminder_one: '{n} keuring moet ingepland worden', reminder_many: '{n} keuringen moeten ingepland worden', reminder_btn: 'Bekijken',
    mail_subject: 'Keuringsaanvraag: {onderdeel}',
    mail_body: 'Beste {bedrijf},\n\nGraag willen wij een nieuwe keuring inplannen voor: {onderdeel}.\n\nLaatste keuring: {laatste}\nHuidige keuring verloopt op: {volgende}\n\nKunt u laten weten wanneer een afspraak mogelijk is? Alvast bedankt.\n\nMet vriendelijke groet,'
  },
  en: {
    title: 'Annual inspections', sub: 'Manage inspections per item: last and next date, plus when to request the next one.',
    add: '+ Add inspection', empty: 'No inspections added yet.', empty_hint: 'Click "Add inspection" to get started.',
    onderdeel: 'Item', bedrijf: 'Inspection company', contact: 'Contact details',
    laatste: 'Last inspection', volgende: 'Next inspection', inplan: 'Schedule from',
    inplan_help: 'From when should the next inspection be requested?',
    st_expired: 'Overdue', st_plan: 'Schedule now', st_ok: 'On schedule', st_none: 'No date',
    d_late: '{n} days overdue', d_today: 'today', d_in: 'in {n} days', d_plan_in: 'schedule in {n} days',
    modal_add: 'Add inspection', modal_edit: 'Edit inspection',
    save: 'Save', cancel: 'Cancel', del: 'Delete', del_confirm: 'Delete this inspection?',
    required: 'Please enter at least the item name.', saved: 'Inspection saved', deleted: 'Inspection deleted',
    contact_ph: 'Contact person, phone, e-mail…', edit: 'Edit', denied: 'You need admin rights for this.',
    btn_email: 'Email request', btn_call: 'Call',
    st_requested: 'Requested', btn_request: 'Mark as requested', btn_requested: 'Requested', requested_on: 'Requested on {datum}', toast_marked: 'Marked as requested', toast_unmarked: 'Request mark removed',
    reminder_one: '{n} inspection needs scheduling', reminder_many: '{n} inspections need scheduling', reminder_btn: 'View',
    mail_subject: 'Inspection request: {onderdeel}',
    mail_body: 'Dear {bedrijf},\n\nWe would like to schedule a new inspection for: {onderdeel}.\n\nLast inspection: {laatste}\nCurrent inspection expires on: {volgende}\n\nCould you let us know when an appointment is possible? Thank you in advance.\n\nKind regards,'
  },
  pl: {
    title: 'Przeglądy roczne', sub: 'Zarządzaj przeglądami: ostatnia i następna data oraz kiedy zamówić kolejny.',
    add: '+ Dodaj przegląd', empty: 'Brak przeglądów.', empty_hint: 'Kliknij „Dodaj przegląd”, aby zacząć.',
    onderdeel: 'Element', bedrijf: 'Firma kontrolna', contact: 'Dane kontaktowe',
    laatste: 'Ostatni przegląd', volgende: 'Następny przegląd', inplan: 'Planuj od',
    inplan_help: 'Od kiedy zamówić następny przegląd?',
    st_expired: 'Po terminie', st_plan: 'Zaplanuj teraz', st_ok: 'Zgodnie z planem', st_none: 'Brak daty',
    d_late: '{n} dni po terminie', d_today: 'dziś', d_in: 'za {n} dni', d_plan_in: 'zaplanuj za {n} dni',
    modal_add: 'Dodaj przegląd', modal_edit: 'Edytuj przegląd',
    save: 'Zapisz', cancel: 'Anuluj', del: 'Usuń', del_confirm: 'Usunąć ten przegląd?',
    required: 'Podaj przynajmniej nazwę elementu.', saved: 'Zapisano przegląd', deleted: 'Usunięto przegląd',
    contact_ph: 'Osoba kontaktowa, telefon, e-mail…', edit: 'Edytuj', denied: 'Wymagane uprawnienia administratora.',
    btn_email: 'Wniosek e-mail', btn_call: 'Zadzwoń',
    st_requested: 'Zamówiony', btn_request: 'Oznacz jako zamówiony', btn_requested: 'Zamówiony', requested_on: 'Zamówiono {datum}', toast_marked: 'Oznaczono jako zamówiony', toast_unmarked: 'Usunięto oznaczenie',
    reminder_one: '{n} przegląd wymaga zaplanowania', reminder_many: '{n} przeglądów wymaga zaplanowania', reminder_btn: 'Pokaż',
    mail_subject: 'Wniosek o przegląd: {onderdeel}',
    mail_body: 'Szanowni Państwo ({bedrijf}),\n\nChcielibyśmy zaplanować nowy przegląd dla: {onderdeel}.\n\nOstatni przegląd: {laatste}\nObecny przegląd wygasa: {volgende}\n\nProsimy o informację, kiedy możliwy jest termin. Z góry dziękujemy.\n\nZ poważaniem,'
  },
  ro: {
    title: 'Verificări anuale', sub: 'Gestionează verificările: ultima și următoarea dată și când să o ceri pe următoarea.',
    add: '+ Adaugă verificare', empty: 'Nicio verificare adăugată.', empty_hint: 'Apasă „Adaugă verificare” pentru a începe.',
    onderdeel: 'Componentă', bedrijf: 'Firmă de verificare', contact: 'Date de contact',
    laatste: 'Ultima verificare', volgende: 'Următoarea verificare', inplan: 'Planifică din',
    inplan_help: 'De când trebuie cerută următoarea verificare?',
    st_expired: 'Expirat', st_plan: 'Planifică acum', st_ok: 'Conform planului', st_none: 'Fără dată',
    d_late: '{n} zile întârziere', d_today: 'azi', d_in: 'în {n} zile', d_plan_in: 'planifică în {n} zile',
    modal_add: 'Adaugă verificare', modal_edit: 'Editează verificarea',
    save: 'Salvează', cancel: 'Anulează', del: 'Șterge', del_confirm: 'Ștergi această verificare?',
    required: 'Introdu cel puțin numele componentei.', saved: 'Verificare salvată', deleted: 'Verificare ștearsă',
    contact_ph: 'Persoană de contact, telefon, e-mail…', edit: 'Editează', denied: 'Ai nevoie de drepturi de administrator.',
    btn_email: 'Cerere e-mail', btn_call: 'Sună',
    st_requested: 'Solicitat', btn_request: 'Marchează ca solicitat', btn_requested: 'Solicitat', requested_on: 'Solicitat la {datum}', toast_marked: 'Marcat ca solicitat', toast_unmarked: 'Marcaj eliminat',
    reminder_one: '{n} verificare trebuie programată', reminder_many: '{n} verificări trebuie programate', reminder_btn: 'Vezi',
    mail_subject: 'Cerere de verificare: {onderdeel}',
    mail_body: 'Stimată firmă {bedrijf},\n\nDorim să programăm o nouă verificare pentru: {onderdeel}.\n\nUltima verificare: {laatste}\nVerificarea curentă expiră la: {volgende}\n\nNe puteți spune când este posibilă o programare? Vă mulțumim.\n\nCu stimă,'
  }
};
function inspT() {
  const base = INSP_T.nl;
  const cur = INSP_T[state.lang] || {};
  return Object.assign({}, base, INSP_T.en, cur);
}

// Mag de huidige gebruiker keuringen toevoegen/bewerken/verwijderen?
// Lokaal (geen auth) = ja; ingelogd = alleen admin/superuser. Zelfde regel
// als bij de MSDS-links.
function canEditInspections() {
  return !state.authUser || isAdmin();
}

// Parse 'YYYY-MM-DD' → Date (lokale middernacht). Lege/ongeldige → null.
function inspParseDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
// 'YYYY-MM-DD' → 'dd-mm-yyyy' voor weergave. Leeg → '—'.
function inspFmtDate(s) {
  const d = inspParseDate(s);
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}
// Aantal hele dagen tussen vandaag (middernacht) en een datum.
function inspDaysFromToday(d) {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// Bepaal de status van een keuring op basis van: aangevraagd-vlag, volgende
// datum en inplanvenster. Prioriteit: aangevraagd > verlopen > nu inplannen >
// op schema > geen datum. "Aangevraagd" wint zodat de oranje "Nu inplannen"-
// melding tot rust komt zodra de keuring daadwerkelijk is aangevraagd.
function getInspectionStatus(rec) {
  const L = inspT();
  const next = inspParseDate(rec.volgende);
  const plan = inspParseDate(rec.inplan);
  // Aangevraagd: rustige (blauwe) status. Toont wanneer de aanvraag is gedaan;
  // is de keuring desondanks al verlopen, dan tonen we dat erbij zodat een
  // echte achterstand niet verborgen blijft.
  if (rec.aangevraagd) {
    const dN = next ? inspDaysFromToday(next) : null;
    let detail = rec.aangevraagdOp
      ? L.requested_on.replace('{datum}', inspFmtDate(rec.aangevraagdOp))
      : L.st_requested;
    if (dN !== null && dN < 0) detail += ' · ' + L.d_late.replace('{n}', Math.abs(dN));
    return { key: 'requested', label: L.st_requested, cls: 'insp-st-requested', detail };
  }
  if (!next) return { key: 'none', label: L.st_none, cls: 'insp-st-none', detail: '' };
  const dNext = inspDaysFromToday(next);
  if (dNext < 0) {
    return { key: 'expired', label: L.st_expired, cls: 'insp-st-expired',
      detail: L.d_late.replace('{n}', Math.abs(dNext)) };
  }
  if (plan && inspDaysFromToday(plan) <= 0) {
    // We zitten in (of voorbij) het inplanvenster maar de keuring is nog niet
    // verlopen → tijd om aan te vragen.
    return { key: 'plan', label: L.st_plan, cls: 'insp-st-plan',
      detail: dNext === 0 ? L.d_today : L.d_in.replace('{n}', dNext) };
  }
  // Op schema. Toon óf "inplannen over X dagen" (als er een venster is) óf
  // gewoon de dagen tot de keuring.
  let detail;
  if (plan) {
    const dPlan = inspDaysFromToday(plan);
    detail = L.d_plan_in.replace('{n}', dPlan);
  } else {
    detail = dNext === 0 ? L.d_today : L.d_in.replace('{n}', dNext);
  }
  return { key: 'ok', label: L.st_ok, cls: 'insp-st-ok', detail };
}

// Lijst van keuringen, gesorteerd op urgentie (verlopen eerst, dan op
// eerstvolgende keuringsdatum). Records zonder datum onderaan.
function getInspectionsSorted() {
  const arr = Object.values(state.inspections || {});
  const rank = { expired: 0, plan: 1, requested: 2, ok: 3, none: 4 };
  return arr.sort((a, b) => {
    const sa = getInspectionStatus(a), sb = getInspectionStatus(b);
    if (rank[sa.key] !== rank[sb.key]) return rank[sa.key] - rank[sb.key];
    const da = inspParseDate(a.volgende), db = inspParseDate(b.volgende);
    if (da && db) return da - db;
    if (da) return -1;
    if (db) return 1;
    return (a.onderdeel || '').localeCompare(b.onderdeel || '');
  });
}

// Haal het eerste e-mailadres uit het vrije contact-veld (of '').
function inspExtractEmail(contact) {
  if (!contact) return '';
  const m = String(contact).match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m ? m[0] : '';
}
// Haal het eerste telefoonnummer uit het contact-veld (of ''). Houdt rekening
// met NL-notaties: 06-12345678, +31 6 1234 5678, (0114) 123456, etc.
function inspExtractPhone(contact) {
  if (!contact) return '';
  // Zoek een reeks van cijfers/spaties/-/()/+ van minstens 8 telcijfers.
  const m = String(contact).match(/(\+?\d[\d\s().-]{7,}\d)/);
  if (!m) return '';
  return m[1].trim();
}
// Normaliseer een telefoonnummer voor een tel:-link (alleen + en cijfers).
function inspTelHref(phone) {
  const cleaned = String(phone).replace(/[^\d+]/g, '');
  return 'tel:' + cleaned;
}
// Bouw een mailto:-link met voorgevulde onderwerp + body. Ontvanger = het
// e-mailadres uit het contact-veld (indien aanwezig), anders leeg zodat de
// gebruiker zelf de geadresseerde kiest.
function buildInspectionMailto(rec) {
  const L = inspT();
  const to = inspExtractEmail(rec.contact);
  const fill = (s) => String(s)
    .replace('{onderdeel}', rec.onderdeel || '—')
    .replace('{bedrijf}', rec.bedrijf || '')
    .replace('{laatste}', inspFmtDate(rec.laatste))
    .replace('{volgende}', inspFmtDate(rec.volgende));
  const subject = fill(L.mail_subject);
  const body = fill(L.mail_body);
  return 'mailto:' + encodeURIComponent(to) +
    '?subject=' + encodeURIComponent(subject) +
    '&body=' + encodeURIComponent(body);
}

// Keuringen die ACTIE vragen: status 'nu inplannen' of 'verlopen', en nog
// niet als aangevraagd gemarkeerd (die zijn immers al afgehandeld).
function getInspectionsNeedingAction() {
  return Object.values(state.inspections || {}).filter(rec => {
    if (rec.aangevraagd) return false;
    const k = getInspectionStatus(rec).key;
    return k === 'plan' || k === 'expired';
  });
}

// In-app herinnering (banner) voor de Vandaag-view: toont hoeveel keuringen
// ingepland moeten worden, met een knop naar de Keuringen-tab. Alleen voor
// wie keuringen mag beheren — cleaners worden niet lastiggevallen.
function renderInspectionReminder() {
  if (!canEditInspections()) return '';
  const items = getInspectionsNeedingAction();
  if (!items.length) return '';
  const L = inspT();
  const n = items.length;
  const txt = (n === 1 ? L.reminder_one : L.reminder_many).replace('{n}', n);
  return `
    <div class="insp-reminder" role="status">
      <span class="insp-reminder-ic">${ic('clipboard', 20)}</span>
      <span class="insp-reminder-text">${esc(txt)}</span>
      <button class="insp-reminder-btn" onclick="switchTab('inspections')">${esc(L.reminder_btn)}</button>
    </div>`;
}

// Inline SVG-iconen (Lucide-stijl, currentColor, 1.8px lijn) ter vervanging
// van emoji's in de Keuringen-tab. Crisp op elk scherm, schaalt mee met de
// tekstkleur. 'dots' is gevuld (kebab), de rest is lijnwerk.
function ic(name, size) {
  const s = size || 18;
  const P = {
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="m9 13 2 2 4-4"/>',
    building: '<path d="M3 21h18"/><path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16"/><path d="M15 21v-9h4v9"/><path d="M9 7h0M12 7h0M9 11h0M12 11h0"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-4.5"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>'
  };
  if (name === 'dots') {
    return `<svg class="ic" viewBox="0 0 24 24" width="${s}" height="${s}" fill="currentColor" aria-hidden="true">`
      + '<circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>';
  }
  return `<svg class="ic" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" `
    + `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

function renderInspectionsView() {
  const L = inspT();
  const editable = canEditInspections();
  const list = getInspectionsSorted();

  const addBtn = editable
    ? `<button class="insp-add-btn" onclick="openInspectionModal()">${esc(L.add)}</button>`
    : '';

  let body;
  if (!list.length) {
    body = `<div class="insp-empty">
      <p class="insp-empty-title">${esc(L.empty)}</p>
      ${editable ? `<p class="insp-empty-hint">${esc(L.empty_hint)}</p>` : ''}
    </div>`;
  } else {
    body = `<div class="insp-list">` + list.map(rec => {
      const st = getInspectionStatus(rec);
      const open = !!(state.inspOpenIds && state.inspOpenIds[rec.id]);
      const contactHtml = rec.contact
        ? `<div class="insp-contact">${esc(rec.contact).replace(/\n/g, '<br>')}</div>` : '';
      // Communicatie-knoppen: altijd een e-mailknop (vult onderwerp + body met
      // de keuringsdata); een belknop alleen als er een telefoonnummer in het
      // contact-veld staat.
      const phone = inspExtractPhone(rec.contact);
      const mailto = buildInspectionMailto(rec);
      const commsHtml = `
        <div class="insp-comms">
          <a class="insp-comm-btn insp-comm-mail" href="${esc(mailto)}">${ic('mail')}<span>${esc(L.btn_email)}</span></a>
          ${phone ? `<a class="insp-comm-btn insp-comm-call" href="${esc(inspTelHref(phone))}">${ic('phone')}<span>${esc(L.btn_call)}</span></a>` : ''}
        </div>`;
      // "Aangevraagd"-toggle: alleen voor bewerkers. Actief = ingedrukte stijl.
      const reqBtn = editable ? `
        <button class="insp-req-btn ${rec.aangevraagd ? 'is-on' : ''}"
          onclick="toggleInspectionAangevraagd('${esc(rec.id)}')"
          aria-pressed="${rec.aangevraagd ? 'true' : 'false'}">
          ${rec.aangevraagd ? ic('check') : ic('send')}<span>${rec.aangevraagd ? esc(L.btn_requested) : esc(L.btn_request)}</span>
        </button>` : '';
      // Kebab-menu (⋮) met wijzig + verwijder, alleen voor bewerkers.
      const kebab = editable ? `
        <button class="insp-kebab" onclick="event.stopPropagation();toggleInspMenu('${esc(rec.id)}')"
          aria-label="Meer" aria-haspopup="true">${ic('dots', 20)}</button>
        <div class="insp-menu" id="insp-menu-${esc(rec.id)}" role="menu">
          <button role="menuitem" onclick="event.stopPropagation();closeAllInspMenus();openInspectionModal('${esc(rec.id)}')">${ic('pencil')}<span>${esc(L.edit)}</span></button>
          <button role="menuitem" class="insp-menu-del" onclick="event.stopPropagation();closeAllInspMenus();deleteInspection('${esc(rec.id)}')">${ic('trash')}<span>${esc(L.del)}</span></button>
        </div>` : '';
      const pill = rec.bedrijf ? `<span class="insp-head-pill">${ic('building', 13)}${esc(rec.bedrijf)}</span>` : '';
      return `
        <div class="insp-item ${open ? 'is-open' : ''} ${rec.aangevraagd ? 'is-requested' : ''}" id="insp-item-${esc(rec.id)}">
          <div class="insp-item-head" role="button" tabindex="0" aria-expanded="${open ? 'true' : 'false'}"
            onclick="toggleInspItem('${esc(rec.id)}')" onkeydown="inspHeadKey(event,'${esc(rec.id)}')">
            <div class="insp-head-text">
              <span class="insp-head-title">${esc(rec.onderdeel || '—')}</span>
              ${pill}
            </div>
            <span class="insp-badge ${st.cls}">${esc(st.label)}</span>
            ${kebab}
            <span class="insp-chevron" aria-hidden="true">${ic('chevron', 18)}</span>
          </div>
          <div class="insp-item-body">
            <div class="insp-item-body-inner">
              ${contactHtml}
              <dl class="insp-dates">
                <div class="insp-date"><dt>${esc(L.laatste)}</dt><dd>${inspFmtDate(rec.laatste)}</dd></div>
                <div class="insp-date"><dt>${esc(L.volgende)}</dt><dd>${inspFmtDate(rec.volgende)}</dd></div>
                <div class="insp-date"><dt>${esc(L.inplan)}</dt><dd>${inspFmtDate(rec.inplan)}</dd></div>
              </dl>
              ${st.detail ? `<div class="insp-detail ${st.cls}-text">${esc(st.detail)}</div>` : ''}
              ${reqBtn}
              ${commsHtml}
            </div>
          </div>
        </div>`;
    }).join('') + `</div>`;
  }

  return `
    <div class="insp-view">
      <div class="insp-header">
        <div class="insp-header-text">
          <h2 class="insp-header-title">${ic('clipboard', 22)}<span>${esc(L.title)}</span></h2>
          <p class="insp-header-sub">${esc(L.sub)}</p>
        </div>
        ${addBtn}
      </div>
      ${body}
    </div>`;
}

// Open het keuring-modal. Zonder id = nieuw; met id = bewerken.
function openInspectionModal(id) {
  const L = inspT();
  if (!canEditInspections()) { showToast(L.denied, 'error'); return; }
  const rec = id ? (state.inspections[id] || null) : null;
  state.editingInspectionId = id || null;
  const g = (x) => document.getElementById(x);
  g('inspection-modal-title').textContent = rec ? L.modal_edit : L.modal_add;
  g('insp-f-onderdeel').value = rec ? (rec.onderdeel || '') : '';
  g('insp-f-bedrijf').value   = rec ? (rec.bedrijf || '') : '';
  g('insp-f-contact').value   = rec ? (rec.contact || '') : '';
  g('insp-f-laatste').value   = rec ? (rec.laatste || '') : '';
  g('insp-f-volgende').value  = rec ? (rec.volgende || '') : '';
  g('insp-f-inplan').value    = rec ? (rec.inplan || '') : '';
  // Labels (zodat ze de juiste taal volgen)
  g('insp-l-onderdeel').textContent = L.onderdeel;
  g('insp-l-bedrijf').textContent   = L.bedrijf;
  g('insp-l-contact').textContent   = L.contact;
  g('insp-l-laatste').textContent   = L.laatste;
  g('insp-l-volgende').textContent  = L.volgende;
  g('insp-l-inplan').textContent    = L.inplan;
  g('insp-l-inplan-help').textContent = L.inplan_help;
  g('insp-f-contact').placeholder = L.contact_ph;
  g('insp-save-btn').textContent = L.save;
  g('insp-cancel-btn').textContent = L.cancel;
  // Delete-knop alleen bij bewerken
  const delBtn = g('insp-delete-btn');
  if (rec) { delBtn.style.display = ''; delBtn.textContent = L.del; delBtn.onclick = () => deleteInspection(rec.id); }
  else { delBtn.style.display = 'none'; }
  g('inspection-modal').classList.add('show');
  setTimeout(() => g('insp-f-onderdeel').focus(), 50);
}
function closeInspectionModal() {
  const m = document.getElementById('inspection-modal');
  if (m) m.classList.remove('show');
  state.editingInspectionId = null;
}

async function saveInspection() {
  const L = inspT();
  if (!canEditInspections()) { showToast(L.denied, 'error'); return; }
  const g = (x) => document.getElementById(x);
  const onderdeel = g('insp-f-onderdeel').value.trim();
  if (!onderdeel) { showToast(L.required, 'error'); g('insp-f-onderdeel').focus(); return; }
  const id = state.editingInspectionId || ('insp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
  const existing = state.inspections[id] || {};
  const newVolgende = g('insp-f-volgende').value || '';
  // Behoud de "aangevraagd"-markering, maar reset 'm zodra een nieuwe
  // volgende keuringsdatum wordt ingevuld (= nieuwe cyclus, oude aanvraag
  // is afgerond). Zo blijft de markering niet ten onrechte staan.
  let aangevraagd = !!existing.aangevraagd;
  let aangevraagdOp = existing.aangevraagdOp;
  let aangevraagdDoor = existing.aangevraagdDoor;
  if (existing.volgende && newVolgende && existing.volgende !== newVolgende) {
    aangevraagd = false; aangevraagdOp = undefined; aangevraagdDoor = undefined;
  }
  const rec = {
    id,
    onderdeel,
    bedrijf: g('insp-f-bedrijf').value.trim(),
    contact: g('insp-f-contact').value.trim(),
    laatste: g('insp-f-laatste').value || '',
    volgende: newVolgende,
    inplan: g('insp-f-inplan').value || '',
    aangevraagd,
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedBy: state.currentUser || (state.authUser && state.authUser.email) || '',
    updatedAt: new Date().toISOString()
  };
  if (aangevraagd && aangevraagdOp) { rec.aangevraagdOp = aangevraagdOp; rec.aangevraagdDoor = aangevraagdDoor; }
  state.inspections[id] = rec;
  saveState();
  if (fbDb && state.authUser) {
    try { await fbDb.collection('inspections').doc(id).set(rec); }
    catch (err) { console.error('Inspection save failed:', err); }
  }
  closeInspectionModal();
  if (state.activeTab === 'inspections') renderApp();
  showToast(L.saved, 'success');
}

async function deleteInspection(id) {
  const L = inspT();
  if (!canEditInspections()) { showToast(L.denied, 'error'); return; }
  if (!state.inspections[id]) return;
  if (!confirm(L.del_confirm)) return;
  delete state.inspections[id];
  if (state.inspOpenIds) delete state.inspOpenIds[id];
  saveState();
  if (fbDb && state.authUser) {
    try { await fbDb.collection('inspections').doc(id).delete(); }
    catch (err) { console.error('Inspection delete failed:', err); }
  }
  closeInspectionModal();
  if (state.activeTab === 'inspections') renderApp();
  showToast(L.deleted, 'success');
}

// Markeer een keuring als "aangevraagd" (of haal de markering weg). Slaat de
// datum + gebruiker op zodat we kunnen tonen wanneer de aanvraag is gedaan.
async function toggleInspectionAangevraagd(id) {
  const L = inspT();
  if (!canEditInspections()) { showToast(L.denied, 'error'); return; }
  const rec = state.inspections[id];
  if (!rec) return;
  const now = !rec.aangevraagd;
  rec.aangevraagd = now;
  if (now) {
    rec.aangevraagdOp = new Date().toISOString().slice(0, 10);
    rec.aangevraagdDoor = state.currentUser || (state.authUser && state.authUser.email) || '';
  } else {
    delete rec.aangevraagdOp;
    delete rec.aangevraagdDoor;
  }
  rec.updatedAt = new Date().toISOString();
  saveState();
  if (fbDb && state.authUser) {
    try { await fbDb.collection('inspections').doc(id).set(rec); }
    catch (err) { console.error('Inspection update failed:', err); }
  }
  if (state.activeTab === 'inspections') renderApp();
  showToast(now ? L.toast_marked : L.toast_unmarked, 'success');
}

// Klap een lijst-item open/dicht. Manipuleert de DOM rechtstreeks (geen
// re-render) zodat de CSS-uitklap-animatie soepel loopt; de open-staat wordt
// in state.inspOpenIds bewaard zodat een latere re-render 'm open houdt.
function toggleInspItem(id) {
  const el = document.getElementById('insp-item-' + id);
  if (!el) return;
  const open = el.classList.toggle('is-open');
  const head = el.querySelector('.insp-item-head');
  if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (!state.inspOpenIds) state.inspOpenIds = {};
  if (open) state.inspOpenIds[id] = true; else delete state.inspOpenIds[id];
  closeAllInspMenus();
}
// Toetsenbord: Enter/Spatie op de rij-kop klapt open/dicht.
function inspHeadKey(ev, id) {
  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleInspItem(id); }
}
// Open/sluit het kebab-menu (⋮) van één item.
function toggleInspMenu(id) {
  const menu = document.getElementById('insp-menu-' + id);
  if (!menu) return;
  const willOpen = !menu.classList.contains('is-open');
  closeAllInspMenus();
  if (willOpen) {
    menu.classList.add('is-open');
    // Sluit bij klik buiten het menu (capture zodat we 'm vóór andere
    // handlers afvangen).
    setTimeout(() => document.addEventListener('click', inspMenuOutside, true), 0);
  }
}
function closeAllInspMenus() {
  document.querySelectorAll('.insp-menu.is-open').forEach(m => m.classList.remove('is-open'));
  document.removeEventListener('click', inspMenuOutside, true);
}
function inspMenuOutside(e) {
  if (e.target.closest && (e.target.closest('.insp-menu') || e.target.closest('.insp-kebab'))) return;
  closeAllInspMenus();
}

// Live-sync: luister naar /inspections voor wijzigingen van andere gebruikers.
let unsubscribeInspectionsListener = null;
function subscribeToInspections() {
  if (!fbDb || !state.authUser) return;
  if (unsubscribeInspectionsListener) { try { unsubscribeInspectionsListener(); } catch(e) {} }
  unsubscribeInspectionsListener = fbDb.collection('inspections').onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      const id = change.doc.id;
      if (change.type === 'removed') delete state.inspections[id];
      else state.inspections[id] = change.doc.data();
    });
    if (state.activeTab === 'inspections') {
      const container = document.getElementById('filters-and-content');
      if (container) container.innerHTML = renderInspectionsView();
    }
  }, err => console.error('Inspections listener error:', err));
}

// Render the link block inside the MSDS modal. Three states:
//   1. Has link + admin   -> show link + edit/delete buttons
//   2. Has link + user    -> show link only (read-only)
//   3. No link  + admin   -> show input field to add a link
//   4. No link  + user    -> show "no link" message
function renderMsdsLinkBlock(productName) {
  const L = T[state.lang];
  const key = msdsKey(productName);
  const entry = state.msdsLinks[key];
  const local = !state.authUser;
  const admin = local || isAdmin();
  const safeName = esc(productName).replace(/'/g, "\\'");
  let html = '<div class="msds-file-block">';
  html += `<h3>${L.msds_file_title}</h3>`;
  if (entry && entry.url) {
    const dt = entry.updatedAt ? new Date(entry.updatedAt) : null;
    const stamp = dt ? `${dt.getDate()}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}` : '';
    // Truncate display URL to keep the card tidy
    let displayUrl = entry.url.replace(/^https?:\/\//, '');
    if (displayUrl.length > 50) displayUrl = displayUrl.slice(0, 47) + '...';
    html += `<div class="msds-file-card">
      <div class="msds-file-icon">🔗</div>
      <div class="msds-file-info">
        <div class="msds-file-name">${esc(displayUrl)}</div>
        <div class="msds-file-meta">${entry.updatedBy ? L.msds_uploaded_by + ' ' + esc(entry.updatedBy) : ''}${stamp ? ' · ' + stamp : ''}</div>
      </div>
      <div class="msds-file-actions">
        <a class="btn-mini active" href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer">↗ ${L.msds_open_link}</a>
        ${admin ? `<button class="btn-mini" onclick="showMsdsLinkEditor('${safeName}')">✏️</button>` : ''}
        ${admin ? `<button class="btn-mini" onclick="deleteMsdsLink('${safeName}')">🗑</button>` : ''}
      </div>
    </div>`;
  } else if (admin) {
    // Admin and no link yet — show input editor
    html += `<p class="msds-file-empty">${L.msds_link_none_admin}</p>`;
    html += renderMsdsLinkEditor(productName);
  } else {
    // Regular user and no link
    html += `<p class="msds-file-empty">${L.msds_link_none}</p>`;
  }
  html += '</div>';
  return html;
}

// Inline editor for entering / changing the link URL
function renderMsdsLinkEditor(productName) {
  const L = T[state.lang];
  const key = msdsKey(productName);
  const entry = state.msdsLinks[key];
  const safeName = esc(productName).replace(/'/g, "\\'");
  return `<div class="msds-link-editor">
    <input type="url" id="msds-link-input"
      placeholder="${L.msds_link_placeholder}"
      value="${entry && entry.url ? esc(entry.url) : ''}"
      onkeydown="if(event.key==='Enter') saveMsdsLink('${safeName}')">
    <button class="btn btn-primary" onclick="saveMsdsLink('${safeName}')">${L.msds_link_save}</button>
  </div>`;
}

// Show the editor (replaces the read-only card with the input field)
function showMsdsLinkEditor(productName) {
  const row = document.getElementById('msds-link-row');
  if (row) {
    const block = row.querySelector('.msds-file-block');
    if (block) {
      const L = T[state.lang];
      block.innerHTML = `<h3>${L.msds_file_title}</h3>` + renderMsdsLinkEditor(productName);
      const input = document.getElementById('msds-link-input');
      if (input) input.focus();
    }
  }
}

// =====================================================
// SIDEBAR — slide-in menu replacing header overflow buttons
// =====================================================

function toggleSidebar() {
  const open = document.getElementById('sidebar').classList.contains('open');
  if (open) closeSidebar(); else openSidebar();
}

function openSidebar() {
  renderSidebar();
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-backdrop').classList.add('show');
  document.getElementById('sidebar').setAttribute('aria-hidden', 'false');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('show');
  document.getElementById('sidebar').setAttribute('aria-hidden', 'true');
}

// Build the sidebar items based on the current user's role. Items are grouped
// in sections so the menu stays scannable as more functionality lands here.
function renderSidebar() {
  const L = T[state.lang];
  const body = document.getElementById('sidebar-body');
  if (!body) return;
  // Title shows current user / role
  const titleEl = document.getElementById('sidebar-title');
  if (titleEl) titleEl.textContent = L.sidebar_title || 'Menu';
  
  // Local mode (no auth): show all admin features (gated by EDIT_PASSWORD)
  const local = !state.authUser;
  const admin = local || isAdmin();
  const su = !local && isSuperuser();
  const roleLabel = !state.authUser ? L.sidebar_role_local
    : isSuperuser() ? L.sidebar_role_superuser
    : isAdmin() ? L.sidebar_role_admin
    : L.sidebar_role_user;
  const userLabel = state.currentUser
    ? (state.currentUser + (state.authUser ? ' · ' + roleLabel : ''))
    : (state.authUser ? state.authUser.email + ' · ' + roleLabel : L.user_anon_label);
  
  let html = `
    <div class="sidebar-userblock">
      <div class="sidebar-user-icon">👤</div>
      <div class="sidebar-user-text">
        <div class="sidebar-user-name">${esc(userLabel)}</div>
      </div>
    </div>
    <button class="sidebar-item" onclick="openUserModal(); closeSidebar();">
      <span class="sidebar-icon">✏️</span>
      <span class="sidebar-label">${L.sidebar_change_name}</span>
    </button>
  `;
  
  // ====== NAVIGATION ======
  html += `<div class="sidebar-section-title">${L.sidebar_section_navigate}</div>`;
  html += `
    <button class="sidebar-item ${state.activeTab === 'today' ? 'active' : ''}" onclick="switchTab('today'); closeSidebar();">
      <span class="sidebar-icon">🏠</span>
      <span class="sidebar-label">${L.tabs.today}</span>
    </button>
    <button class="sidebar-item ${state.activeTab === 'dashboard' ? 'active' : ''}" onclick="switchTab('dashboard'); closeSidebar();">
      <span class="sidebar-icon">📊</span>
      <span class="sidebar-label">${L.dashboard_btn}</span>
    </button>`;
  // Coördinator-overzicht — alleen voor admins en super-users (en local-mode).
  // Deze tab geeft de "oude" tabel-view terug per frequentie, met een
  // sub-tabbalk om snel tussen freqs te wisselen. Bedoeld voor planning &
  // oversight; gewone uitvoerders zien dit niet.
  if (admin) {
    html += `
    <button class="sidebar-item ${state.activeTab === 'coordinator' ? 'active' : ''}" onclick="switchTab('coordinator'); closeSidebar();">
      <span class="sidebar-icon">🗂</span>
      <span class="sidebar-label">${L.tabs.coordinator}</span>
    </button>`;
  }
  html += `
    <button class="sidebar-item ${state.activeTab === 'products' ? 'active' : ''}" onclick="switchTab('products'); closeSidebar();">
      <span class="sidebar-icon">🧴</span>
      <span class="sidebar-label">${L.products_btn}</span>
    </button>`;
  // Versiebeheer-knop alleen tonen als de feature is ingeschakeld.
  if (isFeatureEnabled('changelog')) {
    html += `
    <button class="sidebar-item ${state.activeTab === 'changelog' ? 'active' : ''}" onclick="switchTab('changelog'); closeSidebar();">
      <span class="sidebar-icon">📋</span>
      <span class="sidebar-label">${L.tabs.changelog_label}</span>
    </button>`;
  }
  html += ``;

  // Settings — alleen zichtbaar voor admin/super-user (Etsy-customisation).
  // Gated met dezelfde `admin`-flag als de Coördinator-knop.
  if (admin) {
    html += `
    <button class="sidebar-item ${state.activeTab === 'settings' ? 'active' : ''}" onclick="switchTab('settings'); closeSidebar();">
      <span class="sidebar-icon">⚙️</span>
      <span class="sidebar-label">${L.settings_tab_label}</span>
    </button>`;
  }
  
  // ====== TOOLS (everyone) ======
  html += `<div class="sidebar-section-title">${L.sidebar_section_tools}</div>`;
  html += `
    <button class="sidebar-item" onclick="openHelpModal(); closeSidebar();">
      <span class="sidebar-icon">ℹ️</span>
      <span class="sidebar-label">${L.help_btn}</span>
    </button>`;
  if (isFeatureEnabled('qrCodes')) {
    html += `
    <button class="sidebar-item" onclick="openQrCodesModal(); closeSidebar();">
      <span class="sidebar-icon">🔲</span>
      <span class="sidebar-label">${L.qr_btn}</span>
    </button>`;
  }
  if (isFeatureEnabled('excelExport')) {
    html += `
    <button class="sidebar-item" onclick="exportToExcel(); closeSidebar();">
      <span class="sidebar-icon">⬇</span>
      <span class="sidebar-label">${L.export_excel}</span>
    </button>`;
  }
  html += ``;
  
  // ====== ADMIN tools ======
  if (admin) {
    html += `<div class="sidebar-section-title">${L.sidebar_section_admin}</div>`;
    html += `
      <button class="sidebar-item" onclick="toggleEditMode(); closeSidebar();">
        <span class="sidebar-icon">${state.editUnlocked ? '🔓' : '🔒'}</span>
        <span class="sidebar-label">${state.editUnlocked ? L.edit_mode_unlocked_btn : L.edit_mode_locked_btn}</span>
      </button>
      <button class="sidebar-item" onclick="triggerImportPlan(); closeSidebar();">
        <span class="sidebar-icon">⬆</span>
        <span class="sidebar-label">${L.sidebar_import}</span>
      </button>
      <button class="sidebar-item" onclick="exportBackup(); closeSidebar();">
        <span class="sidebar-icon">💾</span>
        <span class="sidebar-label">${L.backup_btn}</span>
      </button>
      <button class="sidebar-item" onclick="triggerRestoreBackup(); closeSidebar();">
        <span class="sidebar-icon">📥</span>
        <span class="sidebar-label">${L.restore_btn}</span>
      </button>
    `;
  }
  
  // ====== SUPERUSER ======
  if (su) {
    html += `<div class="sidebar-section-title">${L.sidebar_section_su}</div>`;
    html += `
      <button class="sidebar-item" onclick="openUserManagementModal(); closeSidebar();">
        <span class="sidebar-icon">🛡</span>
        <span class="sidebar-label">${L.sidebar_manage_users}</span>
      </button>
    `;
  }
  
  // ====== ACCOUNT (sign out) — only when authenticated ======
  if (state.authUser) {
    html += `<div class="sidebar-section-title">${L.sidebar_section_account}</div>`;
    html += `
      <button class="sidebar-item sidebar-danger" onclick="signOut();">
        <span class="sidebar-icon">🚪</span>
        <span class="sidebar-label">${L.sidebar_sign_out}</span>
      </button>
    `;
  }

  // ====== PWA install prompt — shown when the browser supports it ======
  if (state.canInstallPwa) {
    html += `<div class="sidebar-section-title">${L.sidebar_section_app}</div>`;
    html += `
      <button class="sidebar-item" onclick="window.installPwa(); closeSidebar();">
        <span class="sidebar-icon">📱</span>
        <span class="sidebar-label">${L.pwa_install_btn}</span>
      </button>
    `;
  }

  body.innerHTML = html;
}

function openHelpModal() {
  const L = T[state.lang];
  const body = document.getElementById('help-modal-body');
  if (body) body.innerHTML = renderHelpContent();
  // Update modal header + footer text per current language
  const titleEl = document.querySelector('#help-modal h2');
  if (titleEl) titleEl.textContent = 'ℹ️ ' + (state.lang === 'nl' ? 'Handleiding Schoonmaakplan' : 'User Guide');
  const subEl = document.querySelector('#help-modal .modal-header div div');
  if (subEl) subEl.textContent = state.lang === 'nl' ? 'Uitleg over het gebruik, de waarden en hoe je taken beheert' : 'How to use the plan, what the values mean and how to manage tasks';
  const closeBtn = document.querySelector('#help-modal .btn-cancel');
  if (closeBtn) closeBtn.textContent = L.help_close;
  const m = document.getElementById('help-modal');
  if (m) m.classList.add('show');
}

function closeHelpModal() {
  const m = document.getElementById('help-modal');
  if (m) m.classList.remove('show');
}

function renderHelpContent() {
  // Language-aware help (NL default, EN when state.lang === 'en')
  const isEn = state.lang !== 'nl'; // EN, PL and RO all show the English help text
  const nl = `
<div class="help-content">

<h3>📖 Wat is dit?</h3>
<p>Dit is een digitale versie van het schoonmaakplan <code>GTE-D-09-99</code>. Het plan beschrijft per ruimte en werkplek welke taken er gedaan moeten worden, hoe vaak, door wie, met welk middel en welke methode. Je kunt taken aanvinken zodra ze zijn uitgevoerd, foto's toevoegen, het hele plan exporteren naar Excel, en wijzigingen vastleggen in Versiebeheer.</p>

<h3>🏠 Vandaag-view <span class="help-new-pill">Nieuw</span></h3>
<p>Bij het openen van de app land je standaard op <strong>🏠 Vandaag</strong>. Dit is een slimme verzamellijst van alles wat <em>nu</em> moet gebeuren — geen tabbladen-zoeken meer:</p>
<ul>
  <li>Alle dagelijkse taken die nog niet zijn afgevinkt voor vandaag</li>
  <li>Achterstand uit eerdere periodes (zichtbaar met een ⚠ Achterstand-pil)</li>
  <li>Wekelijkse, maandelijkse en kwartaal-taken die in hun huidige slot vallen — bv. een kwartaaltaak verschijnt alleen in de laatste maand van het kwartaal</li>
  <li>Specifieke dag-taken (Zaterdag-werk, 2x per week) verschijnen alleen op de matchende dag</li>
</ul>
<p>De taken zijn gegroepeerd op <code>wanneer</code>-veld in een logische volgorde: eerst Tijdens productie, dan 1x per dag, Na gebruik, en zo door tot de zaterdagklussen. Wanneer alle taken klaar zijn verschijnt een feestelijke <strong>"🎉 Alles klaar!"</strong>-hero.</p>

<h3>🚀 Schoonmaakronde-modus <span class="help-new-pill">Nieuw</span></h3>
<p>De prominente <strong>🚀 Begin ronde</strong>-knop bovenaan de Vandaag-view start de ronde-modus: één taak per scherm met alle details (foto, methode, middel, PBM, opmerking-veld) en een voortgangsbalk "X van Y".</p>
<ul>
  <li><strong>Vorige / Volgende</strong> — navigeer door de lijst</li>
  <li><strong>Klaar</strong> — vink de taak af en spring automatisch naar de volgende</li>
  <li><strong>Overslaan</strong> — markeer als overgeslagen, ga verder zonder af te vinken</li>
  <li><strong>Pauzeer</strong> (×) — sluit de overlay; de ronde blijft bewaard. Bij heropenen Vandaag-view zie je <em>"Hervat ronde (3/12)"</em> en <em>"Nieuwe ronde"</em></li>
  <li>Het opmerking-veld onderin elke taakkaart is voor losse notities (bv. "extra reiniging nodig") — wordt automatisch opgeslagen</li>
</ul>
<p>Toetsenbord-shortcuts in de overlay: <code>←</code>/<code>→</code> = vorige/volgende, <code>Esc</code> = pauze, <code>Space</code>/<code>Enter</code> = afvink-toggle.</p>
<p>De sortering binnen een ronde volgt eerst het <code>wanneer</code>-veld, dan de ruimte alfabetisch — zodat je alle "Tijdens productie"-werk in dezelfde ruimte aaneengesloten doet voor je naar de volgende ruimte gaat.</p>

<h3>👤 Persoonlijke toewijzing + notificaties <span class="help-new-pill">Nieuw</span></h3>
<p>Bij het bewerken van een taak (admin-functie) kun je in het veld <strong>Toegewezen aan</strong> een naam invullen. Die naam matcht met je gebruikersnaam in de app (rechtsboven via ✏️). Op de Vandaag-view verschijnt dan een <strong>👤 Naam</strong>-pil bij die taak, en met de toggle <strong>"Alleen mijn taken"</strong> filter je de Vandaag-lijst tot wat aan jou is toegewezen.</p>
<ul>
  <li>De toggle is alleen zichtbaar wanneer je een gebruikersnaam hebt ingesteld</li>
  <li>Wanneer "Alleen mijn taken" aan staat, pakt ook <strong>🚀 Begin ronde</strong> alleen jouw scope</li>
  <li>Taken zonder toegewezen-naam verschijnen NIET in de "Alleen mijn taken"-filter — alleen expliciet aan jou toegewezen werk</li>
  <li>De toewijzing zit in het cloud-plan; je collega's zien hetzelfde overzicht zodra je <strong>⟳ Update</strong> klikt</li>
</ul>
<p><strong>🔔 Notificaties:</strong> klik op de "Notificaties aanzetten"-knop op de Vandaag-view om herinneringen te krijgen bij shift-momenten (06:00 ochtend, 14:00 middag). Beperkingen om eerlijk te zijn: notificaties werken alleen zolang de tab of geïnstalleerde app actief is. Voor "wek-me-om-6 uur"-functionaliteit terwijl de telefoon vergrendeld is, is een server-push-implementatie nodig — die hoort bij een toekomstige update.</p>
<div class="help-callout">
  <strong>💡 Let op:</strong> de toegewezen-aan-velden komen niet in de Excel-export terecht (de export gebruikt vaste kolommen). Ze leven in de app + cloud-sync. JSON-backup bewaart ze wel.
</div>

<h3>👥 Gebruikersrollen</h3>
<p>Er zijn vier rollen in de app, elk met eigen rechten:</p>
<ul>
  <li>📖 <strong>Gewone gebruiker</strong> — kan taken zien en afvinken, foto's bekijken, exporteren naar Excel</li>
  <li>🔧 <strong>Admin</strong> — alle bovenstaande, plus taken toevoegen/bewerken/verwijderen, foto's uploaden en verwijderen, MSDS-links toevoegen, en het <strong>🗂 Coördinator-overzicht</strong> gebruiken</li>
  <li>🛡️ <strong>Super-user</strong> — alle bovenstaande, plus rollen toewijzen aan andere gebruikers en correcties op vorige periodes maken</li>
</ul>

<h3>🗂 Coördinator-overzicht <span class="help-new-pill">Nieuw</span></h3>
<p>Voor admins en super-users zit er een aparte <strong>🗂 Coördinator</strong>-knop in het zijmenu. Deze tab is bedoeld voor planning en oversight: je krijgt de volledige tabel-weergave terug zoals die was vóór de Vandaag-refactor — alle zeven frequenties (Dagelijks t/m Jaarlijks) onder één scherm met een sub-tabbalk om snel te wisselen.</p>
<ul>
  <li>Filterbalk + sortering + bulk-acties werken hier hetzelfde als op de oude freq-tabs</li>
  <li>Afvinkingen die je hier maakt synchroniseren onmiddellijk met Vandaag-view en cloud — het is dezelfde data, andere weergave</li>
  <li>Taken bewerken (✏️) en verwijderen (🗑) werken zoals voorheen, mits Wijzigingsmodus is ontgrendeld</li>
  <li>Gewone gebruikers zien deze knop niet — voor hen is Vandaag de primaire ingang</li>
</ul>

<h3>✏️ Afwerklijst <span class="help-new-pill">Nieuw</span></h3>
<p>Bovenin de Coördinator-view staat een <strong>✏️ Afwerklijst (N)</strong>-knop, met daarin het aantal taken dat nog incomplete velden heeft. Klik om een fill-out form te openen die je per taak door de drie kritieke velden loopt: <strong>Wanneer</strong>, <strong>Methode</strong>, <strong>Middel</strong>.</p>
<ul>
  <li>Per taak zie je standaard alleen de ontbrekende velden (compact-modus); klik <em>Toon alle velden</em> om ook de al-ingevulde velden aan te passen</li>
  <li><strong>💾 Opslaan & volgende</strong> — wijzigingen komen in de pending-lijst en worden vastgelegd in Versiebeheer zodra je <strong>⟳ Doorvoeren</strong> klikt (consistent met hoe gewone taak-edits werken)</li>
  <li><strong>↷ Overslaan</strong> — ga door zonder iets te wijzigen</li>
  <li><strong>🚫 Markeer NVT</strong> — leg vast dat een veld bewust leeg blijft (bv. "Externe firma brengt eigen middel"). Zo verschijnt de taak niet steeds opnieuw in de lijst</li>
  <li>Bij taken met <em>Methode = Extern</em> krijg je een hint om Middel als NVT te markeren</li>
  <li>Voortgangsbalk bovenin toont "Taak X van Y"</li>
  <li>NVT-markeringen worden cloud-gesyncd zodat alle coördinatoren dezelfde lijst zien</li>
</ul>
<div class="help-callout">
  <strong>💡 Tip:</strong> Op een mobiel scherm vult de modal het hele scherm — handig voor een coördinator die op de werkvloer met een tablet door de lijst loopt.
</div>

<h3>🗂️ De tabbladen</h3>
<p>Bovenaan staan zeven frequentie-tabbladen die de taken groeperen op hoe vaak ze terugkomen:</p>
<ul>
  <li><strong>Dagelijks</strong> — één afvinkmoment per werkdag (zondag is rustdag)</li>
  <li><strong>Wekelijks</strong> — één keer per dag van de week (Ma t/m Zo)</li>
  <li><strong>Maandelijks</strong> — één keer per maand (12 vakjes per jaar)</li>
  <li><strong>Elke 2 maanden</strong> — zes momenten per jaar</li>
  <li><strong>Per kwartaal</strong> — vier momenten per jaar</li>
  <li><strong>Halfjaarlijks</strong> — twee momenten per jaar</li>
  <li><strong>Jaarlijks</strong> — één moment per jaar</li>
</ul>
<p>Het getalletje achter de tabnaam toont het aantal taken in dat tabblad. Onder elke tabnaam zie je twee kleine voortgangsbalkjes per afdeling (Facilitair groen, Operator oranje) die je voortgang voor de huidige periode tonen.</p>

<h3>🧴 De Middelen-tab</h3>
<p>In het zijmenu staat een aparte <strong>🧴 Middelen</strong>-tab. Daar zie je een overzicht van alle schoonmaakmiddelen met beschrijving en toepassing. Per middel kun je het MSDS-veiligheidsblad bekijken — als een admin een MSDS-link heeft toegevoegd, staat er een groen 'MSDS beschikbaar'-bordje.</p>

<h3>📊 Het Dashboard</h3>
<p>Klik op <strong>📊 Dashboard</strong> in het zijmenu voor een overzicht van de hele afdeling:</p>
<ul>
  <li><strong>Compliance</strong> — algemeen voltooiingspercentage met sparkline van de laatste 14 dagen</li>
  <li><strong>Achterstand</strong> — aantal taken dat te laat is</li>
  <li><strong>Verdeling per afdeling</strong> — donut-grafiek van Facilitair / Operator / Overig</li>
  <li><strong>Risicoverdeling</strong> — hoeveel taken vallen in laag/middel/hoog risico</li>
  <li><strong>Per frequentie</strong> — tabel met klaar/totaal per tabblad</li>
  <li><strong>Top vergeten taken</strong> — welke taken worden het vaakst overgeslagen (op basis van afgelopen 4 weken)</li>
</ul>

<h3>✅ Taken afvinken</h3>
<p>Elke rij heeft één of meer aanvinkvakjes rechts. Klik op een vakje om de taak voor die periode af te vinken. De huidige periode (vandaag, deze week, deze maand) wordt visueel gemarkeerd met een groene kop. Bij elke afvinking wordt automatisch jouw naam en de tijd opgeslagen — handig bij audits.</p>
<div class="help-callout">
  <strong>💡 Tip:</strong> Afvinkingen worden automatisch opgeslagen in je browser. Je hoeft niets handmatig op te slaan. Bij een nieuwe periode (om 00:00 voor dagelijks, op maandag voor wekelijks) komen er nieuwe lege vakjes — de oude periode blijft bewaard in de historie.
</div>
<p>Wanneer alle zichtbare taken in de huidige periode zijn afgevinkt, verschijnt er een feestelijke <strong>"Alles klaar!"</strong>-banner bovenaan met een groene ✓ — leuke bevestiging dat je klaar bent.</p>

<h3>🚦 Per-ruimte kleurcodes</h3>
<p>Elke taakrij heeft een gekleurde linkerrand en een gekleurde ruimte-badge die overeenkomen met de ruimte. Zo kun je in één oogopslag zien welke taken bij welke ruimte horen:</p>
<ul>
  <li>🏭 <strong>Algemeen productie</strong> · sky-blauw</li>
  <li>🍞 <strong>Lijn 1</strong> · oranje &nbsp;·&nbsp; 🍞 <strong>Lijn 2</strong> · roze</li>
  <li>📦 <strong>Magazijn</strong> · violet &nbsp;·&nbsp; 📦 <strong>Inpak lijn 1/2</strong> · blauw/indigo</li>
  <li>🧊 <strong>Koelcel</strong> · teal &nbsp;·&nbsp; 🚿 <strong>Wasplaats</strong> · teal-blauw</li>
  <li>🌳 <strong>Buitenterrein</strong> · lime &nbsp;·&nbsp; 🚚 <strong>Expeditie</strong> · amber</li>
  <li>🧫 <strong>Gistruimte</strong> · paars &nbsp;·&nbsp; 🗃️ <strong>Krathandeling</strong> · donker-amber</li>
</ul>

<h3>📷 Foto's bij taken</h3>
<p>Sommige taken kunnen lastig zijn met alleen tekst — vooral als de vertaling niet helemaal klopt. Daarom kun je per taak een foto koppelen. Wanneer een taak een foto heeft, zie je een blauw <strong>📷</strong>-knopje achter de taaknaam.</p>
<p><strong>Foto bekijken:</strong> klik op het 📷-knopje en de foto opent in een prettige overlay met de ruimte-info bovenaan, een "Ga naar taak"-knop, en een sluit-knop. Op mobiel werkt pinch-zoom om in te zoomen op details.</p>
<p><strong>Foto uploaden</strong> (alleen admins/super-users):</p>
<ol>
  <li>Open de taak via <strong>✏️ Bewerken</strong> of voeg een nieuwe taak toe</li>
  <li>Onderaan zie je het veld <strong>Afbeelding</strong></li>
  <li>Klik op <strong>📷 Kies afbeelding</strong> — op telefoon kun je direct de camera gebruiken</li>
  <li>Klik op <strong>Opslaan</strong> — de foto wordt automatisch verkleind (max 1280px) en geüpload</li>
</ol>
<p><strong>Foto verwijderen</strong> (alleen admins/super-users): open de foto in de overlay en klik op de rode <strong>🗑 Verwijderen</strong>-knop linksonder, of verwijder hem via de bewerk-modal van de taak.</p>

<h3>🗓️ Vorige periodes bekijken</h3>
<p>Boven de tabel staat een "Bekijk periode"-dropdown. Hiermee kun je terugscrollen door eerdere dagen, weken of jaren om te zien welke taken toen wel of niet zijn afgevinkt. Vorige periodes zijn alleen-lezen — je kunt er niet meer in afvinken om de historie zuiver te houden.</p>
<p>Wil je een vorige periode alsnog exporteren naar Excel? Selecteer de periode in de dropdown en klik dan op <strong>⬇ Exporteer Excel</strong> — de export volgt automatisch de bekeken periode.</p>

<h3>📝 Correctiemodus (alleen super-users)</h3>
<p>Soms vergeet de schoonmaak om een taak af te vinken die wél is uitgevoerd. Een super-user kan deze achteraf alsnog plaatsen:</p>
<ol>
  <li>Selecteer de vorige periode in de "Bekijk periode"-dropdown</li>
  <li>In plaats van de gewone alleen-lezen banner verschijnt nu een blauwe <strong>📝 Correctiemodus</strong>-banner</li>
  <li>Vink het vakje aan zoals normaal</li>
  <li>Het vinkje krijgt een klein blauw stipje rechtsboven om aan te geven dat het achteraf is geplaatst</li>
</ol>
<div class="help-callout">
  <strong>🔍 Audit-trail:</strong> elke correctie wordt gelogd met wie en wanneer hem heeft toegevoegd. Bij hover over het vinkje zie je deze info in de tooltip.
</div>

<h3>⚠ Achterstand</h3>
<p>Als een taak in de vorige periode niet is afgevinkt, krijgt hij een ⚠-bordje achter de ruimtenaam en een rode rand aan de linkerkant. Bovenaan in de tabbalk verschijnt een <strong>Achterstand X</strong>-knop die je naar een overzicht brengt van álle achterstallige taken op verschillende frequenties.</p>
<div class="help-callout">
  <strong>💡 Zondag is rustdag:</strong> op zondag wordt geen achterstand gerekend voor dagelijkse taken. Op maandag verschijnt het bordje voor zaterdag pas als die niet was afgevinkt — de zondag wordt overgeslagen.
</div>

<h3>🔢 Wat betekenen de waarden?</h3>

<h4>Vervuiling (V) — score 1 t/m 5</h4>
<p>Hoe groot is het besmettingsrisico van de vervuiling op deze werkplek? Denk aan microbiologisch (bacteriën, schimmels), chemisch (resten van reinigingsmiddelen, allergenen) en fysisch (haren, deeltjes).</p>
<table>
  <thead><tr><th>Score</th><th>Niveau</th><th>HACCP-toelichting</th></tr></thead>
  <tbody>
    <tr><td><span class="help-score-badge" style="background:#3b8a6a;">1</span></td><td>Minimaal</td><td>Droge stof, geen direct besmettingsrisico — bv. stof op buiten-wanden, daken</td></tr>
    <tr><td><span class="help-score-badge" style="background:#84cc16;">2</span></td><td>Licht</td><td>Stof/aanslag, lage microbiologische druk — bv. schakelkasten, kantoorwanden</td></tr>
    <tr><td><span class="help-score-badge" style="background:#eab308;">3</span></td><td>Matig</td><td>Vet/residu, kans op kruisbesmetting — bv. machineomgeving, productievloeren</td></tr>
    <tr><td><span class="help-score-badge" style="background:#f97316;">4</span></td><td>Zwaar</td><td>Aangekoekt organisch materiaal, hoge microbiologische druk — bv. deegkuipen, wasplaats</td></tr>
    <tr><td><span class="help-score-badge" style="background:#dc2626;">5</span></td><td>Kritisch</td><td>Direct productcontact, HACCP-beheerspunt (CCP) — bv. snijtafels, transportbanden, vulpunten</td></tr>
  </tbody>
</table>

<h4>Hygiënezones (5-Zone Systeem)</h4>

<div class="help-zone-list">
  <div class="help-zone-item">
    <div class="help-zone-header">
      <span class="help-score-badge" style="background:#dc2626;">Zone 5</span>
      <strong>Productcontactoppervlakken — Hoogste Risico</strong>
    </div>
    <p><em>Definitie:</em> Direct contact met het product.</p>
    <p><em>Voorbeelden:</em> Mengmachines, snijtafels, lopende banden, vulmachines.</p>
    <p><em>Maatregelen:</em> Strenge reiniging en desinfectie (HACCP/HDN), vaak roestvrij staal.</p>
  </div>
  <div class="help-zone-item">
    <div class="help-zone-header">
      <span class="help-score-badge" style="background:#f97316;">Zone 4</span>
      <strong>Onmiddellijke Omgeving — Hoog Risico</strong>
    </div>
    <p><em>Definitie:</em> Oppervlakken die niet direct het product raken, maar wel kunnen besmetten (bijv. via handen of gereedschap).</p>
    <p><em>Voorbeelden:</em> Ombouw van machines, controlepanelen, gereedschapshouders.</p>
    <p><em>Maatregelen:</em> Regelmatige reiniging en desinfectie, strikte hygiëneregels voor personeel.</p>
  </div>
  <div class="help-zone-item">
    <div class="help-zone-header">
      <span class="help-score-badge" style="background:#eab308;">Zone 3</span>
      <strong>Productieruimte/Vloer — Medium Risico</strong>
    </div>
    <p><em>Definitie:</em> De directe omgeving binnen de productieruimte.</p>
    <p><em>Voorbeelden:</em> Vloeren, muren, drains, afvalbakken.</p>
    <p><em>Maatregelen:</em> Beheersing van vloeiende lucht, scheiding van nat en droog, strenge vloerreiniging.</p>
  </div>
  <div class="help-zone-item">
    <div class="help-zone-header">
      <span class="help-score-badge" style="background:#84cc16;">Zone 2</span>
      <strong>Verkeerszones/Omkleedruimtes — Laag Risico</strong>
    </div>
    <p><em>Definitie:</em> Zones die toegang geven tot de productie (hygiënesluis).</p>
    <p><em>Voorbeelden:</em> Kleedkamers, gangen, medewerkersingangen.</p>
    <p><em>Maatregelen:</em> Scheiding van 'vuile' straatkleding en 'schone' werkkleding, handhygiëne (handen wassen/desinfecteren).</p>
  </div>
  <div class="help-zone-item">
    <div class="help-zone-header">
      <span class="help-score-badge" style="background:#3b8a6a;">Zone 1</span>
      <strong>Niet-productiegebieden — Geen/Minimaal Risico</strong>
    </div>
    <p><em>Definitie:</em> Gebieden buiten het primaire productieproces.</p>
    <p><em>Voorbeelden:</em> Kantoren, kantine, buitenterrein, magazijn voor verpakkingsmateriaal.</p>
    <p><em>Maatregelen:</em> Algemene hygiënerichtlijnen.</p>
  </div>
</div>

<h4>Afstand (A) — score 1 t/m 3</h4>
<p>Hoe dicht staat deze werkplek bij het (onbeschermde) product? Dit bepaalt hoe snel een besmetting het product kan bereiken.</p>
<ul>
  <li><span class="help-score-badge" style="background:#3b8a6a;">1</span> <strong>Geen productcontact</strong> — vloeren, plafonds, buitenwanden — besmetting bereikt product niet direct</li>
  <li><span class="help-score-badge" style="background:#eab308;">2</span> <strong>Nabijheid product</strong> — machineomgeving, wanden productieruimte — indirecte besmettingsroute mogelijk (via handen, gereedschap, spatten)</li>
  <li><span class="help-score-badge" style="background:#dc2626;">3</span> <strong>Direct productcontact</strong> — werkbladen, machine-onderdelen, transportbanden — directe contaminatie van het product mogelijk</li>
</ul>

<h4>Risicoscore (V × Z × A)</h4>
<p>De totale risicoscore is het product van de drie waardes. Deze kleurt de cel in de tabel:</p>
<ul>
  <li><span class="help-score-badge" style="background:#3b8a6a;">≤9</span> Laag risico — standaard schoonmaak voldoet</li>
  <li><span class="help-score-badge" style="background:#f59e0b;">10–24</span> Middelrisico — extra aandacht en vaker controleren</li>
  <li><span class="help-score-badge" style="background:#dc2626;">≥25</span> Hoog risico — strikte schoonmaak, validatie en logging</li>
</ul>
<p>Klik op het <strong>?</strong>-knopje naast de score-kolomkop voor een uitgebreidere uitleg in de tabel zelf.</p>

<h3>🧤 PBM-iconen</h3>
<p>Naast de productnaam staan PBM-iconen die aangeven welke beschermingsmiddelen vereist zijn:</p>
<ul>
  <li>🧤 <strong>Handschoenen</strong> — bij chemische middelen</li>
  <li>😷 <strong>Mondkapje</strong> — bij stof, dampen, desinfectiemiddelen of taken met risicoscore ≥ 25</li>
</ul>

<h3>➕ Een taak toevoegen</h3>
<p>Taken toevoegen kan alleen wanneer Wijzigen is ontgrendeld:</p>
<ol>
  <li>Klik op <strong>🔒 Wijzigen</strong> rechtsboven en voer het wachtwoord in</li>
  <li>Klik op <strong>+ Nieuwe taak</strong> in de filterbalk (of het zwevende +-knopje rechtsonder op mobiel)</li>
  <li>Vul minimaal in: ruimte, werkplek, onderdeel, subcategorie (taakbeschrijving), uitvoerder, frequentie, methode</li>
  <li>Optioneel: voeg een Engelse vertaling toe en/of een afbeelding</li>
  <li>Kies de score-niveaus voor Vervuiling, Zone en Afstand uit de dropdowns — onderaan zie je live de berekende risicoscore</li>
  <li>Klik op <strong>Opslaan</strong> — de taak verschijnt direct in het juiste frequentie-tabblad</li>
</ol>
<div class="help-callout warn">
  <strong>⚠ Let op:</strong> nieuwe taken én wijzigingen komen eerst in een <strong>pending-lijst</strong>. Klik op de oranje <strong>⟳ Update</strong>-knop bovenaan om ze definitief vast te leggen in Versiebeheer met versienummer, datum en jouw naam. Tot die tijd kun je via "Verwerpen" alles terugdraaien.
</div>

<h3>✏️ Taken bewerken</h3>
<p>Wanneer Wijzigen is ontgrendeld verschijnt er bij elke rij een <strong>✏️</strong>-knopje. Klik erop om de taak te wijzigen — alle velden inclusief de scores zijn aanpasbaar. Wijzigingen tonen geel als "Bewerkt" tot ze worden doorgevoerd via Update.</p>

<h3>🗑 Taken verwijderen</h3>
<p>Met Wijzigen aan verschijnt er een selectie-vakje links van elke rij:</p>
<ul>
  <li>Klik op individuele vakjes om taken te selecteren</li>
  <li>Klik op het vakje in de tabelheader om alle zichtbare taken te (de)selecteren</li>
  <li>Bovenaan verschijnt een groene balk met het aantal geselecteerd</li>
  <li>Klik op <strong>🗑 Verwijder geselecteerd</strong> — een bevestigingsmodal toont welke taken worden verwijderd</li>
</ul>
<p>Verwijderingen komen óók in de pending-lijst en zijn omkeerbaar via Verwerpen tot ze definitief worden doorgevoerd via Update.</p>

<h3>📋 Versiebeheer</h3>
<p>Alle structurele wijzigingen (nieuwe taken, bewerkingen, verwijderingen) worden vastgelegd in de Versiebeheer-tab met datum, versienummer, auteur en exacte diff. Zo blijft het schoonmaakplan auditeerbaar — je kunt altijd terugzien wat er wanneer en door wie is veranderd.</p>

<h3>🔲 QR-codes</h3>
<p>Klik op <strong>🔲 QR-codes</strong> in het zijmenu om voor elke ruimte of werkplek een QR-code te genereren. Deze kun je uitprinten en bij de werkplek hangen — scannen brengt de medewerker direct naar de juiste filter in de app.</p>

<h3>📦 Plannen importeren</h3>
<p>Klik op <strong>⬆ Importeer</strong> om een ander schoonmaakplan-Excel in te lezen. Dit wordt een nieuw plan naast het origineel — je kunt schakelen tussen plannen via de tab-balk die verschijnt zodra er meer dan één plan is.</p>

<h3>⬇ Exporteren naar Excel</h3>
<p>Klik op <strong>⬇ Exporteer Excel</strong> rechtsboven om een volledig opgemaakt Excel-bestand te downloaden met vier sheets: Schoonmaakplan (alle taken + afvinkingen), Middelen (productenoverzicht), Methodieken (schoonmaakmethodes) en Versiebeheer (wijzigingsgeschiedenis). De export volgt de huidige bekeken periode.</p>

<h3>🖨️ Printen</h3>
<p>Klik op <strong>🖨 Print</strong> om de huidige periode af te drukken op A4. De print toont per rij: taak, methode, middel, wanneer en lege checkboxes — handig als papieren backup of voor het ophangen bij de werkplek.</p>

<h3>🌙 Donkere modus</h3>
<p>Klik op de <strong>🌙</strong>-knop in de header om over te schakelen naar donkere modus, en op <strong>☀️</strong> om weer terug te gaan. De app onthoudt je voorkeur per browser.</p>

<h3>🌐 Taal wisselen</h3>
<p>Klik op <strong>🌐 EN</strong> rechtsboven om het hele plan te tonen in het Engels. Klik op <strong>🌐 NL</strong> om terug te schakelen.</p>

<h3>❓ Vragen?</h3>
<p>Voor inhoudelijke vragen over het schoonmaakplan zelf: neem contact op met je KAM-coördinator. Voor technische problemen met deze app: maak een notitie en deel deze met de beheerder.</p>

</div>`;

  const en = `
<div class="help-content">

<h3>📖 What is this?</h3>
<p>This is a digital version of cleaning plan <code>GTE-D-09-99</code>. It describes per area and workplace what tasks need to be done, how often, by whom, with which product and method. You can check off tasks once completed, attach photos, export the entire plan to Excel, and record changes in the changelog.</p>

<h3>🏠 Today view <span class="help-new-pill">New</span></h3>
<p>When you open the app you land on <strong>🏠 Today</strong> by default. This is a smart unified list of everything that needs to happen <em>now</em> — no more tab-hopping:</p>
<ul>
  <li>All daily tasks not yet checked off for today</li>
  <li>Overdue work from earlier periods (visible with a ⚠ Overdue pill)</li>
  <li>Weekly, monthly and quarterly tasks falling in their current slot — e.g. a quarterly task only appears in the last month of the quarter</li>
  <li>Day-specific tasks (Saturday work, twice-per-week) appear only on the matching day</li>
</ul>
<p>Tasks are grouped by their <code>when</code> field in a logical order: first During production, then 1× per day, After use, and so on through to the Saturday clean-up. When everything is done, a celebratory <strong>"🎉 All done!"</strong> hero appears.</p>

<h3>🚀 Cleaning round mode <span class="help-new-pill">New</span></h3>
<p>The prominent <strong>🚀 Start round</strong> button at the top of the Today view starts round mode: one task per screen with all details (photo, method, agent, PPE, note field) plus a progress bar "X of Y".</p>
<ul>
  <li><strong>Previous / Next</strong> — navigate the list</li>
  <li><strong>Done</strong> — check the task and auto-jump to the next one</li>
  <li><strong>Skip</strong> — mark as skipped, continue without checking</li>
  <li><strong>Pause</strong> (×) — close the overlay; the round is preserved. Reopening Today shows <em>"Resume round (3/12)"</em> and <em>"New round"</em></li>
  <li>The note field at the bottom of each task card is for free-form notes (e.g. "needs extra cleaning") — auto-saved</li>
</ul>
<p>Keyboard shortcuts inside the overlay: <code>←</code>/<code>→</code> = previous/next, <code>Esc</code> = pause, <code>Space</code>/<code>Enter</code> = toggle check.</p>
<p>Round ordering follows <code>when</code> first, then area alphabetically — so all "During production" work in one area is done back-to-back before moving to the next area.</p>

<h3>👤 Personal assignment + notifications <span class="help-new-pill">New</span></h3>
<p>When editing a task (admin function) the <strong>Assigned to</strong> field accepts a name. That name matches your username in the app (top-right via ✏️). On the Today view a <strong>👤 Name</strong> pill appears for that task, and the <strong>"Only my tasks"</strong> toggle filters the Today list down to what's assigned to you.</p>
<ul>
  <li>The toggle is only visible when you've set a username</li>
  <li>When "Only my tasks" is on, <strong>🚀 Start round</strong> also takes only your scope</li>
  <li>Tasks without an assignee do NOT appear in "Only my tasks" — only work explicitly assigned to you</li>
  <li>Assignment lives in the cloud plan; colleagues see the same view once you click <strong>⟳ Update</strong></li>
</ul>
<p><strong>🔔 Notifications:</strong> tap "Enable notifications" on the Today view to get reminders at shift moments (06:00 morning, 14:00 afternoon). Honest caveat: notifications work only while the tab or installed app is active. For "wake me at 6am while the phone is locked" functionality a server-push setup is required — that's part of a future update.</p>
<div class="help-callout">
  <strong>💡 Note:</strong> assigned-to fields don't end up in the Excel export (export uses fixed columns). They live in the app + cloud sync. JSON backups do preserve them.
</div>

<h3>👥 User roles</h3>
<p>There are four roles in the app, each with their own rights:</p>
<ul>
  <li>📖 <strong>Regular user</strong> — can view and check off tasks, view photos, export to Excel</li>
  <li>🔧 <strong>Admin</strong> — all of the above, plus add/edit/delete tasks, upload and remove photos, add MSDS links, and access the <strong>🗂 Coordinator overview</strong></li>
  <li>🛡️ <strong>Super-user</strong> — all of the above, plus assign roles to other users and make corrections to past periods</li>
</ul>

<h3>🗂 Coordinator overview <span class="help-new-pill">New</span></h3>
<p>Admins and super-users get a separate <strong>🗂 Coordinator</strong> button in the side menu. This tab is meant for planning and oversight: it brings back the full table view as it existed before the Today refactor — all seven frequencies (Daily to Annual) in one screen with a sub-tab bar to switch quickly.</p>
<ul>
  <li>Filter bar + sorting + bulk actions work the same as on the old frequency tabs</li>
  <li>Check-offs made here sync immediately with the Today view and cloud — same data, different presentation</li>
  <li>Editing (✏️) and deleting (🗑) tasks works as before, provided Edit mode is unlocked</li>
  <li>Regular users don't see this button — for them, Today is the primary entry point</li>
</ul>

<h3>✏️ Completion list <span class="help-new-pill">New</span></h3>
<p>At the top of the Coordinator view you'll find an <strong>✏️ Completion list (N)</strong> button, where N is the number of tasks with incomplete fields. Click it to open a fill-out form that walks you through the three critical fields per task: <strong>When</strong>, <strong>Method</strong>, <strong>Agent</strong>.</p>
<ul>
  <li>By default each task shows only the missing fields (compact mode); click <em>Show all fields</em> to also adjust already-filled fields</li>
  <li><strong>💾 Save & next</strong> — changes go to the pending list and are committed to the changelog when you click <strong>⟳ Update</strong> (consistent with how regular task edits work)</li>
  <li><strong>↷ Skip</strong> — move on without changing anything</li>
  <li><strong>🚫 Mark N/A</strong> — record that a field is intentionally blank (e.g. "External firm brings its own agent"). Stops the task from reappearing in the list</li>
  <li>Tasks with <em>Method = External</em> show a hint to mark Agent as N/A</li>
  <li>The progress bar at the top shows "Task X of Y"</li>
  <li>N/A marks sync via the cloud so all coordinators see the same list</li>
</ul>
<div class="help-callout">
  <strong>💡 Tip:</strong> On mobile the modal goes full-screen — handy for a coordinator walking the floor with a tablet.
</div>

<h3>🗂️ The tabs</h3>
<p>The seven frequency tabs at the top group tasks by how often they recur:</p>
<ul>
  <li><strong>Daily</strong> — one check-off per working day (Sunday is a rest day)</li>
  <li><strong>Weekly</strong> — once per day of the week (Mon to Sun)</li>
  <li><strong>Monthly</strong> — once per month (12 slots per year)</li>
  <li><strong>Bimonthly</strong> — six moments per year</li>
  <li><strong>Quarterly</strong> — four moments per year</li>
  <li><strong>Semiannual</strong> — two moments per year</li>
  <li><strong>Annual</strong> — one moment per year</li>
</ul>
<p>The number after each tab name shows the task count. Below each tab name two small department progress bars (Facilitair green, Operator orange) show your progress for the current period.</p>

<h3>🧴 The Products tab</h3>
<p>The side menu has a separate <strong>🧴 Products</strong> tab listing all cleaning agents with their description and application. For each agent you can view its MSDS safety sheet — when an admin has added an MSDS link, a green 'MSDS available' badge appears.</p>

<h3>📊 The Dashboard</h3>
<p>Click <strong>📊 Dashboard</strong> in the side menu for an overview of the whole department:</p>
<ul>
  <li><strong>Compliance</strong> — overall completion percentage with a 14-day sparkline</li>
  <li><strong>Overdue</strong> — count of tasks that are late</li>
  <li><strong>Department distribution</strong> — donut chart of Facilitair / Operator / Other</li>
  <li><strong>Risk distribution</strong> — how many tasks fall in low/medium/high risk</li>
  <li><strong>Per frequency</strong> — table of done/total per tab</li>
  <li><strong>Top forgotten tasks</strong> — which tasks are most often skipped (over the past 4 weeks)</li>
</ul>

<h3>✅ Checking off tasks</h3>
<p>Each row has one or more checkboxes on the right. Click to mark a task done for that period. The current period (today, this week, this month) is highlighted with a green column header. Each check automatically records your name and the time — useful during audits.</p>
<div class="help-callout">
  <strong>💡 Tip:</strong> Checks are auto-saved in your browser. When a new period begins (midnight for daily, Monday for weekly) new empty checkboxes appear automatically — the previous period is preserved in the history.
</div>
<p>When all visible tasks for the current period are checked off, a celebratory <strong>"All done!"</strong> banner appears at the top with a green ✓ — nice confirmation that you're finished.</p>

<h3>🚦 Per-area colour codes</h3>
<p>Each task row has a coloured left border and a coloured area badge matching the room. This lets you spot at a glance which tasks belong to which area:</p>
<ul>
  <li>🏭 <strong>General production</strong> · sky-blue</li>
  <li>🍞 <strong>Line 1</strong> · orange &nbsp;·&nbsp; 🍞 <strong>Line 2</strong> · pink</li>
  <li>📦 <strong>Warehouse</strong> · violet &nbsp;·&nbsp; 📦 <strong>Packaging line 1/2</strong> · blue/indigo</li>
  <li>🧊 <strong>Cold storage</strong> · teal &nbsp;·&nbsp; 🚿 <strong>Wash area</strong> · teal-blue</li>
  <li>🌳 <strong>Outside area</strong> · lime &nbsp;·&nbsp; 🚚 <strong>Dispatch</strong> · amber</li>
  <li>🧫 <strong>Yeast room</strong> · purple &nbsp;·&nbsp; 🗃️ <strong>Crate handling</strong> · dark amber</li>
</ul>

<h3>📷 Photos for tasks</h3>
<p>Some tasks can be hard with text alone — especially when translations don't quite match. That's why you can attach a photo to each task. When a task has a photo, you'll see a blue <strong>📷</strong> button after the task name.</p>
<p><strong>Viewing a photo:</strong> click the 📷 button and the photo opens in a polished overlay with the area info at the top, a "Go to task" button, and a close button. On mobile, pinch-zoom works to zoom in on details.</p>
<p><strong>Uploading a photo</strong> (admins/super-users only):</p>
<ol>
  <li>Open the task via <strong>✏️ Edit</strong> or add a new task</li>
  <li>At the bottom you'll see the <strong>Image</strong> field</li>
  <li>Click <strong>📷 Pick image</strong> — on phone you can use the camera directly</li>
  <li>Click <strong>Save</strong> — the photo is automatically resized (max 1280px) and uploaded</li>
</ol>
<p><strong>Removing a photo</strong> (admins/super-users only): open the photo in the overlay and click the red <strong>🗑 Remove</strong> button at the bottom-left, or remove it via the task's edit modal.</p>

<h3>🗓️ Viewing past periods</h3>
<p>Use the "View period" dropdown above the table to scroll back through previous days, weeks, or years. Past periods are read-only — you can no longer check tasks there to keep the history clean.</p>
<p>Want to export a past period to Excel? Select the period in the dropdown then click <strong>⬇ Export Excel</strong> — the export automatically follows the viewed period.</p>

<h3>📝 Correction mode (super-users only)</h3>
<p>Sometimes the cleaning team forgets to check off a task that was actually done. A super-user can add it retroactively:</p>
<ol>
  <li>Select the past period in the "View period" dropdown</li>
  <li>Instead of the regular read-only banner, a blue <strong>📝 Correction mode</strong> banner appears</li>
  <li>Click the checkbox as usual</li>
  <li>The check gets a small blue dot in the top-right to indicate it was added retroactively</li>
</ol>
<div class="help-callout">
  <strong>🔍 Audit trail:</strong> every correction is logged with who added it and when. Hover over the check to see this info in the tooltip.
</div>

<h3>⚠ Overdue tasks</h3>
<p>If a task wasn't checked off in the previous period, it gets a ⚠ badge after the area name and a red border on the left. At the top of the tab bar, an <strong>Overdue X</strong> button appears that takes you to an overview of all overdue tasks across frequencies.</p>
<div class="help-callout">
  <strong>💡 Sunday is a rest day:</strong> on Sunday no overdue is calculated for daily tasks. On Monday the badge for Saturday only shows if that wasn't checked off — Sunday is skipped.
</div>

<h3>🔢 What do the values mean?</h3>

<h4>Soiling (V) — score 1 to 5</h4>
<p>What is the contamination risk of the soiling at this workplace? Consider microbiological (bacteria, mould), chemical (cleaning agent residues, allergens) and physical (hair, particles) hazards.</p>
<table>
  <thead><tr><th>Score</th><th>Level</th><th>HACCP guidance</th></tr></thead>
  <tbody>
    <tr><td><span class="help-score-badge" style="background:#3b8a6a;">1</span></td><td>Minimal</td><td>Dry dust, no direct contamination risk — e.g. dust on exterior walls, roofs</td></tr>
    <tr><td><span class="help-score-badge" style="background:#84cc16;">2</span></td><td>Light</td><td>Dust/scale, low microbiological pressure — e.g. switch cabinets, office walls</td></tr>
    <tr><td><span class="help-score-badge" style="background:#eab308;">3</span></td><td>Moderate</td><td>Grease/residue, risk of cross-contamination — e.g. machine surroundings, production floors</td></tr>
    <tr><td><span class="help-score-badge" style="background:#f97316;">4</span></td><td>Heavy</td><td>Baked-on organic material, high microbiological pressure — e.g. dough troughs, wash area</td></tr>
    <tr><td><span class="help-score-badge" style="background:#dc2626;">5</span></td><td>Critical</td><td>Direct product contact, HACCP control point (CCP) — e.g. cutting tables, conveyor belts, filling points</td></tr>
  </tbody>
</table>

<h4>Hygiene Zones (5-Zone System)</h4>

<div class="help-zone-list">
  <div class="help-zone-item">
    <div class="help-zone-header">
      <span class="help-score-badge" style="background:#dc2626;">Zone 5</span>
      <strong>Product Contact Surfaces — Highest Risk</strong>
    </div>
    <p><em>Definition:</em> Direct contact with the product.</p>
    <p><em>Examples:</em> Mixing machines, cutting tables, conveyor belts, filling machines.</p>
    <p><em>Measures:</em> Strict cleaning and disinfection (HACCP/HDN), usually stainless steel.</p>
  </div>
  <div class="help-zone-item">
    <div class="help-zone-header">
      <span class="help-score-badge" style="background:#f97316;">Zone 4</span>
      <strong>Immediate Environment — High Risk</strong>
    </div>
    <p><em>Definition:</em> Surfaces that don't directly touch the product, but can contaminate it (e.g. via hands or tools).</p>
    <p><em>Examples:</em> Machine casings, control panels, tool holders.</p>
    <p><em>Measures:</em> Regular cleaning and disinfection, strict hygiene rules for staff.</p>
  </div>
  <div class="help-zone-item">
    <div class="help-zone-header">
      <span class="help-score-badge" style="background:#eab308;">Zone 3</span>
      <strong>Production Area/Floor — Medium Risk</strong>
    </div>
    <p><em>Definition:</em> The immediate environment within the production space.</p>
    <p><em>Examples:</em> Floors, walls, drains, waste bins.</p>
    <p><em>Measures:</em> Airflow control, wet/dry separation, strict floor cleaning.</p>
  </div>
  <div class="help-zone-item">
    <div class="help-zone-header">
      <span class="help-score-badge" style="background:#84cc16;">Zone 2</span>
      <strong>Traffic Zones/Changing Rooms — Low Risk</strong>
    </div>
    <p><em>Definition:</em> Zones that provide access to production (hygiene lock).</p>
    <p><em>Examples:</em> Changing rooms, corridors, employee entrances.</p>
    <p><em>Measures:</em> Separation of 'dirty' street clothing and 'clean' work clothing, hand hygiene (washing/disinfecting).</p>
  </div>
  <div class="help-zone-item">
    <div class="help-zone-header">
      <span class="help-score-badge" style="background:#3b8a6a;">Zone 1</span>
      <strong>Non-Production Areas — No/Minimal Risk</strong>
    </div>
    <p><em>Definition:</em> Areas outside the primary production process.</p>
    <p><em>Examples:</em> Offices, canteen, outdoor area, packaging material warehouse.</p>
    <p><em>Measures:</em> General hygiene guidelines.</p>
  </div>
</div>

<h4>Distance (A) — score 1 to 3</h4>
<p>How close is this workplace to the (unprotected) product? This determines how quickly contamination can reach the product.</p>
<ul>
  <li><span class="help-score-badge" style="background:#3b8a6a;">1</span> <strong>No product contact</strong> — floors, ceilings, exterior walls — contamination cannot directly reach the product</li>
  <li><span class="help-score-badge" style="background:#eab308;">2</span> <strong>Near product</strong> — machine surroundings, production room walls — indirect contamination route possible (via hands, tools, splashing)</li>
  <li><span class="help-score-badge" style="background:#dc2626;">3</span> <strong>Direct product contact</strong> — worktops, machine parts, conveyor belts — direct contamination of the product possible</li>
</ul>

<h4>Risk score (V × Z × A)</h4>
<p>The total risk score is the product of the three values. It colours the cell in the table:</p>
<ul>
  <li><span class="help-score-badge" style="background:#3b8a6a;">≤9</span> Low risk — standard cleaning suffices</li>
  <li><span class="help-score-badge" style="background:#f59e0b;">10–24</span> Medium risk — extra attention, more frequent checks</li>
  <li><span class="help-score-badge" style="background:#dc2626;">≥25</span> High risk — strict cleaning, validation and logging</li>
</ul>
<p>Click the <strong>?</strong> button next to the score column header for a longer explanation in the table itself.</p>

<h3>🧤 PPE icons</h3>
<p>Next to the product name, PPE icons indicate which protective equipment is required:</p>
<ul>
  <li>🧤 <strong>Gloves</strong> — for chemical products</li>
  <li>😷 <strong>Mask</strong> — for dust, vapours, disinfectants or tasks with risk score ≥ 25</li>
</ul>

<h3>➕ Adding a task</h3>
<p>Tasks can only be added when Edit is unlocked:</p>
<ol>
  <li>Click <strong>🔒 Edit</strong> top right and enter the password</li>
  <li>Click <strong>+ New task</strong> in the filter bar (or the floating + button bottom-right on mobile)</li>
  <li>Fill in: area, workplace, component, subcategory (task description), performer, frequency, method</li>
  <li>Optional: add an English translation and/or an image</li>
  <li>Choose Soiling, Zone and Distance from the dropdowns — see the live risk score below</li>
  <li>Click <strong>Save</strong> — the task appears immediately in the right frequency tab</li>
</ol>
<div class="help-callout warn">
  <strong>⚠ Note:</strong> new tasks and edits go to a <strong>pending list</strong>. Click the orange <strong>⟳ Update</strong> button to commit them to the changelog with version, date and author. Until then you can revert everything via "Discard".
</div>

<h3>✏️ Editing tasks</h3>
<p>With Edit unlocked, each row has an <strong>✏️</strong> button. Click it to modify all fields including scores. Edits show as "Edited" until committed via Update.</p>

<h3>🗑 Deleting tasks</h3>
<p>With Edit unlocked, a checkbox appears left of each row:</p>
<ul>
  <li>Click individual checkboxes to select tasks</li>
  <li>Click the header checkbox to (de)select all visible tasks</li>
  <li>A green bar at the top shows how many are selected</li>
  <li>Click <strong>🗑 Delete selected</strong> — a confirmation modal lists what will be removed</li>
</ul>
<p>Deletions also go to the pending list and are reversible via Discard until committed via Update.</p>

<h3>📋 Changelog</h3>
<p>All structural changes (new tasks, edits, deletions) are logged in the Changelog tab with date, version, author and exact diff. The cleaning plan stays auditable — you can always look back at what changed when, and by whom.</p>

<h3>🔲 QR codes</h3>
<p>Click <strong>🔲 QR codes</strong> in the side menu to generate a QR code per area or workplace. Print and hang at the workplace — scanning brings the user directly to the right filter in the app.</p>

<h3>📦 Importing plans</h3>
<p>Click <strong>⬆ Import</strong> to read another cleaning-plan Excel as a new plan alongside the original — switch between plans via the tab bar that appears once there's more than one.</p>

<h3>⬇ Exporting to Excel</h3>
<p>Click <strong>⬇ Export Excel</strong> for a fully formatted file with four sheets: cleaning plan (all tasks + checks), products, methods, changelog. Follows the currently viewed period.</p>

<h3>🖨️ Printing</h3>
<p>Click <strong>🖨 Print</strong> to print the current period on A4. The print shows per row: task, method, product, when and empty checkboxes — useful as paper backup or to hang at the workplace.</p>

<h3>🌙 Dark mode</h3>
<p>Click the <strong>🌙</strong> button in the header to switch to dark mode, and <strong>☀️</strong> to switch back. The app remembers your preference per browser.</p>

<h3>🌐 Switching languages</h3>
<p>Click <strong>🌐 EN</strong> top right to show everything in English. Click <strong>🌐 NL</strong> to switch back to Dutch.</p>

<h3>❓ Questions?</h3>
<p>For content questions about the cleaning plan itself: contact your KAM coordinator. For technical issues with this app: write a note and share it with the administrator.</p>

</div>`;

  return isEn ? en : nl;
}

function closeBulkDeleteModal() {
  const m = document.getElementById('bulk-delete-modal');
  if (m) m.classList.remove('show');
}

// Execute the bulk-delete. Builds a pending-change entry per task so the
// commit flow (Update modal + Versiebeheer) reflects the removal.
function confirmBulkDelete() {
  const L = T[state.lang];
  const ids = (state.selectedTaskIds || []).slice(); // copy
  // Build a snapshot of everything that's about to change, so undo can fully
  // restore it: the original task objects, what was custom vs builtin, and
  // any check entries that get cleared along with the task.
  const undoSnap = {
    customTasks: [],     // [{ task, originalIndex }]
    builtinIds:  [],     // string[] — added to deletedBuiltinIds
    checks:      {},     // { [freqKey]: { [periodKey]: { [taskId]: slotMap } } }
    pendingChanges: []   // [{ type, taskId, payload }] recorded by recordChange
  };
  let customRemoved = 0;
  let builtinRemoved = 0;
  ids.forEach(id => {
    const task = getAllTasks().find(t => t.id === id);
    if (!task) return;
    const before = Object.assign({}, task);
    const isCustom = !!task.custom;
    if (isCustom) {
      const idx = state.customTasks.findIndex(t => t.id === id);
      undoSnap.customTasks.push({ task: Object.assign({}, state.customTasks[idx]), originalIndex: idx });
      state.customTasks = state.customTasks.filter(t => t.id !== id);
      customRemoved++;
    } else {
      if (!state.deletedBuiltinIds) state.deletedBuiltinIds = [];
      if (!state.deletedBuiltinIds.includes(id)) {
        state.deletedBuiltinIds.push(id);
        undoSnap.builtinIds.push(id);
      }
      builtinRemoved++;
    }
    // Clear any stored check marks for this task so they don't linger —
    // remember them in the snapshot so undo can put them back.
    for (const fk in state.checks) {
      for (const pk in state.checks[fk]) {
        if (state.checks[fk][pk] && state.checks[fk][pk][id]) {
          if (!undoSnap.checks[fk]) undoSnap.checks[fk] = {};
          if (!undoSnap.checks[fk][pk]) undoSnap.checks[fk][pk] = {};
          undoSnap.checks[fk][pk][id] = state.checks[fk][pk][id];
          delete state.checks[fk][pk][id];
        }
      }
    }
    // Capture the existing pending changelog entry (if any) BEFORE recordChange
    // mutates it. recordChange('delete') will collapse a pending 'add' to nothing,
    // which would otherwise be lost on undo.
    const priorPending = state.pendingChanges[id]
      ? JSON.parse(JSON.stringify(state.pendingChanges[id]))
      : null;
    recordChange('delete', id, { before: before });
    undoSnap.pendingChanges.push({ taskId: id, prior: priorPending });
  });
  state.selectedTaskIds = [];
  closeBulkDeleteModal();
  saveState();
  renderApp();
  // Toast with Undo action — restoring rebuilds the deleted state in reverse
  const total = customRemoved + builtinRemoved;
  if (total > 0) {
    showToast(L.bulk_delete_success.replace('{n}', total), 'success', {
      actionLabel: L.undo_label,
      onAction: () => {
        // Restore custom tasks at their original indices
        undoSnap.customTasks
          .sort((a, b) => a.originalIndex - b.originalIndex)
          .forEach(({ task, originalIndex }) => {
            const safeIdx = Math.min(originalIndex, state.customTasks.length);
            state.customTasks.splice(safeIdx, 0, task);
          });
        // Un-delete builtins
        if (undoSnap.builtinIds.length && state.deletedBuiltinIds) {
          state.deletedBuiltinIds = state.deletedBuiltinIds.filter(
            id => !undoSnap.builtinIds.includes(id)
          );
        }
        // Restore the cleared check marks
        for (const fk in undoSnap.checks) {
          if (!state.checks[fk]) state.checks[fk] = {};
          for (const pk in undoSnap.checks[fk]) {
            if (!state.checks[fk][pk]) state.checks[fk][pk] = {};
            for (const tid in undoSnap.checks[fk][pk]) {
              state.checks[fk][pk][tid] = undoSnap.checks[fk][pk][tid];
            }
          }
        }
        // Roll back the pending change-log entries to their pre-delete state.
        // Three cases handled:
        //  1) Prior was a pending 'add' → recordChange('delete') collapsed it
        //     to nothing. Restore the 'add' so the task ships in the next commit.
        //  2) Prior was a pending 'edit' → recordChange merged it into a 'delete'.
        //     Restore the original 'edit'.
        //  3) No prior pending → recordChange added a fresh 'delete'. Just remove it.
        if (state.pendingChanges) {
          undoSnap.pendingChanges.forEach(({ taskId, prior }) => {
            if (prior) {
              state.pendingChanges[taskId] = prior;
            } else {
              if (state.pendingChanges[taskId] && state.pendingChanges[taskId].type === 'delete') {
                delete state.pendingChanges[taskId];
              }
            }
          });
        }
        saveState();
        renderApp();
        showToast(L.undo_restored, 'success');
      }
    });
  } else {
    showToast(L.bulk_delete_success.replace('{n}', total), 'success');
  }
}

function deleteCustomTask(taskId) {
  const L = T[state.lang];
  // Capture snapshot for changelog BEFORE the deletion
  const taskBefore = Object.assign({}, getAllTasks().find(t => t.id === taskId));
  if (!taskBefore || !taskBefore.id) return;
  if (!confirm(L.delete_task_confirm)) return;
  // If the task had an image, delete it from Storage too. Best-effort —
  // failure here doesn't block the task deletion (image will become an
  // orphan in Storage but won't break anything).
  if (taskBefore.imageUrl) {
    deleteTaskImage(taskId).catch(err => console.warn('Image cleanup failed:', err));
  }
  state.customTasks = state.customTasks.filter(t => t.id !== taskId);
  recordChange('delete', taskId, { before: taskBefore });
  // Also clean up any stored checks for this task
  for (const fk in state.checks) {
    for (const pk in state.checks[fk]) {
      if (state.checks[fk][pk][taskId]) {
        delete state.checks[fk][pk][taskId];
      }
    }
  }
  saveState();
  renderApp();
  showToast(L.delete_task_success, 'success');
}

// =====================================================
// MSDS MODAL
// =====================================================
function openMsds(productName) {
  const L = T[state.lang];
  state.msdsCurrentProduct = productName;
  const p = DATA.products.find(x => x.name && x.name.toLowerCase() === productName.toLowerCase());
  if (!p) {
    // Even when there's no product in the master list, still allow viewing
    // any saved supplier link for items that only exist as task-level "middel"
    // entries. Admins also need access so they can add a link.
    const key = msdsKey(productName);
    if (!(state.msdsLinks && state.msdsLinks[key]) && !isAdmin()) return;
    document.getElementById('msds-title').textContent = productName;
    document.getElementById('msds-subtitle').textContent = 'MSDS · Safety Data Sheet';
    document.getElementById('msds-body').innerHTML = `<div id="msds-link-row">${renderMsdsLinkBlock(productName)}</div>`;
    document.getElementById('msds-modal').classList.add('show');
    return;
  }
  document.getElementById('msds-title').textContent = p.name;
  document.getElementById('msds-subtitle').textContent = 'MSDS · Safety Data Sheet (samenvatting)';
  const body = document.getElementById('msds-body');
  const hazards = inferHazards(p);
  body.innerHTML = `
    ${p.beschrijving ? `<div class="msds-section"><h3>${L.msds_description}</h3><p>${esc(trProductField(p.beschrijving))}</p></div>` : ''}
    ${p.toepassing ? `<div class="msds-section"><h3>${L.msds_usage}</h3><p>${esc(trProductField(p.toepassing))}</p></div>` : ''}
    ${p.concentratie ? `<div class="msds-section"><h3>${L.msds_concentration}</h3><p>${esc(p.concentratie)}</p></div>` : ''}
    ${p.meetwijze && p.meetwijze !== '--' ? `<div class="msds-section"><h3>${L.msds_measurement}</h3><p>${esc(trProductField(p.meetwijze))}</p></div>` : ''}
    ${hazards.length ? `<div class="msds-section"><h3>${L.msds_classification}</h3><div class="hazard-symbols">${hazards.map(h=>`<span class="hazard-badge">⚠ ${esc(h)}</span>`).join('')}</div></div>` : ''}
    ${p.opmerking ? `<div class="msds-warning"><strong>⚠ ${L.msds_remarks}</strong>${esc(trProductField(p.opmerking))}</div>` : ''}
    <div class="msds-warning"><strong>🧤 PBM / PPE</strong>${L.msds_ppe_warning}</div>
    <div id="msds-link-row">${renderMsdsLinkBlock(p.name)}</div>
    <div class="msds-note">${L.msds_general_note}</div>
  `;
  document.getElementById('msds-modal').classList.add('show');
}
function closeModal() { document.getElementById('msds-modal').classList.remove('show'); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeAddTaskModal();
    closeResetModal();
    closePasswordModal();
    closeSignOutModal();
    closeOverdueOverviewModal();
    closeImageLightbox();
    closeNoteModal();
    closeInspectionModal();
  }
});

// =====================================================
// CHECK NOTE MODAL — annotate a check-off with a remark
// =====================================================
// State for the currently-open note modal. Stored module-level so the
// save and clear handlers know which check to update.
let __noteModalCtx = null; // { freqKey, taskId, slotIdx }

function openNoteModal(freqKey, taskId, slotIdx) {
  const L = T[state.lang];
  const task = getAllTasks().find(t => t.id === taskId);
  const existingNote = getCheckNote(freqKey, taskId, slotIdx) || '';
  __noteModalCtx = { freqKey, taskId, slotIdx };

  // Populate labels
  const titleText = document.getElementById('note-modal-title-text');
  if (titleText) titleText.textContent = L.note_modal_title;
  const subtitle = document.getElementById('note-modal-subtitle');
  if (subtitle) subtitle.textContent = task ? trOnderdeel(task) : '';
  const label = document.getElementById('note-modal-label');
  if (label) label.textContent = L.note_modal_label;
  const cancelBtn = document.getElementById('note-modal-cancel');
  if (cancelBtn) cancelBtn.textContent = L.note_modal_cancel;
  const saveBtn = document.getElementById('note-modal-save');
  if (saveBtn) saveBtn.textContent = L.note_modal_save;
  const clearBtn = document.getElementById('note-modal-clear');
  if (clearBtn) {
    clearBtn.textContent = L.note_modal_clear;
    // Only show the clear button if there's already a note to clear
    clearBtn.style.display = existingNote ? '' : 'none';
  }

  // Pre-fill textarea with existing note
  const input = document.getElementById('note-modal-input');
  if (input) {
    input.value = existingNote;
    input.placeholder = L.note_modal_placeholder;
    updateNoteCharCount();
    input.addEventListener('input', updateNoteCharCount);
  }
  document.getElementById('note-modal').classList.add('show');
  setTimeout(() => { if (input) input.focus(); }, 80);
}

function updateNoteCharCount() {
  const input = document.getElementById('note-modal-input');
  const counter = document.getElementById('note-modal-chars');
  if (input && counter) counter.textContent = input.value.length;
}

function closeNoteModal() {
  const m = document.getElementById('note-modal');
  if (m) m.classList.remove('show');
  __noteModalCtx = null;
}

// Called by the Save button (no arg) or the Clear button (empty string arg).
function saveCheckNote(overrideText) {
  if (!__noteModalCtx) return;
  const { freqKey, taskId, slotIdx } = __noteModalCtx;
  const text = overrideText !== undefined
    ? overrideText
    : (document.getElementById('note-modal-input') || {}).value || '';
  setCheckNote(freqKey, taskId, slotIdx, text);
  closeNoteModal();
  // Pre-seed sig so the Firestore echo after the note write doesn't trigger renderApp
  if (typeof stableStringify === 'function') {
    lastRenderedChecksSig = stableStringify(state.checks);
  }
  // Surgically update only the note button(s) for this task+slot — no full renderApp needed.
  // The note icon changes from + to 💬 (or back), and the tooltip updates.
  updateCheckNoteButton(freqKey, taskId, slotIdx, text.trim());
  showToast(text.trim() ? T[state.lang].note_saved : T[state.lang].note_cleared, 'success');
}

// Patch only the note-button DOM for a specific check slot, without re-rendering
// the whole page. Called after saving or clearing a note.
function updateCheckNoteButton(freqKey, taskId, slotIdx, noteText) {
  const L = T[state.lang];
  const hasNote = !!noteText;
  const tipText = hasNote
    ? esc(L.note_edit_tooltip + ': ' + noteText)
    : esc(L.note_add_tooltip);
  const innerHtml = hasNote ? '💬' : '<span class="check-note-plus">+</span>';
  // Update all matching buttons (table row + mobile card may both be in the DOM)
  document.querySelectorAll(
    `.check-note-btn[data-freq="${freqKey}"][data-task="${taskId}"][data-slot="${slotIdx}"]`
  ).forEach(btn => {
    btn.classList.toggle('has-note', hasNote);
    btn.title = hasNote ? `${L.note_edit_tooltip}: ${noteText}` : L.note_add_tooltip;
    btn.setAttribute('aria-label', hasNote ? L.note_edit_tooltip : L.note_add_tooltip);
    btn.innerHTML = innerHtml;
  });
  // Also update the mobile card note-preview if present
  const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
  if (card) {
    const wrap = card.querySelector(`.task-card-check-wrap:nth-child(${slotIdx + 1})`);
    if (wrap) {
      let preview = wrap.querySelector('.card-note-preview');
      if (hasNote) {
        const previewText = noteText.length > 40 ? noteText.slice(0, 40) + '…' : noteText;
        if (preview) {
          preview.textContent = previewText;
          preview.title = noteText;
        } else {
          const el = document.createElement('div');
          el.className = 'card-note-preview';
          el.title = noteText;
          el.textContent = previewText;
          wrap.appendChild(el);
        }
      } else if (preview) {
        preview.remove();
      }
    }
  }
}

// Delegated click handler for check-note buttons. Same pattern as the image
// buttons — data-attributes avoid any URL/string-escaping issues in onclick.
document.addEventListener('click', e => {
  const btn = e.target && e.target.closest && e.target.closest('.check-note-btn');
  if (!btn) return;
  e.stopPropagation();
  e.preventDefault();
  const freq = btn.dataset.freq;
  const task = btn.dataset.task;
  const slot = parseInt(btn.dataset.slot, 10);
  if (freq && task && !isNaN(slot)) openNoteModal(freq, task, slot);
});

// Delegated click handler for task-image buttons. We use delegation on the
// document so this also works after re-renders, and so we can use
// data-attributes instead of inline onclick — which would break for image
// URLs containing query-string `&` characters (the HTML escape turns them
// into `&amp;` and the URL becomes invalid when read back as JavaScript).
document.addEventListener('click', e => {
  const btn = e.target && e.target.closest && e.target.closest('.task-image-btn');
  if (!btn) return;
  e.stopPropagation();
  e.preventDefault();
  // The browser parses HTML attribute values (turning &amp; back into &),
  // so reading dataset gives us the original URL with intact query params.
  const url = btn.dataset.imageUrl;
  const caption = btn.dataset.imageCaption || '';
  const taskId = btn.dataset.taskId || '';
  if (url) openImageLightbox(url, caption, taskId);
});

function inferHazards(p) {
  const h = [];
  const all = ((p.beschrijving||'') + ' ' + (p.toepassing||'') + ' ' + (p.meetwijze||'') + ' ' + (p.opmerking||'')).toLowerCase();
  if (all.includes('alkalisch') || all.includes('ph') && !all.includes('neutraal')) h.push(state.lang==='nl'?'pH-bijtend':'pH corrosive');
  if (all.includes('chloor')) h.push(state.lang==='nl'?'Chloor':'Chlorine');
  if (all.includes('peroxide') || all.includes('perazijnzuur')) h.push(state.lang==='nl'?'Oxiderend':'Oxidising');
  if (all.includes('bijtend')) h.push(state.lang==='nl'?'Bijtend':'Corrosive');
  if (all.includes('quat')) h.push(state.lang==='nl'?'Quaternaire ammonium':'Quaternary ammonium');
  if (all.includes('alcohol')) h.push(state.lang==='nl'?'Ontvlambaar':'Flammable');
  return h;
}

// =====================================================
// LANGUAGE TOGGLE
// =====================================================
// Supported interface languages. NL and EN are fully translated (UI + help +
// task-content). PL and RO have full UI translations; task names and the help
// modal fall back to English for those two (see trOnderdeel/trSubcat and the
// help renderer). Keep this list in sync with the <option>s in index.html and
// the T object above.
const SUPPORTED_LANGS = ['nl', 'en', 'pl', 'ro'];

// Set the interface language directly (used by the header language dropdown).
function setLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  if (lang === state.lang) return;
  state.lang = lang;
  saveState();
  renderApp();
  // Refresh the dark-mode button's tooltip in the new language without
  // toggling the actual mode.
  applyDarkMode(!!state.darkMode);
}

// Backwards-compatible cycler (cycles through all supported languages). Kept
// in case anything still calls it; the header now uses a dropdown.
function toggleLanguage() {
  const i = SUPPORTED_LANGS.indexOf(state.lang);
  const next = SUPPORTED_LANGS[(i + 1) % SUPPORTED_LANGS.length] || 'nl';
  setLanguage(next);
}

// =====================================================
// DARK MODE
// =====================================================
// Stored as a single key in storage so it survives reloads. Applied via a
// body-level class that drives all of the dark CSS overrides — that lets us
// add dark variants without rewriting the existing light-theme CSS. The
// initial value is read once at startup; toggling persists immediately.
const STORAGE_KEY_DARK_MODE = 'cleaning_dark_mode_v1';

function applyDarkMode(enabled) {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.classList.toggle('dark-mode', !!enabled);
  // Update the toggle button's icon and tooltip so the user knows what'll
  // happen next click.
  const btn = document.getElementById('dark-mode-btn');
  if (btn) {
    btn.textContent = enabled ? '☀️' : '🌙';
    btn.title = enabled
      ? (state.lang === 'nl' ? 'Lichte modus' : 'Light mode')
      : (state.lang === 'nl' ? 'Donkere modus' : 'Dark mode');
    btn.setAttribute('aria-label', btn.title);
  }
  // Logo-switch: als de klant een aparte dark-mode-logo heeft ingesteld,
  // moet die nu zichtbaar worden (anders blijft het light-logo onleesbaar
  // op donker-mode achtergrond). Roep applyBranding aan zodat ook eventuele
  // CSS-vars opnieuw uitgelijnd worden.
  const b = state.branding || {};
  if (b.logoDataUrl || b.logoDarkDataUrl) {
    const logoEl = document.querySelector('.brand-logo');
    if (logoEl) {
      const customLogo = (enabled && b.logoDarkDataUrl) ? b.logoDarkDataUrl
                        : (b.logoDataUrl || b.logoDarkDataUrl);
      if (customLogo) logoEl.src = customLogo;
    }
  }
}

function toggleDarkMode() {
  state.darkMode = !state.darkMode;
  applyDarkMode(state.darkMode);
  // Persist outside saveState so dark-mode survives even if the user is in
  // a state where saveState is gated (e.g. not yet logged in).
  if (typeof window !== 'undefined' && window.storage) {
    try { window.storage.set(STORAGE_KEY_DARK_MODE, state.darkMode); } catch (e) {}
  } else if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(STORAGE_KEY_DARK_MODE, state.darkMode ? '1' : '0'); } catch (e) {}
  }
}

// Read the persisted dark-mode flag at startup. Falls back to OS preference
// when nothing is stored, so first-time visitors on a dark-themed device get
// a comfortable default.
async function initDarkMode() {
  let stored = null;
  try {
    if (typeof window !== 'undefined' && window.storage) {
      stored = await window.storage.get(STORAGE_KEY_DARK_MODE);
    } else if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY_DARK_MODE);
      if (raw !== null) stored = raw === '1' || raw === 'true';
    }
  } catch (e) { /* ignore — we'll fall through to OS preference */ }
  let enabled;
  if (stored === true || stored === false) {
    enabled = stored;
  } else if (typeof window !== 'undefined' && window.matchMedia) {
    enabled = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } else {
    enabled = false;
  }
  state.darkMode = enabled;
  applyDarkMode(enabled);
}

// =====================================================
// EXCEL EXPORT
// =====================================================
// Helper: build a style object for xlsx-js-style
function makeBorder(sides) {
  const thin = { style: 'thin', color: { rgb: '000000' } };
  const b = {};
  (sides || ['top','bottom','left','right']).forEach(s => { b[s] = thin; });
  return b;
}

// Apply styles to every cell in an existing worksheet.
// styleFor(r, c) returns a style object or null.
function applyStylesToSheet(ws, styleFor) {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const style = styleFor(R, C);
      if (!style) continue;
      // Create the cell if it doesn't exist (so styled empty borders still show)
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = style;
    }
  }
}

// =====================================================
// MULTI-PLAN SUPPORT — IMPORT, TABS, RENAME, DELETE
// =====================================================

// Render the plan selector tabs above the frequency tab bar.
// Hidden when only one plan exists (avoids visual clutter).
function renderPlanTabs() {
  const container = document.getElementById('plan-tabs');
  if (!container) return;
  const L = T[state.lang];
  const planIds = Object.keys(state.plans);
  if (planIds.length <= 1) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  container.style.display = 'flex';
  let html = '';
  planIds.forEach(id => {
    const plan = state.plans[id];
    const isActive = id === state.activePlanId;
    const isOriginal = id === 'original';
    const safeId = id.replace(/'/g, "\\'");
    html += `<div class="plan-tab ${isActive ? 'active' : ''}" onclick="switchPlan('${safeId}')" title="${esc(plan.name || id)}">
      📋 <span>${esc(plan.name || id)}</span>
      <button class="plan-tab-rename" onclick="event.stopPropagation(); renamePlan('${safeId}')" title="${esc(L.plan_rename)}">✏️</button>
      ${!isOriginal ? `<button class="plan-tab-delete" onclick="event.stopPropagation(); deletePlan('${safeId}')" title="${esc(L.plan_delete)}">✕</button>` : ''}
    </div>`;
  });
  container.innerHTML = html;
}

function renamePlan(planId) {
  const L = T[state.lang];
  const plan = state.plans[planId];
  if (!plan) return;
  const newName = prompt(L.plan_rename_prompt, plan.name || '');
  if (newName === null) return;
  const trimmed = newName.trim().substring(0, 40);
  if (!trimmed) return;
  plan.name = trimmed;
  saveState();
  // Only the plan-tabs row shows the plan name — no need for a full re-render.
  renderPlanTabs();
  showToast(L.plan_renamed, 'success');
}

function deletePlan(planId) {
  if (planId === 'original') return;
  const L = T[state.lang];
  const plan = state.plans[planId];
  if (!plan) return;
  if (!confirm(L.plan_delete_confirm.replace('{n}', plan.name || planId))) return;
  // If deleting active plan, switch to original first
  if (state.activePlanId === planId) {
    saveActivePlanState();
    loadPlanState('original');
    state.filters = { area: '', performer: '', search: '' };
    state.activeTab = 'today';
  }
  delete state.plans[planId];
  saveState();
  renderApp();
  showToast(L.plan_deleted, 'success');
}

// =====================================================
// BACKUP / RESTORE — full state to/from JSON file
// =====================================================

const BACKUP_FORMAT_VERSION = 1;

function exportBackup() {
  // Save the currently-active plan back into state.plans before snapshotting
  saveActivePlanState();
  // Build a complete snapshot of every persisted key. Anything stored via
  // saveState() that lives in state must be captured here for full fidelity.
  const snapshot = {
    format: 'schoonmaakplan-backup',
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: getLatestVersion ? getLatestVersion() : '',
    plans: state.plans || {},
    activePlanId: state.activePlanId || 'original',
    lang: state.lang || 'nl'
  };
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Filename: schoonmaakplan-backup-YYYY-MM-DD-HHMM.json
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  a.download = `schoonmaakplan-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const L = T[state.lang];
  showToast(L.backup_success, 'success');
}

function triggerRestoreBackup() {
  const input = document.getElementById('restore-file-input');
  if (input) {
    input.value = ''; // reset so re-selecting same file fires change event
    input.click();
  }
}

function handleRestoreFile(event) {
  const L = T[state.lang];
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      // Validate format
      if (!parsed || parsed.format !== 'schoonmaakplan-backup') {
        showToast(L.restore_invalid_format, 'error');
        return;
      }
      if (!parsed.plans || typeof parsed.plans !== 'object' || Object.keys(parsed.plans).length === 0) {
        showToast(L.restore_empty, 'error');
        return;
      }
      // Confirmation: this REPLACES current state — non-trivial
      const planCount = Object.keys(parsed.plans).length;
      const exportedAt = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString() : '?';
      const msg = L.restore_confirm
        .replace('{plans}', planCount)
        .replace('{date}', exportedAt);
      if (!confirm(msg)) return;
      // Apply
      state.plans = parsed.plans;
      state.activePlanId = parsed.activePlanId && parsed.plans[parsed.activePlanId]
        ? parsed.activePlanId : Object.keys(parsed.plans)[0];
      if (['nl', 'en', 'pl', 'ro'].includes(parsed.lang)) state.lang = parsed.lang;
      // Load the active plan into runtime state
      loadPlanState(state.activePlanId);
      // Clear session-only stuff that doesn't survive a restore
      state.selectedTaskIds = [];
      state.viewingPeriod = {};
      state.editUnlocked = false;
      saveState();
      renderApp();
      showToast(L.restore_success.replace('{n}', planCount), 'success');
    } catch (err) {
      console.error('Restore error:', err);
      showToast(L.restore_parse_error, 'error');
    }
  };
  reader.onerror = function() {
    showToast(L.restore_read_error, 'error');
  };
  reader.readAsText(file);
}

function triggerImportPlan() {
  const input = document.getElementById('import-file-input');
  if (input) input.click();
}

// Parse a workbook (SheetJS format) into our internal plan data structure.
// Assumptions that mirror the original uploaded file:
//   - "Schoonmaakplan" sheet: row 1 = title (ignored), row 2 = headers (ignored),
//     column A = empty "P" marker (ignored), data starts at row 3 col B.
//   - Other sheets start their data from the first non-empty row.
function parsePlanFromWorkbook(wb) {
  const out = { tasks: [], products: [], methods: [], versions: [] };
  
  // Helper: find sheet by name with case-insensitive match (tolerates minor naming differences)
  const findSheet = (wantedName) => {
    const lower = wantedName.toLowerCase();
    for (const n of wb.SheetNames) {
      if (n.toLowerCase() === lower) return wb.Sheets[n];
    }
    return null;
  };
  
  // --- Schoonmaakplan (main) ---
  const spSheet = findSheet('Schoonmaakplan') || wb.Sheets[wb.SheetNames[0]];
  if (spSheet) {
    const rows = XLSX.utils.sheet_to_json(spSheet, { header: 1, defval: '' });
    // Skip row 1 (title) and row 2 (headers); data starts at row index 2 (rows[2])
    for (let r = 2; r < rows.length; r++) {
      const row = rows[r] || [];
      // Column A is index 0 (ignore the "P" marker), B=1 Ruimte, C=2 Werkplek,
      // D=3 Onderdeel, E=4 Subcategorie/taak, F=5 Uitvoerend, G=6 Type vervuiling,
      // H=7 vscore, I=8 zscore, J=9 afstand, K=10 score (computed, discarded),
      // L=11 Frequentie, M=12 Wanneer, N=13 Methode, O=14 Middel
      const ruimte = String(row[1] || '').trim();
      const werkplek = String(row[2] || '').trim();
      const onderdeel = String(row[3] || '').trim();
      const subcat = String(row[4] || '').trim();
      // Skip entirely blank rows
      if (!ruimte && !werkplek && !onderdeel && !subcat) continue;
      
      const freqRaw = String(row[11] || '').toLowerCase().trim();
      let freqKey = null;
      if (freqRaw.includes('dag') || freqRaw.includes('daily')) freqKey = 'daily';
      else if (freqRaw.includes('2 maan') || freqRaw.includes('bimonthly') || freqRaw.includes('2-maan')) freqKey = 'bimonthly';
      else if (freqRaw.includes('week')) freqKey = 'weekly';
      else if (freqRaw.includes('maand') || freqRaw.includes('monthly')) freqKey = 'monthly';
      else if (freqRaw.includes('kwart') || freqRaw.includes('quart')) freqKey = 'quarterly';
      else if (freqRaw.includes('halfj') || freqRaw.includes('semi')) freqKey = 'semiannual';
      else if (freqRaw.includes('jaar') || freqRaw.includes('annu')) freqKey = 'annual';
      else freqKey = 'weekly';
      
      const parseScore = (v) => {
        if (v === '' || v === null || v === undefined) return null;
        const n = parseFloat(v);
        return isNaN(n) ? v : n;
      };
      
      out.tasks.push({
        id: 'i' + (r - 1),
        row: r + 1,
        ruimte: ruimte || null,
        werkplek: werkplek || null,
        onderdeel: onderdeel || null,
        subcat: subcat || null,
        uitvoerend: String(row[5] || '').trim() || null,
        vervuiling: String(row[6] || '').trim() || null,
        vscore: parseScore(row[7]),
        zscore: parseScore(row[8]),
        afstand: parseScore(row[9]),
        freq: String(row[11] || '').trim() || null,
        freq_key: freqKey,
        wanneer: String(row[12] || '').trim() || null,
        methode: String(row[13] || '').trim() || null,
        middel: String(row[14] || '').trim() || null
      });
    }
  }
  
  // --- Middelen ---
  const midSheet = findSheet('Middelen');
  if (midSheet) {
    const rows = XLSX.utils.sheet_to_json(midSheet, { header: 1, defval: '' });
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      const name = String(row[0] || '').trim();
      if (!name) continue;
      // Skip header row if detected
      if (name.toLowerCase() === 'product' || name.toLowerCase() === 'naam') continue;
      out.products.push({
        name: name,
        beschrijving: String(row[1] || '').trim(),
        toepassing: String(row[2] || '').trim(),
        concentratie: String(row[3] || '').trim(),
        meetwijze: String(row[4] || '').trim(),
        opmerking: String(row[5] || '').trim()
      });
    }
  }
  
  // --- Methodieken ---
  const methSheet = findSheet('Methodieken');
  if (methSheet) {
    const rows = XLSX.utils.sheet_to_json(methSheet, { header: 1, defval: '' });
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      const code = String(row[0] || '').trim();
      const name = String(row[1] || '').trim();
      if (!code && !name) continue;
      if (code.toLowerCase() === 'code') continue;
      const desc = [];
      for (let c = 2; c < row.length; c++) {
        const v = String(row[c] || '').trim();
        if (v) desc.push(v);
      }
      out.methods.push({ code: code, name: name, description: desc });
    }
  }
  
  // --- Versiebeheer ---
  const vSheet = findSheet('Versiebeheer');
  if (vSheet) {
    const rows = XLSX.utils.sheet_to_json(vSheet, { header: 1, defval: '' });
    // Row 0 is headers; data from row 1 onwards. Multi-row entries share
    // a version number in column A.
    let current = null;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const ver = String(row[0] || '').trim();
      let dateVal = row[1];
      if (dateVal instanceof Date) dateVal = dateVal.toISOString().split('T')[0];
      else dateVal = String(dateVal || '').trim();
      const change = String(row[2] || '').trim();
      if (ver) {
        if (current) out.versions.push(current);
        current = { version: ver, date: dateVal, changes: change ? [change] : [] };
      } else if (current && change) {
        current.changes.push(change);
      }
    }
    if (current) out.versions.push(current);
  }
  
  return out;
}

function handleImportFile(event) {
  const L = T[state.lang];
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const parsed = parsePlanFromWorkbook(wb);
      if (parsed.tasks.length === 0) {
        showToast(L.import_error_no_tasks, 'error');
        event.target.value = '';
        return;
      }
      // Save current plan before switching
      saveActivePlanState();
      // Create new plan
      const planId = 'imported_' + Date.now();
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').substring(0, 30);
      state.plans[planId] = {
        name: baseName || 'Geïmporteerd plan',
        data: parsed,
        checks: {},
        customTasks: [],
        taskOverrides: {},
        taskNvtFields: {},
        branding: {},
        schedule: {},
        customChangelog: [],
        pendingChanges: {},
        deletedBuiltinIds: []
      };
      loadPlanState(planId);
      state.filters = { area: '', performer: '', search: '' };
      state.activeTab = 'today';
      saveState();
      renderApp();
      showToast(L.import_success.replace('{n}', parsed.tasks.length), 'success');
    } catch (err) {
      console.error('Import error:', err);
      showToast((L.import_error || 'Import error') + ': ' + (err.message || ''), 'error');
    }
    event.target.value = '';
  };
  reader.onerror = function() {
    showToast(L.import_error || 'Import error', 'error');
    event.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

function exportToExcel() {
  try {
    const L = T[state.lang];
    const wb = XLSX.utils.book_new();
    
    // Common style building blocks
    const BORDERS_ALL = makeBorder(['top','bottom','left','right']);
    const FONT_HEADER = { bold: true, sz: 11, name: 'Calibri' };
    const FONT_DATA = { sz: 11, name: 'Calibri' };
    const FONT_TITLE = { bold: true, sz: 14, name: 'Calibri' };
    const ALIGN_LEFT_TOP_WRAP = { horizontal: 'left', vertical: 'top', wrapText: true };
    const ALIGN_CENTER_TOP = { horizontal: 'center', vertical: 'top', wrapText: true };
    
    // === Sheet: Schoonmaakplan (main) ===
    const headers = [
      "P", "Ruimte", "Werkplek", "Onderdeel", "Subcategorie/taak/opmerkingen", "Uitvoerend",
      "Type vervuiling", "vervuilingscore", "zonescore", "afstand tot product", "score",
      "Frequentie", "Wanneer", "Methode (dropdown)", "Middelen (dropdown)",
      "Ochtend", "Middag", "Nacht", "Opmerkingen",
      "Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Opmerkingen",
      "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"
    ];
    // Score columns (0-indexed): H=7, I=8, J=9, K=10
    const SCORE_COLS = new Set([7, 8, 9, 10]);
    // Check columns (all are center-aligned): P-R (15-17), T-Z (19-25), AB-AM (27-38)
    const CHECK_COLS = new Set([15,16,17, 19,20,21,22,23,24,25, 27,28,29,30,31,32,33,34,35,36,37,38]);
    // "Opmerkingen" text columns (18 = col S, 26 = col AA)
    const NOTE_COLS = new Set([18, 26]);
    
    const data = [[], headers];
    data[0][1] = "Schoonmaakplan"; // Will be merged B1:O1
    
    const sortedTasks = [...getAllTasks()].sort((a, b) => a.row - b.row);
    sortedTasks.forEach(t => {
      const row = new Array(39).fill("");
      row[0] = "";
      row[1] = t.ruimte || "";
      row[2] = t.werkplek || "";
      row[3] = t.onderdeel || "";
      row[4] = t.subcat || "";
      row[5] = t.uitvoerend || "";
      row[6] = t.vervuiling || "";
      row[7] = (t.vscore != null && t.vscore !== '') ? t.vscore : "";
      row[8] = (t.zscore != null && t.zscore !== '') ? t.zscore : "";
      row[9] = (t.afstand != null && t.afstand !== '') ? t.afstand : "";
      // Compute score only if all 3 are numeric
      const vn = parseFloat(t.vscore), zn = parseFloat(t.zscore), an = parseFloat(t.afstand);
      row[10] = (!isNaN(vn) && !isNaN(zn) && !isNaN(an)) ? (vn * zn * an) : "";
      row[11] = t.freq || "";
      row[12] = t.wanneer || "";
      row[13] = t.methode || "";
      row[14] = t.middel || "";
      
      const fk = t.freq_key;
      if (fk === 'daily') {
        const key = getViewingPeriodKey('daily');
        const slots = (state.checks.daily && state.checks.daily[key] && state.checks.daily[key][t.id]) || {};
        row[15] = slots[0] ? "X" : "";
        row[16] = slots[1] ? "X" : "";
        row[17] = slots[2] ? "X" : "";
      } else if (fk === 'weekly') {
        const key = getViewingPeriodKey('weekly');
        const slots = (state.checks.weekly && state.checks.weekly[key] && state.checks.weekly[key][t.id]) || {};
        for (let i = 0; i < 7; i++) row[19 + i] = slots[i] ? "X" : "";
      } else {
        const key = getViewingPeriodKey(fk);
        const slots = (state.checks[fk] && state.checks[fk][key] && state.checks[fk][key][t.id]) || {};
        if (fk === 'monthly') {
          for (let i = 0; i < 12; i++) row[27 + i] = slots[i] ? "X" : "";
        } else if (fk === 'quarterly') {
          for (let q = 0; q < 4; q++) if (slots[q]) row[27 + q * 3 + 2] = "X";
        } else if (fk === 'semiannual') {
          for (let h = 0; h < 2; h++) if (slots[h]) row[27 + h * 6 + 5] = "X";
        } else if (fk === 'annual') {
          if (slots[0]) row[27 + 11] = "X";
        } else if (fk === 'bimonthly') {
          for (let b = 0; b < 6; b++) if (slots[b]) row[27 + b * 2 + 1] = "X";
        }
      }
      data.push(row);
    });
    
    const ws1 = XLSX.utils.aoa_to_sheet(data);
    
    // Column widths — matching the original Excel as closely as possible
    ws1['!cols'] = [
      {wch: 3},   // A  "P"
      {wch: 14},  // B  Ruimte
      {wch: 14},  // C  Werkplek
      {wch: 40},  // D  Onderdeel
      {wch: 44},  // E  Subcategorie/taak
      {wch: 15},  // F  Uitvoerend
      {wch: 30},  // G  Type vervuiling
      {wch: 13},  // H  vervuilingscore
      {wch: 10},  // I  zonescore
      {wch: 13},  // J  afstand tot product
      {wch: 8},   // K  score
      {wch: 15},  // L  Frequentie
      {wch: 12},  // M  Wanneer
      {wch: 20},  // N  Methode
      {wch: 27},  // O  Middelen
      {wch: 12},  // P  Ochtend
      {wch: 12},  // Q  Middag
      {wch: 10},  // R  Nacht
      {wch: 17},  // S  Opmerkingen
      {wch: 10},  // T  Zondag
      {wch: 11},  // U  Maandag
      {wch: 10},  // V  Dinsdag
      {wch: 11},  // W  Woensdag
      {wch: 13},  // X  Donderdag
      {wch: 13},  // Y  Vrijdag
      {wch: 10},  // Z  Zaterdag
      {wch: 16},  // AA Opmerkingen
      {wch: 8},   // AB-AM monthly
      {wch: 8},{wch: 8},{wch: 8},{wch: 8},{wch: 8},{wch: 8},{wch: 8},{wch: 8},{wch: 8},{wch: 8},{wch: 8}
    ];
    
    // Row heights — title row taller, header row taller, data rows standard
    ws1['!rows'] = [
      { hpt: 30 }, // row 1 (title)
      { hpt: 40 }  // row 2 (headers — needs space for wrapped text like "vervuilingscore")
      // subsequent rows use default auto-height
    ];
    
    // Merge title cell: B1:O1 (indices 1..14 on row 0)
    ws1['!merges'] = [
      { s: { r: 0, c: 1 }, e: { r: 0, c: 14 } }
    ];
    
    // Apply styles per cell
    applyStylesToSheet(ws1, (r, c) => {
      if (r === 0) {
        // Title row — only B1 (merged) has visible content
        if (c === 1) {
          return {
            font: FONT_TITLE,
            alignment: { horizontal: 'center', vertical: 'center' }
          };
        }
        return null;
      }
      if (r === 1) {
        // Header row — bold, wrap, borders
        const align = SCORE_COLS.has(c) ? ALIGN_CENTER_TOP : ALIGN_LEFT_TOP_WRAP;
        return {
          font: FONT_HEADER,
          alignment: align,
          border: BORDERS_ALL,
          fill: { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } }
        };
      }
      // Data rows
      let align;
      if (SCORE_COLS.has(c) || CHECK_COLS.has(c)) {
        align = ALIGN_CENTER_TOP;
      } else if (c === 0) {
        align = { horizontal: 'center', vertical: 'top' };
      } else {
        align = ALIGN_LEFT_TOP_WRAP;
      }
      return {
        font: FONT_DATA,
        alignment: align,
        border: BORDERS_ALL
      };
    });
    
    XLSX.utils.book_append_sheet(wb, ws1, "Schoonmaakplan");
    
    // === Sheet: Middelen ===
    const midData = [["Product", "Beschrijving", "Toepassing", "Concentratie", "Meetwijze", "Opmerking"]];
    DATA.products.forEach(p => {
      midData.push([p.name || "", p.beschrijving || "", p.toepassing || "", p.concentratie || "", p.meetwijze || "", p.opmerking || ""]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(midData);
    ws2['!cols'] = [{wch:20},{wch:60},{wch:45},{wch:14},{wch:16},{wch:30}];
    ws2['!rows'] = [{ hpt: 28 }];
    applyStylesToSheet(ws2, (r, c) => {
      if (r === 0) {
        return {
          font: FONT_HEADER,
          alignment: ALIGN_LEFT_TOP_WRAP,
          border: BORDERS_ALL,
          fill: { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } }
        };
      }
      return { font: FONT_DATA, alignment: ALIGN_LEFT_TOP_WRAP, border: BORDERS_ALL };
    });
    XLSX.utils.book_append_sheet(wb, ws2, "Middelen");
    
    // === Sheet: Methodieken ===
    const methData = [["Code", "Methode", "Beschrijving"]];
    DATA.methods.forEach(m => {
      methData.push([m.code || "", m.name || "", (m.description || []).join(" ")]);
    });
    const ws3 = XLSX.utils.aoa_to_sheet(methData);
    ws3['!cols'] = [{wch:10},{wch:32},{wch:80}];
    ws3['!rows'] = [{ hpt: 28 }];
    applyStylesToSheet(ws3, (r, c) => {
      if (r === 0) {
        return {
          font: FONT_HEADER,
          alignment: ALIGN_LEFT_TOP_WRAP,
          border: BORDERS_ALL,
          fill: { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } }
        };
      }
      return { font: FONT_DATA, alignment: ALIGN_LEFT_TOP_WRAP, border: BORDERS_ALL };
    });
    XLSX.utils.book_append_sheet(wb, ws3, "Methodieken");
    
    // === Sheet: Versiebeheer ===
    const vData = [["Versiebeheer", "Datum", "Beschrijving van de wijziging"]];
    // Same order as in-app view: user-added first, then DATA.versions (newest-first)
    const sortedDataVersions = [...DATA.versions].sort((a, b) => {
      const da = (a.date || '').toString();
      const db = (b.date || '').toString();
      return db.localeCompare(da);
    });
    const allVersions = [...state.customChangelog, ...sortedDataVersions];
    allVersions.forEach(v => {
      const changes = v.changes || [];
      if (changes.length === 0) {
        vData.push([v.version || "", v.date || "", ""]);
      } else {
        vData.push([v.version || "", v.date || "", changes[0]]);
        for (let i = 1; i < changes.length; i++) {
          vData.push(["", "", changes[i]]);
        }
      }
    });
    const ws4 = XLSX.utils.aoa_to_sheet(vData);
    ws4['!cols'] = [{wch:14},{wch:18},{wch:90}];
    ws4['!rows'] = [{ hpt: 28 }];
    applyStylesToSheet(ws4, (r, c) => {
      if (r === 0) {
        return {
          font: FONT_HEADER,
          alignment: ALIGN_LEFT_TOP_WRAP,
          border: BORDERS_ALL,
          fill: { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } }
        };
      }
      return { font: FONT_DATA, alignment: ALIGN_LEFT_TOP_WRAP, border: BORDERS_ALL };
    });
    XLSX.utils.book_append_sheet(wb, ws4, "Versiebeheer");
    
    // File name with today's date
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const fname = `GTE-D-09-99_Schoonmaakplan_${y}-${m}-${d}.xlsx`;
    XLSX.writeFile(wb, fname);
    showToast(T[state.lang].export_success + ': ' + fname, 'success');
  } catch (e) {
    console.error(e);
    showToast(T[state.lang].export_error + ': ' + e.message, 'error');
  }
}

// =====================================================
// TOAST
// =====================================================
// =====================================================
// OVERDUE OVERVIEW MODAL — central drill-down for any
// tasks that were not checked off in the previous period.
// Replaces the per-row "Achterstand" text label: each row
// now shows just a small red dot, and this modal is the
// place to see the full list with one click.
// =====================================================
function openOverdueOverviewModal() {
  const modal = document.getElementById('overdue-modal');
  if (!modal) return;
  renderOverdueOverviewModal();
  modal.classList.add('show');
  // Focus close-button by default — modal is informational, no destructive action
  setTimeout(() => {
    const closeBtn = document.getElementById('btn-overdue-close');
    if (closeBtn) closeBtn.focus();
  }, 50);
}

function closeOverdueOverviewModal() {
  const modal = document.getElementById('overdue-modal');
  if (modal) modal.classList.remove('show');
}

// Build the body of the overdue modal from the current state. Called both
// when opening and (in principle) any time we want to refresh — e.g. after
// the user checks something off from inside the modal in a future iteration.
function renderOverdueOverviewModal() {
  const L = T[state.lang];
  const titleEl = document.getElementById('overdue-modal-title-text');
  const subEl = document.getElementById('overdue-modal-subtitle');
  const body = document.getElementById('overdue-modal-body');
  const closeBtn = document.getElementById('btn-overdue-close');
  if (titleEl) titleEl.textContent = L.overdue_overview_title;
  if (closeBtn) closeBtn.textContent = L.overdue_overview_close;
  const { order, groups } = getOverdueGrouped();
  const total = order.reduce((n, k) => n + (groups[k] ? groups[k].length : 0), 0);
  if (subEl) {
    subEl.textContent = total === 1
      ? `1 ${L.overdue_count_one}`
      : `${total} ${L.overdue_count_many}`;
  }
  if (!body) return;
  if (total === 0) {
    body.innerHTML = `<div class="overdue-empty">✅ ${esc(L.overdue_overview_empty)}</div>`;
    return;
  }
  // Build the grouped list. We use the same tab labels the user is used to
  // seeing, with the per-tab count next to each header.
  let html = '';
  order.forEach(fk => {
    const list = groups[fk] || [];
    if (!list.length) return;
    const tabLabel = (L.tabs && L.tabs[fk]) ? L.tabs[fk] : fk;
    html += `<div class="overdue-group">
      <div class="overdue-group-header">
        <span class="overdue-group-title">${esc(tabLabel)}</span>
        <span class="overdue-group-count">${list.length}</span>
        <button class="overdue-group-goto" onclick="overdueGoToTab('${esc(fk)}')">${esc(L.overdue_overview_goto)}</button>
      </div>
      <ul class="overdue-list">`;
    list.forEach(t => {
      const ruimte = t.ruimte ? esc(tr(t.ruimte)) : '';
      const werkplek = t.werkplek ? ' · ' + esc(tr(t.werkplek)) : '';
      const onderdeel = esc(trOnderdeel(t) || '');
      const sub = t.subcat ? ` — ${esc(trSubcat(t))}` : '';
      const performer = t.uitvoerend ? `<span class="overdue-list-performer">${esc(tr(t.uitvoerend))}</span>` : '';
      html += `<li class="overdue-list-item" onclick="overdueGoToTab('${esc(fk)}')" title="${esc(L.overdue_overview_goto)}">
        <div class="overdue-list-loc">${ruimte}${werkplek}</div>
        <div class="overdue-list-task">${onderdeel}${sub}</div>
        ${performer}
      </li>`;
    });
    html += `</ul></div>`;
  });
  body.innerHTML = html;
}

// Switch to the given tab and close the modal. Bound to "Ga naar →" buttons
// and to the rows themselves for a wider tap target on mobile.
function overdueGoToTab(freqKey) {
  closeOverdueOverviewModal();
  if (state.activeTab !== freqKey) {
    switchTab(freqKey);
  }
}

// =====================================================
// TASK IMAGES — upload/resize/display
// =====================================================
// Single optional image per task, stored in Firebase Storage under
// /task-images/{planId}/{taskId}.jpg, with the public download URL kept
// on the task object as `imageUrl`. Only admins/superusers can upload or
// delete; everyone authenticated can view.
//
// Client-side resizing: phone photos are 3-8 MB and slow to upload. We
// downscale to max 1280×1280 and re-encode as JPEG ~80% quality, which
// brings most images under 300 KB. Done with a hidden <canvas> — no extra
// libraries needed.

// Resize an image File to fit within MAX_DIM × MAX_DIM, preserving aspect
// ratio. Returns a Blob (JPEG, 80% quality). Used by the task-image upload
// flow before pushing to Firebase Storage.
function resizeImageFile(file, maxDim) {
  maxDim = maxDim || 1280;
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      return reject(new Error('Not an image file'));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        let { width, height } = img;
        // Scale down if either dimension exceeds the cap. We use the longest
        // edge so portrait and landscape both get the same downscale rule.
        const longest = Math.max(width, height);
        if (longest > maxDim) {
          const scale = maxDim / longest;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // White background avoids transparent PNGs becoming black when re-encoded as JPEG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('toBlob produced null'));
          resolve(blob);
        }, 'image/jpeg', 0.8);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Upload an image File for a given task. Resizes client-side first, then
// pushes to Firebase Storage. Returns the public download URL on success.
// Caller is responsible for storing the URL on the task object and saving.
async function uploadTaskImage(taskId, file) {
  if (!fbStorage) throw new Error('Storage not available');
  if (!isAdmin()) throw new Error('Only admins can upload images');
  const planId = state.activePlanId || 'original';
  const blob = await resizeImageFile(file, 1280);
  // Use a stable path keyed by task id so re-uploads overwrite the previous
  // image rather than accumulating orphans.
  const safeTaskId = String(taskId).replace(/[^a-zA-Z0-9_-]/g, '');
  const path = `task-images/${planId}/${safeTaskId}.jpg`;
  const ref = fbStorage.ref().child(path);
  const snap = await ref.put(blob, {
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=86400'  // browsers may cache for 1 day
  });
  return await snap.ref.getDownloadURL();
}

// Remove a task image from Storage. Doesn't fail if the file is already gone.
async function deleteTaskImage(taskId) {
  if (!fbStorage) return;
  if (!isAdmin()) throw new Error('Only admins can delete images');
  const planId = state.activePlanId || 'original';
  const safeTaskId = String(taskId).replace(/[^a-zA-Z0-9_-]/g, '');
  const path = `task-images/${planId}/${safeTaskId}.jpg`;
  try {
    await fbStorage.ref().child(path).delete();
  } catch (err) {
    // 'object-not-found' just means it was already gone — that's fine
    if (err && err.code !== 'storage/object-not-found') {
      console.warn('deleteTaskImage failed:', err);
    }
  }
}

// =====================================================
// IMAGE LIGHTBOX — full-screen image viewer
// =====================================================
// Setup the image-upload field inside the Add/Edit Task modal. Hides the
// whole row for non-admin users. Pre-fills the preview from an existing
// task.imageUrl, and wires the file picker to capture a new image into a
// pending state that uploadTask later commits.
function setupTaskImageField(task) {
  const field = document.getElementById('add-image-field');
  if (!field) return;
  // Hide the whole field for non-admins so they don't see options they can't use
  if (!isAdmin()) {
    field.style.display = 'none';
    return;
  }
  field.style.display = '';
  // Reset pending-image state. setupTaskImageField is called every time the
  // modal opens, so this also clears any leftover pending image from a prior
  // save that was cancelled.
  state.pendingTaskImage = {
    file: null,           // newly-picked File (not yet uploaded)
    existingUrl: (task && task.imageUrl) || null,
    cleared: false        // user clicked "Verwijderen"
  };
  // Populate preview
  refreshTaskImagePreview();
  // Re-bind file-input handler. We can't rely on inline onclick because we
  // need to read the chosen file and update preview without re-rendering.
  const input = document.getElementById('add-image-input');
  if (input) {
    input.value = ''; // wipe any previously-selected filename
    input.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!file.type || !file.type.startsWith('image/')) {
        showToast(T[state.lang].image_not_an_image, 'error');
        return;
      }
      // Show a quick local preview (object URL) — actual upload happens on save
      state.pendingTaskImage.file = file;
      state.pendingTaskImage.cleared = false;
      refreshTaskImagePreview(URL.createObjectURL(file));
    };
  }
}

// Update the modal's image preview based on pendingTaskImage state.
function refreshTaskImagePreview(localUrl) {
  const preview = document.getElementById('add-image-preview');
  const clearBtn = document.getElementById('add-image-clear-btn');
  const status = document.getElementById('add-image-status');
  if (!preview) return;
  const p = state.pendingTaskImage || {};
  let urlToShow = null;
  let label = null;
  if (p.file && localUrl) {
    urlToShow = localUrl;
    label = T[state.lang].image_pending_upload;
  } else if (!p.cleared && p.existingUrl) {
    urlToShow = p.existingUrl;
  }
  if (urlToShow) {
    preview.innerHTML = `<img src="${esc(urlToShow)}" alt="">`;
    if (clearBtn) clearBtn.classList.remove('hidden');
  } else {
    preview.innerHTML = `<span class="image-upload-empty">${esc(T[state.lang].image_none)}</span>`;
    if (clearBtn) clearBtn.classList.add('hidden');
  }
  if (status) status.textContent = label || '';
}

// Called when the "Verwijderen" button in the modal is clicked. Marks the
// pending image as cleared so a save will delete the existing one.
function clearTaskImageInModal() {
  if (!state.pendingTaskImage) return;
  state.pendingTaskImage.file = null;
  state.pendingTaskImage.cleared = true;
  // Wipe the file input so picking the same file again still triggers onchange
  const input = document.getElementById('add-image-input');
  if (input) input.value = '';
  refreshTaskImagePreview();
}

// =====================================================
// IMAGE LIGHTBOX — full-screen image viewer
// =====================================================
// Triggered by clicking the camera icon on a task. Shows the image full
// size on a dimmed background. Click outside or press Escape to close.
// Admins/superusers also get a delete button so they can remove obsolete
// images directly from here without going through the edit-task modal.
let __lightboxTaskId = null; // remembered so the delete button knows which task to clean up

function openImageLightbox(imageUrl, caption, taskId) {
  __lightboxTaskId = taskId || null;
  // Try to find the underlying task so we can show area context (icon + colour
  // and room name). Falls back to caption-only if the task can't be matched.
  const task = taskId ? getAllTasks().find(t => t.id === taskId) : null;
  const areaMeta = task ? getAreaMeta(task.ruimte) : { icon: '📷', color: '#94a3b8' };
  const L = T[state.lang];

  let lb = document.getElementById('image-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'image-lightbox';
    lb.className = 'image-lightbox';
    lb.onclick = (e) => {
      // Close when clicking the backdrop or the close-buttons. Anything inside
      // the .lightbox-frame stays open — that's the image and its toolbar.
      const target = e.target;
      if (target === lb ||
          target.classList.contains('image-lightbox-close') ||
          target.closest('.image-lightbox-close')) {
        closeImageLightbox();
      }
    };
    document.body.appendChild(lb);
  }

  const showDelete = __lightboxTaskId && isAdmin();
  const showGoto  = !!task; // if we matched a task, offer "go to it"

  // The frame is the centred card containing header / image / footer.
  // We split into three parts so styling/animation can target each.
  lb.innerHTML = `
    <button class="image-lightbox-close" aria-label="${esc(L.image_close || 'Sluiten')}" title="${esc(L.image_close || 'Sluiten')} (Esc)">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M6 6 L18 18 M18 6 L6 18"/>
      </svg>
    </button>
    <div class="lightbox-frame" role="dialog" aria-modal="true" aria-label="${esc(caption || L.image_view_tooltip)}">
      <div class="lightbox-header">
        <div class="lightbox-area-pill" style="--area-color: ${areaMeta.color};">
          <span class="lightbox-area-icon" aria-hidden="true">${areaMeta.icon}</span>
          <span class="lightbox-area-name">${esc(task ? tr(task.ruimte) : '')}</span>
          ${task && task.werkplek ? `<span class="lightbox-area-sep">·</span><span class="lightbox-area-werkplek">${esc(tr(task.werkplek))}</span>` : ''}
        </div>
        <div class="lightbox-title">${esc(caption || '')}</div>
      </div>
      <div class="lightbox-image-area">
        <div class="lightbox-spinner" aria-hidden="true">
          <div class="lightbox-spinner-ring"></div>
        </div>
        <img class="lightbox-image" src="${esc(imageUrl)}" alt="${esc(caption || '')}" decoding="async">
      </div>
      <div class="lightbox-footer">
        <div class="lightbox-toolbar">
          ${showGoto ? `<button class="lightbox-btn lightbox-btn-secondary" onclick="goToLightboxTask()" title="${esc(L.image_goto_tooltip || 'Ga naar de taak')}">
            <span aria-hidden="true">→</span> ${esc(L.image_goto_btn || 'Ga naar taak')}
          </button>` : ''}
          ${showDelete ? `<button class="lightbox-btn lightbox-btn-danger" onclick="confirmDeleteLightboxImage()" title="${esc(L.image_delete_tooltip)}" aria-label="${esc(L.image_delete_tooltip)}">
            <span aria-hidden="true">🗑</span> ${esc(L.image_delete_btn)}
          </button>` : ''}
        </div>
        <div class="lightbox-hint" role="note">${esc(L.image_esc_hint || 'Druk Esc om te sluiten')}</div>
      </div>
    </div>
  `;

  // Wire up the spinner: when the image actually finishes loading, fade it
  // in and hide the spinner. If it errors, show a small fallback message.
  const img = lb.querySelector('.lightbox-image');
  const spinner = lb.querySelector('.lightbox-spinner');
  if (img) {
    if (img.complete && img.naturalWidth > 0) {
      // Cached — already loaded synchronously
      img.classList.add('loaded');
      if (spinner) spinner.classList.add('hidden');
    } else {
      img.addEventListener('load', () => {
        img.classList.add('loaded');
        if (spinner) spinner.classList.add('hidden');
      }, { once: true });
      img.addEventListener('error', () => {
        if (spinner) spinner.classList.add('hidden');
        const area = lb.querySelector('.lightbox-image-area');
        if (area) {
          area.insertAdjacentHTML('beforeend',
            `<div class="lightbox-error">⚠ ${esc(L.image_load_failed || 'Afbeelding kon niet worden geladen')}</div>`);
        }
      }, { once: true });
    }
  }

  // Show the lightbox with the entry-animation class
  lb.classList.add('show');
  // Lock body scroll while the lightbox is open
  document.body.classList.add('lightbox-open');
  // Focus the close button so Escape works immediately
  setTimeout(() => {
    const btn = lb.querySelector('.image-lightbox-close');
    if (btn) btn.focus();
  }, 50);

  // Auto-fade the keyboard hint after 3 seconds — it's helpful the first time
  // but redundant after that, so we don't keep it lingering.
  setTimeout(() => {
    const hint = lb.querySelector('.lightbox-hint');
    if (hint) hint.classList.add('faded');
  }, 3000);
}

function closeImageLightbox() {
  const lb = document.getElementById('image-lightbox');
  if (lb) lb.classList.remove('show');
  document.body.classList.remove('lightbox-open');
  __lightboxTaskId = null;
}

// Scroll to the task that owns the currently-open image and highlight it
// briefly. Closes the lightbox first so the user lands on the row immediately.
function goToLightboxTask() {
  const taskId = __lightboxTaskId;
  if (!taskId) return;
  const task = getAllTasks().find(t => t.id === taskId);
  closeImageLightbox();
  if (!task) return;
  // If we're on a different frequency tab, switch to the right one first
  if (state.activeTab !== task.freq_key) {
    switchTab(task.freq_key);
  }
  // Wait briefly for any tab-switch render to finish, then scroll + flash
  setTimeout(() => {
    const row = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Brief highlight pulse so the user can spot the row in a long list
    row.classList.add('lightbox-target-flash');
    setTimeout(() => row.classList.remove('lightbox-target-flash'), 1800);
  }, 50);
}

// Triggered by the lightbox's delete button. Asks confirmation, then removes
// the image from Storage and clears the URL on the task. Uses the simple
// in-page confirm() rather than a custom modal because we're already inside
// a modal-like lightbox; nesting custom modals tends to confuse focus state.
async function confirmDeleteLightboxImage() {
  if (!__lightboxTaskId || !isAdmin()) return;
  const L = T[state.lang];
  if (!confirm(L.image_delete_confirm)) return;
  const taskId = __lightboxTaskId;
  closeImageLightbox();
  // Remove the file from Cloud Storage. Failure here is non-fatal — we
  // continue with the metadata update so the icon disappears either way.
  try {
    await deleteTaskImage(taskId);
  } catch (err) {
    console.warn('Storage delete failed:', err);
  }
  // Clear imageUrl on the task. Two cases: custom task vs. built-in override.
  const customIdx = state.customTasks.findIndex(t => t.id === taskId);
  if (customIdx >= 0) {
    state.customTasks[customIdx] = Object.assign({}, state.customTasks[customIdx], { imageUrl: null });
  } else {
    // Built-in task — store as override so the change syncs via taskOverrides
    if (!state.taskOverrides) state.taskOverrides = {};
    const existing = state.taskOverrides[taskId] || {};
    state.taskOverrides[taskId] = Object.assign({}, existing, { imageUrl: null });
  }
  saveState();
  renderApp();
  showToast(L.image_deleted, 'success');
}

// =====================================================
// PRINT — generate a clean, print-friendly view of the
// currently active tab + period in a new window. Only
// shows what matters on paper: task name, method, product,
// and tickable check boxes per slot. The user can then use
// the browser's print dialog (Cmd/Ctrl+P) to print or save
// as PDF.
// =====================================================
function printCurrentPeriod() {
  const L = T[state.lang];
  const freqKey = state.activeTab;
  // Only print on frequency tabs — dashboard/changelog don't have task lists
  const FREQ_KEYS = ['daily', 'weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'];
  if (!FREQ_KEYS.includes(freqKey)) {
    showToast(L.print_no_tasks, 'error');
    return;
  }
  // Filter tasks the same way the on-screen view does, so what's printed
  // matches what the user is currently looking at (including any active
  // search/area/performer filters).
  let tasks = getAllTasks().filter(t => t.freq_key === freqKey);
  const f = state.filters || {};
  if (f.area)      tasks = tasks.filter(t => t.ruimte === f.area);
  if (f.performer) tasks = tasks.filter(t => t.uitvoerend === f.performer);
  if (f.search) {
    const q = f.search.toLowerCase();
    tasks = tasks.filter(t => {
      return [t.ruimte, t.werkplek, t.onderdeel, t.subcat, t.uitvoerend, t.methode, t.middel]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    });
  }
  if (!tasks.length) {
    showToast(L.print_no_tasks, 'error');
    return;
  }
  // Group by ruimte (room) for a much more readable printout — operators
  // working in one area get a contiguous block of their tasks.
  const groups = {};
  tasks.forEach(t => {
    const k = t.ruimte || '—';
    if (!groups[k]) groups[k] = [];
    groups[k].push(t);
  });
  const groupKeys = Object.keys(groups).sort();
  const slotCount = getSlotCount(freqKey);
  const slotLabels = getSlotLabels(freqKey);
  // Use the *viewed* period — formatPeriodKey handles both current and
  // historical periods. Important when the user has navigated to an older
  // period and wants to print exactly what they're looking at.
  const viewingKey = getViewingPeriodKey(freqKey);
  const periodLabel = formatPeriodKey(freqKey, viewingKey);
  // Tab label comes from the translations table — same source renderTabs uses
  const tabLabel = (L.tabs && L.tabs[freqKey]) ? L.tabs[freqKey] : freqKey;
  // Build print HTML. Inline styles are intentional — the print window has
  // no shared CSS file, and print stylesheets are easier to debug when they
  // live next to the markup.
  const today = new Date();
  const dateStr = today.toLocaleDateString(getDateLocale(), {
    day: '2-digit', month: 'long', year: 'numeric'
  });
  // Each slot becomes a column with its label rotated vertically when there
  // are many slots (months: 12 cols), or shown horizontally for fewer (days,
  // shifts, quarters etc.). Threshold chosen so labels stay readable.
  const verticalLabels = slotCount > 8;
  let bodyRows = '';
  groupKeys.forEach(ruimte => {
    bodyRows += `<tr class="group-row"><td colspan="${4 + slotCount}">${escForHtml(tr(ruimte))}</td></tr>`;
    groups[ruimte].forEach(t => {
      const taskCell = `<strong>${escForHtml(trOnderdeel(t) || '')}</strong>` +
        (t.subcat ? `<div class="subcat">${escForHtml(trSubcat(t))}</div>` : '') +
        (t.werkplek ? `<div class="werkplek">${escForHtml(t.werkplek)}</div>` : '');
      let slotCells = '';
      for (let i = 0; i < slotCount; i++) {
        if (isSundaySlot(freqKey, i)) continue;
        slotCells += '<td class="check-cell"></td>';
      }
      bodyRows += `<tr>
        <td class="task-cell">${taskCell}</td>
        <td class="method-cell">${escForHtml(tr(t.methode) || '')}</td>
        <td class="product-cell">${escForHtml(t.middel || '')}</td>
        <td class="when-cell">${escForHtml(tr(t.wanneer) || '')}</td>
        ${slotCells}
      </tr>`;
    });
  });
  // Header row with slot labels — vertical when many columns
  let headerSlots = '';
  for (let i = 0; i < slotCount; i++) {
    if (isSundaySlot(freqKey, i)) continue;
    const label = slotLabels[i] || (i + 1);
    headerSlots += `<th class="slot-th ${verticalLabels ? 'vertical' : ''}"><span>${escForHtml(label)}</span></th>`;
  }
  const printHtml = `<!DOCTYPE html>
<html lang="${state.lang}">
<head>
<meta charset="utf-8">
<title>${escForHtml(L.print_title)} — ${escForHtml(tabLabel)} — ${escForHtml(periodLabel)}</title>
<style>
  /* Print-optimized layout. Page size A4, narrow margins so the table
     uses the available width. Black-on-white for laser printers. */
  @page { size: A4; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #000;
    font-size: 10pt;
    line-height: 1.35;
    background: white;
  }
  .print-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding-bottom: 8px;
    border-bottom: 2px solid #000;
    margin-bottom: 12px;
  }
  .print-header h1 {
    font-size: 18pt;
    margin: 0 0 2px 0;
    font-weight: 700;
  }
  .print-header .sub {
    font-size: 11pt;
    color: #333;
  }
  .print-header .meta {
    text-align: right;
    font-size: 9pt;
    color: #555;
  }
  .print-header .meta strong { color: #000; font-size: 11pt; display: block; }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  thead th {
    background: #1d5b42;
    color: white;
    font-weight: 600;
    text-align: left;
    padding: 6px 8px;
    border: 1px solid #1d5b42;
    font-size: 9.5pt;
    vertical-align: bottom;
  }
  thead th.slot-th {
    text-align: center;
    width: 28px;
    padding: 4px 2px;
  }
  thead th.slot-th.vertical {
    height: 60px;
    position: relative;
    width: 22px;
  }
  thead th.slot-th.vertical span {
    display: inline-block;
    transform: rotate(-90deg);
    transform-origin: center;
    white-space: nowrap;
    font-size: 8.5pt;
  }
  /* First four columns get bigger relative widths. Slot columns are tight. */
  col.col-task    { width: 32%; }
  col.col-method  { width: 16%; }
  col.col-product { width: 14%; }
  col.col-when    { width: 10%; }
  tbody td {
    border: 1px solid #999;
    padding: 5px 6px;
    vertical-align: top;
  }
  tbody td.task-cell strong { font-size: 10pt; }
  tbody td.task-cell .subcat { font-size: 8.5pt; color: #444; margin-top: 2px; }
  tbody td.task-cell .werkplek {
    font-size: 8pt; color: #666; font-style: italic; margin-top: 1px;
  }
  tbody td.method-cell, tbody td.product-cell { font-size: 9pt; }
  tbody td.when-cell { font-size: 8.5pt; color: #444; font-style: italic; }
  tbody td.check-cell {
    /* The actual tick box — empty so the operator can sign off in pen */
    background: white;
    height: 26px;
    text-align: center;
  }
  tr.group-row td {
    background: #e8efec;
    font-weight: 700;
    font-size: 10.5pt;
    padding: 6px 8px;
    border: 1px solid #999;
    color: #1d5b42;
  }
  /* Avoid breaking a task row in two across pages */
  tbody tr { page-break-inside: avoid; }
  tr.group-row { page-break-after: avoid; }
  thead { display: table-header-group; } /* repeat header on every page */
  .signature-block {
    margin-top: 18mm;
    display: flex;
    gap: 30mm;
    font-size: 9.5pt;
  }
  .signature-block .field {
    flex: 1;
    border-top: 1px solid #000;
    padding-top: 4px;
    color: #555;
  }
  /* Toolbar — only visible on screen, hidden when printing */
  .print-toolbar {
    position: fixed;
    top: 8px;
    right: 8px;
    background: #1d5b42;
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    font-size: 12pt;
    display: flex;
    gap: 8px;
    z-index: 100;
  }
  .print-toolbar button {
    background: white;
    color: #1d5b42;
    border: none;
    padding: 6px 14px;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .print-toolbar button:hover { background: #d8e5de; }
  @media print {
    .print-toolbar { display: none; }
  }
</style>
</head>
<body>
  <div class="print-toolbar">
    <button onclick="window.print()">🖨️ ${escForHtml(L.print_btn)}</button>
    <button onclick="window.close()">✕</button>
  </div>
  <div class="print-header">
    <div>
      <h1>${escForHtml(L.print_title)}</h1>
      <div class="sub">${escForHtml(tabLabel)} — ${escForHtml(periodLabel)}</div>
    </div>
    <div class="meta">
      <strong>${escForHtml(L.print_period)}: ${escForHtml(periodLabel)}</strong>
      ${escForHtml(L.print_date)}: ${escForHtml(dateStr)}
    </div>
  </div>
  <table>
    <colgroup>
      <col class="col-task">
      <col class="col-method">
      <col class="col-product">
      <col class="col-when">
      ${Array(slotCount).fill('<col>').join('')}
    </colgroup>
    <thead>
      <tr>
        <th>${escForHtml(L.print_task)}</th>
        <th>${escForHtml(L.print_method)}</th>
        <th>${escForHtml(L.print_product)}</th>
        <th>${escForHtml(L.print_when)}</th>
        ${headerSlots}
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>
  <div class="signature-block">
    <div class="field">${escForHtml(L.print_signature)} 1</div>
    <div class="field">${escForHtml(L.print_signature)} 2</div>
  </div>
</body>
</html>`;
  // Open in a new window. We use about:blank + document.write rather than
  // a data: URL so the browser treats it as same-origin and window.print()
  // works without restrictions.
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) {
    showToast(state.lang === 'nl'
      ? 'Pop-up geblokkeerd — sta pop-ups toe voor deze site'
      : 'Pop-up blocked — please allow pop-ups for this site', 'error');
    return;
  }
  w.document.open();
  w.document.write(printHtml);
  w.document.close();
}

// HTML-escape helper used by the print builder. Keeps the existing esc()
// function untouched; this one is colocated with the print code for clarity.
function escForHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Manually trigger a re-sync from the cloud. Called by the pull-to-refresh
// gesture on mobile. For cloud-connected users this re-attaches the Firestore
// listeners (which produces fresh snapshots). For offline/local users it's a
// no-op data-wise but still re-renders the UI so the user sees feedback.
function manualSync() {
  const L = T[state.lang];
  if (state.authUser && fbDb && state.activePlanId) {
    try {
      subscribeToActivePlan();
      showToast(L.sync_done || 'Bijgewerkt vanuit de cloud', 'success');
    } catch (err) {
      console.error('Manual sync failed:', err);
      showToast(L.sync_failed || 'Bijwerken mislukt — controleer je verbinding', 'error');
    }
  } else {
    // Local-only: there's nothing to sync, but the user invoked the action
    // expecting feedback. Show a toast — no render needed since data didn't
    // change. (Earlier versions did a full renderApp() here, which produced
    // a visible page flash on every pull-to-refresh.)
    showToast(L.sync_local_only || 'Lokale weergave ververst', 'success');
  }
}

function showToast(msg, type, options) {
  // options = { actionLabel, onAction, duration }
  // When actionLabel + onAction are passed, the toast shows a button (e.g.
  // "Undo") that runs the callback. The callback also dismisses the toast.
  const c = document.getElementById('toasts');
  const d = document.createElement('div');
  d.className = 'toast ' + (type || '');
  // Build content. When there's an action, use a flex layout with text + button.
  if (options && options.actionLabel && typeof options.onAction === 'function') {
    const txt = document.createElement('span');
    txt.className = 'toast-text';
    txt.textContent = msg;
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.type = 'button';
    btn.textContent = options.actionLabel;
    btn.onclick = (e) => {
      e.stopPropagation();
      try { options.onAction(); } catch (err) { console.error('Toast action failed:', err); }
      // Dismiss the toast immediately when the action fires
      d.style.transition = 'opacity 0.2s';
      d.style.opacity = '0';
      setTimeout(() => d.remove(), 200);
    };
    d.appendChild(txt);
    d.appendChild(btn);
    d.classList.add('has-action');
  } else {
    d.textContent = msg;
  }
  if (c) c.appendChild(d);
  // Mirror to screen-reader live region so users with assistive tech also hear
  // the notification. Clear and re-set the text so the same message announced
  // twice in a row is still picked up.
  const sr = document.getElementById('sr-live-region');
  if (sr) {
    sr.textContent = '';
    setTimeout(() => { sr.textContent = msg; }, 50);
  }
  // Toasts with an action stay visible longer so the user has time to undo.
  const duration = (options && options.duration)
    || (options && options.actionLabel ? 7000 : 3500);
  setTimeout(() => {
    if (!d.parentNode) return; // already dismissed by action click
    d.style.transition = 'opacity 0.3s, transform 0.3s';
    d.style.opacity = '0';
    d.style.transform = 'translateX(100%)';
    setTimeout(() => d.remove(), 300);
  }, duration);
}

// =====================================================
// INIT
// =====================================================
// =====================================================
// FIRESTORE SYNC LAYER
// =====================================================
// Strategy: each plan is a Firestore document under /plans/{planId} containing
// the structural fields (data, customTasks, taskOverrides, customChangelog,
// deletedBuiltinIds). Checks are stored separately in /plans/{planId}/checks/
// {freqKey} sub-documents — splitting per frequency keeps writes small and
// concurrent users won't trample each other when they check off different
// tasks at the same time.

let unsubscribePlanListeners = []; // detach functions for active listeners
let firestoreApplyingRemote = false; // when true, saveState() shouldn't re-write to cloud

// Cheap stable-stringify of the structural plan fields we listen to. Used to
// detect whether an incoming Firestore snapshot actually changed anything we
// care about — if not, we skip the renderApp() call to avoid the visible
// page flicker that comes from rebuilding header/tabs/sidebar/content etc.
// JSON.stringify with Object.keys().sort() gives stable ordering as long as
// we feed it through this helper.
function stableStringify(obj) {
  if (obj === null || obj === undefined) return String(obj);
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

// Snapshots of the structural state we last rendered. The listeners compare
// incoming data against these and skip renderApp() if nothing meaningful
// differs (which is the common case for echoes of our own writes).
let lastRenderedPlanSig = null;
let lastRenderedChecksSig = null;
// Tijdstempel van de laatste lokale afvink-actie. Binnen een kort venster
// hierna onderdrukt de checks-listener zijn renderApp() (de UI is al
// bijgewerkt; alleen écht externe wijzigingen hoeven een re-render).
let lastLocalCheckAt = 0;

// Subscribe to live updates for the currently-active plan. Called after auth
// and on plan switch.
function subscribeToActivePlan() {
  if (!fbDb || !state.activePlanId) return;
  // Detach existing listeners first
  unsubscribePlanListeners.forEach(fn => { try { fn(); } catch(e){} });
  unsubscribePlanListeners = [];
  // Reset signatures on (re)subscribe so the first snapshot always renders
  lastRenderedPlanSig = null;
  lastRenderedChecksSig = null;
  const planId = state.activePlanId;
  // Listener 1: plan structural document
  const planRef = fbDb.collection('plans').doc(planId);
  const unsub1 = planRef.onSnapshot(snap => {
    if (!snap.exists) return;
    const data = snap.data();
    firestoreApplyingRemote = true;
    try {
      // Only replace local DATA if cloud has actual content (length > 0).
      // Prevents wiping out local data when cloud was created but never properly seeded.
      if (data.data && Array.isArray(data.data.tasks) && data.data.tasks.length > 0) {
        DATA.tasks = data.data.tasks;
        DATA.products = (data.data.products && data.data.products.length) ? data.data.products : DATA.products;
        DATA.methods = (data.data.methods && data.data.methods.length) ? data.data.methods : DATA.methods;
        DATA.versions = (data.data.versions && data.data.versions.length) ? data.data.versions : DATA.versions;
      }
      if (Array.isArray(data.customTasks)) state.customTasks = data.customTasks;
      if (data.taskOverrides) state.taskOverrides = data.taskOverrides;
      if (data.taskNvtFields) state.taskNvtFields = data.taskNvtFields;
      if (data.branding) state.branding = Object.assign({}, state.branding, data.branding);
      if (data.schedule) state.schedule = Object.assign({}, state.schedule, data.schedule);
      if (data.customData) state.customData = Object.assign({}, state.customData, data.customData);
      if (Array.isArray(data.customChangelog)) state.customChangelog = data.customChangelog;
      if (data.pendingChanges) state.pendingChanges = data.pendingChanges;
      if (Array.isArray(data.deletedBuiltinIds)) state.deletedBuiltinIds = data.deletedBuiltinIds;
      if (data.name && state.plans[planId]) state.plans[planId].name = data.name;
      saveActivePlanState();
      if (appStarted) {
        // Compute a signature of the fields we render from. If it matches what
        // we last rendered (typical for echoes of our own writes), skip the
        // full renderApp() — that's where the visual page-flash comes from.
        const sig = stableStringify({
          tasks: DATA.tasks,
          customTasks: state.customTasks,
          taskOverrides: state.taskOverrides,
          taskNvtFields: state.taskNvtFields,
          branding: state.branding,
          schedule: state.schedule,
          customData: state.customData,
          customChangelog: state.customChangelog,
          deletedBuiltinIds: state.deletedBuiltinIds,
          name: data.name || ''
        });
        if (sig !== lastRenderedPlanSig) {
          lastRenderedPlanSig = sig;
          try { renderApp(); } catch (e) { console.error('renderApp failed during plan listener:', e); }
        }
      }
    } finally {
      firestoreApplyingRemote = false;
    }
  }, err => {
    console.error('Plan listener error:', err.code || err.message);
    // Permission errors here mean rules are wrong, but we keep running with local data
  });
  unsubscribePlanListeners.push(unsub1);
  // Listener 2: checks sub-collection (merge into state.checks)
  const checksRef = planRef.collection('checks');
  const unsub2 = checksRef.onSnapshot(snap => {
    firestoreApplyingRemote = true;
    try {
      snap.docChanges().forEach(change => {
        const fk = change.doc.id;
        const periods = change.doc.data().periods || {};
        if (!state.checks[fk]) state.checks[fk] = {};
        Object.assign(state.checks[fk], periods);
      });
      saveActivePlanState();
      if (appStarted) {
        // Same diff-guard for checks. The most common source of visible flicker
        // was this listener firing *after* our own write, then re-rendering even
        // though the local state already reflected the change.
        const sig = stableStringify(state.checks);
        if (sig !== lastRenderedChecksSig) {
          lastRenderedChecksSig = sig;
          // Onderdruk de re-render als we net zelf hebben afgevinkt: de echo
          // van onze eigen schrijfactie (incl. merge van historische periodes
          // door merge:true) mag de pagina niet laten flikkeren. De state is
          // wél bijgewerkt, dus een latere externe wijziging rendert gewoon.
          const justLocal = (Date.now() - lastLocalCheckAt) < 4000;
          if (!justLocal) {
            try { renderApp(); } catch (e) { console.error('renderApp failed during checks listener:', e); }
          }
        }
      }
    } finally {
      firestoreApplyingRemote = false;
    }
  }, err => console.error('Checks listener error:', err));
  unsubscribePlanListeners.push(unsub2);
  state.cloudConnected = true;
  updateCloudStatusBadge();
}

// Push the current active-plan state to Firestore. Called from saveState()
// when cloud is connected. Throttled to avoid hammering the network during
// rapid edits.
let cloudPushTimer = null;
let cloudChecksPushTimer = null;

// Full push: plan structure + checks. Call this when plan data changes
// (tasks added/edited/deleted, overrides updated, changelog committed).
function schedulePushToCloud() {
  if (!fbDb || !state.authUser || !state.activePlanId) return;
  if (firestoreApplyingRemote) return;
  if (cloudPushTimer) clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(() => {
    cloudPushTimer = null;
    pushPlanToCloud();
    pushChecksToCloud();
  }, 500);
}

// Checks-only push: call this after checkbox toggles. Deliberately skips
// pushPlanToCloud so the plan listener does NOT fire — the plan data
// (tasks, overrides, etc.) is unchanged, and every plan listener echo
// replaces DATA.tasks with the Firestore copy which can cause subtle
// sig-mismatches that re-trigger renderApp() and cause visible page flicker.
function scheduleChecksPushToCloud() {
  if (!fbDb || !state.authUser || !state.activePlanId) return;
  if (firestoreApplyingRemote) return;
  if (cloudChecksPushTimer) clearTimeout(cloudChecksPushTimer);
  cloudChecksPushTimer = setTimeout(() => {
    cloudChecksPushTimer = null;
    pushChecksToCloud();
  }, 500);
}

async function pushPlanToCloud() {
  if (!fbDb || !state.activePlanId) return;
  const planId = state.activePlanId;
  const plan = state.plans[planId];
  if (!plan) return;
  try {
    await fbDb.collection('plans').doc(planId).set({
      name: plan.name || 'Origineel',
      data: {
        tasks: DATA.tasks,
        products: DATA.products,
        methods: DATA.methods,
        versions: DATA.versions
      },
      customTasks: state.customTasks || [],
      taskOverrides: state.taskOverrides || {},
      taskNvtFields: state.taskNvtFields || {},
      branding: state.branding || {},
      schedule: state.schedule || {},
      customData: state.customData || { soilingTypes: [], ppeItems: [], rooms: [] },
      customChangelog: state.customChangelog || [],
      pendingChanges: state.pendingChanges || {},
      deletedBuiltinIds: state.deletedBuiltinIds || [],
      lastUpdatedBy: state.currentUser || (state.authUser && state.authUser.email) || '',
      lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error('Cloud push (plan) failed:', err);
  }
}

async function pushChecksToCloud() {
  if (!fbDb || !state.activePlanId) return;
  const planId = state.activePlanId;
  const checksRef = fbDb.collection('plans').doc(planId).collection('checks');
  // Push one document per frequency to keep them small and granular
  const batches = [];
  for (const fk in state.checks) {
    batches.push(checksRef.doc(fk).set({
      periods: state.checks[fk] || {}
    }, { merge: true }));
  }
  try {
    await Promise.all(batches);
  } catch (err) {
    console.error('Cloud push (checks) failed:', err);
  }
}

function updateCloudStatusBadge() {
  const el = document.getElementById && document.getElementById('cloud-status');
  if (!el) return;
  if (state.cloudConnected) {
    el.textContent = '☁ Cloud · live';
    el.className = 'sync-pill cloud-status connected';
  } else {
    el.textContent = '⚠ Lokaal';
    el.className = 'sync-pill cloud-status disconnected';
  }
}

// Sage-design header stats pills: today done/total · overdue · weekly progress.
// Lightweight, reads cached state. Called from renderApp() after the tabs are
// rendered so DOM exists.
function renderHeaderStats() {
  const host = document.getElementById && document.getElementById('header-stats');
  if (!host) return;
  const L = T[state.lang] || T.nl;
  const allTasks = getAllTasks();

  // "Vandaag" = daily tasks. Count total + how many have today's slot checked.
  let todayTotal = 0, todayDone = 0;
  // Week progress = all checked slots in current period across all freqs / all
  // open slots. Approximation: scan all tasks across freqs, count their current
  // slot's done-status, average it.
  let weekTotal = 0, weekDone = 0;
  allTasks.forEach(t => {
    const fk = t.freq_key;
    if (!fk || !['daily','weekly','monthly','bimonthly','quarterly','semiannual','annual'].includes(fk)) return;
    const slot = getCurrentSlot(fk);
    if (slot == null) return;
    const periodKey = getStoragePeriodKey(fk);
    const periodStore = (state.checks[fk] && state.checks[fk][periodKey]) || {};
    const e = (periodStore[t.id] || {})[slot];
    const checked = (e === true) || (e && typeof e === 'object' && e.v === true);
    weekTotal += 1;
    if (checked) weekDone += 1;
    if (fk === 'daily') {
      todayTotal += 1;
      if (checked) todayDone += 1;
    }
  });
  const overdueCount = getAllOverdueTasks(allTasks).length;
  const weekPct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;

  // Render. Overdue stat hidden when zero — pill row stays uncluttered.
  const overduePill = overdueCount > 0
    ? `<div class="stat stat--alert" onclick="openOverdueOverviewModal()" title="Bekijk taken met achterstand">
         <span class="stat-dot"></span>
         <span class="stat-value">${overdueCount}</span>
         <span class="stat-label">${esc(L.overdue_overview_btn || 'achterstand')}</span>
       </div>`
    : '';
  host.innerHTML = `
    <div class="stat stat--sage" onclick="switchTab('today')" title="Open Vandaag-tab">
      <span class="stat-dot"></span>
      <span class="stat-value">${todayDone}/${todayTotal}</span>
      <span class="stat-label">vandaag</span>
    </div>
    ${overduePill}
    <div class="stat" title="Voortgang deze periode (alle tabs)">
      <span class="stat-dot"></span>
      <span class="stat-value">${weekPct}%</span>
      <span class="stat-label">deze week</span>
    </div>`;
}

// Show or hide the persistent "edit mode active" banner. Localized text and
// button label are refreshed on every render so language toggle works.
function updateEditModeBanner() {
  const banner = document.getElementById && document.getElementById('edit-mode-banner');
  if (!banner) return;
  const L = T[state.lang];
  if (state.editUnlocked) {
    banner.classList.add('show');
    const text = document.getElementById('edit-mode-banner-text');
    const btn = document.getElementById('edit-mode-banner-btn');
    if (text) text.textContent = L.edit_mode_active_banner;
    if (btn) btn.textContent = L.edit_mode_active_close;
  } else {
    banner.classList.remove('show');
  }
}

// Role-based visibility now lives mostly in renderSidebar(), which decides
// which menu items to show based on the role. The header only contains the
// always-visible kebab + lang toggle + (admin-only) update button.
function applyRoleBasedVisibility() {
  const updateBtn = document.getElementById('update-btn');
  const local = !state.authUser;
  const admin = local || isAdmin();
  // The update button is gated by role on top of its existing pending-changes
  // visibility logic. Non-admins should never see it.
  if (updateBtn && !admin) {
    updateBtn.style.display = 'none';
  }
  // Force-lock edit mode if the user got demoted while logged in
  if (state.authUser && !isAdmin() && state.editUnlocked) {
    state.editUnlocked = false;
  }
  // If the sidebar is open, re-render it so role changes are picked up live
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList && sidebar.classList.contains('open')) {
    renderSidebar();
  }
}

// =====================================================
// ROLE-BASED PERMISSIONS
// =====================================================
// Three roles with cumulative permissions:
//   user      — can only check off tasks (default for new accounts)
//   admin     — can also add/edit/delete tasks, import plans, commit changelog
//   superuser — can also assign roles to other users (you, the owner)
//
// Roles are stored in /users/{uid} documents on Firestore. The first user to
// sign in with the email matching SUPERUSER_EMAIL is auto-promoted on first
// login; thereafter the superuser manually grants admin/user roles via the
// "Beheer accounts" panel.

function isSuperuser() {
  return state.userRole === 'superuser';
}
function isAdmin() {
  return state.userRole === 'admin' || state.userRole === 'superuser';
}

// Fetch the role of the current authenticated user from Firestore.
// On first sign-in, creates a /users/{uid} document with the default role.
// If the user's email matches SUPERUSER_EMAIL, they get the superuser role.
async function loadUserRole() {
  if (!fbDb || !state.authUser) {
    state.userRole = 'user';
    return;
  }
  try {
    const userRef = fbDb.collection('users').doc(state.authUser.uid);
    const snap = await userRef.get();
    const isSuperuserByEmail = state.authUser.email &&
      state.authUser.email.toLowerCase() === SUPERUSER_EMAIL.toLowerCase();
    if (!snap.exists) {
      // First sign-in for this user — create the role document
      const initialRole = isSuperuserByEmail ? 'superuser' : 'user';
      await userRef.set({
        email: state.authUser.email,
        role: initialRole,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      state.userRole = initialRole;
    } else {
      const data = snap.data();
      // Auto-promote if email matches SUPERUSER_EMAIL but role doesn't reflect that
      // (e.g. the email was changed in code after first sign-in)
      if (isSuperuserByEmail && data.role !== 'superuser') {
        await userRef.update({ role: 'superuser' });
        state.userRole = 'superuser';
      } else {
        state.userRole = data.role || 'user';
      }
    }
  } catch (err) {
    console.error('loadUserRole failed:', err);
    state.userRole = 'user';
  }
}

// Load all users into state.allUsers — only for the user-management panel.
// Listening live so role changes are reflected without reload.
let unsubscribeUsersListener = null;
function subscribeToAllUsers() {
  if (!fbDb || !isSuperuser()) return;
  if (unsubscribeUsersListener) {
    try { unsubscribeUsersListener(); } catch(e) {}
  }
  unsubscribeUsersListener = fbDb.collection('users').onSnapshot(snap => {
    const map = {};
    snap.forEach(d => { map[d.id] = d.data(); });
    state.allUsers = map;
    // If the user-management modal is open, re-render it
    const modal = document.getElementById('user-mgmt-modal');
    if (modal && modal.classList && modal.classList.contains('show')) {
      renderUserManagementList();
    }
  }, err => console.error('Users listener error:', err));
}

// Change the role of another user (only superuser can do this — enforced
// both client-side and server-side via security rules).
async function changeUserRole(uid, newRole) {
  if (!isSuperuser()) {
    showToast(T[state.lang].role_denied_not_superuser, 'error');
    return;
  }
  if (uid === state.authUser.uid) {
    showToast(T[state.lang].role_cannot_demote_self, 'error');
    return;
  }
  if (!['user', 'admin'].includes(newRole)) {
    // Superuser role can only be set via SUPERUSER_EMAIL match, never manually
    showToast(T[state.lang].role_invalid, 'error');
    return;
  }
  try {
    await fbDb.collection('users').doc(uid).update({ role: newRole });
    showToast(T[state.lang].role_changed, 'success');
  } catch (err) {
    console.error('changeUserRole failed:', err);
    showToast(T[state.lang].role_change_failed, 'error');
  }
}

// =====================================================
// AUTHENTICATION FLOW
// =====================================================

// Track whether the auth UI is in "login" mode or "signup" mode
let authMode = 'login';

function showAuthOverlay() {
  const o = document.getElementById && document.getElementById('auth-overlay');
  if (o && o.classList) o.classList.remove('hidden');
}

function hideAuthOverlay() {
  const o = document.getElementById && document.getElementById('auth-overlay');
  if (o && o.classList) o.classList.add('hidden');
}

function showAuthLoading() {
  const l = document.getElementById && document.getElementById('auth-loading');
  const f = document.getElementById && document.getElementById('auth-form');
  const o = document.getElementById && document.getElementById('auth-offline');
  if (l && l.style) l.style.display = '';
  if (f && f.style) f.style.display = 'none';
  if (o && o.style) o.style.display = 'none';
}

function showAuthForm() {
  const l = document.getElementById && document.getElementById('auth-loading');
  const f = document.getElementById && document.getElementById('auth-form');
  const o = document.getElementById && document.getElementById('auth-offline');
  if (l && l.style) l.style.display = 'none';
  if (f && f.style) f.style.display = '';
  if (o && o.style) o.style.display = 'none';
  setAuthSubmitLoading(false);
}

function showAuthOffline() {
  const l = document.getElementById && document.getElementById('auth-loading');
  const f = document.getElementById && document.getElementById('auth-form');
  const o = document.getElementById && document.getElementById('auth-offline');
  if (l && l.style) l.style.display = 'none';
  if (f && f.style) f.style.display = 'none';
  if (o && o.style) o.style.display = '';
}

function showAuthError(message) {
  const el = document.getElementById('auth-error');
  if (el) {
    el.textContent = message;
    el.style.display = '';
  }
}

function clearAuthError() {
  const el = document.getElementById('auth-error');
  if (el) el.style.display = 'none';
}

function toggleAuthMode() {
  authMode = (authMode === 'login') ? 'signup' : 'login';
  const titleEl = document.getElementById('auth-form-title');
  const subEl = document.getElementById('auth-form-sub');
  const submitBtn = document.getElementById('auth-submit-btn');
  const toggleBtn = document.getElementById('auth-toggle-mode');
  if (authMode === 'signup') {
    if (titleEl) titleEl.textContent = 'Account aanmaken';
    if (subEl) subEl.textContent = 'Maak een account aan om bij het gedeelde schoonmaakplan te komen';
    if (submitBtn) submitBtn.textContent = 'Account aanmaken';
    if (toggleBtn) toggleBtn.textContent = 'Ik heb al een account — inloggen';
  } else {
    if (titleEl) titleEl.textContent = 'Inloggen';
    if (subEl) subEl.textContent = 'Log in om bij het gedeelde schoonmaakplan te komen';
    if (submitBtn) submitBtn.textContent = 'Inloggen';
    if (toggleBtn) toggleBtn.textContent = 'Nieuw account aanmaken';
  }
  clearAuthError();
}

// Toon/verberg een spinner op de inlog-knop tijdens het authenticeren, zodat
// de gebruiker visueel ziet dat er ingelogd wordt. De knop-tekst wordt bewaard
// in data-label en hersteld zodra het laden klaar is.
function setAuthSubmitLoading(loading) {
  const btn = document.getElementById('auth-submit-btn');
  if (!btn) return;
  if (loading) {
    if (!btn.classList.contains('is-loading')) btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.classList.add('is-loading');
    const spin = document.createElement('span');
    spin.className = 'btn-spinner';
    spin.setAttribute('aria-hidden', 'true');
    const lbl = document.createElement('span');
    lbl.textContent = (btn.dataset.label || 'Inloggen') + '…';
    btn.replaceChildren(spin, lbl);
  } else {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    btn.textContent = btn.dataset.label || 'Inloggen';
  }
}

async function submitAuthForm() {
  if (!fbAuth) {
    showAuthError('Verbinding met server niet beschikbaar.');
    return;
  }
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) {
    showAuthError('Vul e-mail en wachtwoord in.');
    return;
  }
  if (password.length < 6) {
    showAuthError('Wachtwoord moet minstens 6 karakters zijn.');
    return;
  }
  clearAuthError();
  setAuthSubmitLoading(true);
  try {
    if (authMode === 'signup') {
      await fbAuth.createUserWithEmailAndPassword(email, password);
    } else {
      await fbAuth.signInWithEmailAndPassword(email, password);
    }
    // onAuthStateChanged listener takes it from here (verbergt het formulier);
    // de spinner blijft tot de view wisselt en wordt gereset in showAuthForm().
  } catch (err) {
    console.error('Auth error:', err);
    setAuthSubmitLoading(false);
    showAuthError(translateAuthError(err.code, err.message));
  }
}

async function sendPasswordReset() {
  if (!fbAuth) return;
  const L = T[state.lang];
  const email = document.getElementById('auth-email').value.trim();
  if (!email) {
    showAuthError(L.auth_enter_email_first);
    return;
  }
  // Validate email format minimally
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthError(L.auth_invalid_email);
    return;
  }
  try {
    await fbAuth.sendPasswordResetEmail(email);
    showAuthResetSuccess(email);
  } catch (err) {
    showAuthError(translateAuthError(err.code, err.message));
  }
}

// Replaces the auth form with a friendly success card after a reset mail.
// User can click "Back to login" to return to the form.
function showAuthResetSuccess(email) {
  const L = T[state.lang];
  const form = document.getElementById('auth-form');
  if (!form) return;
  form.style.display = 'none';
  let success = document.getElementById('auth-reset-success');
  if (!success) {
    success = document.createElement('div');
    success.id = 'auth-reset-success';
    success.className = 'auth-reset-success';
    form.parentNode.insertBefore(success, form.nextSibling);
  }
  success.innerHTML = `
    <div class="auth-reset-icon">📨</div>
    <h2>${esc(L.auth_reset_sent_title)}</h2>
    <p>${esc(L.auth_reset_sent_body)}</p>
    <p class="auth-reset-email"><strong>${esc(email)}</strong></p>
    <p class="auth-reset-hint">${esc(L.auth_reset_hint)}</p>
    <button class="btn btn-primary" onclick="hideAuthResetSuccess()" style="margin-top: 16px;">${esc(L.auth_reset_back)}</button>
  `;
  success.style.display = 'block';
}

function hideAuthResetSuccess() {
  const success = document.getElementById('auth-reset-success');
  const form = document.getElementById('auth-form');
  if (success) success.style.display = 'none';
  if (form) form.style.display = '';
  clearAuthError();
}

function translateAuthError(code, fallback) {
  const map = {
    'auth/invalid-email': 'Ongeldig e-mailadres.',
    'auth/user-not-found': 'Geen account gevonden met dit e-mailadres.',
    'auth/wrong-password': 'Verkeerd wachtwoord.',
    'auth/invalid-credential': 'E-mail of wachtwoord klopt niet.',
    'auth/email-already-in-use': 'Er is al een account met dit e-mailadres. Log in.',
    'auth/weak-password': 'Wachtwoord te zwak — minimaal 6 karakters.',
    'auth/network-request-failed': 'Geen netwerkverbinding.',
    'auth/too-many-requests': 'Te veel pogingen — probeer over een paar minuten opnieuw.'
  };
  return map[code] || fallback || 'Er ging iets mis.';
}

// Open the in-screen sign-out confirmation modal (replaces browser confirm()).
// The actual sign-out happens in confirmSignOut() once the user clicks "Ja".
async function signOut() {
  if (!fbAuth) return;
  const modal = document.getElementById('signout-modal');
  if (!modal) {
    // Fallback if the modal isn't in the DOM for some reason
    if (!confirm('Uitloggen? Je moet opnieuw inloggen om bij de gedeelde data te komen.')) return;
    try {
      await fbAuth.signOut();
      window.location.reload();
    } catch (err) {
      console.error('Sign-out failed:', err);
    }
    return;
  }
  modal.classList.add('show');
  // Focus the cancel button by default — safer than focusing the destructive action
  setTimeout(() => {
    const cancelBtn = document.getElementById('btn-signout-cancel');
    if (cancelBtn) cancelBtn.focus();
  }, 50);
}

function closeSignOutModal() {
  const modal = document.getElementById('signout-modal');
  if (modal) modal.classList.remove('show');
}

async function confirmSignOut() {
  closeSignOutModal();
  if (!fbAuth) return;
  try {
    await fbAuth.signOut();
    // Reload so all in-memory state is cleared
    window.location.reload();
  } catch (err) {
    console.error('Sign-out failed:', err);
  }
}

// "Continue offline" button on the offline screen — falls back to local-only
// mode using window.storage. Useful when CDN or network is down.
function continueOffline() {
  state.cloudConnected = false;
  hideAuthOverlay();
  startApp();
}

// Wires up the Firebase auth state listener. Called once on init.
function setupAuthListener() {
  if (!fbAuth) return;
  fbAuth.onAuthStateChanged(async user => {
    state.authReady = true;
    if (user) {
      state.authUser = { uid: user.uid, email: user.email, displayName: user.displayName || '' };
      // Auto-set currentUser to the email (without domain) for audit trail
      if (!state.currentUser && user.email) {
        state.currentUser = user.email.split('@')[0];
      }
      // Load this user's role from Firestore (or create role doc if first login)
      await loadUserRole();
      // Subscribe to all users (no-op if not superuser)
      subscribeToAllUsers();
      // Subscribe to MSDS supplier links
      subscribeToMsdsLinks();
      // Subscribe to jaarlijkse keuringen
      subscribeToInspections();
      // Hydrate cloud data, then start
      await hydrateFromCloud();
      hideAuthOverlay();
      startApp();
      subscribeToActivePlan();
    } else {
      state.authUser = null;
      state.userRole = 'user';
      state.cloudConnected = false;
      // Detach ALL active Firestore listeners to prevent permission-denied
      // errors after sign-out. Each unsubscribe is wrapped in try/catch so
      // a single failure doesn't block the others.
      if (unsubscribeUsersListener) {
        try { unsubscribeUsersListener(); } catch(e){}
        unsubscribeUsersListener = null;
      }
      if (unsubscribeMsdsLinksListener) {
        try { unsubscribeMsdsLinksListener(); } catch(e){}
        unsubscribeMsdsLinksListener = null;
      }
      if (unsubscribePlanListeners && unsubscribePlanListeners.length) {
        unsubscribePlanListeners.forEach(fn => { try { fn(); } catch(e){} });
        unsubscribePlanListeners = [];
      }
      showAuthOverlay();
      showAuthForm();
    }
  });
}

// On first sign-in, decide whether to download the cloud's plans into local
// state (cloud has data) or upload our local plans to seed the cloud (cloud
// is empty). Either way, after this call our local state matches the cloud.
async function hydrateFromCloud() {
  if (!fbDb || !state.authUser) return;
  try {
    const planId = state.activePlanId || 'original';
    const planSnap = await fbDb.collection('plans').doc(planId).get();
    if (planSnap.exists) {
      const data = planSnap.data();
      // Defensive: only replace local DATA.tasks if cloud actually has tasks.
      // If cloud is partially-seeded (e.g. someone created the doc but tasks
      // were never written), keep our local fallback so the user sees the plan.
      const cloudHasTasks = data.data && Array.isArray(data.data.tasks) && data.data.tasks.length > 0;
      firestoreApplyingRemote = true;
      try {
        if (cloudHasTasks) {
          DATA.tasks = data.data.tasks;
          DATA.products = (data.data.products && data.data.products.length) ? data.data.products : DATA.products;
          DATA.methods = (data.data.methods && data.data.methods.length) ? data.data.methods : DATA.methods;
          DATA.versions = (data.data.versions && data.data.versions.length) ? data.data.versions : DATA.versions;
        } else {
          // Cloud doc exists but has no tasks — re-seed with our local data
          console.warn('Cloud plan exists but is empty — re-seeding from local');
          await pushPlanToCloud();
        }
        if (Array.isArray(data.customTasks)) state.customTasks = data.customTasks;
        if (data.taskOverrides) state.taskOverrides = data.taskOverrides;
        if (data.taskNvtFields) state.taskNvtFields = data.taskNvtFields;
        if (data.branding) state.branding = Object.assign({}, state.branding, data.branding);
        if (data.schedule) state.schedule = Object.assign({}, state.schedule, data.schedule);
        if (data.customData) state.customData = Object.assign({}, state.customData, data.customData);
        if (Array.isArray(data.customChangelog)) state.customChangelog = data.customChangelog;
        if (data.pendingChanges) state.pendingChanges = data.pendingChanges;
        if (Array.isArray(data.deletedBuiltinIds)) state.deletedBuiltinIds = data.deletedBuiltinIds;
        // Pull checks (try; tolerate permission errors)
        try {
          const checksSnap = await fbDb.collection('plans').doc(planId).collection('checks').get();
          const remoteChecks = {};
          checksSnap.forEach(d => { remoteChecks[d.id] = (d.data().periods || {}); });
          if (Object.keys(remoteChecks).length > 0) {
            state.checks = remoteChecks;
          }
        } catch (checksErr) {
          console.warn('Could not load checks from cloud:', checksErr.code || checksErr.message);
        }
        saveActivePlanState();
      } finally {
        firestoreApplyingRemote = false;
      }
    } else {
      // Cloud is empty — try to seed it with our local data. If write fails
      // (e.g. permissions not yet propagated), continue with local data so
      // the user at least sees the plan.
      try {
        await pushPlanToCloud();
        await pushChecksToCloud();
      } catch (seedErr) {
        console.warn('Could not seed cloud (continuing with local):', seedErr.code || seedErr.message);
      }
    }
  } catch (err) {
    console.error('hydrateFromCloud failed (continuing with local data):', err.code || err.message);
    // Don't rethrow — we want the app to start with local data even if cloud is broken
  }
}

// Centralized "we're authenticated, start the app" path. Called from the
// auth listener after sign-in, and from continueOffline() in fallback mode.
let appStarted = false;
// =====================================================
// ONBOARDING TOUR — shown once on first login
// =====================================================

let onboardingState = { step: 0, steps: [] };

function getOnboardingSteps() {
  const L = T[state.lang];
  // Define the tour steps. Each step has a target selector, title, body and
  // arrow direction. Steps that target nonexistent elements are skipped.
  const isAdminUser = isAdmin();
  const isSu = isSuperuser();
  const steps = [
    {
      target: 'header',
      title: L.onboard_welcome_title,
      body: L.onboard_welcome_body,
      arrow: 'top'
    },
    {
      target: '#tabs',
      title: L.onboard_tabs_title,
      body: L.onboard_tabs_body,
      arrow: 'top'
    },
    {
      target: '.task-table-wrapper',
      title: L.onboard_check_title,
      body: L.onboard_check_body,
      arrow: 'top'
    },
    {
      target: '#menu-btn',
      title: L.onboard_menu_title,
      body: L.onboard_menu_body,
      arrow: 'right'
    }
  ];
  if (isAdminUser) {
    steps.push({
      target: '#menu-btn',
      title: L.onboard_admin_title,
      body: L.onboard_admin_body,
      arrow: 'right'
    });
  }
  if (isSu) {
    steps.push({
      target: '#menu-btn',
      title: L.onboard_su_title,
      body: L.onboard_su_body,
      arrow: 'right'
    });
  }
  return steps;
}

async function maybeShowOnboarding() {
  if (!state.authUser || !fbDb) return;
  // Check whether this user has seen the tour
  try {
    const userRef = fbDb.collection('users').doc(state.authUser.uid);
    const snap = await userRef.get();
    const data = snap.exists ? snap.data() : {};
    if (data.onboardedAt) return; // already seen
    // Mark as seen first so we don't loop on errors during the tour
    await userRef.update({ onboardedAt: firebase.firestore.FieldValue.serverTimestamp() });
    startOnboardingTour();
  } catch (err) {
    console.warn('Onboarding check failed:', err);
  }
}

function startOnboardingTour() {
  onboardingState.steps = getOnboardingSteps();
  onboardingState.step = 0;
  if (onboardingState.steps.length === 0) return;
  showOnboardingStep();
}

function showOnboardingStep() {
  const L = T[state.lang];
  const step = onboardingState.steps[onboardingState.step];
  if (!step) { closeOnboarding(); return; }
  const target = document.querySelector(step.target);
  const totalSteps = onboardingState.steps.length;
  const isLast = onboardingState.step === totalSteps - 1;

  // Backdrop overlay (no content — just dims the screen)
  let overlay = document.getElementById('onboard-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'onboard-overlay';
    overlay.className = 'onboard-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = '';
  overlay.style.display = 'block';

  // Tooltip lives as a direct body child — always on top, never clipped
  let tooltip = document.getElementById('onboard-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'onboard-tooltip';
    tooltip.className = 'onboard-tooltip';
    document.body.appendChild(tooltip);
  }
  tooltip.style.transform = '';
  tooltip.innerHTML = `
    <h3>${esc(step.title)}</h3>
    <p>${esc(step.body)}</p>
    <div class="onboard-footer">
      <span class="onboard-progress">${onboardingState.step + 1} / ${totalSteps}</span>
      <div>
        <button class="btn-link" onclick="closeOnboarding()">${esc(L.onboard_skip)}</button>
        <button class="btn btn-primary" onclick="nextOnboardingStep()" style="margin-left: 8px;">${esc(isLast ? L.onboard_finish : L.onboard_next)}</button>
      </div>
    </div>
  `;
  tooltip.style.display = 'block';
  tooltip.style.visibility = 'hidden'; // measure before revealing

  // Highlight the target element
  if (target) {
    target.classList.add('onboard-highlight');
    onboardingState.currentTarget = target;
  }

  // Position after a paint so we can read the real rendered dimensions
  requestAnimationFrame(() => {
    const ttW = tooltip.offsetWidth || 320;
    const ttH = tooltip.offsetHeight || 200;
    const MARGIN = 14;
    let top, left;
    if (target) {
      const rect = target.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow >= ttH + MARGIN || spaceBelow >= spaceAbove) {
        top = rect.bottom + MARGIN;
      } else {
        top = rect.top - ttH - MARGIN;
      }
      left = rect.left + rect.width / 2 - ttW / 2;
      // Anchor left when target is near the right edge (e.g. ⋮ menu button)
      if (rect.left + rect.width / 2 > window.innerWidth * 0.7) {
        left = rect.right - ttW;
      }
      top  = Math.max(MARGIN, Math.min(top,  window.innerHeight - ttH - MARGIN));
      left = Math.max(MARGIN, Math.min(left, window.innerWidth  - ttW - MARGIN));
    } else {
      top  = (window.innerHeight - ttH) / 2;
      left = (window.innerWidth  - ttW) / 2;
    }
    tooltip.style.top  = top  + 'px';
    tooltip.style.left = left + 'px';
    tooltip.style.visibility = 'visible';
    tooltip.style.animation = 'onboardFadeIn 0.18s ease';
  });
}

function nextOnboardingStep() {
  if (onboardingState.currentTarget) {
    onboardingState.currentTarget.classList.remove('onboard-highlight');
    onboardingState.currentTarget = null;
  }
  onboardingState.step++;
  if (onboardingState.step >= onboardingState.steps.length) {
    closeOnboarding();
  } else {
    showOnboardingStep();
  }
}

function closeOnboarding() {
  if (onboardingState.currentTarget) {
    onboardingState.currentTarget.classList.remove('onboard-highlight');
    onboardingState.currentTarget = null;
  }
  const overlay = document.getElementById('onboard-overlay');
  if (overlay) overlay.style.display = 'none';
  // Hide the standalone tooltip element
  const tooltip = document.getElementById('onboard-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

// =====================================================
async function startApp() {
  if (appStarted) return;
  appStarted = true;
  // Apply dark mode BEFORE rendering so the first paint is already in the
  // right theme. We don't await — the css class toggle is synchronous in
  // practice; if storage is slow, we briefly start in light then flip,
  // which is a one-time cosmetic blip on first page load.
  initDarkMode();
  renderApp();
  // Decide once now, then on every resize/orientation change, whether to
  // use the mobile fixed-bars layout. This is more reliable than pure CSS
  // because we can measure actual element heights.
  evaluateMobileFixedBars();
  // Set up mobile touch gestures once. The handlers themselves check
  // isTouchDevice() internally so attaching on desktop is harmless.
  setupMobileGestures();
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', () => {
      evaluateMobileFixedBars();
      updateStickyOffsets();
    });
    // Orientation changes need a delay so the browser has settled its layout.
    // We DON'T attach a scroll listener — measuring on scroll causes layout
    // jitter on mobile (the classic "shaking page" symptom).
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        evaluateMobileFixedBars();
        updateStickyOffsets();
      }, 200);
    });
  }
  // Show one-time onboarding tour for first-time users (only after auth so
  // we have a uid to mark "seen" against)
  if (state.authUser) {
    setTimeout(() => maybeShowOnboarding(), 600);
  }
  state.lastSeenPeriods = {
    daily: getStoragePeriodKey('daily'),
    weekly: getStoragePeriodKey('weekly')
  };
  // Period-rollover detector. Runs every minute to notice when midnight or
  // a Monday/Sunday boundary has passed during an open session — at which
  // point the visible "today" / "this week" needs to refresh.
  //
  // IMPORTANT: only re-render when an ACTUAL rollover happened. Earlier
  // versions called renderApp() unconditionally every 60s, which caused
  // periodic flashing of the page even when nothing changed.
  setInterval(() => {
    const L = T[state.lang];
    let didRollover = false;
    ['daily', 'weekly'].forEach(f => {
      const cur = getStoragePeriodKey(f);
      const prev = state.lastSeenPeriods && state.lastSeenPeriods[f];
      if (prev && prev !== cur) {
        const freqLabel = f === 'daily' ? L.freq_day : L.freq_week;
        showToast(L.new_period_notice.replace('{freq}', freqLabel), 'info');
        didRollover = true;
      }
      if (!state.lastSeenPeriods) state.lastSeenPeriods = {};
      state.lastSeenPeriods[f] = cur;
    });
    // Only refresh the UI when a genuine rollover occurred and the user is
    // looking at a frequency tab where the period is visible.
    if (didRollover && state.activeTab !== 'changelog' && state.activeTab !== 'dashboard') {
      renderApp();
    }
  }, 60000);
}

// =====================================================
// FOCUS-TRAP voor modals (accessibility)
// =====================================================
// Houdt Tab/Shift+Tab gevangen binnen een geopende modal zodat
// toetsenbord-gebruikers niet per ongeluk kunnen wegtabben naar elementen
// achter de modal. Werkt via een delegated keydown-listener op document
// die actief is zolang er een .modal-backdrop.show in de DOM staat.
//
// Aanpak: één globale installer (initFocusTrap) die zoekt naar de
// "topmost" zichtbare modal en daarbinnen tabbable elementen vindt.
// Geen wijzigingen aan individuele open-functies nodig — werkt voor alle
// modals in deze app (help, add-task, MSDS, signout, password, afwerklijst).

const FOCUS_TRAP_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
  'input:not([disabled])', 'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

// Vind de top-visible modal: laatste .modal-backdrop.show in document-orde.
// Round-overlay is geen .modal-backdrop maar werkt al met eigen toetsenbord-
// handler — we negeren die hier expliciet.
function getTopVisibleModal() {
  const modals = document.querySelectorAll('.modal-backdrop.show');
  if (!modals.length) return null;
  return modals[modals.length - 1];
}

// Verzamel tabbable elementen binnen de modal die niet hidden of disabled
// zijn. We respecteren ook 'display: none' en 'visibility: hidden' via
// offsetParent-check (gangbaar patroon, hoewel niet 100% accuraat voor
// fixed-positioned items — voor onze use-case voldoende).
function getTabbableElements(container) {
  return [...container.querySelectorAll(FOCUS_TRAP_SELECTOR)].filter(el => {
    if (el.disabled) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.offsetParent === null && el.tagName !== 'AREA') return false;
    return true;
  });
}

let _focusTrapBefore = null; // element dat focus had voor modal opende
let _focusTrapInstalled = false;

function installFocusTrapOnceGlobally() {
  if (_focusTrapInstalled) return;
  _focusTrapInstalled = true;

  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const modal = getTopVisibleModal();
    if (!modal) return;
    const tabbables = getTabbableElements(modal);
    if (tabbables.length === 0) {
      // Geen tabbable elementen → trap focus op de modal zelf
      e.preventDefault();
      modal.focus();
      return;
    }
    const first = tabbables[0];
    const last = tabbables[tabbables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      // Shift+Tab: als focus op eerste of buiten modal → naar laatste
      if (active === first || !modal.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: als focus op laatste of buiten modal → naar eerste
      if (active === last || !modal.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }, true); // capture phase zodat we vóór andere handlers zitten

  // Bewaak welke modal nu zichtbaar is via een MutationObserver — bij
  // openen sla we de huidige focus op zodat we 'm bij sluiten kunnen
  // herstellen. Werkt voor alle modals zonder wijziging aan open-funcs.
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mut => {
      if (mut.type !== 'attributes' || mut.attributeName !== 'class') return;
      const target = mut.target;
      if (!target.classList || !target.classList.contains('modal-backdrop')) return;
      const wasShown = mut.oldValue && mut.oldValue.includes('show');
      const isShown = target.classList.contains('show');
      if (!wasShown && isShown) {
        // Net geopend
        _focusTrapBefore = document.activeElement;
        // Focus eerste tabbable na een micro-delay (modal-fade-animation)
        setTimeout(() => {
          if (!target.classList.contains('show')) return;
          const tabbables = getTabbableElements(target);
          // Skip de close-knop (×) als eerste focus-target — voelt
          // beter om naar het inhoudelijke eerste veld te springen.
          const skipFirst = tabbables[0] && tabbables[0].classList &&
            tabbables[0].classList.contains('close');
          const focusTarget = skipFirst && tabbables[1] ? tabbables[1] : tabbables[0];
          if (focusTarget && (!document.activeElement || !target.contains(document.activeElement))) {
            try { focusTarget.focus(); } catch (e) {}
          }
        }, 60);
      } else if (wasShown && !isShown) {
        // Net gesloten — herstel focus naar element dat 'm voor opening had
        if (_focusTrapBefore && typeof _focusTrapBefore.focus === 'function') {
          try { _focusTrapBefore.focus(); } catch (e) {}
        }
        _focusTrapBefore = null;
      }
    });
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true
  });
}

// =====================================================
// SERVICE WORKER + NOTIFICATIONS (PUNT 10)
// =====================================================
// Registreert een Service Worker (zie sw.js) als foundation voor toekomstige
// push-notificaties + offline-fallback. Lokale notificaties werken via de
// Notification API zolang de tab/PWA open is — voor echte server-driven push
// is een backend met FCM/VAPID nodig (out-of-scope voor deze iteratie; de
// hooks in sw.js liggen klaar).

let swRegistration = null;

async function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    swRegistration = reg;
    return reg;
  } catch (e) {
    console.warn('Service worker registration failed:', e);
    return null;
  }
}

// Vraag de gebruiker om notificatie-toestemming. Bij grant slaan we de keuze
// op (state.notifEnabled) en plannen we de eerste shift-notificaties.
async function requestNotificationPermission() {
  const L = T[state.lang];
  if (typeof Notification === 'undefined') {
    showToast(state.lang === 'nl' ? 'Browser ondersteunt geen notificaties' : 'Browser does not support notifications', 'error');
    return;
  }
  let perm = Notification.permission;
  if (perm === 'default') {
    try {
      perm = await Notification.requestPermission();
    } catch (e) {
      console.warn('Notification permission error:', e);
      return;
    }
  }
  if (perm === 'granted') {
    state.notifEnabled = true;
    saveState();
    showLocalNotification(L.notif_test_title, L.notif_test_body);
    scheduleShiftNotifications();
    // Re-render Today filter row zodat knop-state update
    if (state.activeTab === 'today') {
      const c = document.getElementById('filters-and-content');
      if (c) c.innerHTML = renderTodayView();
      wireCheckboxes();
    }
  } else if (perm === 'denied') {
    showToast(L.notif_blocked, 'error');
    state.notifEnabled = false;
    saveState();
  }
}

// Aan/uit-toggle voor notificaties — als toestemming al gegeven is, wisselt
// dit alleen de scheduling. Bij denied: niets te doen.
function toggleNotificationsPref() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') {
    requestNotificationPermission();
    return;
  }
  state.notifEnabled = !state.notifEnabled;
  saveState();
  if (state.notifEnabled) {
    scheduleShiftNotifications();
    showToast(T[state.lang].notif_enabled, 'success');
  } else {
    cancelScheduledShiftNotifications();
    showToast(state.lang === 'nl' ? 'Notificaties uit' : 'Notifications off', 'info');
  }
  if (state.activeTab === 'today') {
    const c = document.getElementById('filters-and-content');
    if (c) c.innerHTML = renderTodayView();
    wireCheckboxes();
  }
}

// Toon een notificatie. Probeert eerst de SW (zodat hij ook werkt na
// minimaliseren); valt terug op de gewone Notification-constructor wanneer
// SW niet beschikbaar is.
function showLocalNotification(title, body, opts) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const options = Object.assign({
    body: body || '',
    icon: 'favicon.ico',
    tag: 'cleaning-shift'
  }, opts || {});
  if (swRegistration && swRegistration.active) {
    try {
      swRegistration.active.postMessage({
        type: 'show-notification',
        title, body, tag: options.tag, icon: options.icon
      });
      return;
    } catch (e) {
      // fall through naar fallback
    }
  }
  try {
    new Notification(title, options);
  } catch (e) {
    console.warn('Notification show failed:', e);
  }
}

// Plan lokale herinneringen voor de twee shift-momenten van de dag:
// 06:00 ochtend, 14:00 middag. Werkt alleen zolang de tab/PWA actief is —
// voor "wake up at 6am while phone is locked" is een echte push-server nodig.
let _shiftNotifTimers = [];
function scheduleShiftNotifications() {
  cancelScheduledShiftNotifications();
  if (!state.notifEnabled) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const L = T[state.lang];
  const now = new Date();
  const todayY = now.getFullYear(), todayM = now.getMonth(), todayD = now.getDate();
  // Shift-tijden komen uit state.schedule.shifts (configureerbaar in
  // Instellingen → Werkrooster). Voor backward-compat: als state.schedule
  // ontbreekt of leeg is, terugvallen op de oorspronkelijke 06:00 + 14:00.
  let configShifts = (state.schedule && Array.isArray(state.schedule.shifts) && state.schedule.shifts.length > 0)
    ? state.schedule.shifts.slice()
    : [{ hour: 6, minute: 0 }, { hour: 14, minute: 0 }];
  // Voeg een 'key'-label toe voor de notif-body. Eerste shift = morning,
  // laatste = afternoon, tussenliggende krijgen 'shift_2', 'shift_3' etc.
  // De L.notif_shift_morning/afternoon strings dienen nog steeds als
  // primaire body — voor extra shifts gebruiken we een generieke fallback.
  const shifts = configShifts.map((s, i) => ({
    hour: s.hour,
    minute: s.minute,
    key: i === 0 ? 'morning'
       : (i === configShifts.length - 1 && configShifts.length > 1) ? 'afternoon'
       : 'shift_' + (i + 1)
  }));
  shifts.forEach(s => {
    let target = new Date(todayY, todayM, todayD, s.hour, s.minute, 0, 0);
    if (target.getTime() <= now.getTime()) {
      // Al voorbij vandaag — plan voor morgen
      target.setDate(target.getDate() + 1);
    }
    const delay = target.getTime() - now.getTime();
    const timerId = setTimeout(() => {
      const open = (typeof getTasksDueToday === 'function') ? getTasksDueToday().length : 0;
      // Body-tekst: morning/afternoon hebben hun eigen i18n-strings; voor
      // tussenliggende shifts gebruiken we de afternoon-string als fallback.
      const bodyKey = s.key === 'morning' ? L.notif_shift_morning
                    : (s.key === 'afternoon' ? L.notif_shift_afternoon : L.notif_shift_afternoon);
      const body = bodyKey.replace('{n}', open);
      showLocalNotification(L.app_title, body, { tag: 'shift-' + s.key });
      // Reschedule voor morgen
      scheduleShiftNotifications();
    }, delay);
    _shiftNotifTimers.push(timerId);
  });
}

function cancelScheduledShiftNotifications() {
  _shiftNotifTimers.forEach(id => clearTimeout(id));
  _shiftNotifTimers = [];
}

(async function init() {
  await loadState();
  // Apply branding (CSS-vars voor accent-kleur) zo vroeg mogelijk, vóór
  // renderApp() zodat de eerste paint al de juiste kleuren heeft.
  if (typeof document !== 'undefined' && document.documentElement && document.documentElement.style) {
    applyBranding();
  }
  // Install global focus-trap voor modals (accessibility — Tab cycelt
  // binnen een geopende modal, niet erdoorheen naar de page erachter).
  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    installFocusTrapOnceGlobally();
  }
  // Register Service Worker (PUNT 10) — best effort, faalt stil als browser
  // het niet ondersteunt of het bestand niet bereikbaar is.
  registerServiceWorker().then(() => {
    // Hervat geplande shift-notificaties als de gebruiker eerder had
    // toegestemd én de toestemming nog steeds geldig is.
    if (state.notifEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      scheduleShiftNotifications();
    }
  });
  // Parse URL fragment for QR-code deep-linking. A QR code printed for a
  // specific workplace contains "#ruimte=X&werkplek=Y" and lands the user
  // directly on that filtered view, no manual filter setting required.
  if (typeof window !== 'undefined' && window.location && window.location.hash) {
    const hash = window.location.hash.replace(/^#\??/, '');
    const params = new URLSearchParams(hash);
    if (params.get('ruimte') || params.get('werkplek') || params.get('uitvoerend')) {
      state.filters.area = params.get('ruimte') || '';
      state.filters.performer = params.get('uitvoerend') || '';
      state.filters.search = params.get('werkplek') || '';
      // Optional: deep-link to a specific frequency
      const freq = params.get('freq');
      if (freq && ['daily','weekly','monthly','bimonthly','quarterly','semiannual','annual'].includes(freq)) {
        state.activeTab = freq;
      }
    }
  }
  // Try to initialize Firebase. If it succeeds, set up the auth listener,
  // which will eventually call startApp() once a user signs in. If Firebase
  // fails (no SDK, no network), fall back to local-only mode immediately.
  showAuthOverlay();
  showAuthLoading();
  const fbOk = initFirebase();
  if (fbOk) {
    setupAuthListener();
    // Safety: if no auth state arrives within 5s, show offline option
    setTimeout(() => {
      if (!state.authReady) {
        showAuthOffline();
      }
    }, 5000);
  } else {
    // No Firebase available — show offline option after a brief loader
    setTimeout(() => showAuthOffline(), 800);
  }
})();

