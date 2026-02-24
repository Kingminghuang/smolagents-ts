# Web-WASM CodeAgent Validation Specification

**Goal:** Validate Web-WASM CodeAgent's consistency with Node-WASM CodeAgent.
**Source:** `dot/Web_CodeAgent_Tools_Validation.dot`
**DSL Schema:** `dot/dot-dsl-schema.md`

## Overview

This specification validates that the Web-WASM CodeAgent produces identical tool execution outputs to the Node-WASM CodeAgent baseline. The tests cover all file system tools: ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.

## Test Matrix

| Test ID | Tool | Description | Status |
|---------|------|-------------|--------|
| test_read_01 | Read | Normal file reading | ⏳ |
| test_read_02 | Read | Non-existent file handling | ⏳ |
| test_read_03 | Read | Line truncation (2500 lines) | ⏳ |
| test_read_04 | Read | Byte truncation (large content) | ⏳ |
| test_read_05 | Read | Offset parameter | ⏳ |
| test_read_06 | Read | Limit parameter | ⏳ |
| test_read_07 | Read | Offset + Limit combination | ⏳ |
| test_read_08 | Read | Offset beyond file length | ⏳ |
| test_read_09 | Read | Truncation metadata details | ⏳ |
| test_read_10 | Read | Image MIME detection (PNG magic) | ⏳ |
| test_read_11 | Read | Fake image treated as text | ⏳ |
| test_write_12 | Write | Write new file | ⏳ |
| test_write_13 | Write | Create parent directories | ⏳ |
| test_edit_14 | Edit | Replace text | ⏳ |
| test_edit_15 | Edit | Text not found error | ⏳ |
| test_edit_16 | Edit | Multiple occurrences error | ⏳ |
| test_edit_17 | Edit | Trailing whitespace normalization | ⏳ |
| test_grep_30 | Grep | Single file search | ⏳ |
| test_grep_31 | Grep | Limit and context options | ⏳ |
| test_find_32 | Find | Hidden files included | ⏳ |
| test_ls_33 | Ls | List dotfiles and directories | ⏳ |

## DOT Graph Structure

```
digraph Web_CodeAgent_Tools_Validation {
    graph [goal="Validate Web-WASM CodeAgent's consistency with Node-WASM CodeAgent"]
    node [shape=box, timeout="600s"]

    start [shape=Mdiamond, label="Start"]
    exit  [shape=Msquare, label="All Tests Passed"]
    
    // Setup phase
    setup_baseline [label="Generate Node-WASM Baseline"]
    
    // Test clusters (subgraphs)
    cluster_read_tests [label="Read Tool Tests"]
    cluster_write_tests [label="Write Tool Tests"]
    cluster_edit_tests [label="Edit Tool Tests"]
    cluster_grep_tests [label="Grep Tool Tests"]
    cluster_find_tests [label="Find Tool Tests"]
    cluster_ls_tests [label="Ls Tool Tests"]
    
    // Validation gates (diamond shapes)
    gate_read [shape=diamond, label="All Read Tests Pass?"]
    gate_write [shape=diamond, label="All Write Tests Pass?"]
    gate_edit [shape=diamond, label="All Edit Tests Pass?"]
    gate_grep [shape=diamond, label="All Grep Tests Pass?"]
    gate_find [shape=diamond, label="All Find Tests Pass?"]
    gate_ls [shape=diamond, label="All Ls Tests Pass?"]
    
    // Final consolidation
    consolidate_results [label="Consolidate Results"]
    fix_agent [label="Fix Web-WASM CodeAgent Implementation"]
    
    // Flow with conditions
    start -> setup_baseline
    setup_baseline -> test_read_01 -> ... -> gate_read
    gate_read -> consolidate_results [label="Yes", condition="outcome=success"]
    gate_read -> fix_agent [label="No", condition="outcome!=success"]
    fix_agent -> setup_baseline [label="Retry"]
    consolidate_results -> exit
}
```

