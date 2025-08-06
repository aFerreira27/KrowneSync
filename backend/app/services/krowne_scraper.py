import requests
import os
import re
from bs4 import BeautifulSoup

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
    def scrapeSite(sku):
        """
        Scrapes all product information from Krowne website to match ProductCard component fields
        """
        response = requests.get(BASEURL + sku)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Initialize product data structure
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
                'relatedProducts': []
            }
        }
        
        # Extract product name
        h3_tag = soup.find('h3', class_='font-size24')
        if h3_tag and h3_tag.strong:
            product_data['krowne']['name'] = h3_tag.strong.get_text(strip=True)
        
        # Extract model/SKU (often appears after "MODEL")
        model_div = soup.find('div', string=re.compile(r'MODEL'))
        if not model_div:
            # Alternative: look for the pattern in any div or p tag
            model_element = soup.find(text=re.compile(r'MODEL\s+'))
            if model_element:
                model_match = re.search(r'MODEL\s+([A-Z0-9-]+)', model_element.strip())
                if model_match:
                    product_data['sku'] = model_match.group(1)
        
        # Extract price
        price_span = soup.find('span', class_='greentext')
        if price_span:
            price_text = price_span.get_text(strip=True)
            # Remove $ and convert to float if possible
            price_clean = re.sub(r'[^\d.]', '', price_text)
            try:
                product_data['krowne']['price'] = float(price_clean)
            except ValueError:
                product_data['krowne']['price'] = price_text
        
        # Extract main product image
        image_div = soup.find('div', class_='mainProductImage')
        if image_div:
            style_attr = image_div.get('style', '')
            match = re.search(r"url\(['\"]?(.*?)['\"]?\)", style_attr)
            if match:
                relative_path = match.group(1)
                product_data['krowne']['mainImageUrl'] = BASEURL + relative_path
        
        # Extract features/bullet points
        features_ul = soup.find('ul', class_='productDetailInfoList')
        if features_ul:
            for li in features_ul.find_all('li'):
                text = li.get_text(strip=True)
                if text:
                    product_data['krowne']['features'].append(text)
        
        # Extract specifications from the specs table
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
                            # Store series separately if found
                            if key.lower() == 'series':
                                product_data['krowne']['series'] = value
                            product_data['krowne']['specifications'][key] = value
        
        # Extract certifications
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
            warranty_table = warranty_section.find_next('table')
            if warranty_table:
                warranty_cell = warranty_table.find('td')
                if warranty_cell:
                    product_data['krowne']['warranty'] = warranty_cell.get_text(strip=True)
        
        # Extract related products from carousel
        carousel = soup.find('div', id='carousel2')
        if carousel:
            carousel_entries = carousel.find_all('div', class_='carousel-entry')
            for entry in carousel_entries:
                link = entry.find('a')
                if link:
                    href = link.get('href', '').strip('/')
                    
                    # Extract product info
                    img = entry.find('img')
                    img_src = img.get('src') if img else None
                    
                    text_divs = entry.find_all('div', class_='carousel-entry-text')
                    model = text_divs[0].get_text(strip=True) if len(text_divs) > 0 else None
                    name = text_divs[1].get_text(strip=True) if len(text_divs) > 1 else None
                    
                    related_product = {
                        'sku': model,
                        'name': name,
                        'url': BASEURL + href if href else None,
                        'imageUrl': BASEURL + img_src if img_src else None
                    }
                    product_data['krowne']['relatedProducts'].append(related_product)
        
        # Extract breadcrumb for category information
        breadcrumb = soup.find('div', class_='breadcrum')
        categories = []
        if breadcrumb:
            links = breadcrumb.find_all('a')
            for link in links:
                category_text = link.get_text(strip=True)
                if category_text and category_text != '//':
                    categories.append({
                        'name': category_text,
                        'url': link.get('href')
                    })
        product_data['krowne']['categories'] = categories
        
        # Save product image locally
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
    
    @staticmethod
    def format_for_product_card(product_data):
        """
        Formats the scraped data to match the ProductCard component's expected structure
        """
        sku = product_data['sku']
        krowne_data = product_data['krowne']
        
        # Convert specifications to properties array format
        properties = []
        for key, value in krowne_data['specifications'].items():
            properties.append({
                'propertyName': key.replace('_', ' '),
                'propertyAdminName': key,
                'value': value
            })
        
        # Add certifications as properties
        for cert_name, cert_value in krowne_data['certifications'].items():
            properties.append({
                'propertyName': f"{cert_name} Certification",
                'propertyAdminName': f"{cert_name}_Certification",
                'value': cert_value
            })
        
        # Format for ProductCard component
        formatted_data = {
            'sku': sku,
            'krowne': {
                'name': krowne_data['name'],
                'price': krowne_data['price'],
                'description': ' '.join(krowne_data['features']) if krowne_data['features'] else None,
                'mainImageUrl': krowne_data['mainImageUrl'],
                'properties': properties,
                'categories': krowne_data['categories'],
                'relatedProducts': [{
                    'propertyName': 'Related Products',
                    'propertyAdminName': 'Related_Products',
                    'products': krowne_data['relatedProducts']
                }] if krowne_data['relatedProducts'] else [],
                'series': krowne_data['series'],
                'warranty': krowne_data['warranty']
            }
        }
        
        return formatted_data