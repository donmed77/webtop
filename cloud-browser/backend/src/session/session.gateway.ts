import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { SessionService } from './session.service';

@WebSocketGateway({
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3002',
    },
    pingInterval: 5000,  // server pings client every 5s
    pingTimeout: 10000,  // disconnect if no pong within 10s
})
export class SessionGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
    @WebSocketServer()
    server: Server;

    private static readonly GRACE_PERIOD_MS = 35_000; // 30s user countdown + 5s buffer
    private static readonly MAX_VIEWERS_PER_SESSION = 1;
    private readonly logger = new Logger(SessionGateway.name);
    private clientSessions: Map<string, string> = new Map(); // socketId -> sessionId
    private sessionClients: Map<string, Set<string>> = new Map(); // sessionId -> Set<socketId>
    private sessionPrimary: Map<string, string> = new Map(); // sessionId -> primary socketId (EC1)
    private sessionViewers: Map<string, Set<string>> = new Map(); // sessionId -> Set<viewer socketId>
    private clientIsViewer: Map<string, boolean> = new Map(); // socketId -> isViewer
    private reconnectingSessions: Map<string, { disconnectedAt: number; timer: NodeJS.Timeout }> = new Map();
    private connectionLostTimers: Map<string, NodeJS.Timeout> = new Map(); // sessionId -> delayed disconnect timer
    private timerInterval: NodeJS.Timeout;

    constructor(private sessionService: SessionService) {
        // Send timer updates every second
        this.timerInterval = setInterval(() => this.broadcastTimerUpdates(), 1000);
    }

    onModuleDestroy() {
        clearInterval(this.timerInterval);
    }

    handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
        const sessionId = this.clientSessions.get(client.id);
        if (sessionId) {
            this.clientSessions.delete(client.id);
            const isViewer = this.clientIsViewer.get(client.id);
            this.clientIsViewer.delete(client.id);

            // Clean up from viewers set
            if (isViewer) {
                const viewers = this.sessionViewers.get(sessionId);
                if (viewers) {
                    viewers.delete(client.id);
                    if (viewers.size === 0) this.sessionViewers.delete(sessionId);
                }
                this.emitViewerCount(sessionId);
            }

            const clients = this.sessionClients.get(sessionId);
            if (clients) {
                clients.delete(client.id);
                if (clients.size === 0) {
                    this.sessionClients.delete(sessionId);
                }

                // Start grace period when the PRIMARY (controller) disconnects,
                // not when all clients disconnect. Viewers shouldn't keep a session alive.
                const wasPrimary = this.sessionPrimary.get(sessionId) === client.id;
                if (wasPrimary) {
                    this.sessionPrimary.delete(sessionId);
                    // Clear any existing connection lost timer before creating a new one
                    const existingCL = this.connectionLostTimers.get(sessionId);
                    if (existingCL) clearTimeout(existingCL);
                    // Delay "connection lost" indicator — avoid false positives from brief reconnects
                    const connectionLostTimer = setTimeout(() => {
                        const session = this.sessionService.getSession(sessionId);
                        // Only mark disconnected if no new primary reconnected
                        if (session && !this.sessionPrimary.has(sessionId)) {
                            session.userConnectionState = 'disconnected';
                        }
                    }, 10_000); // 10s grace period
                    this.connectionLostTimers.set(sessionId, connectionLostTimer);
                    // Cancel any stale timer from a previous disconnect
                    const existing = this.reconnectingSessions.get(sessionId);
                    if (existing) clearTimeout(existing.timer);
                    // Start fresh grace period
                    const timer = setTimeout(() => this.checkSessionAbandoned(sessionId), SessionGateway.GRACE_PERIOD_MS);
                    this.reconnectingSessions.set(sessionId, { disconnectedAt: Date.now(), timer });
                }
            }
        }
    }

    private checkSessionAbandoned(sessionId: string) {
        const clients = this.sessionClients.get(sessionId);
        if (!clients || clients.size === 0) {
            this.reconnectingSessions.delete(sessionId);
            // Clean up connection lost timer to prevent leaks
            const pendingCL = this.connectionLostTimers.get(sessionId);
            if (pendingCL) { clearTimeout(pendingCL); this.connectionLostTimers.delete(sessionId); }
            const session = this.sessionService.getSession(sessionId);
            if (session && session.status === 'active') {
                this.logger.log(`Session ${sessionId} abandoned, ending...`);
                this.sessionService.endSession(sessionId, 'abandoned');
            }
        } else {
            // Client reconnected before timer fired — just clean up
            this.reconnectingSessions.delete(sessionId);
        }
    }

    getReconnectingSessions(): Map<string, { disconnectedAt: number }> {
        // Return a simplified view (without the timer handle)
        const result = new Map<string, { disconnectedAt: number }>();
        for (const [id, info] of this.reconnectingSessions) {
            result.set(id, { disconnectedAt: info.disconnectedAt });
        }
        return result;
    }

    @SubscribeMessage('session:join')
    handleJoinSession(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string; viewer?: boolean },
    ) {
        const session = this.sessionService.getSession(data.sessionId);
        if (!session || session.status !== 'active') {
            client.emit('session:error', { error: 'Session not found or ended' });
            return;
        }

        // SECURITY #2: For non-viewers, verify IP matches session creator
        if (!data.viewer) {
            const clientIp = (client.handshake.headers['x-real-ip'] as string)
                || (client.handshake.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                || client.handshake.address;
            if (session.clientIp && clientIp !== session.clientIp) {
                this.logger.warn(`Session join rejected: IP mismatch for ${data.sessionId} (expected=${session.clientIp}, got=${clientIp})`);
                client.emit('session:error', { error: 'Session not found or ended' });
                return;
            }
        }

        this.clientSessions.set(client.id, data.sessionId);
        if (!this.sessionClients.has(data.sessionId)) {
            this.sessionClients.set(data.sessionId, new Set());
        }
        this.sessionClients.get(data.sessionId)!.add(client.id);
        // Cancel grace period timer if reconnecting
        const reconnectInfo = this.reconnectingSessions.get(data.sessionId);
        if (reconnectInfo) {
            clearTimeout(reconnectInfo.timer);
            this.reconnectingSessions.delete(data.sessionId);
        }

        // Viewer mode: join without takeover
        if (data.viewer) {
            // Enforce viewer limit
            const currentViewers = this.sessionViewers.get(data.sessionId);
            if (currentViewers && currentViewers.size >= SessionGateway.MAX_VIEWERS_PER_SESSION) {
                client.emit('session:error', {
                    error: 'Viewer limit reached. Only 1 viewer is allowed per session.',
                    viewerLimitReached: true,
                });
                return;
            }

            this.clientIsViewer.set(client.id, true);
            if (!this.sessionViewers.has(data.sessionId)) {
                this.sessionViewers.set(data.sessionId, new Set());
            }
            this.sessionViewers.get(data.sessionId)!.add(client.id);

            // SECURITY #3: Don't send sessionToken to viewers — prevents escalation
            client.emit('session:joined', {
                sessionId: session.id,
                port: session.port,
                timeRemaining: this.sessionService.getSessionTimeRemaining(session.id),
                isViewer: true,
                chromeAlreadyLaunched: this.chromeLaunched.has(data.sessionId),
            });

            this.emitViewerCount(data.sessionId);
            this.logger.log(`Client ${client.id} joined session ${data.sessionId} as viewer`);
            return;
        }

        // EC1: Single-tab enforcement - new tab becomes primary, old tab gets takeover
        const currentPrimary = this.sessionPrimary.get(data.sessionId);
        if (currentPrimary && currentPrimary !== client.id) {
            const oldSocket = this.server.sockets.sockets.get(currentPrimary);
            if (oldSocket) {
                oldSocket.emit('session:takeover', { message: 'Session opened in another tab' });
            }
        }
        this.sessionPrimary.set(data.sessionId, client.id);
        // Cancel pending connection lost timer and restore state
        const pendingTimer = this.connectionLostTimers.get(data.sessionId);
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            this.connectionLostTimers.delete(data.sessionId);
        }
        session.userConnectionState = 'connected';
        session.userVisible = true;

        client.emit('session:joined', {
            sessionId: session.id,
            port: session.port,
            sessionToken: session.sessionToken,
            timeRemaining: this.sessionService.getSessionTimeRemaining(session.id),
            isPrimary: true,
            chromeAlreadyLaunched: this.chromeLaunched.has(data.sessionId),
        });

        // Send current viewer count to the new primary
        this.emitViewerCount(data.sessionId);
        this.logger.log(`Client ${client.id} joined session ${data.sessionId} as primary`);
    }

    @SubscribeMessage('session:reconnect')
    handleReconnect(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string; viewer?: boolean },
    ) {
        return this.handleJoinSession(client, data);
    }

    // Dedup: only launch Chrome once per session
    private chromeLaunched: Set<string> = new Set();

    /**
     * Client signals the Selkies stream is connected (display resized).
     * NOW it's safe to launch Chrome — it will open at the correct resolution.
     */
    @SubscribeMessage('session:clientReady')
    async handleClientReady(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string; mobile?: boolean },
    ) {
        if (!data?.sessionId) return;
        if (this.chromeLaunched.has(data.sessionId)) return;
        this.chromeLaunched.add(data.sessionId);

        this.logger.log(`Client stream ready for ${data.sessionId} (mobile: ${!!data.mobile}) — launching Chrome`);
        await this.sessionService.launchChromeForSession(data.sessionId, !!data.mobile);

        // Tell the frontend Chrome is up — it can drop the loading spinner
        client.emit('session:chromeReady', { sessionId: data.sessionId });
    }

    private broadcastTimerUpdates() {
        for (const [sessionId, clients] of this.sessionClients) {
            const timeRemaining = this.sessionService.getSessionTimeRemaining(sessionId);
            const session = this.sessionService.getSession(sessionId);

            if (!session || session.status !== 'active') {
                // Session ended, notify clients
                for (const clientId of clients) {
                    const socket = this.server.sockets.sockets.get(clientId);
                    if (socket) {
                        socket.emit('session:ended', { reason: 'expired' });
                    }
                    this.clientIsViewer.delete(clientId);
                }
                this.sessionClients.delete(sessionId);
                this.sessionViewers.delete(sessionId);
                continue;
            }

            for (const clientId of clients) {
                const socket = this.server.sockets.sockets.get(clientId);
                if (socket) {
                    socket.emit('session:timer', { timeRemaining });

                    // Warning at 30 seconds
                    if (timeRemaining === 30) {
                        socket.emit('session:warning', { secondsLeft: 30 });
                    }
                }
            }
        }
    }

    notifySessionEnded(sessionId: string, reason: string) {
        this.chromeLaunched.delete(sessionId);
        const clients = this.sessionClients.get(sessionId);
        if (clients) {
            for (const clientId of clients) {
                const socket = this.server.sockets.sockets.get(clientId);
                if (socket) {
                    socket.emit('session:ended', { reason });
                }
            }
        }
    }

    /** Get viewer count for a session (used by admin dashboard) */
    getViewerCount(sessionId: string): number {
        return this.sessionViewers.get(sessionId)?.size || 0;
    }

    /** Check if session stream is ready (Chrome launched) */
    isStreamReady(sessionId: string): boolean {
        return this.chromeLaunched.has(sessionId);
    }

    private emitViewerCount(sessionId: string) {
        const count = this.sessionViewers.get(sessionId)?.size || 0;
        const primaryId = this.sessionPrimary.get(sessionId);
        if (primaryId) {
            const socket = this.server.sockets.sockets.get(primaryId);
            if (socket) {
                socket.emit('session:viewer-count', { count });
            }
        }
    }
}
