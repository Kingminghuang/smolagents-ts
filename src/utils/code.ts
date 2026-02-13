import type { Tool } from '../types/index.js';
import { safeStringify } from './format.js';

export function extractCodeFromText(text: string, codeBlockTags: [string, string]): string | null {
  const [openTag, closeTag] = codeBlockTags;
  // Escape special regex characters in tags
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\\]/g, '\\$&');

  // Create pattern: openTag(.*?)closeTag
  // Use 's' flag (dotAll) to match newlines with .
  const pattern = new RegExp(`${escapeRegex(openTag)}(.*?)${escapeRegex(closeTag)}`, 'gs');

  const matches = [...text.matchAll(pattern)];
  if (matches.length > 0) {
    // Join all matches with double newline
    return matches.map((m) => (m[1] ?? '').trimEnd()).join('\n\n');
  }
  return null;
}

export function parseCodeBlobs(text: string, codeBlockTags: [string, string]): string {
  let matches = extractCodeFromText(text, codeBlockTags);
  if (!matches) {
    // Fallback to markdown pattern if provided tags didn't work
    matches = extractCodeFromText(text, ['```python', '```']);
    if (!matches) {
      matches = extractCodeFromText(text, ['```py', '```']);
    }
  }

  if (matches) {
    const lines = matches.split('\n');
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    if (nonEmptyLines.length > 0) {
      const minIndent = nonEmptyLines.reduce((min, line) => {
        const indent = line.match(/^\s*/)?.[0]?.length ?? 0;
        return Math.min(min, indent);
      }, Number.POSITIVE_INFINITY);
      if (Number.isFinite(minIndent) && minIndent > 0) {
        return lines.map((line) => line.slice(minIndent)).join('\n');
      }
    }
    return matches;
  }

  // Check if final_answer is present but no code block
  if (text.includes('final_answer') && text.includes('answer')) {
    throw new Error(`Your code snippet is invalid, because the regex pattern ${codeBlockTags[0]}(.*?)${codeBlockTags[1]} was not found in it.
Here is your code snippet:
${text}
It seems like you're trying to return the final answer, you can do it as follows:
${codeBlockTags[0]}
final_answer("YOUR FINAL ANSWER HERE")
${codeBlockTags[1]}`);
  }

  throw new Error(`Your code snippet is invalid, because the regex pattern ${codeBlockTags[0]}(.*?)${codeBlockTags[1]} was not found in it.
Here is your code snippet:
${text}
Make sure to include code with the correct pattern, for instance:
Thoughts: Your thoughts
${codeBlockTags[0]}
# Your python code here
${codeBlockTags[1]}`);
}

export function fixFinalAnswerCode(code: string): string {
  // Replace variable assignments to final_answer with final_answer_variable
  // while preserving function calls to final_answer()

  // Regex for assignment: final_answer = ...
  // (?<!\.)(?<!\w) checks for word boundary/not object attribute
  const assignmentRegex = /(?<!\.)(?<!\w)(\bfinal_answer)(\s*=)/g;

  if (!code.includes('final_answer(') && !assignmentRegex.test(code)) {
    return code;
  }

  let fixedCode = code.replace(assignmentRegex, 'final_answer_variable$2');

  // Regex for variable usage: final_answer
  const variableRegex = /(?<!\.)(?<!\w)(\bfinal_answer\b)(?!\s*\()/g;
  fixedCode = fixedCode.replace(variableRegex, 'final_answer_variable');

  return fixedCode;
}

const mapToPythonType = (type: string | undefined): string => {
  switch (type) {
    case 'string':
      return 'str';
    case 'number':
      return 'float';
    case 'integer':
      return 'int';
    case 'boolean':
      return 'bool';
    case 'object':
    case 'dict':
      return 'dict';
    case 'array':
    case 'list':
      return 'list';
    case 'any':
      return 'Any';
    default:
      return 'Any';
  }
};

export function toPythonToolSignature(tool: Tool): string {
  const inputs = tool.inputs || {};
  const args = Object.entries(inputs).map(([name, def]) => {
    let mappedType = mapToPythonType(def?.type);

    // Check if it's nullable or optional
    if (def?.nullable) {
      // If we want to show Optional[T], we could do that, but usually just T = None covers it
      // mappedType = `Optional[${mappedType}]`;
    }

    let param = `${name}: ${mappedType}`;

    // Add default value if present
    if (def?.default !== undefined) {
      const defaultVal = typeof def.default === 'string' ? `"${def.default}"` : def.default;
      param += ` = ${defaultVal}`;
    } else if (def?.nullable) {
      param += ` = None`;
    }

    return param;
  });

  const argsDoc = Object.entries(inputs)
    .map(([name, def]) => {
      return `        ${name}: ${def?.description || ''}`;
    })
    .join('\n');

  const returnType = mapToPythonType(tool.output_type);
  const schemaSection =
    tool.output_schema !== undefined
      ? `\n${safeStringify(tool.output_schema)
        .split('\n')
        .map((line) => `            ${line}`)
        .join('\n')}`
      : '';
  const exampleSection =
    tool.output_example !== undefined
      ? `\n\n    Example:\n${safeStringify(tool.output_example)
        .split('\n')
        .map((line) => `        ${line}`)
        .join('\n')}`
      : '';
  const outputDescription =
    tool.output_description || tool.output_example || tool.output_schema
      ? `\n\n    Returns:\n        ${tool.output_description || 'See example.'}${tool.output_schema !== undefined ? schemaSection : exampleSection
      }`
      : '';
  const argsSection = argsDoc ? `\n\n    Args:\n${argsDoc}` : `\n\n    Args:\n        None`;
  const docstring = `${tool.description}${argsSection}${outputDescription}\n`;

  return `def ${tool.name}(${args.join(', ')}) -> ${returnType}:
    """${docstring}    """`;
}

export function toToolCallingToolSignature(tool: Tool): string {
  const outputType = tool.output_type ? tool.output_type : 'any';
  return `${tool.name}: ${tool.description}
    Takes inputs: ${safeStringify(tool.inputs)}
    Returns an output of type: ${outputType}`;
}
