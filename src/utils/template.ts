import Handlebars from 'handlebars';
import type { TemplateVariables } from '../types/index.js';

/**
 * Compile and populate a Handlebars template
 */
export function populateTemplate(template: string, variables: TemplateVariables): string {
  try {
    const compiledTemplate = Handlebars.compile(template, {
      noEscape: true,
      strict: false,
    });

    return compiledTemplate(variables);
  } catch (error) {
    throw new Error(`Failed to populate template: ${String(error)}`);
  }
}

/**
 * Register custom Handlebars helpers
 */
export function registerTemplateHelpers() {
  // Helper to format tool list
  Handlebars.registerHelper('formatTools', function (tools: unknown[]) {
    if (!tools || tools.length === 0) {
      return 'No tools available.';
    }

    return tools
      .map((tool: unknown) => {
        const typedTool = tool as {
          name?: string;
          description?: string;
          inputs?: Record<string, { type?: string; description?: string }>;
        };
        const inputs = Object.entries(typedTool.inputs || {})
          .map(([name, def]) => {
            return `  - ${name} (${def.type ?? 'unknown'}): ${def.description ?? ''}`;
          })
          .join('\n');

        return `- ${typedTool.name ?? 'unknown'}: ${typedTool.description ?? ''}\n${inputs}`;
      })
      .join('\n\n');
  });

  // Helper to format managed agents
  Handlebars.registerHelper('formatManagedAgents', function (agents: unknown[]) {
    if (!agents || agents.length === 0) {
      return '';
    }

    return agents
      .map((agent: unknown) => {
        const typedAgent = agent as { name?: string; description?: string };
        return `- ${typedAgent.name ?? 'unknown'}: ${typedAgent.description ?? ''}`;
      })
      .join('\n');
  });

  // Helper for conditional rendering
  // Handlebars requires any types for this and options
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  Handlebars.registerHelper(
    'ifCond',
    function (this: any, v1: unknown, operator: string, v2: unknown, options: any) {
      switch (operator) {
        case '==':
          return (v1 as any) == (v2 as any) ? options.fn(this) : options.inverse(this);
        case '===':
          return v1 === v2 ? options.fn(this) : options.inverse(this);
        case '!=':
          return (v1 as any) != (v2 as any) ? options.fn(this) : options.inverse(this);
        case '!==':
          return v1 !== v2 ? options.fn(this) : options.inverse(this);
        case '<':
          return (v1 as any) < (v2 as any) ? options.fn(this) : options.inverse(this);
        case '<=':
          return (v1 as any) <= (v2 as any) ? options.fn(this) : options.inverse(this);
        case '>':
          return (v1 as any) > (v2 as any) ? options.fn(this) : options.inverse(this);
        case '>=':
          return (v1 as any) >= (v2 as any) ? options.fn(this) : options.inverse(this);
        case '&&':
          return v1 && v2 ? options.fn(this) : options.inverse(this);
        case '||':
          return v1 || v2 ? options.fn(this) : options.inverse(this);
        default:
          return options.inverse(this);
      }
    }
  );
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
}

// Register helpers on module load
registerTemplateHelpers();
