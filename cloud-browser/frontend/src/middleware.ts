import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextRequest } from "next/server";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const originalUrl = request.url;
  const response = intlMiddleware(request);
  response.headers.set("x-full-url", originalUrl);
  return response;
}

export const config = {
  matcher: [
    // Exclude cloud-browser routes, API, static files, and Next.js internals
    "/((?!api|_next|queue|session|session-ended|survey|rate-limited|ctrl-7f9x2k|sounds|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|webmanifest|mp3)).*)",
  ],
};
