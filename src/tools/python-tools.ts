export const PYTHON_FS_PRELUDE = `
import os
from pathlib import Path
import re

# Mount point is set by PyodideExecutor when injecting this module
# Default to /mnt if not set
MOUNT_POINT = os.environ.get('PYODIDE_MOUNT_POINT', '/mnt')

def _resolve_path(path: str) -> Path:
    """Resolve path relative to mount point"""
    return Path(MOUNT_POINT) / path
`;

export const PYTHON_READ_TOOL = `
def read(path: str, offset: int = 1, limit: int = None) -> dict:
    """Read the contents of a file. Supports text files and images (jpg, png, gif, webp). 
    Images are sent as attachments. For text files, output is truncated to 2000 lines or 
    200KB (whichever is hit first). Use offset/limit for large files. When you need the 
    full file, continue with offset until complete.
    
    IMPORTANT: Use this tool instead of Python's built-in open() function for file reading.
    IMPORTANT: All arguments must be passed as keyword arguments (e.g., read(path="file.txt", offset=1)).
    
    Args:
        path: Path to the file to read (relative or absolute)
        offset: Line number to start reading from (1-indexed), default 1
        limit: Maximum number of lines to read, nullable
    
    Returns:
        dict: A dictionary with a 'content' field containing:
            - For text files: [{'type': 'text', 'text': <file contents>}]
            - For images: [{'type': 'text', 'text': <description>}, {'type': 'image', 'mimeType': <mime>, 'data': <base64>}]
            - For binary files: [{'type': 'text', 'text': <size info>}]
    """
    import base64
    
    # Constants for truncation
    MAX_LINES = 2000
    MAX_BYTES = 200 * 1024  # 200KB
    
    file_path = _resolve_path(path)

    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    # Read file as binary to detect type
    buffer = file_path.read_bytes()
    
    # Check for image magic numbers
    magic = buffer[:12].hex() if len(buffer) >= 12 else buffer.hex()
    mime_type = None
    
    if magic.startswith('89504e47'):
        mime_type = 'image/png'
    elif magic.startswith('ffd8'):
        mime_type = 'image/jpeg'
    elif magic.startswith('47494638'):
        mime_type = 'image/gif'
    elif magic.startswith('52494646') and len(buffer) >= 12 and buffer[8:12].hex() == '57454250':
        mime_type = 'image/webp'
    
    # Check if binary (has null bytes)
    is_binary = mime_type is not None
    if not is_binary:
        for i in range(min(len(buffer), 1000)):
            if buffer[i] == 0:
                is_binary = True
                break
    
    # Handle binary/image files
    if is_binary:
        if mime_type:
            # Return image as base64
            base64_data = base64.b64encode(buffer).decode('utf-8')
            return {
                'content': [
                    {'type': 'text', 'text': f'Read image file [{mime_type}]'},
                    {'type': 'image', 'mimeType': mime_type, 'data': base64_data}
                ]
            }
        else:
            # Generic binary file
            size = len(buffer)
            size_str = f"{size / 1024:.1f}KB" if size > 1024 else f"{size}B"
            return {
                'content': [{'type': 'text', 'text': f'Read binary file ({size_str})'}]
            }
    
    # Handle text files
    content = buffer.decode('utf-8')
    lines = content.splitlines(keepends=True)
    total_lines = len(lines)

    # Apply offset
    if offset is None:
        offset = 1
    start_line = offset - 1 if offset > 0 else 0
    if start_line >= total_lines:
        raise ValueError(f"Offset {offset} is beyond file length of {total_lines} lines")
    
    # Calculate effective limit respecting MAX_LINES and user-provided limit
    remaining_lines = total_lines - start_line
    effective_limit = min(remaining_lines, MAX_LINES)
    if limit is not None:
        effective_limit = min(effective_limit, limit)
    
    selected_lines = lines[start_line:start_line + effective_limit]
    text = ''.join(selected_lines)
    
    # Check byte limit
    text_bytes = text.encode('utf-8')
    if len(text_bytes) > MAX_BYTES:
        # Truncate to byte limit
        truncated_bytes = text_bytes[:MAX_BYTES]
        # Find the last complete line
        last_newline = truncated_bytes.rfind(b'\\n')
        if last_newline > 0:
            truncated_bytes = truncated_bytes[:last_newline + 1]
        text = truncated_bytes.decode('utf-8', errors='ignore')
        # Recalculate effective_limit based on byte truncation
        effective_limit = text.count('\\n') + (1 if text and not text.endswith('\\n') else 0)
    
    # Add truncation notice if needed
    lines_shown = start_line + effective_limit
    if lines_shown < total_lines:
        remaining = total_lines - lines_shown
        next_offset = lines_shown + 1
        text += "\\n\\n[Showing lines " + str(start_line + 1) + "-" + str(lines_shown) + " of " + str(total_lines) + ". " + str(remaining) + " more lines. Use offset=" + str(next_offset) + " to continue.]"

    return {
        'content': [{'type': 'text', 'text': text}]
    }
`;

