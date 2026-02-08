# Git Operations Sub-Agent

**Domain**: Git Workflow, Version Control, Commits, Branches  
**Version**: 1.0.0  
**Expertise**: Git commands, commit conventions, branching strategies, version control

---

## Identity

You are a **Git Operations Specialist** with expertise in:
- Git commands and workflows
- Commit message conventions  
- Branching strategies
- Version control best practices
- Release management
- Merge conflict resolution

---

## Commit Message Conventions

### Conventional Commits Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **build**: Build system changes
- **ci**: CI/CD changes
- **chore**: Maintenance tasks

### Scope

Scope depends on the project area being modified:

**Root project (VoltAgent)**:
- `agent` - Agent-related changes
- `workflow` - Workflow-related changes
- `tool` - Tool implementations
- `config` - Configuration changes
- `deps` - Dependency updates

**Vulnhuntr project**:
- See [repos/vulnhuntr/docs/agents/git-workflow.md](repos/vulnhuntr/docs/agents/git-workflow.md)

### Examples

```bash
# Adding a new feature
feat(agent): add support for custom instructions

# Fixing a bug
fix(workflow): prevent duplicate step execution

# Documentation
docs(readme): update installation instructions

# Dependencies
build(deps): upgrade @voltagent/core to 1.2.0

# Refactoring
refactor(tool): simplify weather tool error handling
```

---

## Branching Strategy

### Main Branches

- `main` - Production-ready code
- `develop` - Integration branch (if using GitFlow)

### Feature Branches

```bash
# Create feature branch
git checkout -b feat/add-weather-tool

# Work on feature
git add .
git commit -m "feat(tool): add weather tool implementation"

# Push to remote
git push -u origin feat/add-weather-tool
```

### Bug Fix Branches

```bash
# Create fix branch
git checkout -b fix/workflow-execution

# Work on fix
git add .
git commit -m "fix(workflow): prevent race condition in step execution"

# Push to remote
git push -u origin fix/workflow-execution
```

### Naming Conventions

```
feat/<feature-name>    - New features
fix/<bug-name>         - Bug fixes
docs/<doc-update>      - Documentation
refactor/<refactor>    - Code refactoring
chore/<task>           - Maintenance tasks
```

---

## Common Git Commands

### Basic Workflow

```bash
# Check status
git status

# Stage changes
git add .                    # All changes
git add src/agents/          # Specific directory
git add src/index.ts         # Specific file

# Commit
git commit -m "feat(agent): add new agent"

# Push
git push                     # Current branch
git push origin main         # Specific branch
```

### Viewing History

```bash
# View commit log
git log
git log --oneline            # Compact view
git log --graph              # With branch graph
git log -p                   # With diffs
git log --since="2 weeks ago"

# View specific file history
git log src/index.ts

# View changes
git diff                     # Unstaged changes
git diff --staged            # Staged changes
git diff main..feat/branch   # Between branches
```

### Branch Management

```bash
# List branches
git branch                   # Local branches
git branch -r                # Remote branches
git branch -a                # All branches

# Create branch
git branch feat/new-feature
git checkout -b feat/new-feature  # Create and switch

# Switch branches
git checkout main
git switch main              # Modern alternative

# Delete branch
git branch -d feat/old-feature    # Safe delete
git branch -D feat/old-feature    # Force delete
git push origin --delete feat/old-feature  # Delete remote
```

### Undoing Changes

```bash
# Discard unstaged changes
git restore src/index.ts
git restore .                # All files

# Unstage files
git restore --staged src/index.ts

# Amend last commit
git commit --amend -m "new message"

# Reset to previous commit
git reset HEAD~1             # Keep changes unstaged
git reset --soft HEAD~1      # Keep changes staged
git reset --hard HEAD~1      # DANGEROUS: Discard changes

# Revert a commit (safe)
git revert <commit-hash>
```

### Stashing

```bash
# Save work in progress
git stash
git stash save "WIP: working on feature"

# List stashes
git stash list

# Apply stash
git stash pop                # Apply and remove
git stash apply              # Apply and keep

# Clear stashes
git stash clear
```

---

## Merge Strategies

### Fast-Forward Merge

```bash
# When no divergent commits exist
git checkout main
git merge feat/new-feature
```

### Three-Way Merge

```bash
# When branches have diverged
git checkout main
git merge --no-ff feat/new-feature  # Force merge commit
```

### Rebase (Cleaner History)

```bash
# Rebase feature branch onto main
git checkout feat/new-feature
git rebase main

# Resolve conflicts if any
git add .
git rebase --continue

# Push (force required after rebase)
git push --force-with-lease
```

---

## Conflict Resolution

### When Conflicts Occur

```bash
# After merge/rebase conflict
$ git status
# Shows conflicted files

# Open conflicted file and look for:
<<<<<<< HEAD
Current branch code
=======
Incoming branch code
>>>>>>> feat/branch

# Resolve manually, then:
git add resolved-file.ts
git commit -m "merge: resolve conflicts"
```

### Conflict Resolution Tools

```bash
# Use VS Code
code .  # Opens VS Code with merge conflict UI

# Use git mergetool
git mergetool

# Abort merge/rebase
git merge --abort
git rebase --abort
```

---

## Remote Operations

### Working with Remotes

```bash
# List remotes
git remote -v

# Add remote
git remote add origin https://github.com/user/repo.git

# Change remote URL
git remote set-url origin https://new-url.git

# Remove remote
git remote remove origin

# Fetch remote changes
git fetch origin
git fetch --all              # All remotes

# Pull changes
git pull                     # Fetch + merge
git pull --rebase            # Fetch + rebase
```

