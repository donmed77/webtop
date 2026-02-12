import { Module, Global } from '@nestjs/common';
import { ContainerService } from './container.service';

@Global()
@Module({
    providers: [ContainerService],
    exports: [ContainerService],
})
export class ContainerModule { }
