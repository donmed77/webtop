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
import { Logger } from '@nestjs/common';
import { SessionService } from './session.service';

@WebSocketGateway({
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3002',
    },
})
export class SessionGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(SessionGateway.name);
    private clientSessions: Map<string, string> = new Map(); // socketId -> sessionId
    private sessionClients: Map<string, Set<string>> = new Map(); // sessionId -> Set<socketId>
    private sessionPrimary: Map<string, string> = new Map(); // sessionId -> primary socketId (EC1)
    private sessionViewers: Map<string, Set<string>> = new Map(); // sessionId -> Set<viewer socketId>
    private clientIsViewer: Map<string, boolean> = new Map(); // socketId -> isViewer
    private reconnectingSessions: Map<string, { disconnectedAt: number; timer: NodeJS.Timeout }> = new Map();

    constructor(private sessionService: SessionService) {
        // Send timer updates every second
        setInterval(() => this.broadcastTimerUpdates(), 1000);
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
                // EC1: If the primary disconnected, clear primary
                if (this.sessionPrimary.get(sessionId) === client.id) {
                    this.sessionPrimary.delete(sessionId);
                }
                if (clients.size === 0) {
                    this.sessionClients.delete(sessionId);
                    // Cancel any stale timer from a previous disconnect
                    const existing = this.reconnectingSessions.get(sessionId);
                    if (existing) clearTimeout(existing.timer);
                    // Start fresh grace period
                    const timer = setTimeout(() => this.checkSessionAbandoned(sessionId), 35000);
                    this.reconnectingSessions.set(sessionId, { disconnectedAt: Date.now(), timer });
                }
            }
        }
    }

    private checkSessionAbandoned(sessionId: string) {
        const clients = this.sessionClients.get(sessionId);
        if (!clients || clients.size === 0) {
            this.reconnectingSessions.delete(sessionId);
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
            this.clientIsViewer.set(client.id, true);
            if (!this.sessionViewers.has(data.sessionId)) {
                this.sessionViewers.set(data.sessionId, new Set());
            }
            this.sessionViewers.get(data.sessionId)!.add(client.id);

            client.emit('session:joined', {
                sessionId: session.id,
                port: session.port,
                timeRemaining: this.sessionService.getSessionTimeRemaining(session.id),
                isViewer: true,
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

        client.emit('session:joined', {
            sessionId: session.id,
            port: session.port,
            timeRemaining: this.sessionService.getSessionTimeRemaining(session.id),
            isPrimary: true,
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