## 1. Setup Phase

### Generate Node-WASM Baseline
**ID:** `setup_baseline`
**Shape:** box (codergen handler)
**Prompt:** Run the Node-WASM CodeAgent on all test cases (Tests 1-34) to generate baseline tool execution outputs. This creates the expected outputs for comparison with the Web-WASM implementation.

## 2. Read Tool Tests (Tests 1-11)

### Test 1: Read normal file
**ID:** `test_read_01`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named test.txt with the content:
Hello, world!
Line 2
Line 3
Then read the file test.txt.
Finally output the read result.'
**Satisfaction:** Web-WASM CodeAgent generates code that executes successfully and output matches Node-WASM CodeAgent baseline for Test 1.
**Expected Output Pattern:** Contains "Hello, world!", "Line 2", "Line 3"

### Test 2: Read non-existent file
**ID:** `test_read_02`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Ensure that a file named nonexistent.txt does not exist (delete it if it does). Then try to read the file nonexistent.txt. Finally output the read result.'
**Satisfaction:** Web-WASM CodeAgent generates code that executes and output matches Node-WASM CodeAgent baseline for Test 2.
**Expected Output Pattern:** FileNotFoundError with "File not found: nonexistent.txt"

### Test 3: Truncate line limit
**ID:** `test_read_03`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named large.txt with 2500 lines, where each line follows the pattern Line N (e.g., Line 1, Line 2... Line 2500). Then read the file large.txt. Finally output the read result.'
**Satisfaction:** Web-WASM CodeAgent generates code that shows truncation matching Node-WASM CodeAgent baseline for Test 3.
**Expected Output Pattern:** 
- Contains "Line 1" through "Line 2000"
- Does NOT contain "Line 2001"
- Contains "[Showing lines 1-2000 of 2500."

### Test 4: Truncate byte limit
**ID:** `test_read_04`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named large-bytes.txt with 500 lines. Each line should be Line N: followed by 200 x characters. Then read the file large-bytes.txt. Finally output the read result.'
**Satisfaction:** Web-WASM CodeAgent generates code showing byte limit truncation matching Node-WASM CodeAgent baseline for Test 4.
**Expected Output Pattern:** Contains byte limit message like "(XX.XKB limit)"

### Test 5: Read with offset
**ID:** `test_read_05`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named offset-test.txt with 100 lines, where each line is Line N. Then read offset-test.txt starting from line 51. Finally output the read result.'
**Satisfaction:** Web-WASM CodeAgent generates code with output starting from Line 51 matching Node-WASM CodeAgent baseline for Test 5.
**Expected Output Pattern:** 
- First line is "Line 51"
- Does NOT contain "Line 50"
- Contains "Line 100"

### Test 6: Read with limit
**ID:** `test_read_06`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named limit-test.txt with 100 lines, where each line is Line N. Then read the first 10 lines of limit-test.txt. Finally output the read result.'
**Satisfaction:** Web-WASM CodeAgent generates code showing only first 10 lines matching Node-WASM CodeAgent baseline for Test 6.
**Expected Output Pattern:**
- Contains "Line 1" through "Line 10"
- Does NOT contain "Line 11"
- Contains "[90 more lines in file. Use offset=11 to continue.]"

### Test 7: Read with offset+limit
**ID:** `test_read_07`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named offset-limit-test.txt with 100 lines, where each line is Line N. Then read 20 lines from offset-limit-test.txt starting at line 41. Finally output the read result.'
**Satisfaction:** Web-WASM CodeAgent generates code showing lines 41-60 matching Node-WASM CodeAgent baseline for Test 7.
**Expected Output Pattern:**
- First line is "Line 41"
- Contains "Line 60"
- Does NOT contain "Line 40" or "Line 61"
- Contains "[40 more lines in file. Use offset=61 to continue.]"

