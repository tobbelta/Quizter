# Handlingsplan för RouteQuest

Detta dokument sammanfattar föreslagna förbättringar, nya funktioner och kända problem för applikationen RouteQuest, baserat på den tekniska analysen.

## Status

- ✅ = Implementerat
- 🔄 = Pågående/Delvis implementerat
- ⏳ = Ej påbörjat

## 1. Förslag på Framtida Förbättringar

### Förslag för kärnfunktioner (Need to have)

1.  ⏳ **Visuell redigerare för rundor:**
    *   **Vad:** Istället för att bara ange en längd, låt den som skapar rundan manuellt klicka ut checkpoints på kartan. Detta ger full kontroll över rutten.
    *   **Varför:** Det skulle möjliggöra mer genomtänkta och skräddarsydda rundor som inte är slumpmässiga, t.ex. en guidad tur förbi specifika sevärdheter.

2.  ⏳ **Slutför Backend-logiken:**
    *   **Vad:** Flytta logiken för att skapa en runda från frontend till de redan förberedda men tomma funktionerna i backend (`createRun`, `generateRoute`).
    *   **Varför:** Detta är en teknisk förbättring som gör appen säkrare (svårare att manipulera data), mer robust och lättare att underhålla och bygga ut i framtiden.
    *   **Status:** Ej implementerat - omfattande arbete krävs för att flytta all rundor-skapande logik från `runFactory.js` till backend.

3.  ⏳ **Förbättrat Offline-stöd:**
    *   **Vad:** En funktion för att ladda ner en hel runda (karta, bilder och frågor) till enheten i förväg.
    *   **Varför:** Garanterar att spelet fungerar felfritt även om användaren har dålig eller ingen internetuppkoppling under promenaden, vilket är en vanlig situation.

4.  ⏳ **Lägg till Gemini som AI-leverantör:**
    *   **Vad:** Integrera Googles Gemini-modell som ett tredje alternativ för att generera frågor.
    *   **Varför:** Ökar robustheten i systemet. Om både Anthropic och OpenAI skulle misslyckas, finns det en ytterligare reserv. Det ger också flexibilitet att i framtiden välja den mest kostnadseffektiva eller högkvalitativa modellen för en given uppgift.
    *   **Hur:** Arkitekturen är redan förberedd för detta. Det skulle innebära att lägga till `@google/generative-ai`-biblioteket, skapa en `geminiQuestionGenerator.js`-tjänst och uppdatera `index.js` för att inkludera Gemini i fallback-kedjan.

### Förslag för engagemang (Nice to have)

1.  ⏳ **Topplistor (Leaderboards):**
    *   **Vad:** Visa en topplista för varje runda baserat på poäng och tid. Kanske även en global topplista för alla spelare.
    *   **Varför:** Skapar en tävlingsaspekt som uppmuntrar spelare att försöka igen för att slå andras eller sina egna rekord.

2.  ⏳ **Publikt bibliotek med rundor:**
    *   **Vad:** En "Utforska"-sida där skapare kan välja att publicera sina rundor så att vem som helst kan hitta och spela dem. Sidan skulle kunna vara sökbar och sorterbar på plats, popularitet, etc.
    *   **Varför:** Ökar innehållet i appen dramatiskt och skapar en community där användare delar med sig av sina skapelser.

3.  ⏳ **Fler frågetyper:**
    *   **Vad:** Utöka bortom flervalsfrågor. Lägg till stöd för bildfrågor ("Vilken byggnad är detta?"), "lucktexter" eller kanske till och med ljudfrågor.
    *   **Varför:** Ger mer variation och gör rundorna roligare och mer kreativa.

4.  ⏳ **Prestationer och Utmärkelser (Achievements):**
    *   **Vad:** Ge spelare digitala medaljer/badges för att uppnå vissa mål, t.ex. "Spelat 10 rundor", "Skapat din första runda", "Fått alla rätt på en svår runda".
    *   **Varför:** Spelifiering (gamification) är ett beprövat sätt att öka användarnas engagemang och få dem att återkomma.

5.  ⏳ **Betyg och recensioner:**
    *   **Vad:** Låt spelare ge en runda ett betyg (1-5 stjärnor) och lämna en kort kommentar efter att de spelat klart.
    *   **Varför:** Hjälper andra att hitta de bästa rundorna och ger värdefull feedback till den som skapat rundan.

