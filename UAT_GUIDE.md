# HY3N Rider App — User Acceptance Testing (UAT) Guide

## Overview

This guide walks through end-to-end testing of the HY3N Rider App with real drivers and riders. The test validates the complete ride-to-payment flow, including wallet settlement and commission charging via Hubtel.

---

## Prerequisites

### Setup Requirements

1. **Rider Account** — Create a test rider account with wallet balance ≥ GH₵100
2. **Driver Account** — Create a test driver account with MoMo number (MTN/Vodafone/Tigo)
3. **Hubtel Test Mode** — Confirm Hubtel "Receive Money" scope is enabled on API `295WvzM`
4. **Firebase Console Access** — For monitoring Firestore records in real-time
5. **Test Environment** — Use staging/development environment, NOT production

### Accounts to Create

| Role | Phone | MoMo Network | Wallet Balance |
|------|-------|--------------|-----------------|
| Rider 1 | 0244123456 | (any) | GH₵150 |
| Driver 1 | 0244654321 | MTN | GH₵0 (will earn) |
| Driver 2 | 0244987654 | Vodafone | GH₵0 (will earn) |

---

## Test Scenario 1: Complete Ride Flow (Rider → Driver → Payment)

### Objective
Verify that a rider can book a ride, a driver accepts, ride completes, and wallet settles correctly.

### Test Steps

#### Step 1: Rider Books a Ride
1. Open HY3N Rider App as **Rider 1** (0244123456)
2. Tap **"Book a Ride"**
3. Select ride category: **Standard** (GH₵15 base fare)
4. Enter destination: **Osu, Accra** (≈5 km)
5. Select payment method: **Wallet**
6. Tap **"Book Ride"**

**Expected Result:**
- Ride status: **"Searching for driver..."**
- Estimated fare: **GH₵25** (including surge if applicable)
- Wallet balance: **GH₵150** (not deducted yet)

#### Step 2: Driver Accepts Ride
1. Open HY3N Driver App as **Driver 1** (0244654321)
2. Incoming ride notification appears
3. Tap **"Accept Ride"**
4. Driver location updates on rider's map
5. Driver status: **"Arriving in 3 minutes"**

**Expected Result:**
- Rider sees driver name, vehicle, and plate number
- Driver sees pickup and destination on map
- Real-time location tracking active

#### Step 3: Driver Arrives & Ride Starts
1. Driver taps **"I've arrived"** when at pickup location
2. Rider confirms pickup
3. Driver taps **"Start Ride"**

**Expected Result:**
- Ride status changes to **"In Progress"**
- Timer starts counting ride duration
- Waiting time counter begins (if applicable)

#### Step 4: Ride Completes
1. Driver navigates to destination
2. Driver taps **"End Ride"** at destination
3. Rider confirms arrival
4. System calculates final fare (base + distance + waiting time + surge)

**Expected Result:**
- Ride status: **"Completed"**
- Final fare: **GH₵25** (or higher with surge)
- Rider receives receipt with breakdown

#### Step 5: Verify Wallet Settlement
1. **Rider's App:**
   - Open **Wallet** tab
   - Check balance: Should be **GH₵125** (150 - 25)
   - Open **Transaction History**
   - Verify transaction: "Ride to Osu, Accra" | Debit | GH₵25 | ✓

2. **Driver's App:**
   - Open **Wallet** tab
   - Check balance: Should be **GH₵25** (0 + 25)
   - Open **Transaction History**
   - Verify transaction: "Ride fare from [pickup]" | Credit | GH₵25 | ✓

3. **Firebase Console:**
   - Navigate to **Firestore** → **wallets** collection
   - Verify rider wallet: `balance: 125, total_spent: 25`
   - Verify driver wallet: `balance: 25, total_earned: 25`
   - Check **wallet_transactions** collection for both records

**Expected Result:**
- ✅ Rider balance reduced by fare amount
- ✅ Driver balance increased by fare amount
- ✅ Both transactions recorded in Firestore
- ✅ Transaction metadata includes ride ID and counterparty info

