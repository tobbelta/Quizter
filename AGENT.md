# Agent Analysis

## Problem

A non-authenticated user gets a "Missing or insufficient permissions" error when trying to create a run. The error originates from a Firestore snapshot listener.

## Analysis

1.  The `CreateRunPage.js` component has a UI block that should prevent non-superusers from creating a run. However, if this is bypassed, the user can trigger the `createHostedRun` function.
2.  The `createHostedRun` function creates a new run in Firestore with `status: 'active'`.
3.  After the run is created, the `RunProvider` sets up a real-time listener to the `runs` collection using the `subscribeRuns` function in `firestoreRunGateway.js`.
4.  The `subscribeRuns` function currently fetches *all* runs from the collection.
5.  The `firestore.rules` only allow non-authenticated users to read runs that have `status: 'active'`.
6.  If there are any runs in the database that do not have `status: 'active'` (e.g., old runs, or runs that were created before the `status` field was introduced), the snapshot listener will try to read them, and the request will be denied by Firestore's security rules. This causes the "Missing or insufficient permissions" error.

## Solution

The solution is to modify the `subscribeRuns` function in `src/gateways/firestoreRunGateway.js` to only fetch runs that have `status: 'active'`. This will ensure that the snapshot listener only requests data that the user is allowed to read.
