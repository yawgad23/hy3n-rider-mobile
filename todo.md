# HY3N Rider App TODO

## Core Screens
- [x] Home screen with map placeholder (react-native-maps on device, fallback on web)
- [x] "Where to?" search modal with recent & popular destinations
- [x] Booking sheet with ride categories (Standard, Comfort, Kantanka, Executive, Okada, Express Delivery)
- [x] Payment method selector (Cash, MoMo, Wallet, Card) with correct icons
- [x] Now/Schedule toggle
- [x] Split Fare button
- [x] Promo code input
- [x] Request HY3N button with loading state
- [x] Active ride / Ride Booked screen with Cancel Ride
- [x] Activity tab with ride history (Upcoming/Past tabs), trip detail modal, report issue, book again
- [x] Wallet tab with balance card (Ghana green gradient), stats row, Top Up modal (MoMo/Card/quick amounts), transaction history
- [x] Account tab: profile, loyalty tier/progress, stats, saved places, loyalty rewards, help center FAQ, refer-a-friend, settings
- [x] Safety Center: SOS button, emergency numbers (Police/Ambulance/Fire/HY3N), trusted contacts, safety tips
- [x] Scheduled Trips: upcoming/cancelled cards, cancel/edit actions
- [x] Contact Support: ticket list, new ticket modal with categories, ticket detail modal

## Firebase Integration
- [x] Firebase SDK installed (firebase v11)
- [x] Firebase config connected to Hy3n26 project
- [x] Firebase Auth: Email/Password sign in, sign up, forgot password
- [x] Auth context with user state, riderProfile from Firestore
- [x] Auth gating: unauthenticated users redirected to login screen
- [x] Login screen, Register screen, Forgot Password screen
- [x] Account tab: real user data from Firebase (name, email, loyalty points)
- [x] Account tab: sign out wired to Firebase signOut
- [x] Activity tab: loads real rides from Firestore (RideRequests collection)
- [x] Wallet tab: loads real balance and transactions from Firestore
- [x] Leaflet/OpenStreetMap dark map replacing react-native-maps

