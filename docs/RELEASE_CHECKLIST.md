# Release-checklista för Tipspromenad 2.0

## Inför release
- Verifiera att .env innehåller korrekta Firebase-nycklar och att REACT_APP_USE_FIRESTORE=true är satt för produktionsbyggen.
- Kör `npm run lint` och `npm test -- --watchAll=false` i webbappen samt `npm test` i `functions/`.
- Starta Firebase Emulator Suite lokalt och genomför en runda-end-to-end för att säkerställa att Cloud Functions-skeletten svarar utan fel.
- Kontrollera att Firestore-reglerna passerar samtliga jest/cli-tester.

## Deploysteg
1. Bygg webbappen: `npm run build`.
2. Deploya functions och regler: `firebase deploy --only functions,firestore:rules`.
3. Deploya hosting om nödvändigt: `firebase deploy --only hosting` eller via CI.
4. Bekräfta i Firebase Console att de nya funktionerna (createRun, generateRoute, joinRun, submitAnswer, closeRun, questionImport) visas med aktuell version.

## Loggning och övervakning
- Följ realtidsloggar via `firebase functions:log --only <function>` för att upptäcka fel direkt efter deploy.
- Aktivera alerting i Google Cloud Logging på `logger.error` för produktion.
- Dokumentera observationer i `docs/RELEASE_NOTES.md` (eller skapa posten om den saknas).

## Rollbackplan
- Om kritiskt fel uppstår: deploya om den tidigare stabila versionen (taggad i git) med `firebase deploy --only functions --force` efter `git checkout <tag>`.
- Stäng anslutningskoder för aktiva rundor via administrationsgränssnittet eller manuellt i Firestore.
- Kommunicera med administratörerna via broadcast-funktionen i appen (kommer senare) eller e-post.

## Efterkontroller
- Verifiera att statistskärmarna laddar data från Firestore utan varningar i konsolen.
- Bekräfta att schemalagda `questionImport` körs enligt tidsplan (Cloud Scheduler / Logging).
- Uppdatera roadmapen i `TIPSPROMENAD_ARCHITECTURE.md` med eventuella nya fynd eller blockerare.