### Test 8: Offset beyond file
**ID:** `test_read_08`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named short.txt with 3 lines: Line 1, Line 2, Line 3. Then try to read short.txt starting from line 100. Finally output the read result.'
**Satisfaction:** Web-WASM CodeAgent generates code showing appropriate error matching Node-WASM CodeAgent baseline for Test 8.
**Expected Output Pattern:** ValueError with "Offset 100 is beyond file length of 3 lines"

### Test 9: Truncation details
**ID:** `test_read_09`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named large-file.txt with 2500 lines, where each line is Line N. Then read the file large-file.txt. Finally output the read result.'
**Satisfaction:** Web-WASM CodeAgent generates code with truncation metadata matching Node-WASM CodeAgent baseline for Test 9.
**Expected Output Pattern:** 
- Contains "[Showing lines 1-2000 of 2500"
- Result contains metadata about truncation

### Test 10: Image MIME detection
**ID:** `test_read_10`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named image.txt containing the binary buffer of a valid 1x1 PNG image (base64: iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2Z0AAAAASUVORK5CYII=). Then read the file image.txt. Finally output the read result.'
**Satisfaction:** Web-WASM CodeAgent generates code detecting PNG MIME type matching Node-WASM CodeAgent baseline for Test 10.
**Expected Output Pattern:** 
- Contains "Read image file [image/png]"
- Result contains image content block with mimeType: "image/png"

### Test 11: Fake image as text
**ID:** `test_read_11`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named not-an-image.png with the text content "definitely not a png". Then read the file not-an-image.png. Finally output the read result.'
**Satisfaction:** Web-WASM CodeAgent generates code treating file as text matching Node-WASM CodeAgent baseline for Test 11.
**Expected Output Pattern:** 
- Contains "definitely not a png"
- Does NOT contain image content block

## 3. Write Tool Tests (Tests 12-13)

### Test 12: Write file
**ID:** `test_write_12`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Ensure write-test.txt does not exist. Then write the text "Test content" to write-test.txt. Finally output the write result.'
**Satisfaction:** Web-WASM CodeAgent generates code creating file with correct content matching Node-WASM CodeAgent baseline for Test 12.
**Expected Output Pattern:** "Successfully wrote 12 bytes to write-test.txt"

### Test 13: Create parent dirs
**ID:** `test_write_13`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Ensure the directory nested/dir does not exist. Then write the text "Nested content" to nested/dir/test.txt. Finally output the write result.'
**Satisfaction:** Web-WASM CodeAgent generates code creating parent directories and file matching Node-WASM CodeAgent baseline for Test 13.
**Expected Output Pattern:** "Successfully wrote 14 bytes to nested/dir/test.txt"

## 4. Edit Tool Tests (Tests 14-17)

### Test 14: Replace text
**ID:** `test_edit_14`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named edit-test.txt with content "Hello, world!". Then, in edit-test.txt, replace "world" with "testing". Finally output the edit result.'
**Satisfaction:** Web-WASM CodeAgent generates code replacing text successfully matching Node-WASM CodeAgent baseline for Test 14.
**Expected Output Pattern:** "Successfully replaced text in edit-test.txt"

### Test 15: Text not found
**ID:** `test_edit_15`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named edit-test.txt with content "Hello, world!". Then, in edit-test.txt, try to replace "nonexistent" with "testing". Finally output the edit result.'
**Satisfaction:** Web-WASM CodeAgent generates code showing appropriate error matching Node-WASM CodeAgent baseline for Test 15.
**Expected Output Pattern:** ValueError with "Text not found in file: nonexistent"

### Test 16: Multiple occurrences
**ID:** `test_edit_16`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named edit-test.txt with content "foo foo foo". Then, in edit-test.txt, try to replace "foo" with "bar". Finally output the edit result.'
**Satisfaction:** Web-WASM CodeAgent generates code showing error for multiple matches matching Node-WASM CodeAgent baseline for Test 16.
**Expected Output Pattern:** ValueError indicating multiple occurrences found

