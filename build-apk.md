# Building Re-birth as an Android APK

## Method 1: PWA Install (Recommended)

This is the simplest and most reliable approach. No APK needed — Android treats installed PWAs as first-class apps.

### Steps

1. **Host your files on Netlify Drop**
   - Go to [https://app.netlify.com/drop](https://app.netlify.com/drop)
   - Drag and drop the entire `breathing-widget` folder onto the page
   - Netlify will give you a URL like `https://random-name-12345.netlify.app`
   - (Optional) Create a free Netlify account to claim the site and get a custom subdomain

2. **Open in Chrome on your Android phone**
   - Navigate to your Netlify URL in Chrome
   - Wait for the page to fully load

3. **Install the PWA**
   - Tap the **three-dot menu** (⋮) in Chrome
   - Tap **"Install app"** or **"Add to Home screen"**
   - Confirm the installation
   - The app will appear on your home screen with the Re-birth icon

4. **Done!**
   - The app now runs fullscreen (no browser chrome)
   - It works offline after first load
   - Notifications work if you granted permission

### Updating the App
- Just re-deploy to Netlify (drag-drop again, or use Netlify CLI)
- The service worker will detect updated files and refresh the cache
- Users may need to close and reopen the app to see updates

---

## Method 2: Bubblewrap CLI (Trusted Web Activity APK)

Bubblewrap is Google's official tool for wrapping a PWA into an Android APK using Trusted Web Activities (TWA). The resulting APK is a thin shell that loads your hosted PWA.

### Prerequisites

- **Node.js** 14+ ([download](https://nodejs.org/))
- **Java JDK** 11+ ([download](https://adoptium.net/))
- **Android SDK** (installed via Android Studio or standalone SDK tools)
  - Make sure `ANDROID_HOME` environment variable is set
  - Accept Android SDK licenses: `sdkmanager --licenses`

### Steps

1. **Host your PWA** (same as Method 1 — you need a live HTTPS URL)

2. **Install Bubblewrap globally**
   ```bash
   npm install -g @nicksantos/nicksantos-nicksantos.github.io
   ```

3. **Initialize the project**
   ```bash
   npx bubblewrap init --manifest https://YOUR-URL/manifest.json
   ```
   - Bubblewrap will read your manifest and ask configuration questions
   - Accept the defaults or customize (app name, theme color, etc.)
   - It will download Android SDK build tools if needed

4. **Build the APK**
   ```bash
   npx bubblewrap build
   ```
   - This generates a signed APK
   - Output location: `app/build/outputs/apk/release/app-release-signed.apk`

5. **Transfer to your phone**
   - USB cable: Copy the APK file to your phone's Downloads folder
   - Or use `adb install app-release-signed.apk`
   - Or upload to Google Drive and download on your phone

6. **Install on phone**
   - Open the APK file on your phone
   - You may need to enable "Install from unknown sources" in Settings
   - Tap **Install**

### Digital Asset Links (Important!)

For the TWA to show without the browser URL bar, you need to verify domain ownership:

1. After `bubblewrap init`, it generates a signing key fingerprint
2. Create a file `.well-known/assetlinks.json` on your web server with the fingerprint
3. Without this, the app works but shows a small URL bar at the top

---

## Why PWABuilder Doesn't Work Well

[PWABuilder](https://www.pwabuilder.com/) is Microsoft's tool that claims to convert PWAs to APKs with a simple web interface. In practice, it has significant issues:

- **Unsigned or improperly signed APKs** — Many generated APKs fail to install on modern Android devices due to signing issues
- **Malformed APK structure** — The generated packages sometimes have incorrect manifest entries or missing resources
- **Outdated TWA implementation** — PWABuilder's Android wrapper often lags behind the latest Trusted Web Activity standards
- **Inconsistent results** — The same PWA may generate a working APK one day and a broken one the next
- **Limited debugging** — When things go wrong, there's very little visibility into what failed

**Bottom line:** Use direct PWA install (Method 1) for personal use, or Bubblewrap (Method 2) if you specifically need an APK file. Both are more reliable than PWABuilder.
