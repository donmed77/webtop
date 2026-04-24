import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { SecurityService, FileChecksum, ProcessInfo, PortInfo } from './security.service';
import { AdminGuard } from '../admin/admin.guard';

@Controller('admin/security')
@UseGuards(AdminGuard)
export class SecurityController {
    constructor(private securityService: SecurityService) {}

    @Get('events')
    getEvents(
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
        @Query('type') type?: string,
        @Query('severity') severity?: string,
    ) {
        return this.securityService.getEvents(
            Math.min(parseInt(limit || '50', 10), 200),
            parseInt(offset || '0', 10),
            type,
            severity,
        );
    }

    @Get('stats')
    getStats() {
        return this.securityService.getStats();
    }

    @Post('acknowledge/:id')
    acknowledge(@Param('id') id: string) {
        const success = this.securityService.acknowledgeEvent(parseInt(id, 10));
        return { success };
    }

    @Post('acknowledge-all')
    acknowledgeAll() {
        const count = this.securityService.acknowledgeAll();
        return { success: true, acknowledged: count };
    }

    @Get('integrity')
    getIntegrity(): FileChecksum[] {
        return this.securityService.runIntegrityCheck();
    }

    @Get('processes')
    getProcesses(): { suspicious: ProcessInfo[]; total: number } {
        return this.securityService.checkProcesses();
    }

    @Get('ports')
    getPorts(): PortInfo[] {
        return this.securityService.checkPorts();
    }

    @Get('watchdog')
    getWatchdog() {
        return this.securityService.checkSshKeysAndCron();
    }

    @Get('filesystem')
    getFilesystem() {
        return this.securityService.getFsEvents();
    }

    @Get('disk')
    getDisk() {
        return this.securityService.checkDiskSpace();
    }

    @Get('docker-image')
    getDockerImage() {
        return this.securityService.getDockerImageStatus();
    }

    @Get('verify-process/:pid')
    verifyProcess(@Param('pid') pid: string) {
        return this.securityService.verifyProcessBinary(parseInt(pid, 10));
    }
}
