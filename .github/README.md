# Agent Orchestration System

**Version**: 1.0.0  
**Status**: ✅ Active  
**Last Updated**: February 6, 2026

---

## Overview

This workspace has a **context-efficient agent orchestration system** that prevents context flooding by intelligently delegating tasks to specialized sub-agents.

### What This Means for You

When using GitHub Copilot in this workspace:

- ✅ **Automatic Routing**: Your requests are automatically routed to the right specialist
- ✅ **No Context Flooding**: Only relevant knowledge is loaded (1-3 agents max)
- ✅ **Faster Responses**: Less context = faster, more focused answers
- ✅ **Higher Quality**: Specialized agents provide expert-level guidance
- ✅ **Always Research**: Agents verify against actual code before responding

---

## How It Works

```
Your Question
     ↓
Main Orchestrator (.agents/SKILL.md)
     ↓
  Analyzes → Selects 1-3 Sub-Agents → Responds
     ↓
VoltAgent Dev │ TypeScript │ Git │ Infrastructure │ Docs
```

### Example Flow

**You ask**: *"How do I add a tool to my agent?"*

**Orchestrator thinks**:

- Domain: VoltAgent development
- Sub-Agent needed: `voltagent-dev.md`
- No other agents needed

**Action taken**:

1. Loads ONLY `voltagent-dev.md` (~10KB)
2. Searches for tool examples in codebase
3. Provides accurate, researched answer with code

**Result**: Fast, accurate response with ~10KB context instead of ~50KB+ loading everything.

---

## Agent Directory

### Main Orchestrator

**File**: [.agents/SKILL.md](.agents/SKILL.md)  
**Role**: Analyzes requests and delegates to sub-agents  
**Always Loaded**: Yes (via VS Code settings)

### Sub-Agents

| Agent | File | When It's Used |
|-------|------|----------------|
| **VoltAgent Development** | [voltagent-dev.md](.agents/sub-agents/voltagent-dev.md) | Agents, workflows, tools, VoltAgent API |
| **VoltAgent Documentation** | [voltagent-docs.md](.agents/sub-agents/voltagent-docs.md) | Skills, examples, best practices |
| **TypeScript Development** | [typescript-dev.md](.agents/sub-agents/typescript-dev.md) | TypeScript, Node.js, build tools |
| **Git Operations** | [git-ops.md](.agents/sub-agents/git-ops.md) | Git commands, commits, branches |
| **Infrastructure** | [infrastructure.md](.agents/sub-agents/infrastructure.md) | Docker, deployment, CI/CD |
| **Vulnhuntr** | [../repos/vulnhuntr/SKILL.md](../repos/vulnhuntr/SKILL.md) | Python security scanner (separate system) |

---

## Usage Examples

### Single-Domain Questions

**Q**: *"What's the syntax for creating a workflow?"*  
**Loaded**: `voltagent-dev.md` only  
**Context**: ~10KB

**Q**: *"How do I commit with conventional commits?"*  
**Loaded**: `git-ops.md` only  
**Context**: ~8KB

**Q**: *"Explain TypeScript generics"*  
**Loaded**: `typescript-dev.md` only  
**Context**: ~12KB

### Multi-Domain Questions

**Q**: *"Create an agent and containerize it with Docker"*  
**Loaded**: `voltagent-dev.md` + `infrastructure.md`  
**Context**: ~20KB (vs 50KB+ loading all)

**Q**: *"Set up TypeScript build with Git workflow"*  
**Loaded**: `typescript-dev.md` + `git-ops.md`  
**Context**: ~20KB

### Vulnhuntr-Specific

**Q**: *"Fix the Python vulnerability scanner's LLM validation"*  
**Loaded**: Vulnhuntr's own SKILL.md system  
**Context**: Vulnhuntr-specific (separate from root)

---

## Configuration

### VS Code Settings

**File**: [.vscode/settings.json](../.vscode/settings.json)

The orchestrator is automatically loaded via:

```json
{
  "github.copilot.advanced": {
    "contextFiles": [
      ".agents/SKILL.md"
    ]
  }
}
```

### Verification

To verify the system is working, ask Copilot:

> *"Which sub-agents are available in this workspace?"*

It should list all 5 sub-agents and explain the orchestration system.

---

## Sub-Agent Summaries

### VoltAgent Development ([voltagent-dev.md](.agents/sub-agents/voltagent-dev.md))

**Expertise**:

- Agent creation and configuration  
- Workflow chains and orchestration
- Tool development with type-safe schemas
- Memory systems and state management
- VoltAgent server configuration
- Multi-agent systems

**Key Patterns**:

- Agent: `new Agent({ name, model, instructions, tools })`
- Workflow: `createWorkflowChain({ id, input, result })`
- Tool: `tool({ name, description, input, output, execute })`
- Bootstrap: `new VoltAgent({ agents, workflows, server })`

### VoltAgent Documentation ([voltagent-docs.md](.agents/sub-agents/voltagent-docs.md))

**Expertise**:

- Skills system and library
- Code examples and templates
- Best practices and design patterns
- Framework conventions
- MCP (Model Context Protocol) integration

**Key Resources**:

- `.agents/skills/voltagent-best-practices/SKILL.md`
- `.agents/skills/create-voltagent/SKILL.md`
- `.agents/skills/voltagent-docs-bundle/SKILL.md`

### TypeScript Development ([typescript-dev.md](.agents/sub-agents/typescript-dev.md))

