# Agent System Quick Start

**Last Updated**: February 6, 2026

---

## Verify It's Working

Ask GitHub Copilot in VS Code:

> *"Which sub-agents are available in this workspace?"*

**Expected Response**: Copilot should list all 5 sub-agents and explain the orchestration system.

If it doesn't work, see [Troubleshooting](#troubleshooting) below.

---

## How To Use

Just ask questions naturally! The orchestrator will automatically route to the right sub-agent(s).

### Single-Domain Questions

**VoltAgent Development:**

- *"How do I create a tool?"*
- *"Show me workflow examples"*
- *"What's the agent configuration syntax?"*

**TypeScript:**

- *"How do I use generics?"*
- *"Fix this TypeScript error"*
- *"Configure tsconfig for ESM"*

**Git:**

- *"What's the commit message format?"*
- *"How do I rebase?"*
- *"Create a hotfix workflow"*

**Docker:**

- *"Set up multi-stage build"*
- *"Configure docker-compose"*
- *"Deploy to production"*

**Documentation:**

- *"Where are the VoltAgent skills?"*
- *"Show me best practices"*
- *"Find examples of X"*

### Multi-Domain Questions

The orchestrator will load 2-3 relevant agents:

- *"Create an agent and containerize it"* → VoltAgent + Docker
- *"Set up TypeScript build with Git hooks"* → TypeScript + Git
- *"Create workflow and deploy to Railway"* → VoltAgent + Infrastructure

### Vulnhuntr Questions

Questions about the Python security scanner in `repos/vulnhuntr/` automatically use its own agent system:

- *"Fix the LLM validation in vulnhuntr"*
- *"Add a new vulnerability type"*
- *"Update Python dependency handling"*

---

## Behind the Scenes

### What Happens (Simplified)

```
1. You ask: "How do I add a tool to my agent?"
   ↓
2. Main orchestrator (SKILL.md) analyzes the question
   ↓
3. Identifies domain: VoltAgent development
   ↓
4. Loads: voltagent-dev.md ONLY (~10KB)
   ↓
5. Searches: src/tools/ for examples
   ↓
6. Responds: With accurate, code-backed answer
```

### Context Comparison

**Traditional (all-in-one agent)**:

- Load: 50KB+ of all documentation
- Time: Slower processing
- Risk: Context confusion from irrelevant info

**Orchestrated (this system)**:

- Load: 10-20KB of relevant docs
- Time: Faster processing
- Accuracy: Higher due to focused expertise

---

## Verification Tests

### Test 1: Single Domain

**Ask**: *"What's the correct model format in VoltAgent?"*

**Expected**:

- Loads: `voltagent-dev.md` only
- Answer: `provider/model` format (e.g., `openai/gpt-4o-mini`)
- Example: Shows agent creation code

### Test 2: Multi-Domain

**Ask**: *"Create a tool and commit it with conventional commits"*

**Expected**:

- Loads: `voltagent-dev.md` + `git-ops.md`
- Answer: Tool creation code + commit message format
- Example: `feat(tool): add new tool implementation`

### Test 3: Routing

**Ask**: *"Which agent handles Docker questions?"*

**Expected**:

- Loads: Main orchestrator only
- Answer: `infrastructure.md` handles Docker, deployment, CI/CD

---

## Configuration

### VS Code Settings

**File**: `.vscode/settings.json`

The orchestrator is auto-loaded via:

```json
{
  "github.copilot.advanced": {
    "contextFiles": [
      ".agents/SKILL.md"
    ]
  }
}
```

**This is already configured** - you don't need to do anything.

---

## Troubleshooting

### Issue: Copilot not loading agent system

**Symptoms**:

- Copilot doesn't mention sub-agents
- Responses seem generic
- No mention of orchestration

**Solutions**:

1. **Reload VS Code Window**

   ```
   Cmd/Ctrl + Shift + P → "Developer: Reload Window"
   ```

2. **Verify settings.json exists**

   ```bash
   cat .vscode/settings.json
   ```

   Should contain `github.copilot.advanced.contextFiles`

3. **Check SKILL.md exists**

   ```bash
   ls -la .agents/SKILL.md
   ```

