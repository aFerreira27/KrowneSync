
'use server';

import puppeteer from 'puppeteer';

// To get a free token for more reliable access, visit https://www.browserless.io/
const BROWSERLESS_TOKEN = 'YOUR_BROWSERLESS_TOKEN_HERE';

export async function scrapeKrowneWebsite(sku: string) {
    if (!sku) {
        console.error('SKU is required for web scraping.');
        return null;
    }
    
    console.log(`Starting scrape for SKU: ${sku}`);
    const url = `https://krowne.com/product/${sku}`;
    let browser;

    try {
        // Connect to a remote browser instance to avoid local dependency issues.
        // The stealth option helps bypass some anti-bot measures.
        browser = await puppeteer.connect({
            browserWSEndpoint: `wss://chrome.browserless.io?stealth`,
        });

        const page = await browser.newPage();
        
        await page.goto(url, { waitUntil: 'networkidle2' });
        console.log(`Navigated to ${url}`);

        // Check if the page is a 404
        const isNotFound = await page.$('.error-404');
        if (isNotFound) {
            console.log(`Product page not found for SKU: ${sku}`);
            return null;
        }

        const productData = await page.evaluate(() => {
            const getText = (selector: string) => document.querySelector(selector)?.textContent?.trim() || null;
            const getSrc = (selector: string) => (document.querySelector(selector) as HTMLImageElement)?.src || null;
            const getMultiText = (selector: string) => Array.from(document.querySelectorAll(selector)).map(el => el.textContent?.trim());

            const name = getText('.product_title.entry-title');
            const sku = getText('.sku');
            
            // This is a simplified example. A real-world scraper would need to be more robust.
            const description = getText('.woocommerce-product-details__short-description p');
            const mainImage = getSrc('.woocommerce-product-gallery__wrapper .woocommerce-product-gallery__image img');

            const specifications: {name: string, value: string}[] = [];
            document.querySelectorAll('#tab-additional_information table.shop_attributes tr').forEach(row => {
                const keyEl = row.querySelector('th');
                const valueEl = row.querySelector('td p');
                if (keyEl && valueEl) {
                    specifications.push({
                        name: keyEl.textContent?.trim() || '',
                        value: valueEl.textContent?.trim() || '',
                    });
                }
            });

            return {
                name,
                sku,
                description,
                images: mainImage ? [mainImage] : [],
                specifications,
                features: [], // Placeholder, needs specific selector
                compliances: [], // Placeholder, needs specific selector
                url: window.location.href,
            };
        });

        console.log(`Scraping successful for SKU: ${sku}`);
        return productData;

    } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        return { error: `Failed to scrape product data for SKU ${sku}. Error: ${(error as Error).message}` };
    } finally {
        if (browser) {
            // Use disconnect for remote browsers instead of close
            await browser.disconnect();
        }
    }
}
