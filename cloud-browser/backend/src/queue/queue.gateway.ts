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
import { QueueService, QueueEntry } from './queue.service';

@WebSocketGateway({
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3002',
    },
})
export class QueueGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(QueueGateway.name);
    private clientQueues: Map<string, string> = new Map(); // socketId -> queueId

    constructor(private queueService: QueueService) { }

    handleConnection(client: Socket) {
        // Connection handled on join
    }

    handleDisconnect(client: Socket) {
        const queueId = this.clientQueues.get(client.id);
        if (queueId) {
            this.clientQueues.delete(client.id);
            // QE2: Grace period of 10s for page refresh - don't remove immediately
            setTimeout(() => {
                const hasReconnected = [...this.clientQueues.values()].includes(queueId);
                if (!hasReconnected) {
                    this.queueService.removeFromQueue(queueId);
                    this.logger.log(`Queue entry ${queueId} removed after grace period (no reconnect)`);
                }
            }, 10000);
            this.logger.log(`Client ${client.id} disconnected from queue ${queueId}, 10s grace period started`);
        }
    }

    @SubscribeMessage('queue:join')
    handleJoinQueue(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { queueId: string },
    ) {
        const entry = this.queueService.getQueueEntry(data.queueId);
        if (!entry) {
            client.emit('queue:error', { error: 'Queue entry not found' });
            return;
        }

        this.clientQueues.set(client.id, data.queueId);

        // Register callback for all status updates
        this.queueService.onUpdate(data.queueId, (updatedEntry: QueueEntry) => {
            // Send status update
            client.emit('queue:status', {
                status: updatedEntry.status,
                position: updatedEntry.position,
                totalInQueue: this.queueService.getQueueLength(),
                estimatedWaitSeconds: this.queueService.getEstimatedWaitTime(),
            });

            // If ready, send session info
            if (updatedEntry.status === 'ready' && updatedEntry.sessionId) {
                client.emit('queue:ready', {
                    sessionId: updatedEntry.sessionId,
                    port: updatedEntry.port,
                });
            }
        });

        // Send initial status
        client.emit('queue:joined', {
            queueId: entry.id,
            status: entry.status,
            position: entry.position,
            totalInQueue: this.queueService.getQueueLength(),
            estimatedWaitSeconds: this.queueService.getEstimatedWaitTime(),
        });

        // If already ready (processed before client connected), send ready event immediately
        if (entry.status === 'ready' && entry.sessionId) {
            client.emit('queue:ready', {
                sessionId: entry.sessionId,
                port: entry.port,
            });
        }

        this.logger.log(`Client ${client.id} joined queue ${data.queueId}, status: ${entry.status}`);
    }
}
