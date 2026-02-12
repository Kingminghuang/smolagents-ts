# Tools Test Prompts

These prompts are designed for a `CodeAgent` to generate code that first sets up the necessary file system state and then performs the test action.

## Read Tool (`readTool`)

### 1. Read file contents that fit within limits
**Prompt:**
> Create a file named "test.txt" with the content:
> ```text
> Hello, world!
> Line 2
> Line 3
> ```
> Then read the file "test.txt".
> Finally output the read result.

### 2. Handle non-existent files
**Prompt:**
> Ensure that a file named "nonexistent.txt" does not exist (delete it if it does). Then try to read the file "nonexistent.txt".
> Finally output the read result.

### 3. Truncate files exceeding line limit
**Prompt:**
> Create a file named "large.txt" with 2500 lines, where each line follows the pattern `Line N` (e.g., `Line 1`, `Line 2`... `Line 2500`).
> Then read the file "large.txt".
> Finally output the read result.

### 4. Truncate when byte limit exceeded
**Prompt:**
> Create a file named "large-bytes.txt" with 500 lines. Each line should be `Line N: ` followed by 200 'x' characters.
> Then read the file "large-bytes.txt".
> Finally output the read result.

### 5. Handle offset parameter
**Prompt:**
> Create a file named "offset-test.txt" with 100 lines, where each line is `Line N`.
> Then read "offset-test.txt" starting from line 51.
> Finally output the read result.

### 6. Handle limit parameter
**Prompt:**
> Create a file named "limit-test.txt" with 100 lines, where each line is `Line N`.
> Then read the first 10 lines of "limit-test.txt".
> Finally output the read result.

### 7. Handle offset + limit together
**Prompt:**
> Create a file named "offset-limit-test.txt" with 100 lines, where each line is `Line N`.
> Then read 20 lines from "offset-limit-test.txt" starting at line 41.
> Finally output the read result.

### 8. Show error when offset is beyond file length
**Prompt:**
> Create a file named "short.txt" with 3 lines:
> ```text
> Line 1
> Line 2
> Line 3
> ```
> Then try to read "short.txt" starting from line 100.
> Finally output the read result.

### 9. Include truncation details when truncated
**Prompt:**
> Create a file named "large-file.txt" with 2500 lines, where each line is `Line N`.
> Then read the file "large-file.txt".
> Finally output the read result.

### 10. Detect image MIME type from file magic
**Prompt:**
> Create a file named "image.txt" containing the binary buffer of a valid 1x1 PNG image (base64: `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2Z0AAAAASUVORK5CYII=`).
> Then read the file "image.txt".
> Finally output the read result.

### 11. Treat files with image extension but non-image content as text
**Prompt:**
> Create a file named "not-an-image.png" with the text content "definitely not a png".
> Then read the file "not-an-image.png".
> Finally output the read result.

---

## Write Tool (`writeTool`)

### 12. Write file contents
**Prompt:**
> Ensure "write-test.txt" does not exist.
> Then write the text "Test content" to "write-test.txt".
> Finally output the write result.

### 13. Create parent directories
**Prompt:**
> Ensure the directory "nested/dir" does not exist.
> Then write the text "Nested content" to "nested/dir/test.txt".
> Finally output the write result.

---

## Edit Tool (`editTool`)

### 14. Replace text in file
**Prompt:**
> Create a file named "edit-test.txt" with content "Hello, world!".
> Then, in "edit-test.txt", replace "world" with "testing".
> Finally output the edit result.

### 15. Fail if text not found
**Prompt:**
> Create a file named "edit-test.txt" with content "Hello, world!".
> Then, in "edit-test.txt", try to replace "nonexistent" with "testing".
> Finally output the edit result.

### 16. Fail if text appears multiple times
**Prompt:**
> Create a file named "edit-test.txt" with content "foo foo foo".
> Then, in "edit-test.txt", try to replace "foo" with "bar".
> Finally output the edit result.

### 17. Match text with trailing whitespace stripped
**Prompt:**
> Create a file named "trailing-ws.txt" with content:
> ```text
> line one   
> line two  
> line three
> ```
> Then, in "trailing-ws.txt", replace:
> ```
> line one
> line two
> ```
> with "replaced".
> Finally output the edit result and the content of the file.

### 18. Match smart single quotes to ASCII quotes
**Prompt:**
> Create a file named "smart-quotes.txt" with content `console.log(‘hello’);` (using smart quotes).
> Then, in "smart-quotes.txt", replace `console.log('hello');` with `console.log('world');`.
> Finally output the edit result and the content of the file.

