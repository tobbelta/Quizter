# Create GitHub Labels and Milestones
# Run this from the repository root: .\scripts\create-labels-and-milestones.ps1

Write-Host "`n=== Creating GitHub Labels and Milestones ===" -ForegroundColor Cyan
Write-Host "Repository: tobbelta/Quizter`n" -ForegroundColor Yellow

# Check authentication
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Not authenticated. Run: gh auth login" -ForegroundColor Red
    exit 1
}

# ===================
# CREATE LABELS
# ===================
Write-Host "`n📌 Creating Labels..." -ForegroundColor Magenta

# Type labels
Write-Host "  Creating type labels..." -ForegroundColor Blue
gh label create "epic" --description "Epic - large feature containing multiple sub-tasks" --color "7057ff" --force
gh label create "feature" --description "New feature or enhancement" --color "0e8a16" --force
gh label create "bug" --description "Something isn't working" --color "d73a4a" --force
gh label create "documentation" --description "Documentation improvements" --color "0075ca" --force

# Area labels
Write-Host "  Creating area labels..." -ForegroundColor Blue
gh label create "backend" --description "Backend/API related" --color "1d76db" --force
gh label create "frontend" --description "Frontend/UI related" --color "fbca04" --force
gh label create "database" --description "Database schema or queries" --color "006b75" --force
gh label create "ai" --description "AI/ML related functionality" --color "8b5cf6" --force

# Priority labels
Write-Host "  Creating priority labels..." -ForegroundColor Blue
gh label create "priority-critical" --description "Critical priority - must be done ASAP" --color "b60205" --force
gh label create "priority-high" --description "High priority - should be done soon" --color "d93f0b" --force
gh label create "priority-medium" --description "Medium priority - normal timeline" --color "fbca04" --force
gh label create "priority-low" --description "Low priority - nice to have" --color "0e8a16" --force

# Status labels
Write-Host "  Creating status labels..." -ForegroundColor Blue
gh label create "in-progress" --description "Currently being worked on" --color "1d76db" --force
gh label create "blocked" --description "Blocked by dependencies" --color "e99695" --force
gh label create "needs-review" --description "Needs code review" --color "fbca04" --force
gh label create "ready-to-test" --description "Ready for testing" --color "0e8a16" --force

Write-Host "✅ Labels created" -ForegroundColor Green

# ===================
# CREATE MILESTONES
# ===================
Write-Host "`n📅 Creating Milestones..." -ForegroundColor Magenta

# Milestone 1: MVP - Basic Question Generation
Write-Host "  Creating Milestone 1: MVP - Basic Question Generation..." -ForegroundColor Blue
gh api repos/tobbelta/Quizter/milestones -X POST -f title="Milestone 1: MVP - Basic Question Generation" -f description="Core functionality for generating and validating AI questions with dual-language support. Includes AI provider integration, question generation API, validation systems, and manual review." -f due_on="2025-12-31T23:59:59Z" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    ✓ Milestone 1 created" -ForegroundColor Green
} else {
    Write-Host "    ⚠ Milestone 1 may already exist (continuing...)" -ForegroundColor Yellow
}

# Milestone 2: User Interaction & Feedback
Write-Host "  Creating Milestone 2: User Interaction & Feedback..." -ForegroundColor Blue
gh api repos/tobbelta/Quizter/milestones -X POST -f title="Milestone 2: User Interaction & Feedback" -f description="User-facing features for reporting questions, providing feedback, and batch validation triggers. Includes question reporting system, thumbs up/down feedback, and batch validation." 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    ✓ Milestone 2 created" -ForegroundColor Green
} else {
    Write-Host "    ⚠ Milestone 2 may already exist (continuing...)" -ForegroundColor Yellow
}

# Milestone 3: Automated Quality Systems
Write-Host "  Creating Milestone 3: Automated Quality Systems..." -ForegroundColor Blue
gh api repos/tobbelta/Quizter/milestones -X POST -f title="Milestone 3: Automated Quality Systems" -f description="Automated background processes for quality control. Includes difficulty calibration (nightly), seasonal updates (weekly/monthly), auto-approval system, and monthly question generation." 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    ✓ Milestone 3 created" -ForegroundColor Green
} else {
    Write-Host "    ⚠ Milestone 3 may already exist (continuing...)" -ForegroundColor Yellow
}

# Milestone 4: Advanced Features
Write-Host "  Creating Milestone 4: Advanced Features..." -ForegroundColor Blue
gh api repos/tobbelta/Quizter/milestones -X POST -f title="Milestone 4: Advanced Features" -f description="Advanced features including category preferences, soft delete system, admin dashboard improvements, and AI illustrations. These enhance user experience and administrative capabilities." 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    ✓ Milestone 4 created" -ForegroundColor Green
} else {
    Write-Host "    ⚠ Milestone 4 may already exist (continuing...)" -ForegroundColor Yellow
}

