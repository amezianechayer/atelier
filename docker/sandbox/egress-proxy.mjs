// Proxy egress deny-by-default (SPEC.md §11). Filtre les requêtes CONNECT (HTTPS)
// sur une allowlist d'hôtes STRICTE. Sans MITM : on ne voit que l'hôte cible du
// tunnel, jamais le trafic déchiffré. Toute méthode HTTP en clair est refusée.
// Zéro dépendance : node stdlib. Lancé dans le conteneur proxy de la sandbox.

import { createServer } from 'node:http';
import { connect } from 'node:net';

const PORT = Number(process.env.PROXY_PORT ?? 8888);
// Allowlist passée par le worker (hôtes exacts, séparés par des virgules).
const ALLOW = (process.env.ALLOWLIST ?? 'api.anthropic.com')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function allowed(hostname) {
  const h = hostname.toLowerCase();
  return ALLOW.some((entry) => h === entry || h.endsWith(`.${entry}`));
}

const server = createServer((req, res) => {
  // Aucune requête HTTP en clair : la sandbox ne parle qu'en HTTPS via CONNECT.
  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('egress refusé : seul CONNECT (HTTPS) vers l’allowlist est autorisé.\n');
});

server.on('connect', (req, clientSocket, head) => {
  const [hostname, portStr] = (req.url ?? '').split(':');
  const port = Number(portStr ?? 443);
  if (!hostname || (port !== 443 && port !== 8888) || !allowed(hostname)) {
    clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    clientSocket.end();
    console.error(`[egress] REFUSÉ ${req.url}`);
    return;
  }
  const upstream = connect(port, hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  const kill = () => {
    upstream.destroy();
    clientSocket.destroy();
  };
  upstream.on('error', kill);
  clientSocket.on('error', kill);
});

server.listen(PORT, () => {
  console.log(`[egress] proxy CONNECT sur :${PORT} — allowlist : ${ALLOW.join(', ')}`);
});
