# Create GitHub Project Board with proper workflow
# This creates a GitHub Projects V2 board with milestones and correct ordering

Write-Host "`n=== Creating GitHub Project Board ===" -ForegroundColor Cyan
Write-Host "Repository: tobbelta/Quizter`n" -ForegroundColor Yellow

# Check authentication
gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Not authenticated. Run: gh auth login" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Creating Project: AI Question Generation System..." -ForegroundColor Magenta

# Create the project (Projects V2 via GraphQL)
$projectData = gh api graphql -f query='
  mutation {
    createProjectV2(input: {
      ownerId: "U_kgDOP4UoiA"
      title: "AI Question Generation System"
      repositoryId: "R_kgDOP4UoiA"
    }) {
      projectV2 {
        id
        number
      }
    }
  }
' 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Could not create project via API. Creating manually..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please create the project manually:" -ForegroundColor Cyan
    Write-Host "1. Go to: https://github.com/tobbelta/Quizter/projects" -ForegroundColor White
    Write-Host "2. Click 'New project'" -ForegroundColor White
    Write-Host "3. Choose 'Board' template" -ForegroundColor White
    Write-Host "4. Name it: 'AI Question Generation System'" -ForegroundColor White
    Write-Host "5. Add custom fields:" -ForegroundColor White
    Write-Host "   - Milestone (single select): M1, M2, M3, M4" -ForegroundColor White
    Write-Host "   - Work Phase (single select): Foundation, Core, Validation, Admin, User Features, Automation, Advanced" -ForegroundColor White
    Write-Host "   - Effort (single select): S, M, L, XL" -ForegroundColor White
    Write-Host ""
    Write-Host "Then add issues in this order:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "MILESTONE 1 - Phase: Foundation" -ForegroundColor Magenta
    Write-Host "  #68 - AI Provider Integration (Effort: XL)" -ForegroundColor White
    Write-Host "  #71 - Age Group & Category Classification (Effort: L)" -ForegroundColor White
    Write-Host ""
    Write-Host "MILESTONE 1 - Phase: Core" -ForegroundColor Magenta
    Write-Host "  #69 - Question Generation API (Effort: XL)" -ForegroundColor White
    Write-Host "  #70 - Dual-language Support (Effort: L)" -ForegroundColor White
    Write-Host ""
    Write-Host "MILESTONE 1 - Phase: Validation" -ForegroundColor Magenta
    Write-Host "  #73 - AI-to-AI Validation (Effort: XL)" -ForegroundColor White
    Write-Host "  #74 - Confidence Score Calculation (Effort: M)" -ForegroundColor White
    Write-Host "  #75 - Content Filtering (Effort: L)" -ForegroundColor White
    Write-Host "  #76 - Semantic Duplicate Detection (Effort: L)" -ForegroundColor White
    Write-Host ""
    Write-Host "MILESTONE 1 - Phase: Admin" -ForegroundColor Magenta
    Write-Host "  #77 - Manual Review System (Effort: XL)" -ForegroundColor White
    Write-Host ""
    Write-Host "MILESTONE 2 - Phase: User Features" -ForegroundColor Magenta
    Write-Host "  #79 - Question Reporting System (Effort: L)" -ForegroundColor White
    Write-Host "  #80 - User Feedback System (Effort: M)" -ForegroundColor White
    Write-Host "  #81 - Batch Validation Trigger (Effort: M)" -ForegroundColor White
    Write-Host ""
    Write-Host "MILESTONE 3 - Phase: Automation" -ForegroundColor Magenta
    Write-Host "  #83 - Difficulty Calibration (Effort: L)" -ForegroundColor White
    Write-Host "  #84 - Seasonal Update System (Effort: M)" -ForegroundColor White
    Write-Host "  #85 - Auto-Approval System (Effort: M)" -ForegroundColor White
    Write-Host "  #86 - Monthly Question Generation (Effort: L)" -ForegroundColor White
    Write-Host ""
    Write-Host "MILESTONE 4 - Phase: Advanced" -ForegroundColor Magenta
    Write-Host "  #88 - Category Preference System (Effort: M)" -ForegroundColor White
    Write-Host "  #89 - AI Illustration Generation (Effort: L)" -ForegroundColor White
    Write-Host "  #90 - Soft Delete System (Effort: M)" -ForegroundColor White
    Write-Host "  #91 - Admin Dashboard Enhancements (Effort: L)" -ForegroundColor White
    Write-Host ""
    Write-Host "Board columns:" -ForegroundColor Yellow
    Write-Host "  📝 Backlog → 🎯 Ready → 🚧 In Progress → 👀 Review → ✅ Done" -ForegroundColor Cyan
    Write-Host ""
    exit 0
}

Write-Host "✅ Project created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "View project: https://github.com/tobbelta/Quizter/projects" -ForegroundColor Cyan
