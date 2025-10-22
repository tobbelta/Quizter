# 🚀 Native Android Build - Steg-för-steg Guide

## ✅ Vad som är klart

1. **React app byggd** ✅
   - `npm run build` kördes framgångsrikt
   - Build finns i `/build` mappen

2. **Capacitor installerat** ✅
   - @capacitor/cli
   - @capacitor/core
   - @capacitor/android
   - capacitor.config.json skapad

3. **Android projekt syncad** ✅
   - `npx cap sync android` kördes
   - Plugins registrerade:
     * @capacitor-community/background-geolocation
     * @capacitor/haptics
     * @capacitor/local-notifications

4. **Permissions tillagda** ✅
   - AndroidManifest.xml skapad med alla permissions:
     * GPS (ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, ACCESS_BACKGROUND_LOCATION)
     * Foreground service (FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION)
     * Notifications (POST_NOTIFICATIONS)
     * Vibration (VIBRATE)

## 📱 Nästa Steg - Bygg och Testa

### Option 1: Bygg med Android Studio (Rekommenderat)

**A. Installera Android Studio**
1. Ladda ner från: https://developer.android.com/studio
2. Installera med standard-inställningar
3. Öppna och följ setup-guiden (ladda ner SDKs, etc.)

**B. Öppna projektet**
```bash
npx cap open android
```
Eller manuellt: Öppna mappen `c:\Geo\geoquest2\android` i Android Studio

**C. Bygg och kör**
1. Anslut Android-telefon via USB
2. Aktivera "Developer Options" + "USB Debugging" på telefonen
3. I Android Studio: Klicka Run (gröna play-knappen)
4. Välj din enhet från listan
5. Vänta på byggning och installation

### Option 2: Bygg via Terminal (Kräver Android SDK)

```bash
# Bygg APK
cd android
./gradlew assembleDebug

# Installera på ansluten enhet
./gradlew installDebug

# Eller både och
./gradlew build installDebug
```

APK finns sedan i: `android/app/build/outputs/apk/debug/app-debug.apk`

## 🧪 Testa Background Location Tracking

### 1. Första gången du kör appen
- Appen kommer be om permissions:
  * Location (Allow all the time)
  * Notifications (Allow)
- **Viktigt**: Välj "Allow all the time" för location!

### 2. Skapa en distance-based runda
1. Öppna appen på telefonen
2. Logga in
3. Skapa ny runda → Välj "🚶 Distans-baserad"
4. Sätt distans till 100m (för snabb testning)
5. Välj 5 frågor
6. Generera

### 3. Starta rundan
1. Anslut till rundan med koden
2. Se att GPS-tracking startar
3. Lägg telefonen i fickan (skärm släckt!)

### 4. Gå utomhus
- Gå ca 100m (runt kvarteret)
- Telefonen ska vibrera när du gått 100m
- Du får en notifikation: "Ny fråga väntar! 🎯"
- Öppna appen → frågan visas direkt

### 5. Fortsätt
- Svara på frågan
- Telefonen återställer distansräknaren
- Gå 100m till
- Repeat

## 🐛 Felsökning

### "App won't install"
- Avinstallera gammal version först
- Eller ändra versionsnummer i `android/app/build.gradle`

### "Permissions denied"
- Kontrollera att AndroidManifest.xml har alla permissions
- Kör `npx cap sync android` igen
- Rebuild

### "GPS fungerar inte"
- Testa utomhus (inte inomhus)
- Vänta 30-60 sek för GPS-fix
- Kontrollera Location är "Allow all the time"

### "Ingen background tracking"
- Kontrollera Battery Optimization är AV för GeoQuest
- Gå till Settings → Apps → GeoQuest → Battery → Unrestricted

### "Loggar"
För att se vad som händer:
```bash
# Android logs
adb logcat | grep -i geoquest
# eller
adb logcat | grep -i capacitor
```

## 📊 Status efter test

När du har testat, uppdatera här:
- [ ] App installerad på telefon
- [ ] Permissions givna
- [ ] Distance-based runda skapad
- [ ] Background tracking fungerar
- [ ] Vibration fungerar
- [ ] Notifikationer visas
- [ ] Frågor triggas korrekt

## 🎯 Framtida förbättringar

- [ ] iOS build (kräver Mac + Apple Developer Account)
- [ ] Signera APK för Google Play
- [ ] Batterioptimeringar
- [ ] Bättre felhantering för permissions
- [ ] Offline-support

---

**Nästa commit**: Efter test, dokumentera resultat och eventuella bugfixes!
