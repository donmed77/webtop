import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        commit: process.env.GIT_COMMIT || 'unknown',
        branch: process.env.GIT_BRANCH || 'unknown',
        builtAt: process.env.BUILD_TIME || 'unknown',
    });
}
