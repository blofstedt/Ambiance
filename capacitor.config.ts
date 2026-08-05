import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ambient.canvas.overlay',
  appName: 'Ambient Canvas',
  webDir: 'dist',

  server: {
    /*
     * AND-07: this was androidScheme 'http' with cleartext:true and
     * allowNavigation:['*'] — meaning ANY url could be navigated to inside the
     * WebView, over plaintext. Combined with the app-wide cleartext flag that
     * was a full remote-content takeover surface.
     *
     * The app itself is now served over the https scheme. Plaintext sensor
     * traffic no longer needs a permissive WebView, because sensor requests go
     * through CapacitorHttp (native), not through the WebView's fetch.
     */
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [],
  },

  android: {
    allowMixedContent: false,
  },

  plugins: {
    /*
     * WEB-02/FW-01: sensor requests are plain HTTP to a LAN IP from an https
     * origin. Browser CORS + mixed-content rules make that impossible from
     * WebView fetch, and the firmware's Origin-echo logic can never match.
     *
     * CapacitorHttp routes through native libraries, which are not subject to
     * browser CORS at all.
     *
     * NOTE: `enabled` is deliberately FALSE. Turning it on patches window.fetch
     * and XMLHttpRequest globally, which is known to break other plugins' file
     * handling. src/lib/http.ts calls the explicit CapacitorHttp.request() API
     * for sensor traffic only, leaving weather/artwork on standard fetch.
     */
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
