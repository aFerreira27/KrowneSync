import requests
import os
import re
import asyncio
from bs4 import BeautifulSoup
from urllib.parse import urljoin

BASEURL = 'https://www.krowne.com/'

class KrowneScraper:
    @staticmethod
    def parseSite(sku):
        response = requests.get(BASEURL + sku)
        site = BeautifulSoup(response.content, 'html.parser')
        return site

    @staticmethod
    def getProdName(site):
        h3_tag = site.find('h3', class_='font-size24')
        prodName = h3_tag.strong.get_text(strip=True) if h3_tag and h3_tag.strong else 'Product Name Not Found'
        return prodName

    @staticmethod
    def scrapeSite(BASEURL, sku):
        """
        Scrapes all available product information from Krowne website dynamically
        """
        response = requests.get(BASEURL + sku)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Initialize flexible product data structure
        product_data = {
            'sku': sku.upper(),
            'krowne': {
                'name': None,
                'price': None,
                'description': None,
                'mainImageUrl': None,
                'features': [],
                'specifications': {},
                'certifications': {},
                'warranty': None,
                'series': None,
                'relatedProducts': [],
                'categories': [],
                'downloads': [],
                'breadcrumb': [],
                'productCode': None,
                'listPrice': None,
                'specSheetUrl': None,
                'warrantyInfo': None,
                'detailedFeatures': []
            }
        }
        
        # Extract product name
        h3_tag = soup.find('h3', class_='font-size24')
        if h3_tag and h3_tag.strong:
            product_data['krowne']['name'] = h3_tag.strong.get_text(strip=True)
        
        # Extract SKU/Model number
        # Look for MODEL followed by SKU in various formats
        model_text = soup.find(text=re.compile(r'MODEL'))
        if model_text:
            # Find the parent element and look for the SKU
            parent = model_text.parent
            if parent:
                # Look for <strong> tag with SKU
                strong_tag = parent.find_next('strong')
                if strong_tag:
                    extracted_sku = strong_tag.get_text(strip=True)
                    product_data['sku'] = extracted_sku
                    product_data['krowne']['productCode'] = extracted_sku
        
        # Extract price
        price_span = soup.find('span', class_='greentext')
        if price_span:
            price_text = price_span.get_text(strip=True)
            product_data['krowne']['listPrice'] = price_text
            # Extract numeric value
            price_clean = re.sub(r'[^\d.]', '', price_text)
            try:
                product_data['krowne']['price'] = float(price_clean)
            except ValueError:
                product_data['krowne']['price'] = price_text
        
        # Extract main product image
        image_div = soup.find('div', class_='mainProductImage')
        if image_div:
            style_attr = image_div.get('style', '')
            match = re.search(r"url\(['\"]?([^'\"]+)['\"]?\)", style_attr)
            if match:
                relative_path = match.group(1)
                if relative_path.startswith('http'):
                    product_data['krowne']['mainImageUrl'] = relative_path
                else:
                    product_data['krowne']['mainImageUrl'] = urljoin(BASEURL, relative_path)
        
        # Extract features/bullet points
        features_ul = soup.find('ul', class_='productDetailInfoList')
        if features_ul:
            for li in features_ul.find_all('li'):
                text = li.get_text(strip=True)
                if text:
                    product_data['krowne']['features'].append(text)
                    product_data['krowne']['detailedFeatures'].append(text)
        
        # Create description from features
        if product_data['krowne']['features']:
            product_data['krowne']['description'] = ' | '.join(product_data['krowne']['features'][:3])
        
        # Extract ALL specifications dynamically
        specs_section = soup.find('h3', string='SPECIFICATIONS')
        if specs_section:
            specs_table = specs_section.find_next('table')
            if specs_table:
                for row in specs_table.find_all('tr'):
                    cells = row.find_all(['td', 'th'])
                    if len(cells) >= 2:
                        key = cells[0].get_text(strip=True)
                        value = cells[1].get_text(strip=True)
                        if key and value:
                            # Store in specifications dict
                            product_data['krowne']['specifications'][key] = value
                            
                            # Also store series separately if found
                            if key.lower() == 'series':
                                product_data['krowne']['series'] = value
        
        # Extract ALL certifications dynamically
        certs_section = soup.find('h3', string='CERTIFICATIONS')
        if certs_section:
            certs_table = certs_section.find_next('table')
            if certs_table:
                for row in certs_table.find_all('tr'):
                    cells = row.find_all(['td', 'th'])
                    if len(cells) >= 2:
                        cert_name = cells[0].get_text(strip=True)
                        cert_value = cells[1].get_text(strip=True)
                        if cert_name and cert_value:
                            product_data['krowne']['certifications'][cert_name] = cert_value
        
        # Extract warranty information
        warranty_section = soup.find('h3', string='WARRANTY')
        if warranty_section:
            # Look for table first
            warranty_table = warranty_section.find_next('table')
            if warranty_table:
                for row in warranty_table.find_all('tr'):
                    cells = row.find_all(['td', 'th'])
                    if len(cells) >= 1:
                        warranty_text = cells[0].get_text(strip=True)
                        if warranty_text and 'year' in warranty_text.lower():
                            product_data['krowne']['warranty'] = warranty_text
                            break
            
            # Also look for warranty info link
            warranty_link = warranty_section.find_next('a', href=True)
            if warranty_link and 'warranty' in warranty_link.get('href', ''):
                product_data['krowne']['warrantyInfo'] = urljoin(BASEURL, warranty_link.get('href'))
        
        # Extract downloads (spec sheets, etc.)
        downloads_section = soup.find('h3', string='DOWNLOADS')
        if downloads_section:
            download_links = downloads_section.find_next('div').find_all('a', href=True)
            for link in download_links:
                download_info = {
                    'name': link.get_text(strip=True),
                    'url': urljoin(BASEURL, link.get('href'))
                }
                product_data['krowne']['downloads'].append(download_info)
                
                # Store spec sheet URL separately if found
                if 'spec' in download_info['name'].lower():
                    product_data['krowne']['specSheetUrl'] = download_info['url']
        
        # Extract related products from carousel
        carousel = soup.find('div', id='carousel2')
        if carousel:
            carousel_entries = carousel.find_all('div', class_='carousel-entry')
            for entry in carousel_entries:
                link = entry.find('a', href=True)
                if link:
                    # Extract product info
                    href = link.get('href')
                    related_sku = href.strip('/').split('/')[-1] if href else None
                    
                    # Get product name and description
                    text_divs = entry.find_all('div', class_='carousel-entry-text')
                    related_name = None
                    related_description = None
                    
                    if len(text_divs) >= 2:
                        related_name = text_divs[0].get_text(strip=True).replace('<strong>', '').replace('</strong>', '')
                        related_description = text_divs[1].get_text(strip=True)
                    
                    # Get image
                    img = entry.find('img')
                    related_image = None
                    if img and img.get('src'):
                        related_image = urljoin(BASEURL, img.get('src'))
                    
                    if related_sku:
                        related_product = {
                            'sku': related_sku,
                            'name': related_name or related_sku,
                            'description': related_description,
                            'url': urljoin(BASEURL, href) if href else None,
                            'imageUrl': related_image
                        }
                        product_data['krowne']['relatedProducts'].append(related_product)
        
        # Extract breadcrumb navigation
        breadcrumb = soup.find('div', class_='breadcrum')
        if breadcrumb:
            links = breadcrumb.find_all('a', href=True)
            for link in links:
                category_text = link.get_text(strip=True)
                if category_text and category_text != '//' and category_text.lower() not in ['home', '']:
                    category_info = {
                        'name': category_text,
                        'url': urljoin(BASEURL, link.get('href'))
                    }
                    product_data['krowne']['categories'].append(category_info)
                    product_data['krowne']['breadcrumb'].append(category_info)
        
        # Save product image locally (optional)
        if product_data['krowne']['mainImageUrl']:
            folder = f'Output/{sku.upper()} Spec Sheet Folder'
            os.makedirs(folder, exist_ok=True)
            prodImage = f"{sku.upper()}.jpg"
            prodImagePath = os.path.join(folder, prodImage)
            
            try:
                img_data = requests.get(product_data['krowne']['mainImageUrl']).content
                with open(prodImagePath, 'wb') as f:
                    f.write(img_data)
                print(f"✅ Image saved as: {prodImage}")
                product_data['krowne']['localImagePath'] = prodImagePath
            except Exception as e:
                print(f"❌ Error saving image: {e}")
        
        return product_data
    
    async def get_product_by_sku(self, sku):
        """
        Async method to get product data by SKU and format it for the frontend
        """
        try:
            # Use the existing scrapeSite method to get raw data
            raw_data = self.scrapeSite(BASEURL, sku)
            
            # Format the data for the ProductCard component
            formatted_data = self.format_for_product_card(raw_data)
            
            # Return only the krowne portion as expected by the comparison function
            return formatted_data['krowne']
            
        except Exception as e:
            print(f"Error scraping product {sku}: {e}")
            return None
    
    @staticmethod
    def format_for_product_card(product_data):
        """
        Formats the scraped data to match the ProductCard component's expected structure
        """
        sku = product_data['sku']
        krowne_data = product_data['krowne']
        
        # Convert ALL specifications to properties array format
        properties = []
        
        # Add specifications as properties
        for key, value in krowne_data['specifications'].items():
            properties.append({
                'propertyName': key,
                'propertyAdminName': key.replace(' ', '_').replace('-', '_').replace('(', '').replace(')', '').replace('.', ''),
                'value': value
            })
        
        # Add certifications as properties
        for cert_name, cert_value in krowne_data['certifications'].items():
            properties.append({
                'propertyName': f"{cert_name} Certification",
                'propertyAdminName': f"{cert_name.replace(' ', '_')}_Certification",
                'value': cert_value
            })
        
        # Add other metadata as properties
        if krowne_data.get('listPrice'):
            properties.append({
                'propertyName': 'List Price',
                'propertyAdminName': 'List_Price',
                'value': krowne_data['listPrice']
            })
        
        if krowne_data.get('productCode'):
            properties.append({
                'propertyName': 'Product Code',
                'propertyAdminName': 'Product_Code',
                'value': krowne_data['productCode']
            })
        
        # Format for ProductCard component
        formatted_data = {
            'sku': sku,
            'krowne': {
                'name': krowne_data['name'],
                'price': krowne_data['price'],
                'description': krowne_data['description'],
                'mainImageUrl': krowne_data['mainImageUrl'],
                'properties': properties,
                'categories': krowne_data['categories'],
                'relatedProducts': krowne_data['relatedProducts'],
                'series': krowne_data['series'],
                'warranty': krowne_data['warranty'],
                'features': krowne_data['features'],
                'downloads': krowne_data['downloads'],
                'specSheetUrl': krowne_data['specSheetUrl'],
                'warrantyInfo': krowne_data['warrantyInfo'],
                'breadcrumb': krowne_data['breadcrumb'],
                'productCode': krowne_data['productCode'],
                'listPrice': krowne_data['listPrice']
            }
        }
        
        return formatted_data

