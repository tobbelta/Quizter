# Versionshantering

RouteQuest använder automatisk versionshantering enligt Semantic Versioning (SemVer).

## Semantic Versioning (SemVer)

Version: `MAJOR.MINOR.PATCH`

- **MAJOR** (X.0.0): Inkompatibla API-ändringar, stora omskrivningar
- **MINOR** (0.X.0): Nya funktioner, bakåtkompatibelt
- **PATCH** (0.0.X): Buggfixar, små förbättringar, bakåtkompatibelt

## Automatisk versionsökning vid PR-merge

När du mergar en Pull Request till `main` kommer versionen automatiskt att ökas baserat på PR:ens labels.

### 1. Skapa en feature branch

```bash
git checkout -b feature/min-nya-funktion
# ... gör ändringar ...
git add .
git commit -m "feat: lägg till min nya funktion"
git push -u origin feature/min-nya-funktion
```

### 2. Skapa Pull Request

På GitHub, skapa en Pull Request från din feature branch till `main`.

### 3. Lägg till version-label

Lägg till **EN** av följande labels på din PR:

- 🔴 `version:major` - För stora breaking changes (ökar X.0.0)
- 🟡 `version:minor` - För nya funktioner (ökar 0.X.0)
- 🟢 `version:patch` - För buggfixar (ökar 0.0.X)

**Om ingen label läggs till används `patch` som standard.**

### 4. Merge PR

När du mergar PR:en kommer GitHub Actions automatiskt att:

1. ✅ Detektera version-label
2. ✅ Köra `scripts/bump-version.js` för att öka versionen
3. ✅ Uppdatera filer:
   - `src/version.js`
   - `public/index.html`
   - `public/version-check.js`
   - `package.json`
4. ✅ Skapa en commit: `chore: bump version to X.Y.Z [skip ci]`
5. ✅ Skapa en git tag: `vX.Y.Z`
6. ✅ Pusha ändringar och tag till GitHub
7. ✅ Skapa en GitHub Release
8. ✅ Trigga deploy workflow (via push till main)

## Manuell versionsökning (endast för hotfixes)

Om du undantagsvis behöver öka versionen manuellt:

```bash
# Patch (0.0.X)
node scripts/bump-version.js patch

# Minor (0.X.0)
node scripts/bump-version.js minor

# Major (X.0.0)
node scripts/bump-version.js major
```

Därefter:

```bash
git add .
git commit -m "chore: bump version to X.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```

## Uppdatera Changelog

Efter automatisk versionsökning, uppdatera manuellt `CHANGELOG` i `src/version.js`:

```javascript
export const CHANGELOG = [
  {
    version: '0.2.4',
    date: '2025-10-06',
    changes: [
      'Beskrivning av ändring 1',
      'Beskrivning av ändring 2',
      'Beskrivning av ändring 3'
    ]
  },
  // ... äldre versioner
];
```

Detta kan göras i en separat commit direkt i main eller i nästa PR.

## Exempel på workflow

### Scenario 1: Ny funktion (minor)

```bash
# 1. Skapa feature branch
git checkout -b feature/dark-mode
# ... implementera dark mode ...
git commit -m "feat: add dark mode toggle"
git push -u origin feature/dark-mode

# 2. Skapa PR på GitHub
# 3. Lägg till label: version:minor
# 4. Merge PR
# ✅ Version ökas automatiskt från 0.2.3 → 0.3.0
```

### Scenario 2: Buggfix (patch)

```bash
# 1. Skapa feature branch
git checkout -b fix/gps-accuracy
# ... fixa bug ...
git commit -m "fix: improve GPS accuracy calculation"
git push -u origin fix/gps-accuracy

# 2. Skapa PR på GitHub
# 3. Lägg till label: version:patch (eller ingen label)
# 4. Merge PR
# ✅ Version ökas automatiskt från 0.3.0 → 0.3.1
```

### Scenario 3: Breaking change (major)

```bash
# 1. Skapa feature branch
git checkout -b refactor/new-api
# ... stor omskrivning ...
git commit -m "refactor!: migrate to new Firebase API"
git push -u origin refactor/new-api

# 2. Skapa PR på GitHub
# 3. Lägg till label: version:major
# 4. Merge PR
# ✅ Version ökas automatiskt från 0.3.1 → 1.0.0
```

## Cache-hantering

När versionen ökas kommer användare automatiskt att få nya ändringar genom:

1. **Cache-busting i index.html**: Jämför localStorage-version med APP_VERSION
2. **URL-versionskontroll**: `?ver=X.Y.Z` valideras i version-check.js
3. **Automatisk cache-rensning**: Service workers och caches rensas vid version mismatch

## Best Practices

✅ **GÖR:**
- Jobba alltid i feature branches
- Använd beskrivande branch-namn (`feature/`, `fix/`, `refactor/`)
- Lägg till rätt version-label på PR
- Skriv tydliga commit-meddelanden enligt [Conventional Commits](https://www.conventionalcommits.org/)
- Uppdatera CHANGELOG efter merge

❌ **GÖR INTE:**
- Commita direkt till main-branchen
- Öka version manuellt i feature branches
- Glöm att lägga till version-label på stora ändringar
- Merge flera stora features samtidigt utan att öka MINOR/MAJOR

## Felsökning

### Problem: Version ökades inte automatiskt

**Möjliga orsaker:**
1. PR inte mergad (endast stängd)
2. GitHub Actions saknar permissions
3. Skript-fel i bump-version.js

**Lösning:**
Kör manuell versionsökning enligt ovan.

### Problem: Fel versionstyp valdes

**Lösning:**
Skapa en hotfix-PR med rätt version:

```bash
git checkout main
git pull
node scripts/bump-version.js [rätt-typ]
git add .
git commit -m "chore: correct version bump"
git push
```

## Relaterade filer

- `scripts/bump-version.js` - Versionsbumpnings-skript
- `.github/workflows/version-bump.yml` - GitHub Actions workflow
- `.github/workflows/deploy.yml` - Deploy workflow
- `src/version.js` - Version och changelog
- `public/index.html` - Cache-hantering
- `public/version-check.js` - URL-versionskontroll
