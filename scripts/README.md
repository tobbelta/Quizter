# Scripts

Utility scripts för RouteQuest-projektet.

## bump-version.js

Automatisk versionsökning enligt Semantic Versioning.

### Användning

```bash
# Öka patch-version (0.0.X) - för buggfixar
node scripts/bump-version.js patch

# Öka minor-version (0.X.0) - för nya funktioner
node scripts/bump-version.js minor

# Öka major-version (X.0.0) - för breaking changes
node scripts/bump-version.js major
```

### Vad gör skriptet?

1. Läser nuvarande version från `src/version.js`
2. Ökar versionen enligt specifierad typ (major/minor/patch)
3. Uppdaterar version i:
   - `src/version.js`
   - `public/index.html`
   - `public/version-check.js`
   - `package.json`
4. Visar nästa steg för commit och taggning

### Automatisk körning

Detta skript körs automatiskt av GitHub Actions när en PR mergas till main.

Se [VERSIONSHANTERING.md](../docs/VERSIONSHANTERING.md) för detaljer.

### Exempel

```bash
$ node scripts/bump-version.js minor

📦 Ökar version från 0.2.3 till 0.3.0 (minor)
  ✓ Uppdaterar src/version.js...
  ✓ Uppdaterar public/index.html...
  ✓ Uppdaterar public/version-check.js...
  ✓ Uppdaterar package.json...

✅ Version uppdaterad till 0.3.0

📝 Nästa steg:
   1. Uppdatera CHANGELOG i src/version.js med ändringar för 0.3.0
   2. Commit: git add . && git commit -m "chore: bump version to 0.3.0"
   3. Tag: git tag v0.3.0
   4. Push: git push && git push --tags
```

## Lägga till fler scripts

När du lägger till nya scripts, dokumentera dem här med:
- Syfte
- Användning
- Parametrar
- Exempel