# Example usage:
if __name__ == "__main__":
    async def test_scraper():
        test_skus = ["16-281", "kr-2000", "ms-2424"]  # Test different product types
        scraper = KrowneScraper()
        
        for sku in test_skus:
            print(f"\n{'='*50}")
            print(f"Testing SKU: {sku}")
            print('='*50)
            
            try:
                # Test the new async method
                formatted_data = await scraper.get_product_by_sku(sku)
                
                if formatted_data:
                    print(f"✅ Successfully scraped: {formatted_data.get('name', 'Unknown')}")
                    print(f"📋 Specifications found: {len(formatted_data.get('properties', []))}")
                    print(f"🔗 Related products: {len(formatted_data.get('relatedProducts', []))}")
                    print(f"📁 Downloads: {len(formatted_data.get('downloads', []))}")
                    print(f"🏷️ Categories: {len(formatted_data.get('categories', []))}")
                    
                    # Show some key details
                    if formatted_data.get('price'):
                        print(f"💰 Price: ${formatted_data['price']}")
                    if formatted_data.get('series'):
                        print(f"📦 Series: {formatted_data['series']}")
                    if formatted_data.get('warranty'):
                        print(f"🛡️ Warranty: {formatted_data['warranty']}")
                else:
                    print(f"❌ No data found for {sku}")
                    
            except Exception as e:
                print(f"❌ Error testing {sku}: {e}")
    
    # Run the test
    asyncio.run(test_scraper())