**Expertise**:

- TypeScript type system (generics, utilities, unions)
- tsconfig.json and tsdown.config.ts
- ESM module system
- Async/await patterns
- Error handling
- Build troubleshooting

**Key Patterns**:

- Type safety over any
- Interface for objects, type for unions
- Generics for reusable code
- Result pattern for type-safe errors

### Git Operations ([git-ops.md](.agents/sub-agents/git-ops.md))

**Expertise**:

- Conventional Commits format
- Branching strategies (feature, fix, chore)
- Merge vs rebase workflows
- Conflict resolution
- Tagging and releases (semantic versioning)
- Git configuration and aliases

**Key Patterns**:

- Commit: `feat(scope): description`
- Branch: `feat/feature-name`, `fix/bug-name`
- Tag: `v<MAJOR>.<MINOR>.<PATCH>`

### Infrastructure ([infrastructure.md](.agents/sub-agents/infrastructure.md))

**Expertise**:

- Docker multi-stage builds
- docker-compose orchestration
- .dockerignore optimization
- Environment variable management
- Deployment platforms (Railway, Render, Fly.io)
- Health checks and monitoring

**Key Patterns**:

- Multi-stage builds for small images
- Layer caching optimization
- Non-root user for security
- Log to stdout/stderr

---

## Benefits Over Single Agent

### Traditional Approach (❌ Inefficient)

```
User asks simple question
   ↓
Load 50KB+ of all documentation
   ↓
Slower processing, higher cost
   ↓
Potential irrelevant context confusion
```

### Orchestrated Approach (✅ Efficient)

```
User asks simple question
   ↓
Orchestrator analyzes (2KB)
   ↓
Load 1-2 relevant sub-agents (10-20KB)
   ↓
Fast, focused, accurate response
```

### Measurable Improvements

- **Context Size**: 60-80% reduction on average
- **Response Time**: Faster due to less context processing
- **Accuracy**: Higher due to specialized knowledge
- **Cost**: Lower token usage
- **Maintenance**: Easier to update specific domains

---

## Maintenance

### Adding a New Sub-Agent

1. Create file: `.agents/sub-agents/my-domain.md`
2. Follow existing format:

   ```markdown
   # Domain Name Sub-Agent
   
   **Domain**: Brief description
   **Version**: 1.0.0
   **Expertise**: List of topics
   
   ## Identity
   ...
   ```

3. Update main SKILL.md:
   - Add to sub-agent registry table
   - Add to decision tree
   - Add to example interactions
4. Update this README with new agent info

### Updating Existing Sub-Agent

1. Increment version in frontmatter
2. Make updates to content
3. Test with sample questions
4. Update related references if needed

### Deprecated/Outdated Content

When you notice outdated information:

1. Check against current codebase
2. Update the relevant sub-agent
3. Increment version number
4. Consider adding changelog section

---

## Skills System

The workspace also includes a **VoltAgent skills library**:

```
.agents/skills/
├── voltagent-best-practices/SKILL.md
├── voltagent-docs-bundle/SKILL.md
└── create-voltagent/SKILL.md
```

**Skills vs Sub-Agents**:

- **Skills**: Official VoltAgent framework patterns (from VoltAgent team)
- **Sub-Agents**: Workspace-specific guidance (custom to this project)

**Priority**: Skills are authoritative for VoltAgent patterns; sub-agents reference and extend them.

---

## Troubleshooting

### Copilot Not Loading Agent System

**Check**: `.vscode/settings.json` has correct configuration

```json
{
  "github.copilot.advanced": {
    "contextFiles": [".agents/SKILL.md"]
  }
}
```

**Solution**: Reload VS Code window

```
Cmd/Ctrl+Shift+P → "Developer: Reload Window"
```

### Agent Providing Outdated Information

**Cause**: Sub-agent content may be stale  
**Solution**: Update the relevant sub-agent file and increment version

### Wrong Sub-Agent Being Used

**Cause**: Main orchestrator's decision tree may need refinement  
**Solution**: Update `.agents/SKILL.md` decision tree with clearer routing logic

### Too Much Context Still Being Loaded

**Cause**: Orchestrator loading unnecessary sub-agents  
**Solution**: Review orchestrator logs, refine delegation logic in SKILL.md

---

## Contributing

### Adding Domain Knowledge

When you discover useful patterns:

1. **Single Domain**: Add to relevant sub-agent
2. **New Domain**: Create new sub-agent following template
3. **Cross-Cutting**: Add to main SKILL.md or multiple sub-agents with cross-references

### Style Guide

- ✅ **Concise**: Get to the point quickly
- ✅ **Actionable**: Provide code examples
- ✅ **Structured**: Use clear sections and headers
- ✅ **Current**: Verify against actual codebase
- ✅ **Referenced**: Link to actual files/lines

---

## Version History

- **1.0.0** (Feb 6, 2026): Initial orchestration system
  - Main orchestrator with delegation logic
  - 5 specialized sub-agents
  - VS Code configuration
  - Skills integration

---

## Questions?

Ask GitHub Copilot! It will use this system to answer your questions efficiently.

Example questions to try:

- *"Explain how the agent orchestration system works"*
- *"Which sub-agent handles Docker questions?"*
- *"Show me the decision tree for agent selection"*
- *"What are the benefits of this approach?"*

---

**Remember**: The orchestrator is designed to be smart about what it loads. Trust it to make the right decisions, and it will provide faster, more accurate responses.
