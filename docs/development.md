# Development Guide

This guide covers extending and customizing VulnHuntr-Volt for your specific needs.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Creating Custom Tools](#creating-custom-tools)
- [Creating Custom Workflows](#creating-custom-workflows)
- [Adding New Vulnerability Types](#adding-new-vulnerability-types)
- [Custom Reporters](#custom-reporters)
- [Testing](#testing)
- [Contributing](#contributing)

## Development Setup

### Prerequisites

- Node.js 18+
- TypeScript 5.3+
- Git

### Clone and Install

```bash
git clone https://github.com/yourusername/vulnhuntr-volt.git
cd vulnhuntr-volt
npm install
```

### Development Commands

```bash
# Run in watch mode
npm run dev

# Run tests
npm run test
npm run test:watch

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Build
npm run build

# Start server
npm run dev:server
```

## Project Structure

```
vulnhuntr-volt/
├── src/
│   ├── index.ts              # Main entry point
│   ├── config/               # Configuration management
│   ├── llm/                  # LLM provider integrations
│   ├── mcp/                  # MCP server setup
│   ├── prompts/              # Analysis prompts
│   ├── reporters/            # Report generators
│   ├── schemas/              # Zod schemas
│   ├── tools/                # VoltAgent tools
│   │   ├── github.ts         # GitHub integration
│   │   ├── repo.ts           # Repository operations
│   │   └── symbol-finder.ts  # Code analysis
│   ├── workflows/            # VoltAgent workflows
│   │   └── vulnhuntr.ts      # Main analysis workflow
│   ├── cost-tracker/         # Cost tracking
│   ├── checkpoint/           # State management
│   └── integrations/         # External integrations
├── tests/                    # Test files
├── docs/                     # Documentation
└── repos/vulnhuntr/          # Original Python implementation
```

### Key Files

- **src/workflows/vulnhuntr.ts** - Main vulnerability analysis workflow
- **src/tools/symbol-finder.ts** - Wraps original Python symbol finder
- **src/reporters/index.ts** - Report generation in multiple formats
- **src/llm/index.ts** - LLM provider abstraction
- **src/schemas/index.ts** - Input/output schemas

## Creating Custom Tools

Tools are VoltAgent's way of giving LLMs access to external functionality.

### Basic Tool Structure

Create `src/tools/my-tool.ts`:

```typescript
import { defineTool } from '@voltagent/core';
import { z } from 'zod';

export const myTool = defineTool({
  name: 'my-tool',
  description: 'Description of what this tool does',
  
  parameters: z.object({
    input: z.string().describe('Input parameter description'),
    options: z.object({
      flag: z.boolean().default(false)
    }).optional()
  }),
  
  async execute({ input, options }) {
    // Tool implementation
    console.log(`Processing: ${input}`);
    
    // Return results
    return {
      success: true,
      result: 'Tool output'
    };
  }
});
```

### Register the Tool

In `src/tools/index.ts`:

```typescript
import { myTool } from './my-tool';

export const tools = [
  // ... existing tools
  myTool
];
```

### Use in Workflow

```typescript
import { defineWorkflow } from '@voltagent/core';
import { myTool } from '../tools/my-tool';

export const myWorkflow = defineWorkflow({
  name: 'my-workflow',
  tools: [myTool],
  
  async execute({ input }) {
    const result = await myTool.execute({
      input: 'test',
      options: { flag: true }
    });
    
    return result;
  }
});
```

## Creating Custom Workflows

Workflows orchestrate tools and LLM interactions to accomplish complex tasks.

### Basic Workflow Structure

Create `src/workflows/my-workflow.ts`:

```typescript
import { defineWorkflow } from '@voltagent/core';
import { z } from 'zod';

export const myWorkflow = defineWorkflow({
  name: 'my-workflow',
  description: 'Description of the workflow',
  
  inputSchema: z.object({
    target: z.string().describe('Target to analyze'),
    options: z.object({
      deep: z.boolean().default(false)
    }).optional()
  }),
  
  outputSchema: z.object({
    findings: z.array(z.string()),
    summary: z.string()
  }),
  
  tools: [
    // List of tools available to this workflow
  ],
  
  async execute({ input, agent, emit }) {
    // Emit status updates
    emit('status', { message: 'Starting analysis...' });
    
    // Use LLM agent
    const analysis = await agent.generate({
      prompt: `Analyze: ${input.target}`,
      system: 'You are a security analyst.'
    });
    
    // Process results
    const findings = processAnalysis(analysis);
    
    emit('status', { message: 'Analysis complete' });
    
    return {
      findings,
      summary: `Found ${findings.length} issues`
    };
  }
});
```

### Multi-Step Workflow

```typescript
export const complexWorkflow = defineWorkflow({
  name: 'complex-workflow',
  
  async execute({ input, agent, emit }) {
    // Step 1: Initial scan
    emit('step', { name: 'Initial Scan', progress: 0 });
    const initialFindings = await scanPhase1(input);
    
    // Step 2: Deep analysis
    emit('step', { name: 'Deep Analysis', progress: 33 });
    const deepFindings = await scanPhase2(initialFindings);
    
    // Step 3: Verification
    emit('step', { name: 'Verification', progress: 66 });
    const verified = await verifyFindings(deepFindings);
    
    // Step 4: Report generation
    emit('step', { name: 'Generating Report', progress: 90 });
    const report = await generateReport(verified);
    
    emit('complete', { progress: 100 });
    
    return report;
  }
});
```

### Register Workflow

In `src/index.ts`:

```typescript
import { myWorkflow } from './workflows/my-workflow';

const agent = createAgent({
  workflows: [
    vulnhuntrWorkflow,
    myWorkflow  // Add your workflow
  ]
});
```

## Adding New Vulnerability Types

### Define Vulnerability Pattern

In `src/prompts/index.ts`:

```typescript
export const vulnerabilityPatterns = {
  // ... existing patterns
  
  XXE: {
    name: 'XML External Entity (XXE)',
    cwe: 'CWE-611',
    description: 'Allows attackers to interfere with XML processing',
    indicators: [
      'XML parsing without entity restriction',
      'External entity references enabled',
      'DTD processing enabled'
    ],
    examples: `
      # Vulnerable patterns:
      - xml.etree.ElementTree.parse() with external entities
      - lxml.etree.parse() without resolve_entities=False
      - xml.dom.minidom.parse() without feature restriction
    `
  }
};
```

### Update Analysis Prompt

In `src/prompts/index.ts`:

```typescript
export function buildAnalysisPrompt(vulnTypes: string[]) {
  const patterns = vulnTypes
    .map(type => vulnerabilityPatterns[type])
    .filter(Boolean);
  
  return `
    Analyze for these vulnerability types:
    ${patterns.map(p => `
      ## ${p.name} (${p.cwe})
      ${p.description}
      
      Indicators:
      ${p.indicators.map(i => `- ${i}`).join('\n')}
      
      ${p.examples}
    `).join('\n\n')}
  `;
}
```

### Add to Schema

In `src/schemas/index.ts`:

```typescript
export const vulnTypeSchema = z.enum([
  'LFI',
  'RCE',
  'SSRF',
  'AFO',
  'SQLI',
  'XSS',
  'IDOR',
  'XXE'  // Add new type
]);
```

## Custom Reporters

Create custom report formats for your needs.

### Define Reporter

Create `src/reporters/my-format.ts`:

```typescript
import { ReportFormatter } from './types';

export class MyFormatReporter implements ReportFormatter {
  name = 'my-format';
  extension = '.myformat';
  
  async format(findings: Finding[], metadata: Metadata): Promise<string> {
    // Build your custom format
    const report = {
      timestamp: new Date().toISOString(),
      findings: findings.map(f => ({
        id: f.id,
        type: f.type,
        severity: f.severity,
        file: f.file,
        line: f.line
      }))
    };
    
    return JSON.stringify(report, null, 2);
  }
  
  async write(output: string, filepath: string): Promise<void> {
    await fs.writeFile(filepath, output, 'utf-8');
  }
}
```

### Register Reporter

In `src/reporters/index.ts`:

```typescript
import { MyFormatReporter } from './my-format';

export const reporters = {
  json: new JSONReporter(),
  sarif: new SARIFReporter(),
  markdown: new MarkdownReporter(),
  html: new HTMLReporter(),
  csv: new CSVReporter(),
  myformat: new MyFormatReporter()  // Add your reporter
};
```

## Testing

### Unit Tests

Create `tests/my-tool.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { myTool } from '../src/tools/my-tool';

describe('myTool', () => {
  it('should process input correctly', async () => {
    const result = await myTool.execute({
      input: 'test data',
      options: { flag: true }
    });
    
    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });
  
  it('should handle errors gracefully', async () => {
    await expect(
      myTool.execute({ input: '' })
    ).rejects.toThrow('Input required');
  });
});
```

### Workflow Tests

Create `tests/my-workflow.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { myWorkflow } from '../src/workflows/my-workflow';

describe('myWorkflow', () => {
  it('should execute workflow successfully', async () => {
    const mockAgent = {
      generate: vi.fn().mockResolvedValue('analysis result')
    };
    
    const result = await myWorkflow.execute({
      input: { target: 'test' },
      agent: mockAgent,
      emit: vi.fn()
    });
    
    expect(result.findings).toBeDefined();
    expect(result.summary).toContain('issues');
  });
});
```

### Integration Tests

```typescript
import { describe, it, expect } from 'vitest';
import { createAgent } from '@voltagent/core';
import { myWorkflow } from '../src/workflows/my-workflow';

describe('Integration Tests', () => {
  it('should execute full workflow', async () => {
    const agent = createAgent({
      workflows: [myWorkflow],
      llm: mockLLMProvider
    });
    
    const result = await agent.executeWorkflow('my-workflow', {
      target: 'test-data'
    });
    
    expect(result.status).toBe('success');
  });
});
```

### Run Tests

```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# Run specific test file
npm run test -- tests/my-tool.test.ts

# Watch mode
npm run test:watch
```

## Contributing

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add tests for new functionality
5. Ensure tests pass: `npm run test`
6. Lint your code: `npm run lint:fix`
7. Commit: `git commit -m "feat: add my feature"`
8. Push: `git push origin feature/my-feature`
9. Open a Pull Request

### Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test updates
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

### Code Style

- Use TypeScript strict mode
- Follow ESLint configuration
- Use Prettier for formatting
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Write descriptive variable names

## Advanced Topics

### Custom LLM Provider

Create `src/llm/my-provider.ts`:

```typescript
import { LLMProvider } from './types';

export class MyProvider implements LLMProvider {
  name = 'my-provider';
  
  async generate(prompt: string, options: GenerateOptions) {
    // Implement LLM API call
    const response = await fetch('https://api.myprovider.com/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, ...options })
    });
    
    return response.json();
  }
  
  async streamGenerate(prompt: string, options: GenerateOptions) {
    // Implement streaming response
    // Return AsyncIterator<string>
  }
}
```

### Custom MCP Server

```typescript
import { createMCPServer } from '@voltagent/core';

const customServer = createMCPServer({
  name: 'my-custom-server',
  version: '1.0.0',
  
  tools: [
    // Custom tools
  ],
  
  resources: [
    // Custom resources
  ]
});

customServer.listen(3142);
```

## Next Steps

- [Architecture Guide](ARCHITECTURE.md) - Deep dive into system architecture
- [Usage Guide](usage-guide.md) - Learn how to use the system
- [Configuration Guide](configuration.md) - Configure for your needs
- [VoltAgent Documentation](https://github.com/VoltAgent/voltagent) - Framework docs