6.  ⏳ **Rutter i Grönområden:**
    *   **Vad:** Lägg till en kryssruta vid skapandet av en runda ("Föredra parker & stigar"). Om den är vald, instrueras karttjänsten att generera en rutt som prioriterar stigar och grönområden framför asfalterade vägar.
    *   **Varför:** Tillgodoser önskemål från t.ex. hundägare och naturälskare som vill ha promenader i en trevligare miljö.
    *   **Hur:** Detta är fullt möjligt. **Alternativ 1 (Enkel):** Byt profil i OpenRouteService från `foot-walking` till `foot-hiking`. **Alternativ 2 (Avancerad):** Modifiera anropet till `foot-walking`-profilen med instruktioner att undvika vissa vägtyper eller föredra specifika underlag, vilket ger mer finkornig kontroll.

## 2. Kända Problem och Föreslagna Lösningar

### ✅ Meddelanden uppdateras inte i realtid [LÖST]

*   **Problem:** När en administratör skickar ett meddelande (t.ex. till "alla"), dyker det inte upp i administratörens egen meddelandelista förrän listan öppnas på nytt. Detta beror på att komponenten som visar meddelanden (`MessagesDropdown.js`) endast hämtar data när den initialiseras, inte när ny data blir tillgänglig i databasen.
*   **Lösning:** Refaktorera `messageService.js` till att använda en `onSnapshot`-lyssnare från Firestore istället för en engångshämtning med `getDocs`. Detta skulle göra att nya meddelanden omedelbart "knuffas" till klienten så fort de skapas, vilket ger en äkta realtidsupplevelse.
*   **Status:** ✅ **IMPLEMENTERAT**
    - Lagt till `subscribeToMessages()` funktion i `messageService.js` som använder Firestore's `onSnapshot`
    - Uppdaterat `MessagesDropdown.js` för att använda realtidsuppdateringar
    - Meddelanden uppdateras nu automatiskt i realtid när nya meddelanden skapas

### ⏳ Säkerhetsrisk vid skapande av rundor (Hög prioritet)

*   **Problem:** Eftersom rundor skapas helt på klientsidan (i webbläsaren) kan en tekniskt kunnig användare manipulera koden för att kringgå validering (t.ex. antal frågor) och spara ogiltig data direkt i databasen.
*   **Lösning:** Implementera och använd den förberedda backend-logiken i `functions/index.js` för att skapa rundor. Genom att låta servern validera all data innan den sparas stängs denna säkerhetsrisk.
*   **Status:** ⏳ Ej implementerat - kräver omfattande omstrukturering av `runFactory.js` och backend-funktioner

### 🔄 Reservlösning för rutter kan ge dåliga resultat (Låg prioritet)

*   **Problem:** Om den primära karttjänsten (OpenRouteService) misslyckas, återgår appen till en reservlösning som ritar en geometrisk "fyrkantig" rutt. Denna rutt tar inte hänsyn till verkligheten och kan dras över byggnader eller vatten.
*   **Lösning:** Istället för att visa en potentiellt felaktig rutt, visa ett tydligt felmeddelande för användaren och be dem försöka igen.
*   **Status:** 🔄 Ej implementerat - den nuvarande fallback-lösningen i `routeService.js` (`generateCircularRoute`) är faktiskt användbar och genererar en rektangulär rutt som efterliknar gatumönster. Övervägdes men implementerades inte då fallback-lösningen är tillräckligt bra.

### ✅ Exponerad E-postadress och Avsaknad av Feedback-kanal [LÖST]

*   **Problem:** I "Om"-dialogrutan visas e-postadressen `info@routequest.se` öppet med en `mailto:`-länk. Detta utgör en stor risk för att adressen samlas in av spambotar. Appen saknar också en integrerad funktion för användare att enkelt kunna ge feedback.
*   **Lösning:** Ersätt den exponerade e-postadressen med ett integrerat kontakt- och feedbacksystem.
    1.  En "Kontakta oss / Ge feedback"-knapp skulle öppna ett formulär i en dialogruta.
    2.  När formuläret skickas sparas meddelandet i en ny `feedback`-collection i Firestore, tillsammans med kontext som användar-ID och aktuell sida.
    3.  Detta skyddar e-postadressen, ger en låg tröskel för användare att ge feedback, och samlar all input på ett strukturerat sätt i databasen för enkel hantering.
*   **Status:** ✅ **IMPLEMENTERAT**
    - Skapat `feedbackService.js` för att hantera feedback i Firestore
    - Skapat `FeedbackDialog.js` komponent med komplett feedback-formulär
    - Uppdaterat `AboutDialog.js` för att ta bort exponerad e-postadress och ersatt med feedback-knapp
    - Användare kan nu skicka feedback direkt från appen utan att exponera e-postadressen
