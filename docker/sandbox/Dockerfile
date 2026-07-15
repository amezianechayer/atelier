# Image d'exécution du Builder (Phase 4) : Claude Code en mode headless sur un clone
# du repo GitHub de l'utilisateur. Durcissement à l'exécution via dockerode :
# non-root, rootfs read-only sauf /workspace, caps drop ALL, limites CPU/mémoire/pids,
# timeout dur, egress deny-by-default via proxy allowlist (SPEC.md §11).
#
# Squelette Phase 0 — l'outillage (git, Claude Code CLI) est ajouté en Phase 4
# après vérification de la doc headless du jour (code.claude.com/docs).
FROM node:22-bookworm-slim

RUN useradd --create-home --shell /usr/sbin/nologin builder \
  && mkdir /workspace \
  && chown builder:builder /workspace

USER builder
WORKDIR /workspace
