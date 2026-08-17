# Uber and Bolt Rider Feature Research

## Scope and caveat

This comparison uses official Uber and Bolt product, safety, and app-store materials retrieved on 17 August 2026. Availability varies by country, city, ride type, and account, so HY3N should implement locally appropriate variants for Ghana rather than copying every global feature blindly.

## Verified Uber capabilities

Uber's official rider feature guide describes live trip sharing with driver, vehicle, and location details; trusted contacts; multiple destinations/stops; scheduled rides; and in-app fare splitting. Uber's official safety page describes emergency help with live location and trip details, RideCheck-style anomaly/crash detection, 24/7 safety support, privacy-protected phone communication, and concealed specific pickup/dropoff addresses in driver trip history.

Source: https://www.uber.com/ug/en/blog/uber-app-features/
Source: https://www.uber.com/us/en/safety/

## Verified Bolt capabilities

Bolt's official rides page describes immediate and advance booking, budget-to-premium ride types, Emergency Assist, Ride Check for unexpected or excessively long stops, shareable live location with vehicle details, private phone details, 24/7 support, pickup codes, upfront price estimates, and cash/card/mobile-payment options. Bolt states that advance reservations may be available up to 90 days, subject to location.

Bolt's official iOS listing additionally describes real-time driver tracking, multiple payment methods, emergency assist, audio trip recording, private contact details, scheduled rides from 30 minutes to 90 days, Comfort/Premium/Electric/XL options, package delivery, and Bolt Plus membership benefits. The listing states that features differ by location.

Source: https://bolt.eu/en/rides/
Source: https://apps.apple.com/us/app/bolt-request-a-ride/id675033630

## Feature parity candidates for HY3N

| Area | Uber/Bolt pattern | HY3N implementation direction |
|---|---|---|
| Booking | Destination search, upfront estimate, ride categories, stops, schedule | Keep current flow; add robust category cards, explicit estimate expiry, stop editing, and clear schedule states |
| Tracking | Live driver marker, ETA, route progress, shareable trip | Keep current tracking; add pickup-code/PIN surface, route deviation and long-stop states |
| Safety | SOS/emergency assist, trusted contacts, privacy, ride anomaly monitoring, support | Keep SOS/trusted contacts; add emergency call/location payload, RideCheck-style local alerts, safety incident entry points |
| Communication | Masked phone/contact channel, in-ride support | Keep chat/call affordances; route all communication through the separate backend service |
| Payments | Upfront price, cash/card/mobile payments, wallet/balance, receipts | Keep Ghana payment methods; add payment-method lock after booking, receipt detail, payment failure recovery |
| Scheduling | Advance reservation and cancellation/reschedule rules | Keep schedule flow; make availability window and cancellation policy explicit for Ghana |
| Ride options | Budget/premium/XL/electric/women-for-women where locally available | Use HY3N categories and only expose options supported by the separate backend/driver supply |
| Post-ride | Rating, support, receipts, lost item/reporting | Keep rating/receipt flow; add structured issue categories and support handoff |
| Account/retention | Saved places, trip history, promotions, subscriptions/loyalty | Keep account/wallet/history; prioritize saved places, promo integrity, loyalty, and notifications |

## Non-goals for the mobile-only repository

Do not add server, database, webhook, dispatch, payment authorization, or driver-supply logic to this repository. Any new data contract must call the separate `hy3n-backend` service through the existing API boundary and be implemented in that backend repository separately when required.
