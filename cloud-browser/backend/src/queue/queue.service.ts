import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ContainerService } from '../container/container.service';
import { SessionService } from '../session/session.service';

export type QueueStatus = 'waiting' | 'preparing' | 'connecting' | 'ready' | 'rate_limited' | 'error';

export interface QueueEntry {
    id: string;
    url: string;
    clientIp: string;
    position: number;
    status: QueueStatus;
    sessionId?: string;
    port?: number;
    createdAt: Date;
    abandoned?: boolean; // Set when client disconnects during preparing/connecting
}

@Injectable()
export class QueueService implements OnModuleDestroy {
    private readonly logger = new Logger(QueueService.name);
    private queue: QueueEntry[] = [];
    private entries: Map<string, QueueEntry> = new Map(); // All entries by ID
    private ipQueueMap: Map<string, string> = new Map(); // QE3: clientIp -> queueId
    private onUpdateCallbacks: Map<string, (entry: QueueEntry) => void> = new Map();
    private checkInterval: NodeJS.Timeout;
    private staleCheckInterval: NodeJS.Timeout;
    private processing = false; // Fix #4: prevent concurrent processQueue runs
    private static readonly QUEUE_ENTRY_TTL_MS = 5 * 60 * 1000; // 5 minutes max lifetime for unconnected entries

    constructor(
        private containerService: ContainerService,
        private sessionService: SessionService,
    ) {
        // Process queue every 500ms for faster response
        this.checkInterval = setInterval(() => this.processQueue(), 500);
        // Evict stale queue entries every 30s (entries that never got a WebSocket)
        this.staleCheckInterval = setInterval(() => this.evictStaleEntries(), 30_000);
    }

    // Fix #6: Clear intervals on module destroy to prevent memory leaks
    onModuleDestroy() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        if (this.staleCheckInterval) {
            clearInterval(this.staleCheckInterval);
        }
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

    // Fix #2: Return false if entry doesn't exist (guard for double-tab disconnect)
    removeFromQueue(queueId: string): boolean {
        const entry = this.entries.get(queueId);
        if (!entry) return false;

        const queueIndex = this.queue.findIndex(e => e.id === queueId);
        if (queueIndex !== -1) {
            this.queue.splice(queueIndex, 1);
            this.updatePositions();
        }
        // QE3: Clean up IP mapping
        this.ipQueueMap.delete(entry.clientIp);
        this.entries.delete(queueId);
        this.onUpdateCallbacks.delete(queueId);
        return true;
    }

    /**
     * Mark a queue entry as abandoned (client disconnected during processing).
     * If the entry already has a session, end it immediately.
     * If it's still being processed, the abandoned flag will be checked
     * after session creation in processQueue().
     */
    markAbandoned(queueId: string): void {
        const entry = this.entries.get(queueId);
        if (!entry) return;

        entry.abandoned = true;

        if (entry.sessionId) {
            // Session was already created — end it now
            this.logger.warn(`Cleaning up orphaned session ${entry.sessionId} (client disconnected during ${entry.status})`);
            this.sessionService.endSession(entry.sessionId, 'queue_disconnect').catch(err => {
                this.logger.error(`Failed to end orphaned session ${entry.sessionId}: ${err.message}`);
            });
            this.ipQueueMap.delete(entry.clientIp);
            this.entries.delete(queueId);
            this.onUpdateCallbacks.delete(queueId);
        } else {
            this.logger.warn(`Marked queue entry ${queueId} as abandoned (status: ${entry.status}) — will clean up after processing`);
        }
    }

    private updatePositions() {
        this.queue.forEach((entry, index) => {
            entry.position = index + 1;
        });
    }

    getQueueLength(): number {
        return this.queue.length;
    }

    // SECURITY #13: Check if IP already has a pending queue entry
    hasEntryForIp(clientIp: string): boolean {
        return this.ipQueueMap.has(clientIp);
    }

