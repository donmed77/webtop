import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';

@Injectable()
export class UrlService {
    private readonly logger = new Logger(UrlService.name);

    /**
     * Navigate Chrome to a URL via CDP (Chrome DevTools Protocol)
     * @param containerHost The container hostname or IP (e.g., 'host.docker.internal' or IP)
     * @param port The container's mapped port
     * @param url The URL to navigate to
     */
    async navigateToUrl(port: number, url: string): Promise<boolean> {
        const cdpUrl = `http://localhost:${port}`;
        const maxRetries = 10;
        const retryDelay = 1000; // 1 second

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.logger.log(`Attempt ${attempt}: Connecting to Chrome CDP at port ${port}...`);

                // Connect to Chrome's debugging endpoint
                const browser = await puppeteer.connect({
                    browserURL: cdpUrl,
                    defaultViewport: null,
                });

                // Get existing pages (Chrome should have at least the initial page)
                const pages = await browser.pages();
                let page = pages[0];

                if (!page) {
                    page = await browser.newPage();
                }

                // Navigate to the user's URL
                this.logger.log(`Navigating to: ${url}`);
                await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000,
                });

                // Disconnect (don't close - we want Chrome to keep running)
                browser.disconnect();

                this.logger.log(`Successfully navigated to ${url}`);
                return true;
            } catch (error) {
                this.logger.warn(`Attempt ${attempt} failed: ${error.message}`);

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }

        this.logger.error(`Failed to navigate to ${url} after ${maxRetries} attempts`);
        return false;
    }
}
