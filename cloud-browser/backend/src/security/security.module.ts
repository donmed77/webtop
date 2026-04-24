import { Module, Global } from '@nestjs/common';
import { SecurityService } from './security.service';
import { SecurityController } from './security.controller';

@Global()
@Module({
    providers: [SecurityService],
    controllers: [SecurityController],
    exports: [SecurityService],
})
export class SecurityModule {}
