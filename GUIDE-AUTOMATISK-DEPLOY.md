# Guide: Sätt upp Automatisk Deployment till Firebase

Detta är en guide för att konfigurera ditt GitHub-repository så att det automatiskt bygger och publicerar din GeoQuest-app till Firebase varje gång du gör en ändring i `main`-branchen.

## Processen i Två Delar

1.  **Spara hemligheter:** Du behöver spara olika hemligheter på två ställen: **GitHub Secrets** (för att den automatiska processen ska kunna köra) och **Google Secret Manager** (där dina funktioner hämtar API-nycklar i produktion).
2.  **Automatisk Deployment:** När hemligheterna är sparade kommer `deploy.yml`-filen i ditt projekt att automatiskt driftsätta ny kod som pushas till `main`.

---

### Steg 1: Spara Hemligheter för GitHub Actions

Dessa hemligheter behövs för att GitHub ska kunna autentisera mot Google Cloud och bygga din React-app. Värdena för alla `REACT_APP_`-variabler hittar du i din lokala `.env`-fil.

1.  **Gå till ditt repository på GitHub.com.**
2.  Klicka på fliken **Settings**.
3.  I menyn till vänster, navigera till **Secrets and variables > Actions**.
4.  Klicka på **New repository secret** för varje hemlighet nedan.

**Du ska skapa följande hemligheter här:**

*   `FIREBASE_SERVICE_ACCOUNT_GEOQUEST2`
    *   **Värde:** Klistra in **hela innehållet** från din `.json`-servicekontofil.

*   `REACT_APP_FIREBASE_API_KEY`
*   `REACT_APP_FIREBASE_AUTH_DOMAIN`
*   `REACT_APP_FIREBASE_PROJECT_ID`
*   `REACT_APP_FIREBASE_STORAGE_BUCKET`
*   `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`
*   `REACT_APP_FIREBASE_APP_ID`
*   `REACT_APP_FIREBASE_MEASUREMENT_ID`
*   `REACT_APP_OPENROUTE_API_KEY`
*   `REACT_APP_STRIPE_PUBLISHABLE_KEY`

---

### Steg 2: Spara API-nycklar i Google Secret Manager (Engångsåtgärd)

Dina funktioner är konfigurerade för att säkert hämta API-nycklar från Google Secret Manager. Du behöver bara ladda upp dem dit **en enda gång** från din lokala terminal.

Öppna en terminal i projektmappen `c:\Geo\geoquest2` och kör följande kommandon.

**1. Sätt Gemini API-nyckel:**
```shell
firebase functions:secrets:set GEMINI_API_KEY --project geoquest2-7e45c
```

**2. Sätt OpenAI API-nyckel:**
```shell
firebase functions:secrets:set OPENAI_API_KEY --project geoquest2-7e45c
```

**3. Sätt Anthropic API-nyckel:**
```shell
firebase functions:secrets:set ANTHROPIC_API_KEY --project geoquest2-7e45c
```

**4. Sätt Stripe API-nyckel:**
```shell
firebase functions:secrets:set STRIPE_SECRET_KEY --project geoquest2-7e45c
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
```shell
firebase deploy --only functions --project geoquest2-7e45c
```