### Test 17: Trailing whitespace
**ID:** `test_edit_17`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named trailing-ws.txt with content: "line one   " (with 3 trailing spaces), "line two  " (with 2 trailing spaces), "line three". Then, in trailing-ws.txt, replace the text "line one\nline two\n" with "replaced\n". Finally output the edit result and the content of the file.'
**Satisfaction:** Web-WASM CodeAgent generates code succeeding with whitespace normalization matching Node-WASM CodeAgent baseline for Test 17.
**Expected Output Pattern:** "Successfully replaced text in trailing-ws.txt"

## 5. Grep Tool Tests (Tests 30-31)

### Test 30: Single file search
**ID:** `test_grep_30`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named example.txt with content: "first line", "match line", "last line". Then search for "match" in example.txt. Finally output the search result.'
**Satisfaction:** Web-WASM CodeAgent generates code with output including filename and line number matching Node-WASM CodeAgent baseline for Test 30.
**Expected Output Pattern:** "example.txt:2: match line"

### Test 31: Limit and context
**ID:** `test_grep_31`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a file named context.txt with content: "before", "match one", "after", "middle", "match two", "after two". Then search for "match" in context.txt showing 1 line of context, and limit results to 1 match. Finally output the search result.'
**Satisfaction:** Web-WASM CodeAgent generates code showing context lines and respecting limit matching Node-WASM CodeAgent baseline for Test 31.
**Expected Output Pattern:**
- Contains context line "before"
- Contains "match one"
- Contains context line "after"
- Does NOT contain "match two"
- Contains "[1 matches limit reached"

## 6. Find Tool Tests (Test 32)

