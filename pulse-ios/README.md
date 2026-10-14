# Pulse — iOS wrapper for the App Store

Capacitor wrapper that puts the live Novarys dashboard
(`https://pulse-engine.xyz`) on the iPhone home screen as a real
App Store app.

Why Capacitor and not native: the dashboard is a Next.js web app
that ships hourly. A native rewrite would freeze features behind
every App Store review. Capacitor runs the WKWebView against the
live server, so **every bug fix and every new feature lands on
iPhones the moment it hits Vercel**, no review wait.

- **Bundle ID**: `app.novarys.novarys`
- **App Store name**: `Pulse`
- **Universal link / server**: `https://pulse-engine.xyz`
- **Supports**: iPhone (portrait), iOS 14+.

---

## One-time setup (on a Mac)

Everything below has to run on macOS because Xcode is a hard
requirement for signing + submitting to the App Store.

### 0. Prereqs
- macOS 13 or newer
- Xcode 15 or newer, with Command Line Tools installed
- CocoaPods: `sudo gem install cocoapods` (or `brew install cocoapods`)
- Node 18+ and npm
- Apple Developer Program membership ($99/year) — enroll at
  <https://developer.apple.com/programs/>

### 1. Install Capacitor + plugins
```bash
cd pulse-ios
npm install
```

### 2. Add the iOS project
```bash
npx cap add ios
```
This creates `pulse-ios/ios/` with the full Xcode project.

### 3. Generate icon + splash from the sources
```bash
npm run icons
```
`cordova-res` turns `resources/icon.png` and `resources/splash.png`
into every size the App Store asks for and drops them into
`ios/App/App/Assets.xcassets/`.

### 4. Sync the Capacitor config into the Xcode project
```bash
npx cap sync ios
```
Run this after every edit of `capacitor.config.ts` or
`package.json`.

### 5. Open in Xcode
```bash
npx cap open ios
```

Inside Xcode:
1. Pick the **App** target → **Signing & Capabilities** → sign in
   with your Apple ID → let Xcode auto-generate the provisioning
   profile. Team = `The Flippin' Labs`.
2. Confirm **Bundle Identifier = `app.novarys.novarys`**.
3. Confirm **Display Name = `Pulse`**.
4. Add capabilities: **Push Notifications**, **Associated Domains**
   (for the Discord OAuth round-trip: add
   `applinks:pulse-engine.xyz`).
5. Build on an iPhone connected via USB (`Cmd+R`) to smoke-test.
   The WKWebView should open on the landing page of pulse-engine.xyz.

### 6. First App Store submission

1. **Create the App Store Connect record**:
   <https://appstoreconnect.apple.com/> → My Apps → `+`.
   - Name: `Pulse`
   - Bundle ID: `app.novarys.novarys` (pick it from the list — it
     was registered when Xcode generated the profile)
   - SKU: `novarys-pulse-ios`
   - User access: full

2. **Fill the metadata**:
   - **Privacy Policy URL**: `https://pulse-engine.xyz/legal/privacy`
   - **Support URL**: `https://pulse-engine.xyz` (or your contact)
   - **Marketing URL**: `https://pulse-engine.xyz`
   - **Category**: Social Networking
   - **Age rating**: 12+ (user-generated content + simulated gambling PULSE games)
   - **Screenshots**: see § 7 below

3. **Archive & upload**:
   - Xcode → `Product` → `Archive`
   - When the Organizer opens, click **Distribute App** →
     **App Store Connect** → **Upload** → sign with your
     distribution certificate → wait ~10 minutes for the build to
     appear in App Store Connect.

4. **Submit for review**: App Store Connect → the uploaded build →
   fill the review notes (see § 8) → **Submit for Review**.
   First reviews take 24–48 h.

### 7. Screenshots (required by Apple)

Needed sizes (take on real devices or Xcode's simulator):
- 6.7" iPhone (14/15/16 Pro Max): 1290×2796, 3 to 10 screenshots
- 6.5" iPhone (older Plus/Pro Max): 1242×2688, 3 to 10 screenshots
- 5.5" iPhone (SE 1st gen fallback): 1242×2208, 3 to 10 screenshots

Suggested screens: landing / sign-in → dashboard → battle pass →
cards collection → pet view → blackjack mid-hand.

### 8. Review notes to Apple

The App Store review team will reject a plain web-view wrapper
(Guideline 4.2 Minimum Functionality). Explain in the review notes:

> Pulse is the companion app to the Novarys Discord bot. Members
> sign in with Discord to track their PULSE balance, play
> real-time card and dice games against the dealer, open trading-
> card packs, feed and battle their pet, and chat with their
> personal AI companion. All of these are interactive native
> flows, not a passive website.
>
> Push notifications are implemented via APNs for duel challenges,
> gift events and tournament invites.
>
> Test credentials (if asked): [sign in via Discord with any
> account; the server auto-provisions a free profile].
>
> Privacy policy: https://pulse-engine.xyz/legal/privacy
> Terms: https://pulse-engine.xyz/legal/terms

Mention the integrated APNs push, native share, haptics on game
events, and the Capacitor plugins we actually use (Browser, Share,
Haptics, StatusBar). That checks the "minimum functionality" box.

### 9. Later: update the app

To ship a new version to the App Store without any code change
(because the real app is on Vercel and auto-reloads), you only
need a submission for native-side changes (new plugin, new
permission, app icon update, iOS target bump). Daily feature
work does **not** require a resubmission.

If you do need to resubmit:
```bash
npx cap sync ios
# bump CFBundleShortVersionString + CFBundleVersion in Xcode
# Product → Archive → Upload → Submit for Review
```