export const PYTHON_WRITE_TOOL = `
def write(path: str, content: str) -> dict:
    """Write content to a file. Creates file if it doesn't exist, overwrites if it does. 
    Automatically creates parent directories.
    
    IMPORTANT: Use this tool instead of Python's built-in open() function for file writing.
    IMPORTANT: All arguments must be passed as keyword arguments (e.g., write(path="file.txt", content="data")).
    
    Args:
        path: Path to the file to write (relative or absolute)
        content: Content to write to the file
    
    Returns:
        dict: A dictionary with 'content' field containing:
            [{'type': 'text', 'text': 'Successfully wrote <N> bytes to <path>'}]
    """
    file_path = _resolve_path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content)

    return {
        'content': [{
            'type': 'text',
            'text': f'Successfully wrote {len(content)} bytes to {path}'
        }]
    }
`;

export const PYTHON_EDIT_TOOL = `
def edit(path: str, old_text: str, new_text: str) -> dict:
    """Edit a file by replacing exact text. The oldText must match exactly (including 
    whitespace). Use this for precise, surgical edits.
    
    IMPORTANT: Use this tool instead of Python's built-in open() function for file editing.
    IMPORTANT: All arguments must be passed as keyword arguments (e.g., edit(path="file.txt", oldText="old", newText="new")).
    
    Args:
        path: Path to the file to edit (relative or absolute)
        oldText: Exact text to find and replace (must match exactly)
        newText: New text to replace the old text with
    
    Returns:
        dict: A dictionary with 'content' field containing:
            [{'type': 'text', 'text': 'Successfully replaced text in <path>'}]
    """
    if old_text is None or new_text is None:
        raise ValueError("Missing required arguments: old_text or new_text")

    file_path = _resolve_path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    content = file_path.read_text()
    if old_text not in content:
        raise ValueError(f"Text not found in file: {old_text}")

    new_content = content.replace(old_text, new_text, 1)
    file_path.write_text(new_content)

    return {
        'content': [{
            'type': 'text',
            'text': f'Successfully replaced text in {path}'
        }]
    }
`;