4. **Restart Copilot**

   ```
   Cmd/Ctrl + Shift + P → "GitHub Copilot: Restart Server"
   ```

### Issue: Wrong agent being used

**Symptoms**:

- Docker question gets VoltAgent answer
- TypeScript question gets Git answer

**Cause**: Orchestrator's decision tree needs refinement

**Solution**: The orchestrator self-corrects over time, but you can help by being more specific:

- ❌ Vague: *"How do I configure this?"*
- ✅ Clear: *"How do I configure tsconfig.json for ESM?"*

### Issue: Outdated information

**Symptoms**:

- Code examples don't match current structure
- References to files that don't exist

**Cause**: Sub-agent content may be stale

**Solution**: Report to maintainers or update the relevant sub-agent file yourself

### Issue: Too much context loaded

**Symptoms**:

- Slow responses
- Copilot mentions many sub-agents for simple question

**Cause**: Question too broad or orchestrator being overly cautious

**Solution**: Ask more specific questions:

- ❌ Broad: *"Tell me about this project"*
- ✅ Specific: *"How is the VoltAgent bootstrap configured?"*

---

## Tips for Best Results

### Be Specific

✅ **Good**: *"How do I add a tool to an agent in VoltAgent?"*  
❌ Vague: *"How do I add something?"*

### Mention the Domain (Optional)

✅ **Clear**: *"In TypeScript, how do I use generics with constraints?"*  
✅ **Also works**: *"How do I use generics with constraints?"* (orchestrator figures it out)

### Ask Follow-ups

The orchestrator maintains context:

```
You: "How do I create a tool?"
Copilot: [Explains with voltagent-dev.md]

You: "Now show me how to test it"
Copilot: [Continues with same agent]
```

### Request Multiple Domains

✅ **Clear**: *"Create a VoltAgent tool and write a Dockerfile for it"*  
Result: Loads `voltagent-dev.md` + `infrastructure.md`

---

## Advanced Usage

### Listing Agents

Ask: *"List all sub-agents and their domains"*

### Checking What's Loaded

Ask: *"Which sub-agents are you currently using for this question?"*

### Requesting Specific Agent

Ask: *"Using the infrastructure sub-agent, explain Docker multi-stage builds"*

### Comparing Approaches

Ask: *"Compare VoltAgent workflow vs agent for this use case"*  
Result: Uses `voltagent-dev.md` + `voltagent-docs.md`

---

## File Locations

Quick reference for manual reading:

```
Main System:
.agents/SKILL.md                      ← Main orchestrator (auto-loaded)
.agents/README.md                     ← Full documentation  
.agents/QUICKSTART.md                 ← This file

Sub-Agents:
.agents/sub-agents/voltagent-dev.md   ← VoltAgent development
.agents/sub-agents/voltagent-docs.md  ← VoltAgent documentation
.agents/sub-agents/typescript-dev.md  ← TypeScript development
.agents/sub-agents/git-ops.md         ← Git operations
.agents/sub-agents/infrastructure.md  ← Docker & deployment

Skills (Official):
.agents/skills/voltagent-best-practices/SKILL.md
.agents/skills/create-voltagent/SKILL.md
.agents/skills/voltagent-docs-bundle/SKILL.md

VS Code Config:
.vscode/settings.json                 ← Copilot configuration
```

---

## Next Steps

1. ✅ **Verify**: Ask Copilot if the system is working
2. 🎯 **Try**: Ask a domain-specific question
3. 🔍 **Explore**: Read [README.md](README.md) for deep dive
4. 🛠️ **Customize**: Update sub-agents with project-specific knowledge

---

## Quick Commands

```bash
# View main orchestrator
cat .agents/SKILL.md

# List all sub-agents
ls -la .agents/sub-agents/

# View specific sub-agent
cat .agents/sub-agents/voltagent-dev.md

# Check VS Code config
cat .vscode/settings.json

# Search agent system
grep -r "keyword" .agents/
```

---

**That's it!** The system works automatically. Just ask questions and let the orchestrator route them efficiently.

**Need Help?** Ask Copilot: *"How does the agent orchestration system work?"*
