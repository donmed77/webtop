import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ContainerService } from '../container/container.service';
import { SessionService } from '../session/session.service';

export type QueueStatus = 'waiting' | 'preparing' | 'connecting' | 'ready' | 'rate_limited';

export interface QueueEntry {
    id: string;
    url: string;
    clientIp: string;
    position: number;
    status: QueueStatus;
    sessionId?: string;
    port?: number;
    createdAt: Date;
}

@Injectable()
export class QueueService {
    private readonly logger = new Logger(QueueService.name);
    private queue: QueueEntry[] = [];
    private entries: Map<string, QueueEntry> = new Map(); // All entries by ID
    private ipQueueMap: Map<string, string> = new Map(); // QE3: clientIp -> queueId
    private onUpdateCallbacks: Map<string, (entry: QueueEntry) => void> = new Map();
    private checkInterval: NodeJS.Timeout;

    constructor(
        private containerService: ContainerService,
        private sessionService: SessionService,
    ) {
        // Process queue every 500ms for faster response
        this.checkInterval = setInterval(() => this.processQueue(), 500);
    }

    addToQueue(url: string, clientIp: string): QueueEntry {
        // QE3: If this IP already has a waiting queue entry, reuse it
        const existingId = this.ipQueueMap.get(clientIp);
        if (existingId) {
            const existing = this.entries.get(existingId);
            if (existing && existing.status === 'waiting') {
                existing.url = url; // Update to new URL
                this.logger.log(`Reusing queue entry ${existingId} for IP ${clientIp}`);
                return existing;
            }
            // Stale reference, clean up
            this.ipQueueMap.delete(clientIp);
        }

        const entry: QueueEntry = {
            id: uuidv4(),
            url,
            clientIp,
            position: this.queue.length + 1,
            status: 'waiting',
            createdAt: new Date(),
        };
        this.queue.push(entry);
        this.entries.set(entry.id, entry);
        this.ipQueueMap.set(clientIp, entry.id);
        this.logger.log(`Added ${entry.id} to queue at position ${entry.position}`);

        // Trigger immediate processing
        setImmediate(() => this.processQueue());

        return entry;
    }

    getQueueEntry(queueId: string): QueueEntry | undefined {
        const entry = this.entries.get(queueId);
        if (entry && entry.status === 'waiting') {
            const queueIndex = this.queue.findIndex(e => e.id === queueId);
            entry.position = queueIndex >= 0 ? queueIndex + 1 : 0;
        }
        return entry;
    }

    removeFromQueue(queueId: string): boolean {
        const entry = this.entries.get(queueId);
        const queueIndex = this.queue.findIndex(e => e.id === queueId);
        if (queueIndex !== -1) {
            this.queue.splice(queueIndex, 1);
            this.updatePositions();
        }
        // QE3: Clean up IP mapping
        if (entry) {
            this.ipQueueMap.delete(entry.clientIp);
        }
        this.entries.delete(queueId);
        this.onUpdateCallbacks.delete(queueId);
        return true;
    }

    private updatePositions() {
        this.queue.forEach((entry, index) => {
            entry.position = index + 1;
        });
    }

    getQueueLength(): number {
        return this.queue.length;
    }

    getEstimatedWaitTime(): number {
        // Q5: Use dynamic avg from actual session durations
        const avgDuration = this.sessionService.getAvgSessionDuration();
        const queueLength = this.queue.length;
        const warmContainers = this.containerService.getWarmCount();

        if (warmContainers > 0) return 0;
        return Math.ceil((queueLength / 3) * avgDuration);
    }

    /**
     * DT3: Drain queue — remove all waiting entries
     */
    drainQueue(): number {
        const count = this.queue.length;
        // Notify all waiting entries that they were removed
        for (const entry of this.queue) {
            entry.status = 'rate_limited'; // Reuse status to show "removed" message
            this.notifyUpdate(entry);
            this.ipQueueMap.delete(entry.clientIp);
            this.entries.delete(entry.id);
            this.onUpdateCallbacks.delete(entry.id);
        }
        this.queue = [];
        this.logger.log(`Queue drained: ${count} entries removed`);
        return count;
    }

    /**
     * Register callback for queue entry updates (status changes)
     */
    onUpdate(queueId: string, callback: (entry: QueueEntry) => void) {
        this.onUpdateCallbacks.set(queueId, callback);
    }



    private notifyUpdate(entry: QueueEntry) {
        const callback = this.onUpdateCallbacks.get(entry.id);
        if (callback) {
            callback(entry);
        }
    }

    private async processQueue() {
        if (this.queue.length === 0) return;

        const warmCount = this.containerService.getWarmCount();
        if (warmCount === 0) return;

        // Process next waiting entry
        const entry = this.queue.find(e => e.status === 'waiting');
        if (!entry) return;

        // Remove from waiting queue
        const queueIndex = this.queue.indexOf(entry);
        if (queueIndex !== -1) {
            this.queue.splice(queueIndex, 1);
            this.updatePositions();
        }

        this.logger.log(`Processing queue entry ${entry.id}`);

        // E4: Check rate limit during processing (user has already seen queue page)
        const rateLimit = this.sessionService.checkRateLimit(entry.clientIp);
        if (!rateLimit.allowed) {
            entry.status = 'rate_limited';
            this.notifyUpdate(entry);
            this.logger.log(`Queue entry ${entry.id} rate-limited (IP: ${entry.clientIp})`);
            // Clean up
            if (entry.clientIp) this.ipQueueMap.delete(entry.clientIp);
            this.entries.delete(entry.id);
            this.onUpdateCallbacks.delete(entry.id);
            return;
        }

        // Step 1: Preparing
        entry.status = 'preparing';
        this.notifyUpdate(entry);

        // Small delay for UX (shows preparing step)
        await new Promise(resolve => setTimeout(resolve, 500));

        // Step 2: Connecting
        entry.status = 'connecting';
        this.notifyUpdate(entry);

        const result = await this.sessionService.createSession(entry.url, entry.clientIp);

        if (result.session) {
            // Step 3: Ready
            entry.status = 'ready';
            entry.sessionId = result.session.id;
            entry.port = result.session.port;
            this.notifyUpdate(entry);

            this.logger.log(`Queue entry ${entry.id} ready with session ${entry.sessionId}`);
        } else if (result.error) {
            this.logger.error(`Queue processing failed for ${entry.id}: ${result.error}`);
            this.entries.delete(entry.id);
        } else {
            // Put back in queue if no containers
            entry.status = 'waiting';
            this.queue.unshift(entry);
            this.updatePositions();
            this.notifyUpdate(entry);
        }
    }

    getAllQueue(): QueueEntry[] {
        return [...this.queue];
    }
}