---

## Test Scenario 2: Commission Charging via Hubtel

### Objective
Verify that daily driver commissions are charged correctly via Hubtel USSD.

### Test Steps

#### Step 1: Trigger Commission Charge
1. Open **Admin Dashboard** (if available) or use Firebase Console
2. Manually trigger commission charge for **Driver 1** (0244654321)
   - Service type: **Standard** (Car driver)
   - Expected commission: **GH₵50**
   - MoMo network: **MTN**
   - Date: **Today**

**Alternative (via API):**
```bash
curl -X POST http://localhost:3000/api/trpc/commission.charge \
  -H "Content-Type: application/json" \
  -d '{
    "driverId": "driver1_uid",
    "driverName": "John Doe",
    "momoNumber": "0244654321",
    "momoNetwork": "mtn-gh",
    "serviceType": "Standard",
    "date": "2026-06-19"
  }'
```

#### Step 2: Driver Receives USSD Prompt
1. Driver's phone (0244654321) receives USSD notification
2. Driver dials **#123#** (or Hubtel USSD code)
3. USSD menu shows: **"HY3N daily platform fee - 2026-06-19: GH₵50"**
4. Driver selects **"Approve"** and enters MoMo PIN

**Expected Result:**
- ✅ USSD prompt appears on driver's phone
- ✅ Amount shown: GH₵50
- ✅ Driver can approve/decline
- ✅ Confirmation message received

#### Step 3: Verify Commission Status
1. **Driver's App:**
   - Open **Earnings** or **Commissions** tab
   - Check today's commission status
   - Should show: **"Commission: GH₵50 (Paid)"** or **"Pending"**

2. **Firebase Console:**
   - Navigate to **Firestore** → **daily_commissions** collection
   - Find record with `driver_id: "driver1_uid"` and `date: "2026-06-19"`
   - Verify fields:
     - `status: "paid"` (if approved) or `"pending"` (if waiting for webhook)
     - `amount: 50`
     - `hubtel_transaction_id: "..."` (populated after webhook)
     - `hubtel_status: "Success"`

**Expected Result:**
- ✅ Commission charge initiated successfully
- ✅ USSD prompt sent to driver's phone
- ✅ Status updated in Firestore after webhook callback
- ✅ Driver can see commission in app

#### Step 4: Verify Webhook Callback
1. Check **Firebase Console** → **daily_commissions** record
2. Verify `hubtel_webhook_received_at` timestamp is recent
3. Check `hubtel_message` field for confirmation

**Expected Result:**
- ✅ Webhook received and processed
- ✅ Commission status updated to "paid"
- ✅ All Hubtel response data recorded

---

## Test Scenario 3: Multiple Rides & Cumulative Earnings

### Objective
Verify that multiple rides accumulate correctly in driver earnings and wallet.

### Test Steps

#### Step 1: Complete 3 Rides
1. Repeat **Test Scenario 1** three times with different riders
   - Ride 1: GH₵25
   - Ride 2: GH₵35 (longer distance)
   - Ride 3: GH₵20

#### Step 2: Verify Cumulative Earnings
1. **Driver's App:**
   - Open **Wallet** tab
   - Balance should be: **GH₵80** (25 + 35 + 20)
   - `total_earned: 80`

2. **Firebase Console:**
   - Check **wallet_transactions** for driver
   - Should have 3 credit transactions
   - Sum of amounts: **GH₵80**

**Expected Result:**
- ✅ All rides credited to driver wallet
- ✅ Cumulative balance correct
- ✅ Transaction history complete

---

## Test Scenario 4: Error Handling & Edge Cases

### Test Case 4.1: Insufficient Rider Balance
1. Rider with balance **GH₵10** attempts to book ride with **GH₵25** fare
2. Expected: **"Insufficient wallet balance"** error message
3. Rider cannot proceed with booking

### Test Case 4.2: Invalid MoMo Number
1. Attempt to charge commission with invalid phone number (e.g., "123")
2. Expected: **"Invalid phone number"** error from Hubtel
3. Commission charge fails gracefully

