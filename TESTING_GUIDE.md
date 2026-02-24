# Web-WASM CodeAgent Testing Guide

## Overview

This guide explains how to validate Web-WASM CodeAgent consistency with Node-WASM CodeAgent using the cross-environment testing framework.

## Architecture

```
Node-WASM (nodefs)          Web-WASM (nativefs)
     │                             │
     │  test-node-                 │  test-web-
     │  baseline.json              │  baseline.json
     │                             │
     └─────────────┬───────────────┘
                   │
                   ▼
          compare-baseline.js
                   │
                   ▼
           Consistency Report
```

## Test Files

| File | Purpose | Environment |
|------|---------|-------------|
| `test-node-codeagent-validation.ts` | Node-WASM baseline generator | Node.js |
| `tests/e2e/nativefs-test.html` | Browser test page | Browser |
| `tests/e2e/nativefs.spec.ts` | Playwright E2E tests | Browser (Playwright) |
| `compare-baseline.js` | Baseline comparison script | Node.js |

## Running Tests

### 1. Generate Node-WASM Baseline

```bash
# Run all tests and generate baseline
npx tsx test-node-codeagent-validation.ts

# Output: test-node-baseline.json
```

This creates a JSON file with all test results from Node-WASM (nodefs mode).

### 2. Run Web-WASM Tests in Browser

#### Option A: Manual Browser Testing

```bash
# Start local server
python3 -m http.server 3456

# Open browser to:
# http://localhost:3456/tests/e2e/nativefs-test.html
```

Steps:
1. Enter API key (OpenAI/DeepSeek)
2. Click "Select Test Directory"
3. Choose a test directory
4. Click "Run Test"
5. View results

#### Option B: Playwright Automated Testing

```bash
# Run E2E tests with Playwright
npx playwright test tests/e2e/nativefs.spec.ts --headed

# Debug mode
npx playwright test tests/e2e/nativefs.spec.ts --debug
```

**Note:** `--headed` flag is required because File System Access API requires user interaction for directory selection.

### 3. Compare Results

```bash
# Compare Node-WASM and Web-WASM baselines
node compare-baseline.js test-node-baseline.json test-web-baseline.json

# Or use default filenames
node compare-baseline.js
```

## Test Cases

| Test ID | Tool | Description |
|---------|------|-------------|
| test_read_01 | Read | Normal file reading |
| test_read_02 | Read | Non-existent file handling |
| test_write_12 | Write | Write new file |
| test_write_13 | Write | Create parent directories |
| test_edit_14 | Edit | Replace text |
| test_edit_15 | Edit | Text not found error |
| test_edit_16 | Edit | Multiple occurrences error |
| test_grep_30 | Grep | Single file search |
| test_grep_31 | Grep | Limit and context options |
| test_find_32 | Find | Hidden files included |
| test_ls_33 | Ls | List dotfiles and directories |

## Environment Variables

```bash
# Required
export OPENAI_API_KEY="sk-..."

# Optional
export OPENAI_BASE_URL="https://api.deepseek.com"
export OPENAI_MODEL="deepseek-chat"
export E2E_PORT="3456"
```

## Filesystem Modes

### Node-WASM (nodefs)

Uses NODEFS to mount a local directory:
```typescript
const executor = new PyodideExecutor(undefined, {
  fsMode: 'nodefs',
  workDir: '/path/to/dir',
});
```

### Web-WASM (nativefs)

Uses File System Access API:
```typescript
const agent = new CodeAgent({
  fsMode: 'nativefs',
  directoryHandle: fileSystemDirectoryHandle,
  ...
});
```

## Troubleshooting

### File System Access API not supported

**Error:** `File System Access API not supported`

**Solution:** Use Chrome or Edge browser. Firefox and Safari don't support this API yet.

### Permission denied

**Error:** `Permission denied` or `readwrite permission not granted`

**Solution:** 
- In browser: Click "Allow" when prompted for directory access
- In Playwright: Tests run with `--headed` to handle permission dialogs

### Pyodide not loading

**Error:** `Pyodide is not defined`

**Solution:** Check internet connection. Pyodide is loaded from CDN:
```html
<script src="https://cdn.jsdelivr.net/pyodide/v0.29.3/full/pyodide.js"></script>
```

## Expected Output

### Node-WASM Baseline (test-node-baseline.json)
```json
{
  "timestamp": "2026-02-16T12:00:00.000Z",
  "environment": "node-wasm",
  "fsMode": "nodefs",
  "totalTests": 21,
  "passed": 21,
  "failed": 0,
  "results": [
    {
      "testId": "test_read_01",
      "name": "Test 1: Read normal file",
      "status": "pass",
      "output": "Hello, world!\nLine 2\nLine 3",
      "duration": 8500
    }
  ]
}
```

### Comparison Output
```
=== Web-WASM CodeAgent Validation Comparison ===

✅ MATCH: Test 1: Read normal file
   Similarity: 95.2%

Summary:
  Total tests: 21
  Matches: 21
  Match rate: 100.0%

✓ All tests passed! Web-WASM is consistent with Node-WASM.
```

## CI/CD Integration

For CI/CD pipelines, you may want to:

1. Run only Node-WASM tests (headless)
2. Skip Web-WASM tests (require headed browser)

```yaml
# Example GitHub Actions
- name: Run Node-WASM Tests
  run: npx tsx test-node-codeagent-validation.ts
  
- name: Run Web-WASM Tests
  if: github.event_name == 'workflow_dispatch'  # Manual trigger only
  run: npx playwright test tests/e2e/nativefs.spec.ts --headed
```
