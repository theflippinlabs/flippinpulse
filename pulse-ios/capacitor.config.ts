import type { CapacitorConfig } from '@capacitor/cli';

/**
 * iOS wrapper for the Novarys Pulse web app.
 *
 * Strategy: Capacitor spins up a WKWebView and points it at the live
 * Vercel-hosted dashboard. No code shipped in the IPA except the shell —
 * every page, every feature, every bug fix lands on iPhones the moment
 * it hits production, no App Store review wait.
 *
 * Native capabilities enabled on top of the webview:
 *   - APNs push notifications (Capacitor Push Notifications plugin).
 *     The server reuses the existing push_subscriptions table but writes
 *     the APNs token instead of a VAPID endpoint.
 *   - Browser.open for Discord OAuth (opens in SFSafariViewController and
 *     comes back via the universal link once Discord finishes).
 *   - Share sheet for inviting friends to a server.
 *   - Haptics on Deal / Hit / Win feedback.
 *   - StatusBar styling so the top bar matches the dashboard theme.
 */
const config: CapacitorConfig = {
  appId: 'app.novarys.novarys',
  appName: 'Pulse',
  // Bundle a tiny launch page as the webDir so Capacitor is happy; the
  // launch page immediately hands over to the live server config below.
  webDir: 'www',
  bundledWebRuntime: false,
  server: {
    url: 'https://pulse-engine.xyz',
    // Allow Discord's auth domain for OAuth round-trips.
    allowNavigation: [
      'pulse-engine.xyz',
      '*.pulse-engine.xyz',
      '*.vercel.app',
      'discord.com',
      '*.discord.com',
      '*.discordapp.com',
    ],
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
  },
  ios: {
    scheme: 'Pulse',
    // Opt into the modern WebView content inset so our safe-area CSS keeps
    // working the way it does in Safari.
    contentInset: 'always',
    // Append a signature to the user agent so the server can show app-only
    // UX (e.g., hide the "Add to home screen" prompt). Pulse-iOS/<version>.
    appendUserAgent: 'Pulse-iOS/1.0',
    // Keep the webview opaque so we never see a white flash during nav.
    backgroundColor: '#000000',
    // Hide the "<" back button that WKWebView would otherwise show in the
    // nav bar; our dashboard shell has its own back links.
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      overlaysWebView: true,
      backgroundColor: '#000000',
      style: 'DARK',
    },
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#000000',
      iosSpinnerStyle: 'small',
      spinnerColor: '#F5B62E',
    },
  },
};

export default config;
