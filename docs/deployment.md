# Deployment Guide

This guide covers deploying VulnHuntr-Volt in various environments for production use.

## Table of Contents

- [Docker Deployment](#docker-deployment)
- [Docker Compose](#docker-compose)
- [CI/CD Integration](#cicd-integration)
- [GitHub Actions](#github-actions)
- [Production Considerations](#production-considerations)

## Docker Deployment

### Build the Image

```bash
docker build -t vulnhuntr-volt:latest .
```

### Run as CLI

```bash
docker run --rm \
  -v $(pwd)/reports:/app/.vulnhuntr-reports \
  -v $(pwd)/code:/workspace \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  vulnhuntr-volt:latest \
  npm run scan -- -r /workspace -b 5.0
```

### Run as Server

```bash
docker run -d \
  --name vulnhuntr-server \
  -p 3141:3141 \
  -v $(pwd)/reports:/app/.vulnhuntr-reports \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -e VOLT_PORT=3141 \
  vulnhuntr-volt:latest \
  npm run dev:server
```

## Docker Compose

### Basic Setup

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  vulnhuntr:
    build: .
    ports:
      - "3141:3141"
    volumes:
      - ./reports:/app/.vulnhuntr-reports
      - ./repos:/workspace:ro
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - VOLT_PORT=3141
      - DEFAULT_PROVIDER=anthropic
      - DEFAULT_MODEL=claude-sonnet-4
    command: npm run dev:server
    restart: unless-stopped
```

Start the service:

```bash
docker-compose up -d
```

### With Persistent Storage

```yaml
version: '3.8'

services:
  vulnhuntr:
    build: .
    ports:
      - "3141:3141"
    volumes:
      - reports:/app/.vulnhuntr-reports
      - repos:/workspace:ro
      - config:/app/config
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - VOLT_PORT=3141
    command: npm run dev:server
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3141/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  reports:
  repos:
  config:
```

### With Ollama (Local LLM)

```yaml
version: '3.8'

services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama:/root/.ollama
    restart: unless-stopped

  vulnhuntr:
    build: .
    ports:
      - "3141:3141"
    volumes:
      - ./reports:/app/.vulnhuntr-reports
      - ./repos:/workspace:ro
    environment:
      - DEFAULT_PROVIDER=ollama
      - DEFAULT_MODEL=llama3.1:70b
      - OLLAMA_BASE_URL=http://ollama:11434
      - VOLT_PORT=3141
    depends_on:
      - ollama
    command: npm run dev:server
    restart: unless-stopped

volumes:
  ollama:
```

Pull Ollama model:

```bash
docker-compose exec ollama ollama pull llama3.1:70b
```

## CI/CD Integration

<u>**BE CAREFUL, These can be a VERY expensive.**</u>

### GitHub Actions

Create `.github/workflows/security-scan.yml`:

```yaml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * 1'  # Weekly on Monday at 2 AM

jobs:
  vulnhuntr-scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
      issues: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run VulnHuntr-Volt
        uses: docker://ghcr.io/diaz3618/vulnhuntr-volt:latest
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        with:
          args: npm run scan -- -r /github/workspace -b 10.0 -c 7

      - name: Upload SARIF report
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: .vulnhuntr-reports/report-*.sarif
          category: vulnhuntr

      - name: Upload reports as artifacts
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: vulnhuntr-reports
          path: .vulnhuntr-reports/
          retention-days: 30

      - name: Create issues for findings
        if: github.event_name == 'push'
        run: |
          # Custom script to create GitHub issues
          npm run create-issues -- --report .vulnhuntr-reports/report-*.json
```

### GitLab CI

Create `.gitlab-ci.yml`:

```yaml
stages:
  - security

vulnhuntr-scan:
  stage: security
  image: docker:latest
  services:
    - docker:dind
  variables:
    DOCKER_DRIVER: overlay2
  script:
    - docker build -t vulnhuntr .
    - docker run --rm 
        -v $(pwd):/workspace 
        -v $(pwd)/reports:/app/.vulnhuntr-reports 
        -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY 
        vulnhuntr 
        npm run scan -- -r /workspace -b 5.0
  artifacts:
    paths:
      - reports/
    expire_in: 30 days
    reports:
      sast: reports/report-*.sarif
  only:
    - main
    - merge_requests
```

## GitHub Actions (Webhook Integration)

### Setup Webhook Server

```yaml
version: '3.8'

services:
  vulnhuntr-webhook:
    build: .
    ports:
      - "3141:3141"
    volumes:
      - ./reports:/app/.vulnhuntr-reports
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
      - VOLT_PORT=3141
    command: npm run dev:server
    restart: unless-stopped
```

### Configure GitHub Webhook

1. Go to repository Settings → Webhooks
2. Add webhook:
   - Payload URL: `https://your-server.com:3141/webhook/github`
   - Content type: `application/json`
   - Secret: Your `GITHUB_WEBHOOK_SECRET`
   - Events: `push`, `pull_request`

### Webhook Handler

The server automatically:

- Receives push/PR events
- Clones the repository
- Runs vulnerability analysis
- Posts results to Pull Request
- Creates issues for findings
- Uploads SARIF to Security Tab

## Production Considerations

### Security Best Practices

1. **API Key Management**
   - Use secret management systems (Vault, AWS Secrets Manager, etc.)
   - Never commit API keys to version control
   - Rotate keys regularly
   - Use separate keys for different environments

2. **Network Security**
   - Run behind reverse proxy (nginx, Traefik)
   - Enable TLS/HTTPS
   - Restrict access with authentication
   - Use API rate limiting

3. **Resource Limits**
   - Set memory/CPU limits
   - Configure request timeouts
   - Implement queue systems for large scans
   - Monitor resource usage

### Monitoring and Logging

```yaml
# docker-compose.yml
services:
  vulnhuntr:
    # ... existing config ...
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
  
  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

### Backup Strategy

```bash
# Backup reports
docker run --rm \
  -v vulnhuntr_reports:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/reports-$(date +%Y%m%d).tar.gz /data

# Restore reports
docker run --rm \
  -v vulnhuntr_reports:/data \
  -v $(pwd)/backups:/backup \
  alpine tar xzf /backup/reports-20240101.tar.gz -C /data
```

### Scaling Considerations

For high-volume scanning:

1. **Horizontal Scaling**
   - Deploy multiple server instances
   - Use load balancer
   - Implement job queue (Redis, RabbitMQ)

2. **Cost Optimization**
   - Cache analysis results
   - Implement incremental scanning
   - Use budget limits per scan
   - Consider local LLMs for initial screening

3. **Performance Tuning**
   - Adjust max iterations based on needs
   - Filter file types to analyze
   - Skip test/migration files
   - Use parallel analysis where possible

## Next Steps

- [Configuration Guide](configuration.md) - Configure for your environment
- [Usage Guide](usage-guide.md) - Learn how to run scans
- [Development Guide](development.md) - Customize and extend
