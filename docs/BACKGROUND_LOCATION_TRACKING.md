# Background Location Tracking - Implementation Guide

## Problem
GPS-tracking fungerar endast när appen är öppen och skärmen är på. När användaren stänger av skärmen eller minimerar appen slutar GPS-uppdateringarna.

## Lösning
Implementerat background location tracking med följande komponenter:

### 1. Installerade paket
```bash
npm install @capacitor-community/background-geolocation
npm install @capacitor/local-notifications
npm install @capacitor/haptics
```

### 2. Background Location Service
**Fil**: `src/services/backgroundLocationService.js`

**Funktionalitet**:
- Spårar GPS även när appen är i bakgrunden
- Beräknar distans kontinuerligt
- Vibrerar när distanströskeln nås
- Visar push-notifikation när fråga är klar
- Fungerar både på native (Android/iOS) och webb (begränsat)

**API**:
```javascript
import backgroundLocationService from './services/backgroundLocationService';

// Starta tracking
await backgroundLocationService.startTracking({
  distanceBetweenQuestions: 500,
  onDistanceReached: (data) => {
    console.log('Question ready!', data);
  }
});

// Lyssna på updates
const unsubscribe = backgroundLocationService.addListener((data) => {
  console.log('Distance update:', data.totalDistance);
});

// Stoppa tracking
await backgroundLocationService.stopTracking();

// Återställ efter svarad fråga
backgroundLocationService.resetDistance();
```

### 3. Native Setup - MÅSTE GÖRAS

#### Steg 1: Bygg appen först
```bash
npm run build
```

#### Steg 2: Synca Capacitor (detta skapar native project files)
```bash
npx cap sync android
npx cap sync ios
```

#### Steg 3: Android Permissions
Efter sync, öppna `android/app/src/main/AndroidManifest.xml` och lägg till:
```xml
<!-- GPS tracking permissions -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

<!-- Background service -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />

<!-- Notifications and vibration -->
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Synca igen:
```bash
npx cap sync android
```

#### iOS (ios/App/App/Info.plist)
Lägg till location permissions:
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>GeoQuest behöver din plats för att visa frågor när du går.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>GeoQuest behöver spåra din plats även i bakgrunden för att trigga frågor baserat på distans.</string>
<key>UIBackgroundModes</key>
<array>
    <string>location</string>
</array>
```

Synca Capacitor:
```bash
npx cap sync ios
```

### 4. Integrera i PlayRunPage
**TODO**: Uppdatera `src/views/PlayRunPage.js` för att använda `backgroundLocationService` istället för `useDistanceTracking` på native platforms.

```javascript
import { Capacitor } from '@capacitor/core';
import backgroundLocationService from '../services/backgroundLocationService';

// I PlayRunPage component
useEffect(() => {
  const isNative = Capacitor.isNativePlatform();
  const isDistanceBased = currentRun?.type === 'distance-based';
  
  if (isNative && isDistanceBased && trackingEnabled) {
    // Använd background service på native
    backgroundLocationService.startTracking({
      distanceBetweenQuestions: currentRun.distanceBetweenQuestions || 500,
      onDistanceReached: () => {
        // Visa fråga
        setQuestionVisible(true);
      }
    });

    // Lyssna på updates för UI
    const unsubscribe = backgroundLocationService.addListener((data) => {
      setTotalDistance(data.totalDistance);
      setDistanceToNext(data.distanceSinceLastQuestion);
    });

    return () => {
      backgroundLocationService.stopTracking();
      unsubscribe();
    };
  }
}, [currentRun, trackingEnabled]);
```

### 5. Testa

#### På Android:
1. Bygg appen: `npm run build`
2. Synca: `npx cap sync android`
3. Öppna i Android Studio: `npx cap open android`
4. Kör på enhet (inte emulator för GPS)
5. Ge location permissions
6. Starta en distance-based runda
7. Lägg telefonen i fickan (skärm släckt)
8. Gå 500m
9. Telefonen ska vibrera och visa notifikation

#### På iOS:
1. Bygg: `npm run build`
2. Synca: `npx cap sync ios`
3. Öppna i Xcode: `npx cap open ios`
4. Signera med Apple Developer Account
5. Kör på fysisk enhet
6. Samma testprocess som Android

#### På Webb (begränsat):
- Fungerar endast när appen är öppen i förgrunden
- Ingen background tracking möjlig
- Ingen vibration/notifikationer (eller begränsade)

### 6. Batterioptimeringar
Background location tracking drar mycket batteri. Överväganden:

**Implementerade optimeringar**:
- `distanceFilter: 10` - uppdatera var 10:e meter
- Accuracy-filtrering - ignorera dålig GPS
- Outlier-filtrering - ignorera stora hopp

**Framtida optimeringar**:
- Dynamisk update-frekvens baserat på hastighet
- Pausa tracking när användaren är still (geofencing)
- Visa batteri-varning till användare

### 7. Privacy & Permissions
**VIKTIGT**: Informera användare tydligt om:
- Varför background location behövs
- Hur data används (endast för spelet, ej lagrad långsiktigt)
- Hur de kan stänga av tracking

Lägg till i privacy policy och visa consent-dialog vid första start.

## Status
- ✅ Background location service implementerad
- ✅ NPM-paket installerade
- ⏳ Android permissions (behöver läggas till manuellt)
- ⏳ iOS permissions (behöver läggas till manuellt)
- ⏳ Integrera i PlayRunPage
- ⏳ Testa på fysisk enhet
- ⏳ Privacy policy uppdatering

## Nästa steg
1. Lägg till Android permissions i AndroidManifest.xml
2. Lägg till iOS permissions i Info.plist
3. Synca Capacitor
4. Uppdatera PlayRunPage för att använda service
5. Bygg och testa på fysisk enhet
