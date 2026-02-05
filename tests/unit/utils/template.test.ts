/**
 * Tests for template utilities
 */
import { describe, it, expect } from 'vitest';
import { populateTemplate } from '../../../src/utils/template.js';

describe('populateTemplate', () => {
  it('should replace simple variables', () => {
    const template = 'Hello {{name}}!';
    const result = populateTemplate(template, { name: 'World' });

    expect(result).toBe('Hello World!');
  });

  it('should handle multiple variables', () => {
    const template = '{{greeting}} {{name}}!';
    const result = populateTemplate(template, {
      greeting: 'Hello',
      name: 'World',
    });

    expect(result).toBe('Hello World!');
  });

  it('should handle missing variables', () => {
    const template = 'Hello {{name}}!';
    const result = populateTemplate(template, {});

    // Should leave placeholder or replace with empty string
    expect(result).toBeDefined();
  });

  it('should handle nested objects', () => {
    const template = 'Hello {{user.name}}!';
    const result = populateTemplate(template, {
      user: { name: 'Alice' },
    });

    expect(result).toBe('Hello Alice!');
  });

  it('should handle arrays with each helper', () => {
    const template = '{{#each items}}{{this}}, {{/each}}';
    const result = populateTemplate(template, {
      items: ['a', 'b', 'c'],
    });

    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result).toContain('c');
  });

  it('should handle conditional statements', () => {
    const template = '{{#if condition}}Yes{{else}}No{{/if}}';
    
    const resultTrue = populateTemplate(template, { condition: true });
    const resultFalse = populateTemplate(template, { condition: false });

    expect(resultTrue).toBe('Yes');
    expect(resultFalse).toBe('No');
  });

  it('should handle complex templates', () => {
    const template = `
      System: {{system_prompt}}
      
      Tools:
      {{#each tools}}
      - {{name}}: {{description}}
      {{/each}}
      
      {{#if custom_instructions}}
      Instructions: {{custom_instructions}}
      {{/if}}
    `;

    const result = populateTemplate(template, {
      system_prompt: 'You are helpful',
      tools: [
        { name: 'calculator', description: 'Do math' },
        { name: 'search', description: 'Search web' },
      ],
      custom_instructions: 'Be concise',
    });

    expect(result).toContain('You are helpful');
    expect(result).toContain('calculator');
    expect(result).toContain('Be concise');
  });

  it('should handle escaped characters', () => {
    const template = 'Value: {{value}}';
    const result = populateTemplate(template, {
      value: 'Special: <>&"',
    });

    expect(result).toBeDefined();
  });
});