Write-Host "✅ Milestones created" -ForegroundColor Green

# ===================
# APPLY LABELS TO EXISTING ISSUES
# ===================
Write-Host "`n🏷️  Applying Labels to Existing Issues..." -ForegroundColor Magenta

# Epic #1: Core Question Generation System (#67)
Write-Host "  Labeling #67: [EPIC] Core Question Generation System..." -ForegroundColor Blue
gh issue edit 67 --add-label "epic,backend,priority-critical" --milestone "Milestone 1: MVP - Basic Question Generation"

# Feature: AI Provider Integration (#68)
Write-Host "  Labeling #68: AI Provider Integration..." -ForegroundColor Blue
gh issue edit 68 --add-label "feature,backend,ai,priority-critical" --milestone "Milestone 1: MVP - Basic Question Generation"

# Feature: Question Generation API (#69)
Write-Host "  Labeling #69: Question Generation API..." -ForegroundColor Blue
gh issue edit 69 --add-label "feature,backend,priority-critical" --milestone "Milestone 1: MVP - Basic Question Generation"

# Feature: Dual-language Support (#70)
Write-Host "  Labeling #70: Dual-language Support..." -ForegroundColor Blue
gh issue edit 70 --add-label "feature,backend,frontend,priority-critical" --milestone "Milestone 1: MVP - Basic Question Generation"

# Feature: Age Group & Category Classification (#71)
Write-Host "  Labeling #71: Age Group & Category Classification..." -ForegroundColor Blue
gh issue edit 71 --add-label "feature,backend,database,priority-high" --milestone "Milestone 1: MVP - Basic Question Generation"

# Epic #2: Validation & Quality Control (#72)
Write-Host "  Labeling #72: [EPIC] Validation & Quality Control..." -ForegroundColor Blue
gh issue edit 72 --add-label "epic,backend,priority-critical" --milestone "Milestone 1: MVP - Basic Question Generation"

# Feature: AI-to-AI Validation (#73)
Write-Host "  Labeling #73: AI-to-AI Validation System..." -ForegroundColor Blue
gh issue edit 73 --add-label "feature,backend,ai,priority-critical" --milestone "Milestone 1: MVP - Basic Question Generation"

# Feature: Confidence Score Calculation (#74)
Write-Host "  Labeling #74: Confidence Score Calculation..." -ForegroundColor Blue
gh issue edit 74 --add-label "feature,backend,priority-critical" --milestone "Milestone 1: MVP - Basic Question Generation"

# Feature: Content Filtering (#75)
Write-Host "  Labeling #75: Content Filtering System..." -ForegroundColor Blue
gh issue edit 75 --add-label "feature,backend,ai,priority-high" --milestone "Milestone 1: MVP - Basic Question Generation"

# Feature: Semantic Duplicate Detection (#76)
Write-Host "  Labeling #76: Semantic Duplicate Detection..." -ForegroundColor Blue
gh issue edit 76 --add-label "feature,backend,database,priority-high" --milestone "Milestone 1: MVP - Basic Question Generation"

# Feature: Manual Review System (#77)
Write-Host "  Labeling #77: Manual Review System..." -ForegroundColor Blue
gh issue edit 77 --add-label "feature,backend,frontend,priority-high" --milestone "Milestone 1: MVP - Basic Question Generation"

Write-Host "✅ Labels applied to all issues" -ForegroundColor Green

# ===================
# SUMMARY
# ===================
Write-Host "`n" -NoNewline
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "📌 Labels created:" -ForegroundColor Yellow
Write-Host "   • Type: epic, feature, bug, documentation"
Write-Host "   • Area: backend, frontend, database, ai"
Write-Host "   • Priority: critical, high, medium, low"
Write-Host "   • Status: in-progress, blocked, needs-review, ready-to-test"
Write-Host ""
Write-Host "📅 Milestones created:" -ForegroundColor Yellow
Write-Host "   • Milestone 1: MVP - Basic Question Generation"
Write-Host "   • Milestone 2: User Interaction & Feedback"
Write-Host "   • Milestone 3: Automated Quality Systems"
Write-Host "   • Milestone 4: Advanced Features"
Write-Host ""
Write-Host "🏷️  11 issues labeled and assigned to Milestone 1" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. View issues: gh issue list --limit 20" -ForegroundColor White
Write-Host "2. View milestones: gh api repos/tobbelta/Quizter/milestones | ConvertFrom-Json | Select-Object title,number,open_issues" -ForegroundColor White
Write-Host "3. Visit GitHub: https://github.com/tobbelta/Quizter/issues" -ForegroundColor White
Write-Host "4. Visit Projects: https://github.com/tobbelta/Quizter/projects" -ForegroundColor White
Write-Host ""
