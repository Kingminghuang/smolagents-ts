import type { PromptTemplates, MultiStepAgentConfig } from '../types/index.js';
import { ActionStep, AgentMemory } from '../memory/index.js';
import { MultiStepAgent } from './multi-step-agent.js';
import { PyodideExecutor, type CodeOutput } from '../utils/python-executor.js';
import { loadPromptTemplate } from '../prompts/template-loader.js';
import { populateTemplate } from '../utils/template.js';
import { parseCodeBlobs, fixFinalAnswerCode, toPythonToolSignature } from '../utils/code.js';
import { safeStringify } from '../utils/format.js';
import { AgentExecutionError, AgentParsingError } from '../utils/errors.js';

export interface CodeAgentConfig extends MultiStepAgentConfig {
  authorized_imports?: string[];
  executor?: PyodideExecutor;
  code_block_tags?: [string, string];
}

export class CodeAgent extends MultiStepAgent {
  protected executor: PyodideExecutor;
  protected authorized_imports: string[];
  protected code_block_tags: [string, string];

  constructor(config: CodeAgentConfig) {
    const prompt_templates = config.prompt_templates || loadPromptTemplate('code-agent.yaml');

    super({
      ...config,
      prompt_templates,
    });

    this.authorized_imports = config.authorized_imports || [
      'collections',
      'datetime',
      'itertools',
      'math',
      'os',
      'queue',
      'random',
      're',
      'stat',
      'statistics',
      'time',
      'unicodedata',
      'json',
      'base64',
      'pathlib'
    ];

    this.code_block_tags = config.code_block_tags || ['<code>', '</code>'];

    this.executor = config.executor || new PyodideExecutor(this.authorized_imports);

    // Re-initialize memory with correct system prompt now that properties are set
    const system_prompt = this.initialize_system_prompt();
    this.memory = new AgentMemory(system_prompt);
  }

  protected get_default_prompt_templates(): PromptTemplates {
    return loadPromptTemplate('code-agent.yaml');
  }

  initialize_system_prompt(): string {
    if (!this.authorized_imports) {
      return '';
    }
    const system_prompt_template = this.prompt_templates.system_prompt;

    // Format authorized imports
    const authorized_imports_str = this.authorized_imports.includes('*')
      ? 'You can import from any package you want.'
      : JSON.stringify(this.authorized_imports);

    const toolDefinitions = Array.from(this.tools.values())
      .map((tool) => toPythonToolSignature(tool))
      .join('\n\n');

    const managedAgentDefinitions = Array.from(this.managed_agents.values())
      .map((agent) => {
        const agentDef = agent.to_dict() as { function?: { name?: string; description?: string } };
        const name = agentDef.function?.name || 'agent';
        const description = agentDef.function?.description || '';
        return (
          `def ${name}(task: str, additional_args: dict[str, Any]) -> str:\n` +
          `    """${description}\n\n` +
          `    Args:\n` +
          `        task: Long detailed description of the task.\n` +
          `        additional_args: Dictionary of extra inputs to pass to the managed agent, e.g. images, dataframes, or any other contextual data it may need.\n` +
          `    """`
        );
      })
      .join('\n');

    // Prepare variables for template
    const variables = {
      tools_prompt: toolDefinitions,
      managed_agents_prompt: managedAgentDefinitions,
      has_managed_agents: this.managed_agents.size > 0,
      authorized_imports: authorized_imports_str,
      custom_instructions: this.instructions,
      code_block_opening_tag: this.code_block_tags[0],
      code_block_closing_tag: this.code_block_tags[1],
    };

    return populateTemplate(system_prompt_template, variables);
  }

  private extractTextContent(content: string | { type: string; text?: string }[]): string {
    if (typeof content === 'string') return content;
    return content
      .map((part) =>
        part && typeof part === 'object' && part.type === 'text' ? (part.text ?? '') : ''
      )
      .join('');
  }

  protected async *_step_stream(memory_step: ActionStep): AsyncGenerator<unknown> {
    const messages = this.write_memory_to_messages();
    memory_step.model_input_messages = messages;

    const stop_sequences = ['Observation:', 'Calling tools:'];
    if (!this.code_block_tags[0].includes(this.code_block_tags[1])) {
      stop_sequences.push(this.code_block_tags[1]);
    }

    let output_text = '';

    try {
      const response = await this.model.generate(messages, {
        stop_sequences: stop_sequences,
      });

      output_text = this.extractTextContent(response.content || '');
      memory_step.model_output_message = response;
      memory_step.model_output = output_text;
      memory_step.token_usage = response.token_usage;

      yield response;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Error generating model output: ${message}`);
    }

    // Append closing tag if missing
    if (output_text && !output_text.trim().endsWith(this.code_block_tags[1])) {
      output_text += this.code_block_tags[1];
      if (memory_step.model_output_message) {
        memory_step.model_output_message.content = output_text;
      }
    }

    // Parse code
    let code_action: string;
    try {
      code_action = parseCodeBlobs(output_text, this.code_block_tags);
      code_action = fixFinalAnswerCode(code_action);
      // memory_step.code_action = code_action; // Field does not exist on ActionStep
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AgentParsingError(message);
    }

    // Create tool call for logging/memory
    const tool_call: { id: string; name: string; arguments: { code: string } } = {
      name: 'python_interpreter',
      arguments: { code: code_action },
      id: `call_${this.step_number}`,
    };
    memory_step.tool_calls = [tool_call];
    yield tool_call;

    // Execute code
    this.logger.info(`Executing parsed code:\n${code_action}`);

    await this.executor.sendVariables(Object.fromEntries(this.state));

    // Collect Python implementations from tools
    const pythonToolsMap: Record<string, string> = {};
    for (const tool of this.tools.values()) {
      if (tool.pythonCode) {
        pythonToolsMap[tool.name] = tool.pythonCode;
      }
    }

    // Python fs-tools and other Python-native tools are now injected here
    // No need to build tool_map for them since they are Python-native
    await this.executor.sendTools({}, pythonToolsMap);

    let code_output: CodeOutput;
    try {
      code_output = await this.executor.run(code_action);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AgentExecutionError(message);
    }

    let observationForModel = `Execution logs:\n${code_output.logs}`;
    if (code_output.output !== undefined) {
      const modelOutputText =
        typeof code_output.output === 'string'
          ? code_output.output
          : safeStringify(code_output.output).trim();
      observationForModel += `\nLast output from code snippet:\n${modelOutputText}`;
    }

    memory_step.observations = observationForModel;

    this.logger.info(observationForModel);

    // Yield plain object matching ActionOutput interface
    yield {
      output: code_output.output,
      is_final_answer: code_output.is_final_answer,
      observation: observationForModel,
    };
  }

  /**
   * Cleanup method - MUST be called when agent is no longer needed
   * This ensures NODEFS is unmounted and resources are released
   */
  async cleanup() {
    await this.executor.cleanup();
  }
}
