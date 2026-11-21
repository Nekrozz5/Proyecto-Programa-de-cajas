---
name: impasse-detector
description: Detects when the agent is stuck in a reasoning loop or unproductive state by analyzing tool usage and sentiment patterns.
metadata:
  version: 1.0.0
  author: Antigravity Skills Library
  created: 2026-01-16
  leverage_score: 5/5
---

# SKILL-017: Impasse Detector

## Overview

Critical **meta-cognitive skill** that acts as a circuit breaker for unproductive loops. It analyzes recent conversation history and tool outputs to detect "stuck" states, preventing token wastage on failing paths and forcing escalation or delegation.

## Trigger Phrases

- `check logic`
- `am i stuck`
- `detect loop`
- `impasse check`

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `--TranscriptPath` | string | No | $null | Path to conversation log/json |
| `--Content` | string | No | $null | Direct string content to analyze |
| `--Lookback` | int | No | 10 | Number of recent turns to analyze |

## Outputs

### 1. Analysis Result (JSON)

```json
{
  "status": "IMPASSE",
  "confidence": 0.95,
  "reasons": [
    "Apology loop detected (4 occurrences)",
    "High frequency of file reads (6 in window)"
  ],
  "recommendation": "ESCALATE_TO_USER",
  "score": 80
}
```

### 2. Status Codes

- `CLEAR`: No issues detected.
- `IMPASSE`: Significant loop/blockage detected.
- `UNKNOWN`: Insufficient data.

## Preconditions

1. Access to conversation history OR a provided transcript string.
2. PowerShell 5.1+ or Core 7+.

## Safety/QA Checks

1. **Read-Only**: This skill only analyzes text; it does not modify state.
2. **Fail-Safe**: If input is missing/malformed, defaults to "UNKNOWN" rather than crashing.

## Stop Conditions

| Condition | Action |
|-----------|--------|
| No input provided | Return status "UNKNOWN" (0 confidence) |
| File not found | Return error JSON |

## Implementation

See `scripts/detect_impasse.ps1`.

## Integration with Other Skills

Use this skill when repeated attempts, repeated tool failures, or circular reasoning indicate a real impasse:

1. Review the last attempts and identify the repeated blocking condition.
2. If status is `IMPASSE`, summarize the evidence and choose a materially different safe approach.
3. If no safe alternative remains, stop and tell the user exactly what input or external change is required.
