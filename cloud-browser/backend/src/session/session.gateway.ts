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
            const clients = this.sessionClients.get(sessionId);
            if (clients) {
                clients.delete(client.id);
                // EC1: If the primary disconnected, clear primary
                if (this.sessionPrimary.get(sessionId) === client.id) {
                    this.sessionPrimary.delete(sessionId);
                }
                if (clients.size === 0) {
                    this.sessionClients.delete(sessionId);
                    // Grace period before ending session
                    setTimeout(() => this.checkSessionAbandoned(sessionId), 30000);
                }
            }
        }
    }

    private checkSessionAbandoned(sessionId: string) {
        const clients = this.sessionClients.get(sessionId);
        if (!clients || clients.size === 0) {
            const session = this.sessionService.getSession(sessionId);
            if (session && session.status === 'active') {
                this.logger.log(`Session ${sessionId} abandoned, ending...`);
                this.sessionService.endSession(sessionId, 'abandoned');
            }
        }
    }

    @SubscribeMessage('session:join')
    handleJoinSession(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string },
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

        this.logger.log(`Client ${client.id} joined session ${data.sessionId} as primary`);
    }

    @SubscribeMessage('session:reconnect')
    handleReconnect(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { sessionId: string },
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
                }
                this.sessionClients.delete(sessionId);
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
}
