/**
 * Host↔launcher control channel (option d seam). A loopback-only HTTP server
 * owned by Electron main; the desktop-bridge Host row (running in the Host
 * child process) talks to it to provide `ctx.desktopRuntime`. Token-authenticated,
 * ephemeral port, bound to 127.0.0.1 — same posture as the carrier.
 * @module apps/desktop/main/control
 */

import { randomBytes } from 'node:crypto';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';

/** Restart reasons the bridge may report (mirrors dsh-plugin-desktop/runtime). */
export type ControlRestartReason = 'profile-switch' | 'mode-change' | 'settings-committed';

export interface ControlHandlers {
  /** The bridge row announced itself (generation composition reached the desktop layer). */
  onBridgeRegistered(rowId: string): void;
  /** A desktop row requested an orderly restart; the launcher coordinator decides. */
  onRestartRequest(reason: ControlRestartReason): void;
}

export interface ControlServer {
  /** Base URL injected into the Host child environment. */
  readonly url: string;
  /** Bearer token injected into the Host child environment. */
  readonly token: string;
  close(): Promise<void>;
}

/** Read one JSON body (bounded); resolves undefined when empty. */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  let size = 0;
  let body = '';
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 65_536) throw new Error('control payload too large');
    body += (chunk as Buffer).toString();
  }
  if (body.trim().length === 0) return undefined;
  return JSON.parse(body) as Record<string, unknown>;
}

/** Start the control server on an ephemeral loopback port. */
export async function startControlServer(handlers: ControlHandlers): Promise<ControlServer> {
  const token = randomBytes(24).toString('base64url');

  const reply = (res: ServerResponse, status: number, payload: object): void => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  const server: Server = createServer((req, res) => {
    const authorized = req.headers['x-dsh-desktop-token'] === token;
    if (!authorized) return reply(res, 401, { error: 'unauthorized' });
    if (req.method === 'POST' && req.url === '/bridge/register') {
      return void readJson(req)
        .then((payload) => {
          handlers.onBridgeRegistered(
            typeof payload?.row === 'string' ? payload.row : 'desktop-bridge',
          );
          reply(res, 200, { ok: true });
        })
        .catch(() => reply(res, 400, { error: 'bad payload' }));
    }
    if (req.method === 'POST' && req.url === '/bridge/restart') {
      return void readJson(req)
        .then((payload) => {
          const reason = payload?.reason;
          handlers.onRestartRequest(
            reason === 'profile-switch' ||
              reason === 'mode-change' ||
              reason === 'settings-committed'
              ? reason
              : 'settings-committed',
          );
          reply(res, 200, { ok: true });
        })
        .catch(() => reply(res, 400, { error: 'bad payload' }));
    }
    if (req.method === 'GET' && req.url === '/health') {
      return reply(res, 200, { ok: true });
    }
    reply(res, 404, { error: 'not found' });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });

  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('control server has no bound address');
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    token,
    close: () =>
      new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
        server.closeAllConnections?.();
      }),
  };
}
