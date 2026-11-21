---
name: e2e-testing
description: "End-to-end testing workflow with Playwright for browser automation, visual regression, cross-browser testing, and CI/CD integration."
metadata:
  category: granular-workflow-bundle
  risk: safe
  source: personal
  date_added: "2026-02-27"
---

# E2E Testing Workflow

## Overview

Specialized workflow for end-to-end testing using Playwright including browser automation, visual regression testing, cross-browser testing, and CI/CD integration.

## When to Use This Workflow

Use this workflow when:
- Setting up E2E testing
- Automating browser tests
- Implementing visual regression
- Testing across browsers
- Integrating tests with CI/CD

## Scope and proof

Choose phases needed for the current task, not every listed skill. Use dedicated test accounts, isolated fixtures and approved sandbox endpoints; clicks can send messages, make purchases or delete data. Review browser installation/downloads and CI permissions first. Traces, screenshots, videos and storage-state files can contain credentials or private data; keep them private and redact artifacts before sharing. A Playwright WebKit run is not proof on actual Safari/iOS, and mobile emulation is not a real-device test. Keep visual baselines fixed until differences are reviewed; do not overwrite them merely to get a pass.

## Workflow Phases

### Phase 1: Test Setup

Use the repository's installed Playwright package and configuration. Read the relevant project files before changing setup.

#### Actions
1. Install Playwright
2. Configure test framework
3. Set up test directory
4. Configure browsers
5. Create base test setup

#### Copy-Paste Prompts
```
Use $e2e-testing to set up Playwright for this repository.
```

### Phase 2: Test Design

Derive scenarios from the requested user flows and the repository's existing fixtures.

#### Actions
1. Identify critical flows
2. Design test scenarios
3. Plan test data
4. Create page objects
5. Set up fixtures

#### Copy-Paste Prompts
```
Use $e2e-testing to design the smallest E2E strategy that covers these flows.
```

### Phase 3: Test Implementation

Implement tests with the local Playwright APIs and conventions.

#### Actions
1. Write test scripts
2. Add assertions
3. Implement waits
4. Handle dynamic content
5. Add error handling

#### Copy-Paste Prompts
```
Use $e2e-testing to implement the approved Playwright scenarios.
```

### Phase 4: Browser Automation

Use Playwright through repository scripts or `exec_command`; request approval before browser installation, downloads, or GUI launches when required.

#### Actions
1. Configure headless mode
2. Set up screenshots
3. Implement video recording
4. Add trace collection
5. Configure mobile emulation

#### Copy-Paste Prompts
```
Use $e2e-testing to automate these browser interactions with Playwright.
```

### Phase 5: Visual Regression

Use Playwright screenshot assertions and keep reviewed baselines stable.

#### Actions
1. Set up visual testing
2. Create baseline images
3. Add visual assertions
4. Configure thresholds
5. Review differences

#### Copy-Paste Prompts
```
Use $e2e-testing to add reviewed Playwright visual assertions.
```

### Phase 6: Cross-Browser Testing

Configure only the Playwright browser projects required by the task.

#### Actions
1. Configure Chromium
2. Add Firefox tests
3. Add WebKit tests
4. Test mobile browsers
5. Compare results

#### Copy-Paste Prompts
```
Use $e2e-testing to run the requested Playwright browser matrix.
```

### Phase 7: CI/CD Integration

Inspect the repository's existing CI provider and workflow before proposing changes.

#### Actions
1. Create CI workflow
2. Configure parallel execution
3. Set up artifacts
4. Add reporting
5. Configure notifications

#### Copy-Paste Prompts
```
Use $e2e-testing to integrate the Playwright suite with the existing CI workflow.
```

## Quality Gates

- [ ] Tests passing
- [ ] Coverage adequate
- [ ] Visual tests stable
- [ ] Cross-browser verified
- [ ] CI integration working

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