export const PYTHON_GREP_TOOL = `
def grep(pattern: str, path: str = '.', glob: str = None, ignore_case: bool = False,
         literal: bool = False, context: int = 0, limit: int = 100) -> dict:
    """Search file contents for a pattern. Returns matching lines with file paths and
    line numbers. Output is truncated to 100 matches or 200KB (whichever is hit first).
    Long lines are truncated to 500 chars.

    IMPORTANT: All arguments must be passed as keyword arguments (e.g., grep(pattern="search", path=".")).

    Args:
        pattern: Search pattern (regex or literal string)
        path: Directory or file to search (default: current directory)
        glob: Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts', nullable
        ignore_case: Case-insensitive search (default: false)
        literal: Treat pattern as literal string instead of regex (default: false)
        context: Number of lines to show before and after each match (default: 0)
        limit: Maximum number of matches to return (default: 100)

    Returns:
        dict: A dictionary with 'content' field containing:
            [{'type': 'text', 'text': '<path>:<line_num>: <matching line>\n...'}]
            If no matches found: [{'type': 'text', 'text': 'No matches found'}]
    """
    import bisect
    import codecs
    import fnmatch
    from typing import Tuple

    # === Internal Classes ===

    class PyGrepError(Exception):
        pass

    class BinaryOrEncodingError(PyGrepError):
        pass

    def _match_glob(filepath: str, glob_pattern: str) -> bool:
        """Check if filepath matches glob pattern."""
        normalized = filepath.replace(os.sep, '/')
        if '**' in glob_pattern:
            from pathlib import PurePosixPath
            return PurePosixPath(normalized).match(glob_pattern)
        else:
            return fnmatch.fnmatch(normalized, glob_pattern)

    def _walk_directory(walk_path: str, recursive: bool = True, glob_pattern: str = None):
        """Walk directory yielding file paths."""
        walk_path = os.fspath(walk_path)
        if os.path.isfile(walk_path):
            yield walk_path
            return
        if not os.path.isdir(walk_path):
            return
        if recursive:
            stack = [walk_path]
            while stack:
                current = stack.pop()
                try:
                    # Use list() to force evaluation before the with block exits
                    # This avoids Pyodide iterator exhaustion issues
                    entries = list(os.scandir(current))
                    for entry in entries:
                        try:
                            if entry.is_symlink():
                                continue
                            if entry.is_file():
                                entry_path = entry.path  # Capture path before closing
                                if glob_pattern is None or _match_glob(entry_path, glob_pattern):
                                    yield entry_path
                            elif entry.is_dir():
                                stack.append(entry.path)
                        except (OSError, PermissionError):
                            continue
                except PermissionError:
                    continue
        else:
            try:
                entries = list(os.scandir(walk_path))
                for entry in entries:
                    try:
                        if entry.is_symlink():
                            continue
                        if entry.is_file():
                            entry_path = entry.path
                            if glob_pattern is None or _match_glob(entry_path, glob_pattern):
                                yield entry_path
                    except (OSError, PermissionError):
                        continue
            except PermissionError:
                pass

    def _iter_text_chunks(filepath: str, chunk_size: int, encoding: str, errors: str):
        """Yield decoded text chunks from a file path."""
        input_stream = None
        
        try:
            input_stream = open(filepath, "rb")
            decoder = codecs.getincrementaldecoder(encoding)(errors=errors)

            while True:
                data = input_stream.read(chunk_size)
                if not data:
                    break
                text_chunk = decoder.decode(data, final=False)
                if text_chunk:
                    yield text_chunk

            # Final decode
            try:
                text_chunk = decoder.decode(b"", final=True)
                if text_chunk:
                    yield text_chunk
            except:
                pass

        except UnicodeDecodeError:
            raise BinaryOrEncodingError("Decoding failed")
        finally:
            if input_stream:
                input_stream.close()

    def _truncate_line(text: str, max_length: int = 500) -> Tuple[str, bool]:
        """Truncate line to max_length characters."""
        text = text.rstrip('\\r\\n')
        if len(text) <= max_length:
            return text, False
        return text[:max_length] + "...", True

    # === Main Search Logic ===

    mount_root = Path(MOUNT_POINT)
    search_path = _resolve_path(path)

    if not search_path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    # Build regex
    regex_flags = re.IGNORECASE if ignore_case else 0
    regex_flags |= re.MULTILINE | re.DOTALL
    search_pattern = re.escape(pattern) if literal else pattern

    try:
        regex = re.compile(search_pattern, regex_flags)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    # Collect files
    files_to_search = []
    if search_path.is_file():
        files_to_search = [str(search_path)]
    else:
        for f in _walk_directory(str(search_path), recursive=True, glob_pattern=glob):
            files_to_search.append(f)
    


    # Search state
    matches = []
    match_count = 0
    max_output_bytes = 200 * 1024
    current_bytes = 0
    chunk_size = 128 * 1024
    overlap = 4096
    max_line_length = 500

    for file_path in files_to_search:
        if match_count >= limit or current_bytes >= max_output_bytes:
            break

        try:
            # State for this file
            buffer = ""
            buffer_start_abs = 0
            total_scanned = 0
            last_match_end_abs = -1

            # For context support
            all_lines = []
            line_starts = [0]
            match_events = []

            chunk_iter = _iter_text_chunks(file_path, chunk_size, 'utf-8', 'strict')

            for chunk in chunk_iter:
                # Binary check - look for null byte
                if chr(0) in chunk:
                    raise BinaryOrEncodingError("Binary file")

                # Build line index incrementally
                base = total_scanned
                for i, char in enumerate(chunk):
                    if char == '\\n':
                        line_starts.append(base + i + 1)

                total_scanned += len(chunk)

                # Rolling buffer with overlap
                if buffer:
                    prev_tail = buffer[-overlap:] if len(buffer) > overlap else buffer
                    buffer = prev_tail + chunk
                    buffer_start_abs = total_scanned - len(buffer)
                else:
                    buffer = chunk
                    buffer_start_abs = 0

                # Search in buffer
                for match in regex.finditer(buffer):
                    start_rel = match.start()
                    end_rel = match.end()

                    start_abs = buffer_start_abs + start_rel
                    end_abs = buffer_start_abs + end_rel

                    if start_abs < last_match_end_abs:
                        continue

                    last_match_end_abs = end_abs

                    # Calculate line/col using bisect
                    line_idx = bisect.bisect_right(line_starts, start_abs) - 1
                    line_start_pos = line_starts[line_idx]

                    # Extract full line from buffer
                    line_end_pos = buffer.find(chr(10), start_rel)
                    if line_end_pos == -1:
                        line_end_pos = len(buffer)
                    full_line = buffer[line_start_pos - buffer_start_abs:line_end_pos]
                    truncated_line, _ = _truncate_line(full_line, max_line_length)

                    match_events.append({
                        'start_abs': start_abs,
                        'end_abs': end_abs,
                        'line': line_idx + 1,
                        'text': truncated_line
                    })

                    if match_count + len(match_events) >= limit:
                        break

                if match_count + len(match_events) >= limit:
                    break
            


            # Process matches for this file
            rel_path = str(Path(file_path).relative_to(mount_root)) if file_path.startswith(str(mount_root)) else file_path

            # Handle context
            if context > 0 and match_events:
                # Re-read file to get all lines for context
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        full_lines = f.read().splitlines()
                except:
                    full_lines = []

                yielded_lines = set()
                output_events = []

                for evt in match_events:
                    if match_count >= limit:
                        break

                    match_line = evt['line']
                    yielded_lines.add(match_line)

                    # Context before
                    for ctx_line in range(max(1, match_line - context), match_line):
                        if ctx_line not in yielded_lines and ctx_line <= len(full_lines):
                            ctx_text, _ = _truncate_line(full_lines[ctx_line - 1], max_line_length)
                            output_events.append({'line': ctx_line, 'text': ctx_text, 'is_context': True})
                            yielded_lines.add(ctx_line)

                    # The match
                    output_events.append({'line': match_line, 'text': evt['text'], 'is_context': False})
                    match_count += 1

                    # Context after
                    for ctx_line in range(match_line + 1, min(len(full_lines) + 1, match_line + 1 + context)):
                        if ctx_line not in yielded_lines:
                            ctx_text, _ = _truncate_line(full_lines[ctx_line - 1], max_line_length)
                            output_events.append({'line': ctx_line, 'text': ctx_text, 'is_context': True})
                            yielded_lines.add(ctx_line)

                    if match_count >= limit:
                        break

                # Format output
                for evt in output_events:
                    line_out = f"{rel_path}:{evt['line']}: {evt['text']}"
                    line_bytes = len(line_out.encode('utf-8')) + 1
                    if current_bytes + line_bytes > max_output_bytes:
                        break
                    matches.append(line_out)
                    current_bytes += line_bytes
            else:
                # No context - just add matches
                for evt in match_events:
                    if match_count >= limit:
                        break
                    line_out = f"{rel_path}:{evt['line']}: {evt['text']}"
                    line_bytes = len(line_out.encode('utf-8')) + 1
                    if current_bytes + line_bytes > max_output_bytes:
                        break
                    matches.append(line_out)
                    current_bytes += line_bytes
                    match_count += 1

        except (BinaryOrEncodingError, UnicodeDecodeError, IOError):
            continue

    # Build result
    if not matches:
        result_text = 'No matches found'
    else:
        result_text = '\\n'.join(matches)
        if match_count >= limit:
            result_text += f"\\n\\n[{limit} matches limit reached. Use limit={limit + 1} for more, or refine pattern]"

    return {
        'content': [{
            'type': 'text',
            'text': result_text
        }]
    }
`;

