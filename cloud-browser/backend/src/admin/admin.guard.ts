import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminGuard implements CanActivate {
    private readonly username: string;
    private readonly password: string;

    constructor(private configService: ConfigService) {
        this.username = this.configService.get<string>('ADMIN_USER', 'admin');
        this.password = this.configService.get<string>('ADMIN_PASSWORD', 'changeme');
    }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Basic ')) {
            throw new UnauthorizedException('Basic auth required');
        }

        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const [username, password] = credentials.split(':');

        if (username !== this.username || password !== this.password) {
            throw new UnauthorizedException('Invalid credentials');
        }

        return true;
    }
}