### Test 32: Hidden files
**ID:** `test_find_32`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a hidden directory .secret/ and a file inside .secret/hidden.txt. Also create a file visible.txt. Then find all text files (**/*.txt) in the current directory. Finally output the find result.'
**Satisfaction:** Web-WASM CodeAgent generates code with output including hidden files matching Node-WASM CodeAgent baseline for Test 32.
**Expected Output Pattern:**
- Contains ".secret/hidden.txt"
- Contains "visible.txt"

## 7. Ls Tool Tests (Test 33)

### Test 33: List dotfiles
**ID:** `test_ls_33`
**Shape:** box
**Task:**
Initialize a Web-WASM CodeAgent with ReadTool, WriteTool, EditTool, GrepTool, FindTool, and LsTool.
Then run the CodeAgent with the following task:
'Create a hidden file .hidden-file and a hidden directory .hidden-dir. Then list the contents of the current directory. Finally output the ls result.'
**Satisfaction:** Web-WASM CodeAgent generates code with output including dotfiles and directories matching Node-WASM CodeAgent baseline for Test 33.
**Expected Output Pattern:**
- Contains ".hidden-file"
- Contains ".hidden-dir/"

## 8. Validation Gates

### Gate: Read Tests
**ID:** `gate_read`
**Shape:** diamond (conditional handler)
**Condition:** `outcome=success` routes to consolidate_results, `outcome!=success` routes to fix_agent

### Gate: Write Tests
**ID:** `gate_write`
**Shape:** diamond
**Condition:** Same as gate_read

### Gate: Edit Tests
**ID:** `gate_edit`
**Shape:** diamond
**Condition:** Same as gate_read

### Gate: Grep Tests
**ID:** `gate_grep`
**Shape:** diamond
**Condition:** Same as gate_read

### Gate: Find Tests
**ID:** `gate_find`
**Shape:** diamond
**Condition:** Same as gate_read

### Gate: Ls Tests
**ID:** `gate_ls`
**Shape:** diamond
**Condition:** Same as gate_read

## 9. Completion Phase

### Consolidate Results
**ID:** `consolidate_results`
**Shape:** box
**Prompt:** Review all test outputs and compare with Node-WASM baseline. Generate a summary report showing pass/fail for each test case.

### Fix Implementation
**ID:** `fix_agent`
**Shape:** box
**Prompt:** Analyze failed test cases and update Web-WASM CodeAgent code generation logic to handle the failing scenarios correctly matching Node-WASM behavior.
**Retry Target:** setup_baseline (loop_restart)

## 10. Cross-Environment Validation Workflow

The validation workflow follows these steps to ensure Web-WASM consistency with Node-WASM:

### Step 1: Generate Node-WASM Baseline

Run Node-WASM tests with `nodefs` mode to generate baseline JSON:

```bash
npx tsx tests/test-node-codeagent-validation.ts
```

**Output:** `test-node-baseline.json`

**Format:**
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

### Step 2: Run Web-WASM Tests in Browser

Open `demo/web-wasm-validation.html` in a browser:

```bash
npx serve . -l 3000
# Open http://localhost:3000/demo/web-wasm-validation.html
```

**Steps:**
1. Enter API credentials (OpenAI/DeepSeek)
2. Click "Select Test Directory" to choose a workspace
3. Click "Run All Tests" to execute Web-WASM tests with `nativefs` mode
4. Click "Download Results" to save `test-web-baseline.json`

### Step 3: Compare Results

Run the comparison script to validate consistency:

```bash
node compare-baseline.js test-node-baseline.json test-web-baseline.json
```

**Output:**
```
=== Web-WASM CodeAgent Validation Comparison ===

Environment Info:
  Node-WASM: 2026-02-16T12:00:00.000Z (nodefs)
  Web-WASM:  2026-02-16T12:05:00.000Z (nativefs)

Test Comparison Results:

✅ MATCH: Test 1: Read normal file
   Similarity: 95.2%

✅ MATCH: Test 2: Read non-existent file
   Similarity: 92.8%

...

Summary:
  Total tests: 21
  Matches: 21
  Mismatches: 0
  Missing: 0
  Match rate: 100.0%

✓ All tests passed! Web-WASM is consistent with Node-WASM.
```

## 11. Implementation Notes

### Tool Python Code Injection
The tools use Python code from `src/tools/python-tools.ts` which gets injected into Pyodide by `PyodideExecutor.sendTools()`. All file paths are resolved relative to the mount point (`/mnt` in Pyodide, mapped to the working directory).

### Filesystem Modes

| Mode | Environment | Description |
|------|-------------|-------------|
| `nodefs` | Node.js | Uses NODEFS to mount local directory |
| `nativefs` | Browser | Uses File System Access API with `showDirectoryPicker()` |

Both modes use the same Python tool implementations, ensuring consistent behavior.

### Key Constants
- `MAX_LINES = 2000` (read tool line limit)
- `MAX_BYTES = 200 * 1024` (200KB byte limit)
- `MOUNT_POINT = os.environ.get('PYODIDE_MOUNT_POINT', '/mnt')`

### Image Detection Magic Numbers
- PNG: `89504e47` (starts with `\x89PNG`)
- JPEG: `ffd8`
- GIF: `47494638` (`GIF8`)
- WebP: `52494646` + `57454250` at offset 8 (`RIFF` + `WEBP`)

## 12. Test Files

| File | Purpose |
|------|---------|
| `test-node-codeagent-validation.ts` | Node-WASM baseline generator |
| `demo/web-wasm-validation.html` | Browser-based Web-WASM test runner |
| `compare-baseline.js` | Cross-environment comparison script |
| `tests/web-wasm-codeagent-validation.test.ts` | Vitest unit tests |

## 13. Validation Results

| Date | Tests Run | Passed | Failed | Notes |
|------|-----------|--------|--------|-------|
| 2026-02-16 | Sample (3 tests) | 3 | 0 | Read, Write, Edit tools verified working |

### Verified Behaviors
- ✅ Test 1: Normal file read/write operations
- ✅ Test 12: File creation with parent directories
- ✅ Test 14: Text replacement in files

### Known Limitations
- Tests require LLM API access (DeepSeek/OpenAI)
- Each test takes 8-15 seconds due to LLM round-trips
- Full test suite takes ~5-10 minutes to complete