export const PYTHON_FIND_TOOL = `
def find(pattern: str, path: str = '.', limit: int = 1000) -> dict:
    """Search for files by glob pattern. Returns matching file paths relative to the 
    search directory. Output is truncated to 1000 results or 200KB (whichever is hit first).
    
    IMPORTANT: All arguments must be passed as keyword arguments (e.g., find(pattern="*.ts", path=".")).
    
    Args:
        pattern: Glob pattern to match files, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts'
        path: Directory to search in (default: current directory)
        limit: Maximum number of results (default: 1000)
    
    Returns:
        dict: A dictionary with 'content' field containing:
            [{'type': 'text', 'text': '<file1>\\n<file2>\\n...'}]
            If no files found: [{'type': 'text', 'text': 'No files found'}]
    """
    import os
    import re
    import fnmatch
    from typing import List, Optional, Iterator, Union, Set, Dict, Tuple, Any

    # --- Matcher Module ---

    class Matcher:
        """Handles filename matching using Regex or Glob patterns."""
        
        def __init__(self, pattern: str, regex: bool = True, glob: bool = False):
            if regex and glob:
                raise ValueError("Cannot specify both regex=True and glob=True")
            
            self.regex_mode = regex
            self.pattern = pattern
            self._compiled_regex = None
            
            if self.regex_mode:
                self._compiled_regex = re.compile(pattern)
            elif glob:
                # Convert glob to regex for robust matching (handling ** and /)
                # This conversion supports simple recursive globs
                # Note: fnmatch.translate produces a regex, but it's often too specific or 
                # platform dependent. We use a manual conversion similar to previous tools
                # to Ensure ** behavior is consistent.
                glob_pattern = pattern.replace('.', r'\.')
                glob_pattern = glob_pattern.replace('**/', '<<<DOUBLESTAR>>>')
                glob_pattern = glob_pattern.replace('**', '<<<DOUBLESTAR>>>')
                glob_pattern = glob_pattern.replace('*', '[^/]*')
                glob_pattern = glob_pattern.replace('<<<DOUBLESTAR>>>', '.*')
                glob_pattern = f'^{glob_pattern}$'
                self._compiled_regex = re.compile(glob_pattern)
                # Switch to regex mode implementation-wise
                self.regex_mode = True 

        def match(self, filename: str) -> bool:
            # When using our glob-to-regex conversion, we match against the path string
            if self.regex_mode:
                return self._compiled_regex.search(filename) is not None
            else:
                # Fallback to simple fnmatch (not used if glob=True specified above)
                return fnmatch.fnmatchcase(filename, self.pattern)


    # --- Walker Module ---

    class Walker:
        def __init__(self, 
                    root: str, 
                    matcher: Matcher, 
                    include_hidden: bool = False,
                    file_types: Optional[List[str]] = None):
            self.root = root
            self.matcher = matcher
            self.include_hidden = include_hidden
            self.file_types = file_types or ["file"]
            
            self.do_files = "file" in self.file_types
            self.do_dirs = "dir" in self.file_types

        def walk(self) -> Iterator[str]:
            for dirpath, dirs, files in os.walk(self.root, topdown=True, followlinks=False):
                rel_dir = os.path.relpath(dirpath, self.root)
                if rel_dir == ".":
                    rel_dir = ""

                # Prune Dirs
                if not self.include_hidden:
                    dirs[:] = [d for d in dirs if not self._is_hidden(d)]
                    files[:] = [f for f in files if not self._is_hidden(f)]

                # Process Files
                if self.do_files:
                    for f in files:
                        # Construct relative path to match against
                        f_rel = os.path.join(rel_dir, f) if rel_dir else f
                        if self.matcher.match(f_rel):
                            yield os.path.join(dirpath, f)

                # Process Dir
                if self.do_dirs:
                    if rel_dir:
                        # Match directory path
                        if self.matcher.match(rel_dir):
                            yield dirpath
                

        def _is_hidden(self, name: str) -> bool:
            return name.startswith('.') and name != '.' and name != '..'

    # --- Find Logic ---
    
    search_path = _resolve_path(path)
    if not search_path.exists():
         raise FileNotFoundError(f"Directory not found: {path}")

    root_str = str(search_path)
    
    # Use glob=True which triggers the regex conversion in Matcher
    matcher = Matcher(pattern, regex=False, glob=True)
    # Always include hidden to let the glob pattern decide (e.g. .env or **/*.txt inside .git)
    # Wait, if we include hidden, standard globs like *.txt won't match .hidden/foo.txt unless we use **.
    # But if we use match on relative paths, '**' will match hidden dirs if walked.
    walker = Walker(root_str, matcher, include_hidden=True, file_types=["file"])
    
    all_results = list(walker.walk())
    all_results.sort()
    
    matches = []
    mount_root = Path(MOUNT_POINT)
    
    for abs_path in all_results:
        try:
             p_obj = Path(abs_path)
             if mount_root in p_obj.parents or p_obj == mount_root:
                 r_path = p_obj.relative_to(mount_root)
                 matches.append(str(r_path))
             else:
                 matches.append(str(abs_path))
        except ValueError:
             matches.append(abs_path)

        if len(matches) >= limit:
            break
            
    result_text = '\\n'.join(matches) if matches else 'No files found'
    
    return {
        'content': [{
            'type': 'text',
            'text': result_text
        }]
    }
`;

