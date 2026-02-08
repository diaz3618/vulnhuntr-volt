# Agent Orchestration System Architecture

**Version**: 1.0.0  
**Created**: February 6, 2026

---

## System Diagram

```mermaid
graph TB
    User[👤 User asks question in VS Code]
    User --> Copilot[🤖 GitHub Copilot]
    
    Copilot --> Orchestrator[📋 Main Orchestrator<br/>.agents/SKILL.md]
    
    Orchestrator --> Analysis{Analyze Domain}
    
    Analysis -->|VoltAgent/Agents/Tools| VoltDev[⚡ VoltAgent Dev<br/>voltagent-dev.md]
    Analysis -->|Skills/Examples/Patterns| VoltDocs[📚 VoltAgent Docs<br/>voltagent-docs.md]
    Analysis -->|TypeScript/Node/Build| TSDev[📘 TypeScript Dev<br/>typescript-dev.md]
    Analysis -->|Commits/Branches/Tags| GitOps[🌿 Git Operations<br/>git-ops.md]
    Analysis -->|Docker/Deploy/CI| Infra[🐳 Infrastructure<br/>infrastructure.md]
    Analysis -->|Python/Vuln Scanner| Vulnhuntr[🔒 Vulnhuntr<br/>repos/vulnhuntr/SKILL.md]
    
    VoltDev --> Research[🔍 Research Codebase]
    VoltDocs --> Research
    TSDev --> Research
    GitOps --> Research
    Infra --> Research
    Vulnhuntr --> Research
    
    Research --> CodeSearch[Search src/]
    Research --> SkillsSearch[Check .agents/skills/]
    Research --> DocsSearch[Read documentation]
    
    CodeSearch --> Response[✅ Accurate Response]
    SkillsSearch --> Response
    DocsSearch --> Response
    
    Response --> User
    
    style Orchestrator fill:#e1f5ff,stroke:#01579b,stroke-width:3px
    style VoltDev fill:#fff3e0,stroke:#e65100
    style VoltDocs fill:#f3e5f5,stroke:#4a148c
    style TSDev fill:#e8f5e9,stroke:#1b5e20
    style GitOps fill:#fce4ec,stroke:#880e4f
    style Infra fill:#e0f2f1,stroke:#004d40
    style Vulnhuntr fill:#fff9c4,stroke:#f57f17
    style Response fill:#c8e6c9,stroke:#2e7d32,stroke-width:2px
```

---

## Information Flow

### Example 1: Simple Question

**Question**: *"How do I add a tool to my agent?"*

```mermaid
sequenceDiagram
    participant U as User
    participant C as Copilot
    participant O as Orchestrator
    participant V as VoltAgent Dev Sub-Agent
    participant S as Codebase Search
    
    U->>C: "How do I add a tool?"
    C->>O: Load SKILL.md
    O->>O: Analyze: Domain = VoltAgent
    O->>V: Load voltagent-dev.md
    V->>S: Search src/tools/
    S->>V: Return examples
    V->>C: Tool creation pattern + code
    C->>U: Response with examples
    
    Note over O,V: Only 1 sub-agent loaded (~10KB)
    Note over U,C: Fast, accurate response
```

### Example 2: Multi-Domain Question

**Question**: *"Create an agent and containerize it with Docker"*

```mermaid
sequenceDiagram
    participant U as User
    participant C as Copilot
    participant O as Orchestrator
    participant V as VoltAgent Dev
    participant I as Infrastructure
    participant S as Codebase Search
    
    U->>C: "Create agent & containerize"
    C->>O: Load SKILL.md
    O->>O: Analyze: VoltAgent + Docker
    
    par Load Sub-Agents
        O->>V: Load voltagent-dev.md
        O->>I: Load infrastructure.md
    end
    
    par Research
        V->>S: Search src/agents/
        I->>S: Search Dockerfile
    end
    
    S->>V: Agent patterns
    S->>I: Docker config
    
    V->>C: Agent creation code
    I->>C: Dockerfile structure
    
    C->>U: Complete solution
    
    Note over O,I: 2 sub-agents loaded (~20KB)
    Note over U,C: Comprehensive answer
```

### Example 3: Vulnhuntr Question

**Question**: *"Fix the Python vulnerability scanner's validation"*

```mermaid
sequenceDiagram
    participant U as User
    participant C as Copilot
    participant O as Main Orchestrator
    participant Vh as Vulnhuntr SKILL.md
    participant S as Vulnhuntr Codebase
    
    U->>C: "Fix vulnhuntr validation"
    C->>O: Load .agents/SKILL.md
    O->>O: Analyze: Vulnhuntr domain
    O->>Vh: Delegate to repos/vulnhuntr/SKILL.md
    Vh->>Vh: Use Vulnhuntr sub-agents
    Vh->>S: Search vulnhuntr/ code
    S->>Vh: Find validation code
    Vh->>C: Solution with context
    C->>U: Vulnhuntr-specific fix
    
    Note over O,Vh: Separate agent system
    Note over Vh,S: Vulnhuntr-specific patterns
```