## Technical
- [x] react-native-maps web stub (metro.config.js resolver)
- [x] MaterialIcons mapping for payment methods and ride categories
- [x] Tab navigation (Home, Activity, Wallet, Account)
- [x] HY3N branding (logo, splash screen, app name)
- [x] Ghana Cedis (GH₵) fare calculation
- [x] Dark theme with Ghana green (#006B3F) + gold (#D4AF37) + red (#CE1126) colors
- [x] All screens match web app from GitHub repo (https://github.com/yawgad23/Hy3N)
- [x] TypeScript 0 errors

## Remaining for App Store
- [x] Phone OTP login (Firebase Phone Auth)
- [x] Google Sign-In button (works in production build)
- [x] Save ride bookings to Firestore on request
- [x] Real GPS location centering map on user's position
- [x] EAS Build configuration (eas.json) for App Store submission
- [x] Bundle ID set to com.hy3n.rider
- [x] expo-location plugin added to app.config.ts with iOS/Android permissions

## Web App Feature Parity — Remaining Gaps

### Onboarding
- [x] Onboarding slides (5 slides: Book a Ride, Real-Time Tracking, Payment Options, Safe & Secure, Split Fare) — shown once on first launch before login

### Account Screen
- [x] Delete Account option with confirmation dialog
- [x] Dark/Light mode toggle in account settings (UI toggle added)
- [x] Biometric login toggle (Face ID / Fingerprint)
- [x] Privacy Policy & Terms of Use screen (linked from account)

### Home Screen
- [x] Scheduled trip confirmation toast/banner after booking a scheduled ride
- [x] SOS button visible during active ride (in ride tracker area)
- [x] In-ride chat with driver (quick message templates + free text)

### Activity / History
- [ ] Trip receipt download/share (full breakdown: fare, tip, promo, waiting fee)
- [ ] Ride report modal improvements (match web: rude driver, wrong route, overcharged, lost item, safety concern)

### Notifications
- [x] Push notification service setup (expo-notifications + expo-device)
- [x] Android notification channels (rides, promos, wallet)
- [x] Driver found / arriving / trip started / completed / wallet top-up notifications
- [x] Wire notification toggle in account settings to actual OS permission

### Safety
- [x] Trusted contacts persisted to AsyncStorage

### General
- [x] "Wo ho te sɛn?" Twi greeting on home screen header

## Production Backend & Uber/Bolt Feature Parity

### Real Dispatch Backend (Firestore)
- [ ] Firestore schema: rides collection (status, rider_id, driver_id, pickup, destination, fare, timestamps)
- [ ] Firestore schema: drivers collection (name, vehicle, colour, plate, photo, rating, location, is_available)
- [ ] Real ride request creation — write to Firestore on Book
- [ ] Real driver matching — query available drivers near pickup
- [ ] Real-time ride status listener — onSnapshot for live status updates
- [ ] Real driver location updates — live lat/lng from Firestore
- [ ] Real trip history — load from Firestore rides collection per rider_id
- [ ] Real wallet balance — load from Firestore users collection, start at GH₵ 0.00

### Uber/Bolt Rider UI Features
- [ ] Vehicle colour badge on driver card (e.g. Red, Black, White, Silver, Blue)
- [ ] Driver card: photo placeholder, name, rating, vehicle, plate, colour
- [ ] ETA countdown timer (live seconds countdown to driver arrival)
- [ ] Surge pricing indicator (1.2x, 1.5x, 2x badge on category cards)
- [ ] Cancel policy warning (free within 2 min, GH₵2 fee after)
- [ ] Cancel ride with reason selection modal
- [ ] Ride options: AC toggle, pet-friendly, extra luggage
- [x] Fare estimate range before booking (show min-max per category)
- [x] Share trip with contact (share live tracking link via WhatsApp/SMS)
- [x] Driver is nearby alert (push notification + banner when driver is 2 min away)
- [x] Ride PIN verification (4-digit PIN rider shows driver before trip starts)
- [x] Lost & Found contact button in trip details
- [ ] Accessibility option (wheelchair-accessible vehicle request)

## Driver App Feature Parity (vs Web App)

### Settings Tab
- [x] Settings tab created with 5 preference toggles (Push Notifications, Sound Alerts, Auto-Accept, Long Trips Only, Prefer High-Rated Riders)
- [x] Delete Account with two-step confirmation dialog

### History Tab
- [x] Today / This Week filter buttons added
- [x] Expandable trip cards (passenger feedback, payment method, Trip ID)
- [x] Rider name included in search
- [x] Summary row shows Today earnings and This Week earnings
- [x] Result count + earnings shown in filtered list header

### Home Tab
- [x] Notification bell opens Notification Center modal (trip history as notifications)
- [x] High-risk area alert on incoming ride request (Nima, Mamobi, Agbogbloshie, etc.)
- [x] declined_by array updated on decline so driver is not shown same ride again
- [x] driver_accepted_at timestamp written on accept
- [x] is_available: false set on accept, restored to true on complete
- [x] Rider info row on incoming request (name + rating)
- [x] Fare shown prominently on incoming request card

### Post-Trip TripSummaryDialog
- [x] Rate passenger (1-5 stars)
- [x] Optional remarks about passenger
- [x] Found item toggle + description field
- [x] Writes passenger_rating, driver_remarks, found_item to Firestore ride doc
- [x] Creates RideReport doc for found items

### Commission Gate
- [x] Real MoMo number: 0546728330
- [x] Vehicle-type-based fees: GH₵50 (car), GH₵30 (okada/delivery)

## New Features (Jun 17)

### Rider Email Receipt on Trip Completion
- [x] Server-side email trigger: when driver marks trip complete, send receipt email to rider (fare, route, date, Trip ID, driver name/vehicle)
- [x] tRPC endpoint: `trips.sendReceipt` called from driver app on trip complete
- [x] Email template: HY3N branded, Ghana Cedis fare, pickup/destination, payment method, Trip ID
- [x] rider_email saved in Firestore ride document on booking so driver app can send to correct address

### Driver Set Destination
- [x] "Set Destination" button on driver home screen (when online, no active trip)
- [x] Allows driver to filter incoming requests to only those heading toward their chosen destination
- [x] Destination filter applied to incoming ride request listener
- [x] Clear destination button to remove filter
- [x] Destination shown as active badge on home screen

### History Tab Share Receipt
- [x] Share Receipt button inside expanded trip card (completed trips only)
- [x] Generates plain-text receipt: rider, date, route, fare, Trip ID, payment method
- [x] Opens native share sheet

## Web App Full Parity Pass (Jun 17 — second pass)

- [x] Earnings tab: correct commission model (100% fare retention, flat daily fee)
- [x] Earnings tab: correct tier thresholds (0/50/150/300)
- [x] Earnings tab: KPI cards (today earnings, this week, avg hourly rate, all-time)
- [x] Earnings tab: week/4-week toggle with bar charts
- [x] Earnings tab: acceptance rate card with progress bar
- [x] Earnings tab: streak/flame card
- [x] Earnings tab: all-time performance summary grid
- [x] Profile tab: correct tier thresholds (0/50/150/300)
- [x] Profile tab: verification checklist card (Identity, License, Vehicle, Background, Phone)
- [x] Profile tab: always-visible safety score with grade circle (A+/A/B/C/D/F)
- [x] Profile tab: hero gradient layout with stats row
- [x] Commission Gate: confirmed/rejected/pending/resubmit state machine
- [x] Commission Gate: 10s auto-poll while pending, auto-advance on confirmed
- [x] Commission Gate: copy MoMo number button
- [x] Notification Center: reads from Firestore notifications collection (primary)
- [x] Notification Center: commission status notifications (confirmed/rejected/pending)
- [x] Notification Center: rating_received and support_reply types
- [x] Notification Center: mark-all-read writes back to Firestore
- [x] Notification Center: unread badges and dot indicators

## Waiting Time System (Jun 17)

- [x] Driver app: start waiting timer when driver taps "Arrived at Pickup" (driver_arrived status)
- [x] Driver app: show countdown — 3 min free, then GH₵X/min charged, live display
- [x] Rider app: show waiting timer countdown when driver has arrived at pickup
- [x] Trip complete: calculate and save waiting_fee to Firestore ride document

## Rating & Receipt Features (Jun 17 — round 2)

- [x] Driver post-trip rating modal: add rider-specific quick tags (Friendly, Ready on time, Good communication, Clean entry, Polite, No issues)
- [x] Activity tab: star rating badge already shown on trip cards (rider_rating field) — confirmed working
- [x] Activity tab: Share Receipt button added to trip detail modal (Book Again → Share Receipt → Report Issue)

## Rating Features Parity (Jun 17)

- [x] Driver app: live average rating display updates after rider submits a rating (Firestore subscribeDoc in driver-auth-context)
- [x] Rider app: pending rating prompt on app reopen if a completed unrated ride exists (last 24h check on user load)
- [x] Rider app: comment/feedback text field + quick tags in the rating modal (Great Driver, Smooth Ride, On Time, Clean Car, Professional, Safe Driving)

## Ride History & Account Stats Bug Fix (Jun 17)

- [x] Activity tab queries wrong collection (RideRequests) — fixed to use correct 'rides' collection
- [x] Activity tab uses wrong orderBy field (created_date) — fixed to use 'created_at'
- [x] Activity tab onRefresh doesn't reload rides — fixed to call loadRides()
- [x] Activity tab normalizes destination/pickup from nested objects to flat address strings
- [x] Account tab shows hardcoded '24' total rides — fixed to use real riderProfile.total_rides
- [x] Account tab shows hardcoded '4.9' rating — fixed to use real riderProfile.rating
- [x] handleFinishRide now increments total_rides on riderProfile when a completed trip is dismissed

## Nearby Cars Map Parity (Jun 17)

- [x] Rider home map shows nearby available cars around the user before booking, like the web app
- [x] Rider home map shows a live "cars nearby" indicator when no active ride is in progress
- [x] Driver app writes current_lat/current_lng to Firestore when going online so riders can see nearby cars
- [x] Rider app polls nearby available drivers and passes them into the mobile map component

## Surge Badge & Cancel-With-Reason (Jun 17)

- [ ] Surge pricing badge on each category card (1.2×/1.5×/2× gold badge when SURGE > 1)
- [ ] Cancel-with-reason modal (Driver taking too long, Wrong vehicle, Changed plans, etc.) saves reason to Firestore

## Driver Ride Category Selector (Jun 17)

- [x] Driver app: category selector card on home screen (when online, no active trip)
- [x] Vehicle-type restrictions: Standard car → Standard/Comfort/Executive; Okada → Okada only; Delivery → Express Delivery only; Kantanka → all categories; Comfort → Standard + Comfort + Executive
- [x] Selected categories saved to Firestore driver_profiles and AsyncStorage
- [x] Incoming ride request listener filters to only show rides matching driver's selected categories
- [x] Category badges shown on home screen when categories are selected

## Driver App Entry Flow (Jun 17)

- [x] Driver landing page: single screen with Sign In + Become a Driver buttons (shown only when not logged in)
- [x] Authenticated drivers skip the landing page and go directly to the driver tabs
- [x] Remove separate "become a driver" page from the unauthenticated flow (merge into sign-up)

## Driver Onboarding Checklist (Jun 17)

- [x] Onboarding checklist screen shown after registration (pending approval state)
- [x] Steps: Account Created → Documents Uploaded → Under Review → Approved
- [x] Each step shows status icon (done/active/pending), title, and description
- [x] "Under Review" step shows estimated review time and support contact
- [x] Auto-advances to driver tabs when approval_status changes to 'approved'
- [x] Checklist replaces the bare ApprovalGate screen

## Driver Registration Form — Admin Alignment (Jun 17)

- [x] Add City field to Step 3 (Personal Details) — saved to Firestore as `city`
- [x] Add Vehicle Year field to Step 4 (Vehicle & Documents) — saved to Firestore as `vehicle_year`
- [x] Step 5 confirmation screen matches admin review flow: timeline + 24–48 hr note + WhatsApp support + Go to Driver App
- [x] All admin-reviewed fields now collected: Full Name, Phone, Email, City, MoMo, Service Type, Vehicle Make/Model/Plate/Color/Year, Ghana Card (front+back), Driver's License (front+back), Selfie, Vehicle Photo, Insurance, Roadworthy

## Ride Category Selection — Registration & Admin (Jun 17)

- [ ] Driver registration Step 3: multi-select ride categories (filtered by service type)
- [ ] Categories saved to Firestore as `ride_categories` array on driver profile
- [ ] Admin ApplicationDetailModal: display ride_categories field in Vehicle Info section
- [ ] Admin ApplicationDetailModal: allow admin to edit/override ride categories before approving

## Rejection Reason & Admin Push Notifications (Jun 17)

- [ ] Driver ApprovalGate: show rejection reason when approval_status is 'rejected'
- [ ] Driver ApprovalGate: show "Fix & Resubmit" button that navigates back to registration
- [ ] Admin: send push notification to driver on approval (title: "You're Approved!", body: "Welcome to HY3N. Start driving now.")
- [ ] Admin: send push notification to driver on rejection (title: "Application Update", body: rejection reason)
- [ ] Admin ApplicationDetailModal: trigger push notification via Firestore push_notifications collection on status change

## Driver Document Re-Upload (Jun 17)

- [x] New screen `/driver/reupload-docs` — shows all 8 document slots with current upload status
- [x] Each slot shows the existing photo (thumbnail) with a "Replace" button
- [x] Driver can replace individual documents without touching other fields
- [x] On submit: updates only the changed document URLs in Firestore driver_profiles
- [x] Also resets approval_status to 'pending' so admin sees the resubmission
- [x] "Fix & Resubmit" button on ApprovalGate navigates to this screen instead of full register
- [x] "Or restart full application" secondary link still available for full re-registration

## Surge Pricing UX — Uber/Bolt Style (Jun 17)

- [x] Amber banner above category list in booking sheet: "Prices are higher than normal" with explanation
- [x] Fare summary amber note: "Prices are higher due to demand" (replaces red multiplier badge)
- [x] Active ride card amber note: "Fare includes high-demand pricing" (replaces red multiplier badge)
- [x] No multiplier numbers shown to riders — plain language only, matching Uber/Bolt UX

## Driver Earnings Chart (Jun 17)

- [ ] Weekly bar chart on driver earnings tab showing daily earnings (Mon–Sun)
- [ ] Monthly bar chart showing weekly totals for the current month
- [ ] Toggle between Weekly and Monthly views
- [ ] Highlight the highest earning day/week bar in gold
- [ ] Show total earnings and trip count for the selected period above the chart
- [ ] Chart built with react-native-svg (no external chart library needed)
- [ ] Data loaded from Firestore rides collection filtered by driver_id and date range

## Hubtel Daily Commission Integration (Jun 17)

- [ ] Store HUBTEL_API_ID and HUBTEL_API_KEY as server environment secrets
- [ ] Server endpoint POST /api/driver/charge-commission — debit driver MoMo via Hubtel DebitMobileAccount
- [ ] Charge GH₵50 for car drivers, GH₵30 for Okada/Delivery
- [ ] Check daily_commissions Firestore collection to prevent double-charging on same day
- [ ] Save commission record to daily_commissions with status (success/failed) and Hubtel transaction ID
- [ ] Driver app triggers commission charge when driver goes online for the first time each day
- [ ] Earnings screen shows today's commission payment status (Paid / Pending / Failed)
- [ ] Failed payment shows retry button and warning banner

## Hubtel Automatic Daily Commission (Jun 17)

- [x] Server: `commission.charge` tRPC endpoint — calls Hubtel Receive Money API with POS 5809
- [x] Server: `commission.getStatus` tRPC endpoint — check today's commission status for a driver
- [x] Driver registration: add MoMo network selector (MTN / Vodafone / AirtelTigo) — saved to Firestore as `momo_network`
- [x] Driver profile: add MoMo network field to DriverProfile interface
- [x] CommissionGate: replace manual reference submission with automatic Hubtel charge flow
- [x] CommissionGate: show USSD prompt instruction (driver approves on phone)
- [x] CommissionGate: poll for Hubtel payment status (processing → paid/failed)
- [x] Driver earnings tab: show today's commission status card (paid/processing/failed + retry)

## Hubtel Webhook & Admin Dashboard (Jun 17)

- [x] Server: `POST /api/hubtel/callback` webhook endpoint to receive Hubtel payment confirmations
- [x] Webhook: verify Hubtel signature and update commission record from `processing` → `paid`/`failed`
- [x] Admin dashboard: list all drivers' daily commissions with status (paid/processing/failed)
- [x] Admin dashboard: manual override button to mark commission as paid or failed
- [x] Admin dashboard: filter by date range and driver name
- [x] tRPC endpoints: `commission.listForAdmin` and `commission.overrideStatus` (placeholder, needs admin auth)

## Admin Auth & Dashboard Wiring (Jun 18)

- [ ] Fix server-side Firebase import (hubtelWebhook.ts imports react-native via lib/firebase.ts)
- [ ] Create server/firebaseAdmin.ts using firebase-admin SDK (no React Native dependency)
- [ ] Add admin auth middleware to tRPC context (verify Firebase ID token + admin claim)
- [ ] Implement commission.listForAdmin with real Firestore query via firebase-admin
- [ ] Implement commission.overrideStatus with real Firestore update via firebase-admin
- [ ] Wire admin-commission.html to tRPC API (fetch commissions, execute overrides)
- [ ] Add admin login gate to admin-commission.html (Firebase Auth web SDK)

## Commission Flow Fix (Jun 18)

- [x] CommissionGate: check for 'paid' status in addition to 'confirmed'
- [x] Driver home: add midnight reset logic to clear daily commission at 00:00
- [ ] Admin dashboard: wire to real tRPC API (fetch commissions, execute overrides)

## Admin Dashboard Wiring (Jun 18)

- [x] Wire admin-commission.html to real tRPC API (commission.listForAdmin, commission.overrideStatus)
- [x] Add admin PIN login gate to dashboard (PIN verified server-side via /api/admin/verify-pin)
- [x] Show live stats: total/paid/processing/failed counts + GH₵ revenue collected
- [x] Override modal calls real overrideStatus mutation with reason field

## Wallet System (Jun 18)

- [ ] Server: wallet.topup tRPC endpoint — calls Hubtel Receive Money for rider top-up
- [ ] Server: wallet.getBalance tRPC endpoint — fetch rider/driver wallet balance from Firestore
- [ ] Server: wallet.getTransactions tRPC endpoint — fetch wallet transaction history
- [ ] Server: wallet.transfer tRPC endpoint — transfer fare from rider wallet to driver wallet on ride completion
- [ ] Hubtel webhook: handle wallet top-up callback and credit rider wallet
- [ ] Rider app: Wallet screen with balance display and top-up flow (Hubtel MoMo prompt)
- [ ] Rider app: payment method selector — choose wallet or MoMo on ride booking
- [ ] Driver app: earnings screen shows live wallet balance from Firestore
- [ ] Ride completion: auto-deduct fare from rider wallet and credit driver wallet

## Rider Wallet Top-Up (Jun 18)

- [x] Server: wallet.topup tRPC endpoint — calls Hubtel Receive Money for rider top-up
- [x] Server: wallet.getBalance tRPC endpoint — fetch rider wallet balance
- [x] Server: wallet.getTransactions tRPC endpoint — fetch wallet transaction history
- [x] Hubtel webhook: handle wallet top-up callback and credit rider wallet in Firestore
- [x] Rider wallet screen: replace "Coming Soon" with real Hubtel MoMo flow
- [x] Rider wallet screen: USSD prompt → polling → success/failure feedback
- [x] Rider wallet screen: live balance from Firestore (real-time listener)
- [x] Ride completion: deduct fare from rider wallet, credit driver wallet
- [x] Hubtel credentials: API ID and API Key set correctly in hubtel.ts

## Time-Sensitive Surge Pricing (Jun 20)

- [x] Add time-sensitive surge indicator (peak hours: 7-9am, 12-1pm, 5-8pm)
- [x] Show "High Demand" badge with countdown timer on booking sheet
- [x] Display time window when surge will end (e.g., "High demand until 9:00 AM")
- [x] Add surge timer component to active ride card
- [ ] Implement surge schedule logic in backend (peak hours vary by day)
- [ ] Show historical surge patterns in activity tab

## Booking Fee (Jun 27)

- [x] Add GH₵2.50 booking fee to all ride categories
- [x] Update fare calculation functions to include booking fee
- [x] Display booking fee breakdown in fare summary (Base fare + distance + Booking fee)
- [x] Show booking fee as separate line item in booking sheet

## Tip Option at Checkout (Jun 27)

- [x] Add tip selector to booking sheet (10%, 15%, 20% quick buttons)
- [x] Custom tip input field for flexible amounts
- [x] Display selected tip amount in real-time
- [x] Show tip in fare breakdown (Base fare + Booking fee + Tip)
- [x] Tip included in total fare calculation