### 19. Match smart double quotes to ASCII quotes
**Prompt:**
> Create a file named "smart-double-quotes.txt" with content `const msg = “Hello World”;` (using smart quotes).
> Then, in "smart-double-quotes.txt", replace `const msg = "Hello World";` with `const msg = "Goodbye";`.
> Finally output the edit result and the content of the file.

### 20. Match Unicode dashes to ASCII hyphen
**Prompt:**
> Create a file named "unicode-dashes.txt" with content `range: 1–5\nbreak—here` (using en-dash and em-dash).
> Then, in "unicode-dashes.txt", replace:
> ```
> range: 1-5
> break-here
> ```
> with:
> ```
> range: 10-50
> break--here
> ```
> Finally output the edit result and the content of the file.

### 21. Match non-breaking space to regular space
**Prompt:**
> Create a file named "nbsp.txt" with content `hello\u00A0world`.
> Then, in "nbsp.txt", replace "hello world" with "hello universe".
> Finally output the edit result and the content of the file.

### 22. Prefer exact match over fuzzy match
**Prompt:**
> Create a file named "exact-preferred.txt" with content:
> ```text
> const x = 'exact';
> const y = 'other';
> ```
> Then, in "exact-preferred.txt", replace "const x = 'exact';" with "const x = 'changed';".
> Finally output the edit result and the content of the file.

### 23. Fail when text is not found even with fuzzy matching
**Prompt:**
> Create a file named "no-match.txt" with content "completely different content".
> Then, in "no-match.txt", try to replace "this does not exist" with "replacement".
> Finally output the edit result.

### 24. Detect duplicates after fuzzy normalization
**Prompt:**
> Create a file named "fuzzy-dups.txt" with content:
> ```text
> hello world   
> hello world
> ```
> Then, in "fuzzy-dups.txt", try to replace "hello world" with "replaced".
> Finally output the edit result.

### 25. Match LF oldText against CRLF file content
**Prompt:**
> Create a file named "crlf-test.txt" with CRLF line endings: `line one\r\nline two\r\nline three\r\n`.
> Then, in "crlf-test.txt", replace "line two" (using LF) with "replaced line".
> Finally output the edit result.

### 26. Preserve CRLF line endings after edit
**Prompt:**
> Create a file named "crlf-preserve.txt" with CRLF line endings: `first\r\nsecond\r\nthird\r\n`.
> Then, in "crlf-preserve.txt", replace "second\n" with "REPLACED\n".
> Finally output the edit result and the content of the file.

### 27. Preserve LF line endings for LF files
**Prompt:**
> Create a file named "lf-preserve.txt" with LF line endings: `first\nsecond\nthird\n`.
> Then, in "lf-preserve.txt", replace "second\n" with "REPLACED\n".
> Finally output the edit result and the content of the file.

### 28. Detect duplicates across CRLF/LF variants
**Prompt:**
> Create a file named "mixed-endings.txt" with mixed endings:
> ```text
> hello\r\nworld\r\n---\r\nhello\nworld\n
> ```
> Then, in "mixed-endings.txt", try to replace "hello\nworld\n" with "replaced\n".
> Finally output the edit result.

### 29. Preserve UTF-8 BOM after edit
**Prompt:**
> Create a file named "bom-test.txt" starting with BOM `\uFEFF` and content: `\uFEFFfirst\r\nsecond\r\nthird\r\n`.
> Then, in "bom-test.txt", replace "second" with "REPLACED".
> Finally output the edit result and the content of the file.

---

## Grep Tool (`grepTool`)

### 30. Include filename in single file search
**Prompt:**
> Create a file named "example.txt" with content:
> ```text
> first line
> match line
> last line
> ```
> Then search for "match" in "example.txt".
> Finally output the search result.

### 31. Respect global limit and include context lines
**Prompt:**
> Create a file named "context.txt" with content:
> ```text
> before
> match one
> after
> middle
> match two
> after two
> ```
> Then search for "match" in "context.txt" showing 1 line of context, and limit results to 1 match.
> Finally output the search result.

---

## Find Tool (`findTool`)

### 32. Include hidden files not gitignored
**Prompt:**
> Create a hidden directory ".secret/" and a file inside ".secret/hidden.txt". Also create a file "visible.txt".
> Then find all text files ("**/*.txt") in the current directory.
> Finally output the find result.

### 33. Respect .gitignore
**Prompt:**
> Create a file named ".gitignore" with content "ignored.txt". Create "ignored.txt" and "kept.txt".
> Then find all text files ("**/*.txt") in the current directory.
> Finally output the find result.

---

## Ls Tool (`lsTool`)

### 34. List dotfiles and directories
**Prompt:**
> Create a hidden file ".hidden-file" and a hidden directory ".hidden-dir".
> Then list the contents of the current directory.
> Finally output the ls result.
