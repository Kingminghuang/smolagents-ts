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
def read(path: str, offset: int = 1, limit: int = None, **kwargs) -> dict:
    """Read the contents of a file. Supports text files and images (jpg, png, gif, webp). 
    Images are sent as attachments. For text files, output is truncated to 2000 lines or 
    200KB (whichever is hit first). Use offset/limit for large files. When you need the 
    full file, continue with offset until complete.
    
    IMPORTANT: Use this tool instead of Python's built-in open() function for file reading.
    IMPORTANT: All arguments must be passed as keyword arguments (e.g., read(path="file.txt", offset=1)).
    
    Args:
        path: Path to the file to read (relative or absolute)
        offset: Line number to start reading from (1-indexed), nullable
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
    
    # Handle aliases
    if offset == 1 and 'start_line' in kwargs:
        offset = kwargs['start_line']

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
def edit(path: str, old_text: str = None, new_text: str = None, **kwargs) -> dict:
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
    # Handle aliases for compatibility with agent predictions
    if old_text is None:
        old_text = kwargs.get('old_str') or kwargs.get('oldText')
    if new_text is None:
        new_text = kwargs.get('new_str') or kwargs.get('newText')

    if old_text is None or new_text is None:
        raise ValueError("Missing required arguments: old_text/oldText and new_text/newText")

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
         literal: bool = False, context: int = 0, limit: int = 100, **kwargs) -> dict:
    """Search file contents for a pattern. Returns matching lines with file paths and 
    line numbers. Respects .gitignore. Output is truncated to 100 matches or 200KB 
    (whichever is hit first). Long lines are truncated to 500 chars.
    
    IMPORTANT: All arguments must be passed as keyword arguments (e.g., grep(pattern="search", path=".")).
    
    Args:
        pattern: Search pattern (regex or literal string)
        path: Directory or file to search (default: current directory), nullable
        glob: Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts', nullable
        ignoreCase: Case-insensitive search (default: false), nullable
        literal: Treat pattern as literal string instead of regex (default: false), nullable
        context: Number of lines to show before and after each match (default: 0), nullable
        limit: Maximum number of matches to return (default: 100), nullable
    
    Returns:
        dict: A dictionary with 'content' field containing:
            [{'type': 'text', 'text': '<path>:<line_num>: <matching line>\n...'}]
            If no matches found: [{'type': 'text', 'text': 'No matches found'}]
    """
    # Handle parameter aliases
    if 'ignore_case' not in kwargs and 'ignoreCase' in kwargs:
        ignore_case = kwargs['ignoreCase']
    
    search_path = _resolve_path(path)
    mount_root = Path(MOUNT_POINT)

    if not search_path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    # Build regex flags
    flags = re.IGNORECASE if ignore_case else 0
    
    # Escape pattern if literal search
    search_pattern = re.escape(pattern) if literal else pattern
    
    try:
        regex = re.compile(search_pattern, flags)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    # Compile glob pattern if provided
    glob_regex = None
    if glob:
        # Convert glob to regex (handle ** and *)
        glob_pattern = glob.replace('.', r'\.')
        glob_pattern = glob_pattern.replace('**/', '<<<DOUBLESTAR>>>')
        glob_pattern = glob_pattern.replace('**', '<<<DOUBLESTAR>>>')
        glob_pattern = glob_pattern.replace('*', '[^/]*')
        glob_pattern = glob_pattern.replace('<<<DOUBLESTAR>>>', '.*')
        glob_regex = re.compile(glob_pattern)

    # Load .gitignore patterns
    gitignore_patterns = []
    gitignore_path = mount_root / '.gitignore'
    if gitignore_path.exists():
        try:
            gitignore_content = gitignore_path.read_text()
            for line in gitignore_content.splitlines():
                line = line.strip()
                if line and not line.startswith('#'):
                    gitignore_patterns.append(line)
        except:
            pass

    def _is_gitignored(file_path: Path) -> bool:
        """Check if file matches gitignore patterns"""
        rel_path = str(file_path.relative_to(mount_root))
        for pattern in gitignore_patterns:
            # Simple gitignore matching
            if pattern in rel_path:
                return True
            if pattern.endswith('/'):
                if rel_path.startswith(pattern.rstrip('/')):
                    return True
        return False

    # Collect files to search
    files_to_search = []
    if search_path.is_file():
        files_to_search = [search_path]
    else:
        for p in search_path.rglob('*'):
            if p.is_file() and not _is_gitignored(p):
                # Check glob filter
                if glob_regex:
                    rel_path = str(p.relative_to(search_path))
                    if not glob_regex.search(rel_path):
                        continue
                files_to_search.append(p)

    matches = []
    match_count = 0

    for file_path in files_to_search:
        if match_count >= limit:
            break
            
        try:
            content = file_path.read_text()
            lines = content.splitlines()
            rel_path = file_path.relative_to(mount_root)
            
            for i, line in enumerate(lines):
                if match_count >= limit:
                    break
                    
                if regex.search(line):
                    # Add context lines before
                    if context > 0:
                        for j in range(max(0, i - context), i):
                            ctx_line = lines[j][:500] + '...' if len(lines[j]) > 500 else lines[j]
                            matches.append(f"{rel_path}:{j+1}: {ctx_line}")
                    
                    # Add the match line
                    display_line = line[:500] + '...' if len(line) > 500 else line
                    matches.append(f"{rel_path}:{i+1}: {display_line}")
                    match_count += 1
                    
                    # Add context lines after
                    if context > 0:
                        for j in range(i + 1, min(len(lines), i + 1 + context)):
                            ctx_line = lines[j][:500] + '...' if len(lines[j]) > 500 else lines[j]
                            matches.append(f"{rel_path}:{j+1}: {ctx_line}")
                        
        except (UnicodeDecodeError, IOError):
            # Skip binary or unreadable files
            continue

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
    search directory. Respects .gitignore. Output is truncated to 1000 results or 200KB 
    (whichever is hit first).
    
    IMPORTANT: All arguments must be passed as keyword arguments (e.g., find(pattern="*.ts", path=".")).
    
    Args:
        pattern: Glob pattern to match files, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts'
        path: Directory to search in (default: current directory), nullable
        limit: Maximum number of results (default: 1000), nullable
    
    Returns:
        dict: A dictionary with 'content' field containing:
            [{'type': 'text', 'text': '<file1>\n<file2>\n...'}]
            If no files found: [{'type': 'text', 'text': 'No files found'}]
    """
    search_path = _resolve_path(path)
    mount_root = Path(MOUNT_POINT)

    # Convert glob pattern to regex (handle ** and *)
    glob_pattern = pattern.replace('.', r'\.')
    glob_pattern = glob_pattern.replace('**/', '<<<DOUBLESTAR>>>')
    glob_pattern = glob_pattern.replace('**', '<<<DOUBLESTAR>>>')
    glob_pattern = glob_pattern.replace('*', '[^/]*')
    glob_pattern = glob_pattern.replace('<<<DOUBLESTAR>>>', '.*')
    glob_pattern = f'^{glob_pattern}$'
    regex = re.compile(glob_pattern)

    # Load .gitignore patterns
    gitignore_patterns = []
    gitignore_path = mount_root / '.gitignore'
    if gitignore_path.exists():
        try:
            gitignore_content = gitignore_path.read_text()
            for line in gitignore_content.splitlines():
                line = line.strip()
                if line and not line.startswith('#'):
                    gitignore_patterns.append(line)
        except:
            pass

    def _is_gitignored(file_path: Path) -> bool:
        """Check if file matches gitignore patterns"""
        rel_path = str(file_path.relative_to(mount_root))
        for pattern in gitignore_patterns:
            # Simple gitignore matching
            if pattern in rel_path:
                return True
            if pattern.endswith('/'):
                if rel_path.startswith(pattern.rstrip('/')):
                    return True
            if pattern.startswith('*.'):
                if rel_path.endswith(pattern[1:]):
                    return True
        return False

    matches = []
    for p in search_path.rglob('*'):
        if p.is_file() and not _is_gitignored(p):
            rel_path = p.relative_to(mount_root)
            # Match against the full relative path
            if regex.search(str(rel_path)):
                matches.append(str(rel_path))
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
        path: Directory to list (default: current directory), nullable
        limit: Maximum number of entries to return (default: 500), nullable
    
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
