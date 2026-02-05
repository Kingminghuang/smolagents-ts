/**
 * Planning prompt templates
 */
export interface PlanningPromptTemplate {
  initial_plan: string;
  update_plan_pre_messages: string;
  update_plan_post_messages: string;
}

/**
 * Managed agent prompt templates
 */
export interface ManagedAgentPromptTemplate {
  task: string;
  report: string;
}

/**
 * Final answer prompt templates
 */
export interface FinalAnswerPromptTemplate {
  pre_messages: string;
  post_messages: string;
}

/**
 * Complete prompt templates structure
 */
export interface PromptTemplates {
  system_prompt: string;
  planning?: PlanningPromptTemplate;
  managed_agent?: ManagedAgentPromptTemplate;
  final_answer?: FinalAnswerPromptTemplate;
}

/**
 * Template variable types
 */
export type TemplateVariables = Record<string, unknown>;
