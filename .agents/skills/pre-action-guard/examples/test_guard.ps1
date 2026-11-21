$ScriptPath = Join-Path $PSScriptRoot "..\scripts\guard_check.ps1"
$ReportPath = Join-Path $PSScriptRoot "..\VERIFICATION_REPORT.md"

Write-Host "Running Validation Tests for SKILL-018..."

# Case 1: Safe Read
$Res1 = & $ScriptPath -Action "read_mcp_resource" -Target "SKILL.md" | ConvertFrom-Json
$Pass1 = $Res1.risk_level -eq "NONE" -and $Res1.allowed -eq $true

# Case 2: Config Write (High Risk)
$Res2 = & $ScriptPath -Action "apply_patch" -Target ".env" | ConvertFrom-Json
$Pass2 = $Res2.risk_level -eq "HIGH" -and $Res2.allowed -eq $true

# Case 3: Dangerous Delete (Critical and requires authorization)
$Res3 = & $ScriptPath -Action "exec_command" -Target "rm ./temp.txt" | ConvertFrom-Json
$Pass3 = $Res3.risk_level -eq "CRITICAL" -and $Res3.allowed -eq $false

# Case 4: Root Delete (BLOCKED)
$Res4 = & $ScriptPath -Action "exec_command" -Target "rm C:\" | ConvertFrom-Json
$Pass4 = $Res4.risk_level -eq "CRITICAL" -and $Res4.allowed -eq $false

$AllPassed = $Pass1 -and $Pass2 -and $Pass3 -and $Pass4

$Report = @"
# 🧪 Verification Report: SKILL-018 (Pre-Action Guard)
**Date:** $(Get-Date)

## Test Cases

### 1. Safe Read
**Input:** read_mcp_resource SKILL.md
**Expected:** NONE / Allowed
**Actual:** $($Res1.risk_level) / $($Res1.allowed)
**Pass:** $(if($Pass1){"✅"}else{"❌"})

### 2. Config Write
**Input:** apply_patch .env
**Expected:** HIGH / Allowed
**Actual:** $($Res2.risk_level) / $($Res2.allowed)
**Pass:** $(if($Pass2){"✅"}else{"❌"})

### 3. Normal Delete
**Input:** rm ./temp.txt
**Expected:** CRITICAL / Blocked pending authorization
**Actual:** $($Res3.risk_level) / $($Res3.allowed)
**Pass:** $(if($Pass3){"✅"}else{"❌"})

### 4. Root Delete (Block)
**Input:** rm C:\
**Expected:** CRITICAL / Blocked
**Actual:** $($Res4.risk_level) / $($Res4.allowed)
**Pass:** $(if($Pass4){"✅"}else{"❌"})

## Summary
$(if($AllPassed){"**✅ PASSED (100% Coverage)**"}else{"**❌ FAILED**"})
"@

Set-Content -Path $ReportPath -Value $Report
Write-Host "Report saved to $ReportPath"
Write-Output $Report
