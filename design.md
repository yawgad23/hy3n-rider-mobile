# HY3N Rider App Interface Design

## Product direction

HY3N is a Ghana-focused ride-hailing experience designed for fast, confident one-handed booking on a portrait mobile screen. The interface uses a calm dark navy foundation, warm gold accents for the HY3N brand, and clear green, amber, and red status colors for ride progress, demand, and safety states. The interaction model follows mainstream iOS conventions: large tap targets, bottom sheets for booking decisions, inline validation, system share sheets, and restrained motion.

## Screen list

| Screen | Primary content and functionality |
|---|---|
| Login | HY3N logo, “Akwaaba Ba Hy3n”, “Welcome to Hy3n”, Ghana premium ride-hailing tagline, phone/email and password fields, persistent-session restoration, sign-in, password recovery, and validation feedback. |
| Home / Book a ride | Pickup and destination search, current location, ride category cards, live fare estimate, peak-demand indicator, booking fee, tip selector, promo code, Now/Schedule choice, Book for Someone toggle, recipient details, and booking confirmation. |
| Active rides | A stack or list of all active rides, with a badge count in the tab bar. Each ride card shows status, category, pickup, destination, live fare, booking fee, surge period, driver ETA, and a route/map entry point. |
| Active ride map | Map with pickup, destination, and animated driver marker; driver photo/name/rating/vehicle card; distance to pickup; ETA countdown; actual-distance fare updates; call/message/safety actions; and ride completion handling. |
| Post-ride review | Completion summary, five-star rating, emoji feedback, selectable tags, optional comment, tip confirmation, receipt preview, and native share action. |
| Activity / History | Upcoming scheduled rides, completed rides, cancelled rides, fare receipts, rating history, and tap-through ride detail. |
| Account / Profile | Rider profile, phone/email, saved recipient details, payment preferences, notification settings, help and support, legal links, and sign out. |
| Support | FAQ categories, issue selection, ride-specific support entry, contact options, and safety guidance. |

## Key user flows

### Book a ride for self

1. User opens Home and confirms or edits pickup and destination.
2. User selects a ride category and reviews the estimate.
3. If demand is elevated, the booking sheet shows the named peak period, multiplier context, and countdown until the period ends.
4. User optionally selects a tip, adds a promo code, and confirms the GH₵2.50 booking fee in the fare breakdown.
5. User taps Book now and sees the new ride in Active rides without blocking other ride bookings.

### Book for someone else

1. User opens the booking sheet and enables Book for Someone.
2. The sheet reveals recipient name, phone, and pickup address fields with inline validation.
3. User reviews the recipient summary and fare breakdown, then confirms the booking.
4. Recipient information is saved with the ride record so driver-facing surfaces can show the correct passenger details.

### Monitor an active ride

1. User opens any active ride card.
2. The map centers on the route and interpolates the driver marker between location updates.
3. The driver card shows driver identity, rating, vehicle, live distance to pickup, and a second-by-second ETA countdown.
4. During the ride, actual traveled distance updates the fare; the UI distinguishes estimate, booking fee, surge adjustment, tip, and current total.
5. When the ride completes, the Post-ride review modal opens and the receipt can be shared.

### Multiple simultaneous rides

1. User books a second ride while one or more rides are active.
2. The active-rides state stores each ride independently with its own status, fare, driver, tracking listener, and timers.
3. The tab badge reflects the number of rides that are not completed or cancelled.
4. Selecting a ride opens only that ride’s map and controls; completing one ride leaves the others available.

## Visual system

| Token | Choice | Usage |
|---|---|---|
| Base background | `#07111F` | Main app background and map overlay surfaces. |
| Elevated surface | `#102238` | Cards, sheets, inputs, and active ride containers. |
| HY3N gold | `#F5B942` | Logo-adjacent accents, primary actions, selected ride state, and tips. |
| Soft gold | `#FFD978` | Secondary highlights and fare emphasis. |
| Primary text | `#F7FAFC` | Headings and key ride details. |
| Secondary text | `#A7B6C8` | Supporting labels and helper copy. |
| Success green | `#35C98A` | Driver arrived, ride active, and completion states. |
| Demand amber | `#F59E0B` | Surge/high-demand banners and countdowns. |
| Safety/error red | `#F45B69` | Cancellations, validation errors, and urgent safety states. |
| Divider | `#223A55` | Subtle card and section separation. |

## Interaction and accessibility rules

All primary controls use at least a 44-point touch target. Bottom sheets keep the primary confirmation action above the home indicator and tab bar. Text labels accompany status colors so demand and ride states are not communicated by color alone. Motion is limited to short, purposeful transitions: 80–300 ms for interaction feedback and smooth driver-marker interpolation between GPS updates. The app must continue to show an explicit loading or unavailable state when live driver data is missing rather than rendering invented coordinates or fares.
