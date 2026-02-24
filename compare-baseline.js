/**
 * Baseline Comparison Script
 * 
 * Compares Node-WASM baseline (test-node-baseline.json) with Web-WASM results
 * (test-web-baseline.json) to validate Web-WASM CodeAgent consistency.
 * 
 * Usage:
 *   node compare-baseline.js [node-baseline.json] [web-baseline.json]
 * 
 * Default files:
 *   - test-node-baseline.json (Node-WASM results)
 *   - test-web-baseline.json (Web-WASM results)
 */

import { readFileSync, existsSync } from 'fs';

const NODE_BASELINE = process.argv[2] || 'test-node-baseline.json';
const WEB_BASELINE = process.argv[3] || 'test-web-baseline.json';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function loadBaseline(path) {
  if (!existsSync(path)) {
    console.error(`${RED}Error: File not found: ${path}${RESET}`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    console.error(`${RED}Error parsing ${path}: ${error.message}${RESET}`);
    process.exit(1);
  }
}

function normalizeOutput(output) {
  // Normalize output for comparison
  return output
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

function compareOutputs(nodeOutput, webOutput) {
  const nodeNorm = normalizeOutput(nodeOutput);
  const webNorm = normalizeOutput(webOutput);
  
  // Check for key patterns in both outputs
  const checks = {
    // Both should indicate success or failure similarly
    success: nodeNorm.includes('success') === webNorm.includes('success'),
    error: nodeNorm.includes('error') === webNorm.includes('error'),
    
    // Check for common content patterns
    hasContent: nodeNorm.length > 0 && webNorm.length > 0,
  };
  
  // Calculate similarity score (simple word overlap)
  const nodeWords = new Set(nodeNorm.split(' '));
  const webWords = new Set(webNorm.split(' '));
  const intersection = new Set([...nodeWords].filter(x => webWords.has(x)));
  const similarity = intersection.size / Math.max(nodeWords.size, webWords.size);
  
  return {
    checks,
    similarity,
    match: similarity > 0.5 && checks.success && checks.error,
  };
}

function main() {
  console.log(`${BOLD}=== Web-WASM CodeAgent Validation Comparison ===${RESET}\n`);
  
  console.log(`Node-WASM baseline: ${NODE_BASELINE}`);
  console.log(`Web-WASM baseline:  ${WEB_BASELINE}\n`);
  
  const nodeBaseline = loadBaseline(NODE_BASELINE);
  const webBaseline = loadBaseline(WEB_BASELINE);
  
  console.log(`${BOLD}Environment Info:${RESET}`);
  console.log(`  Node-WASM: ${nodeBaseline.timestamp} (${nodeBaseline.fsMode})`);
  console.log(`  Web-WASM:  ${webBaseline.timestamp} (${webBaseline.fsMode})\n`);
  
  // Build lookup map for Web results
  const webResultsMap = new Map(webBaseline.results.map(r => [r.testId, r]));
  
  let matches = 0;
  let mismatches = 0;
  let missing = 0;
  
  console.log(`${BOLD}Test Comparison Results:${RESET}\n`);
  
  for (const nodeResult of nodeBaseline.results) {
    const webResult = webResultsMap.get(nodeResult.testId);
    
    if (!webResult) {
      console.log(`${YELLOW}⚠️  MISSING: ${nodeResult.name} (not in Web-WASM results)${RESET}`);
      missing++;
      continue;
    }
    
    const comparison = compareOutputs(nodeResult.output, webResult.output);
    
    if (comparison.match) {
      console.log(`${GREEN}✅ MATCH: ${nodeResult.name}${RESET}`);
      console.log(`   Similarity: ${(comparison.similarity * 100).toFixed(1)}%`);
      matches++;
    } else {
      console.log(`${RED}❌ MISMATCH: ${nodeResult.name}${RESET}`);
      console.log(`   Similarity: ${(comparison.similarity * 100).toFixed(1)}%`);
      console.log(`   Node status: ${nodeResult.status}, Web status: ${webResult.status}`);
      
      if (nodeResult.status !== webResult.status) {
        console.log(`   ${RED}Status differs!${RESET}`);
      }
      
      // Show output snippets
      console.log(`   Node output: ${nodeResult.output.substring(0, 100)}...`);
      console.log(`   Web output:  ${webResult.output.substring(0, 100)}...`);
      mismatches++;
    }
    
    console.log();
  }
  
  // Summary
  const total = nodeBaseline.results.length;
  const matchRate = ((matches / total) * 100).toFixed(1);
  
  console.log(`${BOLD}Summary:${RESET}`);
  console.log(`  Total tests: ${total}`);
  console.log(`  ${GREEN}Matches: ${matches}${RESET}`);
  console.log(`  ${RED}Mismatches: ${mismatches}${RESET}`);
  console.log(`  ${YELLOW}Missing: ${missing}${RESET}`);
  console.log(`  Match rate: ${matchRate}%`);
  
  if (mismatches === 0 && missing === 0) {
    console.log(`\n${GREEN}${BOLD}✓ All tests passed! Web-WASM is consistent with Node-WASM.${RESET}`);
    process.exit(0);
  } else {
    console.log(`\n${YELLOW}${BOLD}⚠ Some tests did not match. Review the output above.${RESET}`);
    process.exit(1);
  }
}

main();