export const PYTHON_LS_TOOL = `
def ls(path: str = '.', limit: int = 500) -> dict:
    """List directory contents. Returns entries sorted alphabetically, with '/' suffix 
    for directories. Includes dotfiles. Output is truncated to 500 entries or 200KB 
    (whichever is hit first).
    
    IMPORTANT: All arguments must be passed as keyword arguments (e.g., ls(path=".", limit=500)).
    
    Args:
        path: Directory to list (default: current directory)
        limit: Maximum number of entries to return (default: 500)
    
    Returns:
        dict: A dictionary with 'content' field containing:
            [{'type': 'text', 'text': '<entry1>/\n<entry2>\n...'}]
            If empty directory: [{'type': 'text', 'text': '(empty directory)'}]
    """
    dir_path = _resolve_path(path)

    if not dir_path.exists():
        raise FileNotFoundError(f"Directory not found: {path}")

    entries = []
    all_entries = sorted(dir_path.iterdir(), key=lambda p: p.name.lower())
    
    for i, p in enumerate(all_entries):
        if i >= limit:
            break
        # Add '/' suffix for directories
        suffix = '/' if p.is_dir() else ''
        entries.append(f"{p.name}{suffix}")

    if not entries:
        result_text = '(empty directory)'
    else:
        result_text = '\\n'.join(entries)
        # Add notice if we hit the limit
        if len(all_entries) > limit:
            result_text += f"\\n\\n[{limit} entries limit reached]"

    return {
        'content': [{
            'type': 'text',
            'text': result_text
        }]
    }
`;