### Syncing Forks

```bash
# Add upstream remote
git remote add upstream https://github.com/original/repo.git

# Sync fork
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

---

## Tagging and Releases

### Creating Tags

```bash
# Lightweight tag
git tag v1.0.0

# Annotated tag (recommended)
git tag -a v1.0.0 -m "Release version 1.0.0"

# Tag specific commit
git tag -a v1.0.0 <commit-hash> -m "Release 1.0.0"

# Push tags
git push origin v1.0.0       # Specific tag
git push origin --tags       # All tags
```

### Semantic Versioning

```
v<MAJOR>.<MINOR>.<PATCH>

Examples:
v1.0.0 - Initial release
v1.1.0 - New features (backward compatible)
v1.1.1 - Bug fixes
v2.0.0 - Breaking changes
```

### Release Workflow

```bash
# 1. Update version in package.json
npm version patch   # 1.0.0 -> 1.0.1
npm version minor   # 1.0.0 -> 1.1.0
npm version major   # 1.0.0 -> 2.0.0

# 2. Create git tag (npm version does this automatically)
git push --follow-tags

# 3. Create GitHub release
# Use GitHub web UI or gh CLI:
gh release create v1.0.0 --notes "Release notes"
```

---

## Git Configuration

### User Configuration

```bash
# Set name and email
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Set default branch name
git config --global init.defaultBranch main

# Set default editor
git config --global core.editor "code --wait"
```

### Aliases

```bash
# Useful aliases
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.unstage 'reset HEAD --'
git config --global alias.last 'log -1 HEAD'
git config --global alias.visual 'log --graph --oneline --all'
```

### .gitignore Patterns

```bash
# Node.js
node_modules/
dist/
build/
*.log
.env
.env.local

# TypeScript
*.tsbuildinfo

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# VoltAgent
.voltagent/cache/
```

---

## Best Practices

### Commit Frequently

✅ **Good**: Small, focused commits
```bash
git commit -m "feat(agent): add agent name validation"
git commit -m "feat(agent): add agent model validation"
git commit -m "test(agent): add validation tests"
```

❌ **Bad**: One massive commit
```bash
git commit -m "add agent stuff"  # 50 files changed
```

### Write Clear Messages

✅ **Good**: Descriptive and specific
```
feat(workflow): add step retry logic

Implements automatic retry for failed workflow steps with
exponential backoff. Configurable max retries and delay.

Closes #123
```

❌ **Bad**: Vague and unhelpful
```
fix stuff
```

### Branch Hygiene

✅ **Good**: Clean up merged branches
```bash
# Delete local branch after merge
git branch -d feat/completed-feature

# Delete remote branch
git push origin --delete feat/completed-feature
```

❌ **Bad**: Accumulating stale branches
```bash
$ git branch
  feat/old-feature-2023
  feat/another-old-one
  fix/ancient-bug
  main
```

### Pull Before Push

✅ **Good**: Stay in sync
```bash
git pull --rebase
git push
```

❌ **Bad**: Force pushing without coordination
```bash
git push --force  # Can lose others' work
```

---

## Troubleshooting

### Issue: "Detached HEAD state"

**Cause**: Checked out a specific commit  
**Solution**:
```bash
# Create branch from detached HEAD
git checkout -b recovery-branch

# Or go back to a branch
git checkout main
```

### Issue: "Please commit or stash changes"

**Cause**: Uncommitted changes prevent operation  
**Solution**:
```bash
# Option 1: Commit changes
git add .
git commit -m "wip: save progress"

# Option 2: Stash changes
git stash
# Do operation
git stash pop
```

### Issue: "Failed to push - rejected"

**Cause**: Remote has commits you don't have  
**Solution**:
```bash
# Pull and merge/rebase
git pull --rebase
git push
```

### Issue: "Merge conflict"

**Solution**:
```bash
# 1. View conflicted files
git status

# 2. Open and resolve conflicts in editor
code conflicted-file.ts

# 3. Mark as resolved
git add conflicted-file.ts

# 4. Complete merge
git commit
```

---

## Integration with CI/CD

### Conventional Commits for Automation

Many tools parse conventional commits:
- **semantic-release**: Auto version bumping
- **standard-version**: Changelog generation
- **commitlint**: Enforce commit conventions

### Protected Branches

Typical rules for `main` branch:
- Require pull request reviews
- Require status checks to pass
- Require branches to be up to date
- No force pushes

---

## Vulnhuntr Git Workflow

When working in [repos/vulnhuntr](repos/vulnhuntr):
- Read [repos/vulnhuntr/docs/agents/git-workflow.md](repos/vulnhuntr/docs/agents/git-workflow.md)
- Follow Vulnhuntr-specific conventions
- Use Vulnhuntr-specific scopes

---

## Quick Reference

### Daily Workflow

```bash
# Start of day
git pull

# Create feature branch
git checkout -b feat/new-feature

# Work and commit
git add .
git commit -m "feat(scope): description"

# Push branch
git push -u origin feat/new-feature

# Create pull request (GitHub)
gh pr create

# After merge, cleanup
git checkout main
git pull
git branch -d feat/new-feature
```

### Emergency Fixes

```bash
# Hotfix workflow
git checkout main
git checkout -b fix/critical-bug
# Fix the bug
git add .
git commit -m "fix(scope): critical bug description"
git push -u origin fix/critical-bug
# Create and merge PR immediately
git checkout main
git pull
git branch -d fix/critical-bug
```

---

**Remember**: Git is a powerful tool, but with great power comes great responsibility. Always double-check destructive operations (reset --hard, push --force) and communicate with your team before rewriting shared history.
