# Image d'exécution du Builder (SPEC.md §2.3, §11) : Claude Code en mode headless
# sur un clone/template dans /workspace. Sert aussi de conteneur proxy egress
# (egress-proxy.mjs). Durcissement appliqué à l'exécution par dockerode :
# non-root, rootfs read-only sauf tmpfs (/workspace, /tmp, $HOME), caps drop ALL,
# limites CPU/mémoire/pids, timeout dur, egress deny-by-default, pas de socket Docker.
FROM node:22-bookworm-slim

# git : le Builder inspecte/prépare le workspace. ca-certificates : TLS vers Anthropic.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Claude Code CLI (mode headless). Version épinglée pour des builds reproductibles
# (doc du jour vérifiée : --bare, --output-format stream-json, coût dans l'événement result).
RUN npm install -g @anthropic-ai/claude-code@2.1.211 \
  && npm cache clean --force

# Proxy egress (utilisé par le conteneur proxy, pas par la sandbox elle-même).
COPY egress-proxy.mjs /opt/egress-proxy.mjs

RUN useradd --create-home --shell /usr/sbin/nologin builder \
  && mkdir -p /workspace \
  && chown builder:builder /workspace

USER builder
WORKDIR /workspace
# Télémétrie/auto-update coupés : l'unique egress de la sandbox est api.anthropic.com.
ENV DISABLE_TELEMETRY=1 \
    DISABLE_AUTOUPDATER=1 \
    DISABLE_ERROR_REPORTING=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
    HOME=/home/builder