    /**
     * Calculate realistic estimated wait time for a specific queue position.
     * Maps each position to the Nth soonest-ending active session + boot time.
     * For positions beyond active session count, uses max session duration.
     */
    getEstimatedWaitTime(position: number): number {
        const warmCount = this.containerService.getWarmCount();
        const bootTime = this.containerService.getAvgBootTimeSec();
        const poolSize = this.containerService.getPoolSize();

        // Users covered by warm containers wait 0 seconds
        if (position <= warmCount) return 0;

        // Position after warm containers are consumed
        const posAfterWarm = position - warmCount;

        // Get sorted remaining times of all active sessions (soonest first)
        const sortedRemaining = this.sessionService.getSortedRemainingTimes();
        const maxDuration = this.sessionService.getMaxSessionDuration();

        // Which "wave" am I in? Wave 0 = waiting for current sessions to end
        const wave = Math.floor((posAfterWarm - 1) / poolSize);
        const slotIndex = (posAfterWarm - 1) % poolSize;

        if (wave === 0) {
            // First wave: wait for the Nth soonest session to end + boot
            const remaining = sortedRemaining[slotIndex];
            if (remaining !== undefined) {
                return remaining + bootTime;
            }
            // No active sessions — just boot time (containers are starting)
            return bootTime;
        }

        // Later waves: first wave wait + (wave × maxSessionDuration) + boot
        const firstWaveRemaining = sortedRemaining[slotIndex] ?? maxDuration;
        return firstWaveRemaining + (wave * maxDuration) + bootTime;
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

    /**
     * Fix #1: Clean up terminal entries (ready/error/rate_limited) after 60s
     */
    private scheduleCleanup(entry: QueueEntry) {
        setTimeout(() => {
            if (this.entries.has(entry.id)) {
                this.entries.delete(entry.id);
                this.onUpdateCallbacks.delete(entry.id);
                this.ipQueueMap.delete(entry.clientIp);
                this.logger.debug(`Cleaned up stale entry ${entry.id} (status: ${entry.status})`);
            }
        }, 60_000);
    }

    private async processQueue() {
        // Fix #4: Prevent concurrent runs
        if (this.processing) return;
        if (this.queue.length === 0) return;

        // Fix #5: Skip processing when service is paused
        if (this.sessionService.isPaused()) return;

        this.processing = true;

        try {
            // Batch dequeue: process all eligible entries in one tick
            while (this.queue.length > 0) {
                const warmCount = this.containerService.getWarmCount();
                if (warmCount === 0) break;

                const activeCount = this.sessionService.getActiveCount();
                const maxSessions = this.containerService.getMaxSessions();
                if (activeCount >= maxSessions) break;

                const entry = this.queue.find(e => e.status === 'waiting');
                if (!entry) break;

                await this.processEntry(entry);
            }
        } finally {
            this.processing = false;
        }
    }

    /**
     * Process a single queue entry: rate-check, acquire container, create session.
     */
    private async processEntry(entry: QueueEntry): Promise<void> {
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
            // Immediately free IP so they aren't permanently locked out
            this.ipQueueMap.delete(entry.clientIp);
            this.notifyUpdate(entry);
            this.logger.log(`Queue entry ${entry.id} rate-limited (IP: ${entry.clientIp})`);
            this.scheduleCleanup(entry);
            return;
        }

        // Step 1: Preparing
        entry.status = 'preparing';
        this.notifyUpdate(entry);

        // Small delay for UX (shows preparing step)
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if client abandoned during preparing
        if (entry.abandoned) {
            this.logger.warn(`Queue entry ${entry.id} abandoned during preparing — skipping session creation`);
            this.ipQueueMap.delete(entry.clientIp);
            this.entries.delete(entry.id);
            this.onUpdateCallbacks.delete(entry.id);
            return;
        }

        // Step 2: Connecting
        entry.status = 'connecting';
        this.notifyUpdate(entry);

        const result = await this.sessionService.createSession(entry.url, entry.clientIp);

        if (result.session) {
            entry.sessionId = result.session.id;
            entry.port = result.session.port;

            // Check if client abandoned during session creation
            if (entry.abandoned) {
                this.logger.warn(`Queue entry ${entry.id} abandoned after session creation — ending orphaned session ${result.session.id}`);
                await this.sessionService.endSession(result.session.id, 'queue_disconnect');
                this.ipQueueMap.delete(entry.clientIp);
                this.entries.delete(entry.id);
                this.onUpdateCallbacks.delete(entry.id);
                return;
            }

            // Step 3: Ready
            entry.status = 'ready';
            // Immediately free IP from queue map — active session check now guards this IP
            this.ipQueueMap.delete(entry.clientIp);
            this.notifyUpdate(entry);
            this.logger.log(`Queue entry ${entry.id} ready with session ${entry.sessionId}`);
            // Fix #1: Schedule cleanup of this completed entry
            this.scheduleCleanup(entry);
        } else if (result.error) {
            // Fix #3: Notify the client about the error instead of silently dropping
            this.logger.error(`Queue processing failed for ${entry.id}: ${result.error}`);
            entry.status = 'error';
            // Immediately free IP so they can retry
            this.ipQueueMap.delete(entry.clientIp);
            this.notifyUpdate(entry);
            this.scheduleCleanup(entry);
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

    /**
     * Evict queue entries that have been waiting too long without being processed.
     * Catches the edge case where a client gets a queueId but never opens a WebSocket
     * (JS disabled, bookmarked URL, closed tab before WS connected, etc.).
     * Without this, ipQueueMap would hold the IP hostage forever.
     */
    private evictStaleEntries() {
        const now = Date.now();
        const stale: QueueEntry[] = [];

        for (const entry of this.queue) {
            if (entry.status === 'waiting' && (now - entry.createdAt.getTime()) > QueueService.QUEUE_ENTRY_TTL_MS) {
                stale.push(entry);
            }
        }

        for (const entry of stale) {
            const idx = this.queue.indexOf(entry);
            if (idx !== -1) this.queue.splice(idx, 1);
            this.ipQueueMap.delete(entry.clientIp);
            this.entries.delete(entry.id);
            this.onUpdateCallbacks.delete(entry.id);
            this.logger.warn(`Evicted stale queue entry ${entry.id} (IP: ${entry.clientIp}, age: ${Math.round((now - entry.createdAt.getTime()) / 1000)}s)`);
        }

        if (stale.length > 0) {
            this.updatePositions();
        }
    }
}
