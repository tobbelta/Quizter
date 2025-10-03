# Guide: Sätt upp Automatisk Deployment till Firebase

Detta är en guide för att konfigurera ditt GitHub-repository så att det automatiskt bygger och publicerar din GeoQuest-app till Firebase varje gång du gör en ändring i `main`-branchen.

## Processen i Två Delar

1.  **Spara hemligheter:** Du behöver spara olika hemligheter på två ställen: **GitHub Secrets** (för att den automatiska processen ska kunna köra) och **Google Secret Manager** (där dina funktioner hämtar API-nycklar i produktion).
2.  **Automatisk Deployment:** När hemligheterna är sparade kommer `deploy.yml`-filen i ditt projekt att automatiskt driftsätta ny kod som pushas till `main`.

---

### Steg 1: Spara Hemligheter för GitHub Actions

Dessa hemligheter behövs för att GitHub ska kunna autentisera mot Google Cloud och bygga din React-app.

1.  **Gå till ditt repository på GitHub.com.**
2.  Klicka på fliken **Settings**.
3.  I menyn till vänster, navigera till **Secrets and variables > Actions**.
4.  Klicka på **New repository secret** för varje hemlighet nedan.

**Du ska skapa TRE hemligheter här:**

**1. Firebase Service Account**
- **Namn:** `FIREBASE_SERVICE_ACCOUNT_GEOQUEST2`
- **Värde:**
    1. Gå till [Firebase Console](https://console.firebase.google.com/).
    2. Välj ditt projekt (`geoquest2-7e45c`).
    3. Klicka på kugghjulet (⚙️) och välj **Project settings**.
    4. Gå till fliken **Service accounts**.
    5. Klicka på **Generate new private key**. En JSON-fil laddas ner.
    6. Klistra in **hela innehållet** från JSON-filen som värde för denna secret.

**2. Firebase Config för React-appen**
- **Namn:** `REACT_APP_FIREBASE_CONFIG`
- **Värde:**
    1. I Firebase Console, gå till **Project settings**.
    2. Under "Your apps", välj din webb-app.
    3. Välj "Config" för att se din `firebaseConfig`-variabel.
    4. Kopiera **hela JavaScript-objektet** (från `{` till `}`).

**3. OpenRouteService API-nyckel**
- **Namn:** `REACT_APP_OPENROUTE_API_KEY`
- **Värde:** Din API-nyckel från [OpenRouteService](https://openrouteservice.org/). Du hittar den i din lokala `.env`-fil.

---

### Steg 2: Spara API-nycklar i Google Secret Manager (Engångsåtgärd)

Dina funktioner är konfigurerade för att säkert hämta API-nycklar från Google Secret Manager. Du behöver bara ladda upp dem dit **en enda gång** från din lokala terminal.

Öppna en terminal i projektmappen `c:\Geo\geoquest2` och kör följande kommandon. Ersätt `<DIN_NYCKEL_HÄR>` med dina faktiska API-nycklar.

**VIKTIGT: Undvik att spara dessa kommandon i din terminalhistorik eller i ett skript, då det exponerar din hemlighet.**

**1. Sätt Gemini API-nyckel:**
```shell
echo "<DIN_GEMINI_NYCKEL_HÄR>" | firebase functions:secrets:set GEMINI_API_KEY --project geoquest2-7e45c
```

**2. Sätt OpenAI API-nyckel:**
```shell
echo "<DIN_OPENAI_NYCKEL_HÄR>" | firebase functions:secrets:set OPENAI_API_KEY --project geoquest2-7e45c
```

**3. Sätt Anthropic API-nyckel:**
```shell
echo "<DIN_ANTHROPIC_NYCKEL_HÄR>" | firebase functions:secrets:set ANTHROPIC_API_KEY --project geoquest2-7e45c
```

**4. Sätt Stripe API-nyckel:**
```shell
echo "<DIN_STRIPE_NYCKEL_HÄR>" | firebase functions:secrets:set STRIPE_SECRET_KEY --project geoquest2-7e45c
```

---

### Steg 3: Klart!

Nu är allt korrekt konfigurerat. När du committar och pushar den uppdaterade `deploy.yml` och denna guide till `main`-branchen, kommer den automatiska deploymenten att fungera.

---

### Valfritt: Manuell Deployment

Om du snabbt vill driftsätta ändringar utan att gå via GitHub kan du använda följande kommandon från din lokala terminal.

**Driftsätt allt (både frontend och backend):**
```shell
npm run build && firebase deploy --project geoquest2-7e45c
```

**Driftsätt ENDAST funktioner (backend):**
Om du bara har gjort ändringar i `functions`-mappen kan du köra detta kommando för en snabbare uppdatering av din backend-logik.
```shell
firebase deploy --only functions --project geoquest2-7e45c
```

**Anpassa automatisk deployment:**
Om du vill att den automatiska processen på GitHub *endast* ska driftsätta funktioner, kan du ändra det sista steget i `.github/workflows/deploy.yml` till:
`firebase deploy --project geoquest2-7e45c --only functions`
