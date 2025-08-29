# Guide: Sätt upp Automatisk Deployment till Firebase

Detta är en guide för att konfigurera ditt GitHub-repository så att det automatiskt bygger och publicerar din GeoQuest-app till Firebase Hosting varje gång du slår ihop en branch med `main`.

## Förutsättningar

- Du har ett Firebase-projekt och har installerat Firebase CLI (`npm install -g firebase-tools`).
- Du har ett GitHub-repository för ditt projekt.

---

### Steg 1: Hämta din "Service Account"-nyckel

Detta är en säkerhetsnyckel som låter GitHub agera på uppdrag av dig i ditt Firebase-projekt.

1.  **Gå till Firebase Console:** [https://console.firebase.google.com/](https://console.firebase.google.com/)
2.  **Välj ditt projekt.**
3.  Klicka på **kugghjulsikonen** (⚙️) bredvid "Project Overview" och välj **Project settings**.
4.  Klicka på fliken **Service accounts**.
5.  Klicka på knappen **Generate new private key**. En JSON-fil kommer att laddas ner.
6.  **Öppna JSON-filen** i en textredigerare. Du kommer att behöva hela innehållet i nästa steg.

---

### Steg 2: Lägg till "Secrets" på GitHub

Hemligheter (Secrets) är ett säkert sätt att lagra känslig information (som dina API-nycklar) i ditt GitHub-repository utan att de syns i koden.

1.  **Gå till ditt repository på GitHub.com.**
2.  Klicka på fliken **Settings**.
3.  I menyn till vänster, navigera till **Secrets and variables > Actions**.
4.  Klicka på knappen **New repository secret**.

Du ska nu skapa **två** hemligheter:

**Hemlighet 1: Firebase Service Account**
- **Namn:** `FIREBASE_SERVICE_ACCOUNT_GEOQUEST_1C461`
- **Värde (Secret):** Klistra in **hela innehållet** från JSON-filen du laddade ner i Steg 1.

**Hemlighet 2: Firebase Config för din app**
- **Namn:** `REACT_APP_FIREBASE_CONFIG`
- **Värde (Secret):** Gå till din lokala fil `src/firebase.js.local`. Kopiera **hela innehållet** i den filen och klistra in det här.

---

### Steg 3: Ladda upp den nya filen

Nu när du har kört PowerShell-skriptet har du en ny mapp `.github` i ditt projekt.

1.  **Committa och pusha** ändringarna till din `main`-branch. Detta laddar upp `deploy.yml`-filen, vilket aktiverar den automatiska processen.

---

### Steg 4: Testa flödet

Nu är allt klart! Nästa gång du:
1. Skapar en feature branch.
2. Gör ändringar och pushar dem.
3. Slår ihop din feature branch med `main` via en Pull Request.

...så kommer GitHub automatiskt att starta processen. Du kan följa förloppet under "Actions"-fliken i ditt GitHub-repository. Efter några minuter kommer din live-app att vara uppdaterad!
