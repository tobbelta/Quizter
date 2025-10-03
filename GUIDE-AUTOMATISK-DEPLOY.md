# Guide: Sätt upp Automatisk Deployment till Firebase

Detta är en guide för att konfigurera ditt GitHub-repository så att det automatiskt bygger och publicerar din GeoQuest-app till Firebase varje gång du gör en ändring i `main`-branchen.

Processen använder GitHub Actions och filen `.github/workflows/deploy.yml` som nu finns i ditt projekt.

## Förutsättningar

- Du har ett Firebase-projekt.
- Du har ett GitHub-repository för ditt projekt.

---

### Steg 1: Lägg till Secrets på GitHub

Hemligheter (Secrets) är ett säkert sätt att lagra känslig information (som dina API-nycklar och konfigurationer) i ditt GitHub-repository utan att de syns i koden. Flödet i `deploy.yml` är beroende av dessa.

1.  **Gå till ditt repository på GitHub.com.**
2.  Klicka på fliken **Settings**.
3.  I menyn till vänster, navigera till **Secrets and variables > Actions**.
4.  Klicka på knappen **New repository secret** för varje hemlighet nedan.

Du ska nu skapa **fem** hemligheter:

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

**3. Gemini API-nyckel**
- **Namn:** `GEMINI_API_KEY`
- **Värde:** Din API-nyckel för Google AI / Gemini.

**4. OpenAI API-nyckel**
- **Namn:** `OPENAI_API_KEY`
- **Värde:** Din API-nyckel för OpenAI.

**5. Anthropic API-nyckel**
- **Namn:** `ANTHROPIC_API_KEY`
- **Värde:** Din API-nyckel för Anthropic.

---

### Steg 2: Verifiera och Pusha

Nu när du har den nya `deploy.yml`-filen och har lagt till alla hemligheter på GitHub är allt klart.

1.  **Committa och pusha** ändringarna till din `main`-branch. Detta laddar upp `deploy.yml`-filen och aktiverar den automatiska processen.

### Steg 3: Klart!

Nästa gång du pushar en ändring till `main` kommer GitHub automatiskt att starta bygg- och deployment-processen. Du kan följa förloppet under "Actions"-fliken i ditt GitHub-repository. Efter några minuter kommer din live-app att vara uppdaterad!