---

## Decision Tree

```mermaid
graph TD
    Start[User Question] --> Analyze{Analyze Request}
    
    Analyze -->|Agent/Workflow/Tool| Q1{VoltAgent Domain?}
    Analyze -->|Skills/Patterns| Q2{Documentation?}
    Analyze -->|TypeScript/Build| Q3{TypeScript Domain?}
    Analyze -->|Git/Commit/Branch| Q4{Git Domain?}
    Analyze -->|Docker/Deploy| Q5{Infrastructure?}
    Analyze -->|Python/Vuln| Q6{Vulnhuntr?}
    
    Q1 -->|Implementation| LoadVD[Load voltagent-dev.md]
    Q2 -->|Yes| LoadDocs[Load voltagent-docs.md]
    Q3 -->|Yes| LoadTS[Load typescript-dev.md]
    Q4 -->|Yes| LoadGit[Load git-ops.md]
    Q5 -->|Yes| LoadInfra[Load infrastructure.md]
    Q6 -->|Yes| LoadVH[Load vulnhuntr/SKILL.md]
    
    Q1 -->|+ Documentation| Multi1[Load voltagent-dev.md<br/>+ voltagent-docs.md]
    Q1 -->|+ Docker| Multi2[Load voltagent-dev.md<br/>+ infrastructure.md]
    Q3 -->|+ Git| Multi3[Load typescript-dev.md<br/>+ git-ops.md]
    
    LoadVD --> Research[Research Codebase]
    LoadDocs --> Research
    LoadTS --> Research
    LoadGit --> Research
    LoadInfra --> Research
    LoadVH --> Research
    Multi1 --> Research
    Multi2 --> Research
    Multi3 --> Research
    
    Research --> Respond[Generate Response]
    
    style Start fill:#e3f2fd
    style Analyze fill:#fff3e0
    style Research fill:#f3e5f5
    style Respond fill:#c8e6c9
    style LoadVD fill:#ffebee
    style LoadDocs fill:#f1f8e9
    style LoadTS fill:#e0f2f1
    style LoadGit fill:#fce4ec
    style LoadInfra fill:#e8eaf6
    style LoadVH fill:#fff9c4
```

---

## System Components

### Layer 1: Entry Point

```
┌─────────────────────────────────┐
│   GitHub Copilot (VS Code)      │
│   - Loads via settings.json     │
│   - Always includes SKILL.md    │
└─────────────────────────────────┘
```

### Layer 2: Orchestration

```
┌─────────────────────────────────┐
│   Main Orchestrator             │
│   .agents/SKILL.md (~15KB)      │
│   - Analyzes user question      │
│   - Identifies domain(s)        │
│   - Selects 1-3 sub-agents      │
│   - Never loads all agents      │
└─────────────────────────────────┘
```

### Layer 3: Specialized Sub-Agents

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  VoltAgent   │ │  VoltAgent   │ │  TypeScript  │
│     Dev      │ │     Docs     │ │     Dev      │
│   (~12KB)    │ │   (~10KB)    │ │   (~12KB)    │
└──────────────┘ └──────────────┘ └──────────────┘

┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│     Git      │ │Infrastructure│ │  Vulnhuntr   │
│   Operations │ │   (~10KB)    │ │  (Separate)  │
│    (~8KB)    │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
```

### Layer 4: Research & Verification

```
┌─────────────────────────────────────────────────┐
│   Code Search & Verification                    │
│   - semantic_search() - Find patterns           │
│   - grep_search() - Find specific text          │
│   - read_file() - Read implementation           │
│   - file_search() - Find files                  │
└─────────────────────────────────────────────────┘
```

### Layer 5: Knowledge Base

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  src/        │ │ .agents/     │ │ node_modules/│
│  Codebase    │ │ skills/      │ │ @voltagent/  │
│              │ │ VoltAgent    │ │ Package docs │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## Context Size Comparison

### Traditional Single-Agent Approach

```
User Question
    ↓
┌─────────────────────────────────────┐
│  Single Large Agent (~50KB+)        │
│  • All VoltAgent knowledge          │
│  • All TypeScript knowledge         │
│  • All Git knowledge                │
│  • All Docker knowledge             │
│  • All documentation                │
│  ❌ Context flooding                │
│  ❌ Slower processing               │
│  ❌ Higher cost                     │
└─────────────────────────────────────┘
    ↓
Response (slower, may be confused)
```

### Orchestrated Multi-Agent Approach

```
User Question
    ↓
