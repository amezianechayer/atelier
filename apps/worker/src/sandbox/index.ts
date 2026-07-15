// Phase 4 : sandbox Docker du Builder via dockerode — non-root, rootfs read-only sauf
// /workspace, caps drop ALL, limites CPU/mémoire/pids, timeout dur, egress deny-by-default
// via proxy allowlist, pas de socket Docker monté (SPEC.md §11).
export {};