### Test Case 4.3: Network Failure During Ride
1. Simulate network outage during ride
2. Expected: App retries connection, resumes when network restored
3. Ride data not lost

### Test Case 4.4: Duplicate Commission Charge
1. Attempt to charge same driver twice on same date
2. Expected: **"Commission already charged for this date"** (idempotency check)
3. No duplicate charges

---

## Verification Checklist

### Wallet Settlement
- [ ] Rider balance decreases by fare amount
- [ ] Driver balance increases by fare amount
- [ ] Both transactions recorded in Firestore
- [ ] Transaction includes ride ID and counterparty info
- [ ] Timestamps are accurate

### Commission Charging
- [ ] Commission amount correct (GH₵50 for cars, GH₵30 for okada)
- [ ] USSD prompt sent to driver's phone
- [ ] Driver can approve/decline
- [ ] Firestore record updated after webhook
- [ ] Status shows "paid" after successful charge

### Security
- [ ] Riders cannot modify wallet balance
- [ ] Drivers cannot modify commission status
- [ ] Only authenticated users can access their data
- [ ] Admins can view all data (for debugging)

### Error Handling
- [ ] Clear error messages for insufficient balance
- [ ] Graceful handling of network failures
- [ ] Idempotency prevents duplicate charges
- [ ] Invalid data rejected with helpful messages

---

## Debugging Tips

### Check Firestore Records
```
Firebase Console → Firestore Database

1. Wallets:
   /wallets/{userId}
   - balance: current wallet balance
   - total_spent: cumulative rider spending
   - total_earned: cumulative driver earnings

2. Transactions:
   /wallet_transactions/{transactionId}
   - user_id: who the transaction is for
   - type: "credit" or "debit"
   - amount: transaction amount
   - description: what the transaction is for
   - date: when it happened

3. Commissions:
   /daily_commissions/{commissionId}
   - driver_id: which driver
   - date: YYYY-MM-DD
   - amount: GH₵50 or GH₵30
   - status: "pending", "paid", or "failed"
   - hubtel_transaction_id: Hubtel's reference
   - hubtel_webhook_received_at: when webhook arrived
```

### Check Server Logs
```
Dev Server Logs (Terminal):
- Look for [Hubtel] messages for commission charging
- Look for [Wallet] messages for settlement
- Look for errors in payment processing

Production Logs (Firebase Cloud Logging):
- Filter by function name: "chargeCommission" or "settleRide"
- Check for errors or warnings
```

### Test Hubtel API Directly
```bash
# Test Hubtel commission charge API
curl -X POST https://rmp.hubtel.com/merchantaccount/merchants/5809/receive/mobilemoney \
  -H "Authorization: Basic $(echo -n '295WvzM:279782ed8a88420ebb629843cfbedf49' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "CustomerMsisdn": "233244654321",
    "Amount": 50,
    "CustomerName": "John Doe",
    "Description": "HY3N daily platform fee",
    "ClientReference": "hy3n-commission-driver1-2026-06-19",
    "Channel": "mtn-gh"
  }'
```

---

## Sign-Off

When all test scenarios pass, have the test lead sign off:

| Item | Tester | Date | Status |
|------|--------|------|--------|
| Scenario 1: Complete Ride Flow | | | ✓ Pass / ✗ Fail |
| Scenario 2: Commission Charging | | | ✓ Pass / ✗ Fail |
| Scenario 3: Multiple Rides | | | ✓ Pass / ✗ Fail |
| Scenario 4: Error Handling | | | ✓ Pass / ✗ Fail |
| Security Verification | | | ✓ Pass / ✗ Fail |

**Overall UAT Status:** ✓ PASS / ✗ FAIL

---

## Next Steps After UAT

1. **Fix any issues found** during testing
2. **Document bugs** in a separate issue tracker
3. **Re-test fixes** before production deployment
4. **Get stakeholder sign-off** on UAT results
5. **Deploy to production** after approval