┌─────────────────────────────────────┐
│  Main Orchestrator (~15KB)          │
│  • Analyzes question                │
│  • Identifies domain                │
│  ✅ Smart routing                   │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  1-3 Relevant Sub-Agents (~10-25KB) │
│  • Only necessary knowledge         │
│  • Domain-specific expertise        │
│  ✅ Focused context                 │
│  ✅ Faster processing               │
│  ✅ Lower cost                      │
└─────────────────────────────────────┘
    ↓
Response (faster, more accurate)
```

### Savings

| Metric | Traditional | Orchestrated | Improvement |
|--------|------------|--------------|-------------|
| **Avg Context** | 50KB+ | 15-30KB | 60-70% reduction |
| **Simple Q** | 50KB | 15-20KB | 60-70% reduction |
| **Complex Q** | 50KB+ | 25-35KB | 30-50% reduction |
| **Processing** | Slower | Faster | Variable |
| **Accuracy** | Mixed | Higher | Better focus |

---

## Configuration Architecture

### VS Code Integration

```
.vscode/settings.json
    ↓
{
  "github.copilot.advanced": {
    "contextFiles": [
      ".agents/SKILL.md"  ← Always loaded
    ]
  }
}
    ↓
GitHub Copilot includes orchestrator with every request
    ↓
Orchestrator decides which sub-agents to load
```

### File Structure

```
vulnhuntr-volt/
├── .agents/                    ← Agent system root
│   ├── SKILL.md               ← Main orchestrator (auto-loaded)
│   ├── README.md              ← Full documentation
│   ├── QUICKSTART.md          ← Quick start guide
│   ├── ARCHITECTURE.md        ← This file
│   ├── sub-agents/            ← Specialized agents
│   │   ├── voltagent-dev.md
│   │   ├── voltagent-docs.md
│   │   ├── typescript-dev.md
│   │   ├── git-ops.md
│   │   └── infrastructure.md
│   └── skills/                ← Official VoltAgent skills
│       ├── voltagent-best-practices/
│       ├── voltagent-docs-bundle/
│       └── create-voltagent/
├── .vscode/
│   ├── settings.json          ← Copilot configuration
│   └── mcp.json               ← MCP servers
├── src/                       ← VoltAgent application
├── repos/
│   └── vulnhuntr/            ← Separate agent system
│       └── SKILL.md          ← Vulnhuntr orchestrator
└── [other project files]
```

---

## Performance Characteristics

### Latency

```
┌─────────────────────────────────────────────────────┐
│  Traditional: Copilot processing 50KB+ context      │
│  ████████████████████████████ ~2-4s                 │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Orchestrated: Process 15KB orchestrator            │
│  ██████████ ~0.5-1s                                 │
│  Then load 10-20KB sub-agent                        │
│  ████████████████ ~1-2s                             │
│  Total: ██████████████████████ ~1.5-3s              │
└─────────────────────────────────────────────────────┘
```

### Token Usage (Estimated)

```
Traditional Approach:
- Context: ~50KB = ~12,500 tokens
- Response: ~500 tokens
- Total: ~13,000 tokens per request

Orchestrated Approach:
- Orchestrator: ~15KB = ~3,750 tokens
- Sub-agent: ~10KB = ~2,500 tokens
- Response: ~500 tokens
- Total: ~6,750 tokens per request

Savings: ~48% fewer tokens
```

---

## Scalability

### Adding New Sub-Agents

```mermaid
graph LR
    A[Create new sub-agent file] --> B[Follow template structure]
    B --> C[Add to SKILL.md registry]
    C --> D[Update decision tree]
    D --> E[Test with questions]
    E --> F[Document in README]
    
    style A fill:#e1f5ff
    style F fill:#c8e6c9
```

### System Limits

- **Sub-Agents**: Recommended 5-10 max
- **Context Per Request**: Target 15-30KB total
- **Agents Loaded**: 1-3 per request max
- **File Size**: Keep sub-agents under 15KB each

---

## Maintenance Architecture

### Update Frequency

```
Main Orchestrator (SKILL.md)
├── Weekly: Review delegation logic
├── Monthly: Update sub-agent registry
└── As needed: Add new routing rules

Sub-Agents
├── Weekly: Update with new patterns
├── Sprint: Sync with codebase changes
└── As needed: Fix outdated information

Skills (Official)
├── Monthly: Run `npx skills add VoltAgent/skills`
└── Version updates: Check for new skills
```

---

## Future Enhancements

### Planned Features

1. **Dynamic Agent Loading**: Load agents based on file context
2. **Agent Metrics**: Track which agents are most used
3. **Context Caching**: Cache frequently-used sub-agents
4. **User Preferences**: Let users prefer certain agents
5. **Agent Versioning**: Track sub-agent versions separately

---

**This architecture ensures fast, accurate, context-efficient responses by intelligently routing questions to specialized experts rather than loading everything at once.**
