import requests
from bs4 import BeautifulSoup
import time
import logging
from typing import List, Dict, Any
import re
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)

class KrowneScraper:
    def __init__(self):
        self.base_url = "https://krowne.com"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        self.delay = 1  # Delay between requests to be respectful
    
    def scrape_products(self) -> List[Dict[str, Any]]:
        """Scrape product data from krowne.com"""
        try:
            # First, get all product URLs
            product_urls = self._discover_product_urls()
            
            products = []
            for i, url in enumerate(product_urls):
                try:
                    logger.info(f"Scraping product {i+1}/{len(product_urls)}: {url}")
                    product_data = self._scrape_product_page(url)
                    if product_data:
                        products.append(product_data)
                    
                    # Be respectful with delays
                    time.sleep(self.delay)
                    
                except Exception as e:
                    logger.error(f"Error scraping product {url}: {str(e)}")
                    continue
            
            logger.info(f"Successfully scraped {len(products)} products from krowne.com")
            return products
            
        except Exception as e:
            logger.error(f"Error during product scraping: {str(e)}")
            raise
    
    def _discover_product_urls(self) -> List[str]:
        """Discover all product URLs on the website"""
        product_urls = []
        
        try:
            # Start with common category pages
            category_pages = [
                '/products',
                '/shop',
                '/catalog',
                '/items'
            ]
            
            # Try to find sitemap first
            sitemap_urls = self._check_sitemap()
            if sitemap_urls:
                product_urls.extend(sitemap_urls)
                return product_urls
            
            # Fallback: crawl category pages
            for category_path in category_pages:
                try:
                    category_url = urljoin(self.base_url, category_path)
                    response = self._make_request(category_url)
                    if response and response.status_code == 200:
                        soup = BeautifulSoup(response.content, 'html.parser')
                        
                        # Look for product links
                        links = soup.find_all('a', href=True)
                        for link in links:
                            href = link['href']
                            full_url = urljoin(self.base_url, href)
                            
                            # Filter for product URLs (adjust patterns as needed)
                            if self._is_product_url(href):
                                product_urls.append(full_url)
                        
                        time.sleep(self.delay)
                        
                except Exception as e:
                    logger.warning(f"Could not access category page {category_path}: {str(e)}")
                    continue
            
            # Remove duplicates
            product_urls = list(set(product_urls))
            logger.info(f"Discovered {len(product_urls)} product URLs")
            
            return product_urls[:50]  # Limit to first 50 for demo purposes
            
        except Exception as e:
            logger.error(f"Error discovering product URLs: {str(e)}")
            return []
    
    def _check_sitemap(self) -> List[str]:
        """Check for XML sitemap"""
        sitemap_urls = [
            '/sitemap.xml',
            '/sitemap_index.xml',
            '/robots.txt'
        ]
        
        product_urls = []
        
        for sitemap_path in sitemap_urls:
            try:
                sitemap_url = urljoin(self.base_url, sitemap_path)
                response = self._make_request(sitemap_url)
                
                if response and response.status_code == 200:
                    if sitemap_path.endswith('.xml'):
                        # Parse XML sitemap
                        soup = BeautifulSoup(response.content, 'xml')
                        urls = soup.find_all('url')
                        
                        for url_tag in urls:
                            loc = url_tag.find('loc')
                            if loc and self._is_product_url(loc.text):
                                product_urls.append(loc.text)
                    
                    elif sitemap_path.endswith('robots.txt'):
                        # Look for sitemap references in robots.txt
                        for line in response.text.split('\n'):
                            if line.lower().startswith('sitemap:'):
                                sitemap_ref = line.split(':', 1)[1].strip()
                                # Recursively check referenced sitemaps
                                continue
                
            except Exception as e:
                logger.warning(f"Could not access {sitemap_path}: {str(e)}")
                continue
        
        return product_urls
    
    def _is_product_url(self, url: str) -> bool:
        """Determine if a URL is likely a product page"""
        product_indicators = [
            '/product/',
            '/item/',
            '/p/',
            '/products/',
            '-p-',
            '/shop/',
        ]
        
        url_lower = url.lower()
        return any(indicator in url_lower for indicator in product_indicators)
    
    def _scrape_product_page(self, url: str) -> Dict[str, Any]:
        """Scrape individual product page"""
        try:
            response = self._make_request(url)
            if not response or response.status_code != 200:
                return None
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Extract product information (adjust selectors as needed)
            product_data = {
                'url': url,
                'product_id': self._extract_product_id(url, soup),
                'name': self._extract_product_name(soup),
                'price': self._extract_price(soup),
                'description': self._extract_description(soup),
                'availability': self._extract_availability(soup),
                'images': self._extract_images(soup, url)
            }
            
            return product_data
            
        except Exception as e:
            logger.error(f"Error scraping product page {url}: {str(e)}")
            return None
    
    def _extract_product_id(self, url: str, soup: BeautifulSoup) -> str:
        """Extract product ID from URL or page content"""
        # Try to find product ID in URL
        url_parts = url.split('/')
        for part in reversed(url_parts):
            if part and re.match(r'^[A-Za-z0-9-_]+$', part):
                return part
        
        # Try to find in meta tags or data attributes
        product_id_selectors = [
            '[data-product-id]',
            '[data-product-code]',
            'meta[property="product:retailer_item_id"]',
            'meta[name="product_id"]'
        ]
        
        for selector in product_id_selectors:
            element = soup.select_one(selector)
            if element:
                return element.get('content') or element.get('data-product-id') or element.get('data-product-code')
        
        return url.split('/')[-1] or 'unknown'
    
    def _extract_product_name(self, soup: BeautifulSoup) -> str:
        """Extract product name"""
        name_selectors = [
            'h1.product-title',
            'h1.product-name',
            'h1',
            '.product-title',
            '.product-name',
            '[data-product-name]'
        ]
        
        for selector in name_selectors:
            element = soup.select_one(selector)
            if element:
                return element.get_text().strip()
        
        return 'Unknown Product'
    
    def _extract_price(self, soup: BeautifulSoup) -> float:
        """Extract product price"""
        price_selectors = [
            '.price',
            '.product-price',
            '[data-price]',
            '.cost',
            '.amount'
        ]
        
        for selector in price_selectors:
            elements = soup.select(selector)
            for element in elements:
                price_text = element.get_text().strip()
                price_match = re.search(r'[\d,]+\.?\d*', price_text.replace(',', ''))
                if price_match:
                    try:
                        return float(price_match.group())
                    except ValueError:
                        continue
        
        return 0.0
    
    def _extract_description(self, soup: BeautifulSoup) -> str:
        """Extract product description"""
        desc_selectors = [
            '.product-description',
            '.description',
            '.product-details',
            '.product-info'
        ]
        
        for selector in desc_selectors:
            element = soup.select_one(selector)
            if element:
                return element.get_text().strip()
        
        return ''
    
    def _extract_availability(self, soup: BeautifulSoup) -> str:
        """Extract availability status"""
        availability_selectors = [
            '.availability',
            '.stock-status',
            '.in-stock',
            '.out-of-stock'
        ]
        
        for selector in availability_selectors:
            element = soup.select_one(selector)
            if element:
                return element.get_text().strip()
        
        return 'Unknown'
    
    def _extract_images(self, soup: BeautifulSoup, base_url: str) -> List[str]:
        """Extract product images"""
        image_urls = []
        
        img_selectors = [
            '.product-image img',
            '.product-gallery img',
            '.product-photos img'
        ]
        
        for selector in img_selectors:
            images = soup.select(selector)
            for img in images:
                src = img.get('src') or img.get('data-src')
                if src:
                    full_url = urljoin(base_url, src)
                    image_urls.append(full_url)
        
        return image_urls
    
    def _make_request(self, url: str, max_retries: int = 3):
        """Make HTTP request with retry logic"""
        for attempt in range(max_retries):
            try:
                response = self.session.get(url, timeout=10)
                return response
            except requests.exceptions.RequestException as e:
                logger.warning(f"Request attempt {attempt + 1} failed for {url}: {str(e)}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
                else:
                    logger.error(f"All request attempts failed for {url}")