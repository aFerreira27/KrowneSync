import requests
import os
import re
from bs4 import BeautifulSoup

BASEURL = 'https://www.krowne.com/'

class KrowneScraper:
    def parseSite(sku):
        response = requests.get(BASEURL + sku)
        site = BeautifulSoup(response.content, 'html.parser')
        return site

    def getProdName(site):
        h3_tag = site.find('h3', class_='font-size24')
        prodName = h3_tag.strong.get_text(strip=True) if h3_tag and h3_tag.strong else 'Product Name Not Found'
        return prodName

    def scrapeSite(BASEURL, sku):
        features = None
        specs = None
        certs = None
        series = None

        response = requests.get(BASEURL+sku)
        soup = BeautifulSoup(response.content, 'html.parser')

        h3_tag = soup.find('h3', class_='font-size24')
        prodName = h3_tag.strong.get_text(strip=True) if h3_tag and h3_tag.strong else 'Product Name Not Found'
        print("Product Name:", prodName)

        image_div = soup.find('div', class_='mainProductImage')
        style_attr = image_div.get('style') if image_div else ''
        match = re.search(r"url\(['\"]?(.*?)['\"]?\)", style_attr)
        relative_path = match.group(1) if match else ''
        prodImage_url = BASEURL + relative_path if relative_path else None
        
        folder = f'Output/{sku.upper()} Spec Sheet Folder'
        os.makedirs(folder, exist_ok=True)
        prodImage = f"{sku.upper()}.jpg"
        prodImagePath = os.path.join(folder, prodImage)
        if not prodImage_url:
            print("❌ Image URL not found.")
        else:  
            img_data = requests.get(prodImage_url).content
            with open(prodImagePath, 'wb') as f:
                f.write(img_data)
            print(f"✅ Image saved as: {prodImage}")

        features = []
        ul = soup.find('ul', class_='productDetailInfoList')
        if ul:
            for li in ul.find_all('li'):
                text = li.get_text(strip=True)
                if text:
                    features.append(text)

        # Scrape specs from the table under the h3 with class 'font-size24'
        specs = []
        h3 = soup.find('h3', class_='font-size24')
        if h3:
            table = h3.find_next('table')
            if table:
                for row in table.find_all('tr'):
                    cells = row.find_all(['td', 'th'])
                    if len(cells) >= 2:
                        key = cells[0].get_text(strip=True)
                        val = cells[1].get_text(strip=True)
                        if key and val:
                            # If the key is 'Series', save to series variable
                            if key.lower() == 'series':
                                series = val
                            else:
                                specs.append((key, val))

        # Scrape certifications from the table under the h3 with class 'font-size24'
        certs = []
        h3 = soup.find('h3', class_='font-size24')
        if h3:
            table = h3.find_next('table')
            if table:
                for row in table.find_all('tr'):
                    cells = row.find_all(['td', 'th'])
                    if len(cells) >= 2:
                        key = cells[0].get_text(strip=True)
                        val = cells[1].get_text(strip=True)
                        if key and val and key.lower() == 'certifications':
                            certs.append(val)

        return prodName, series, prodImagePath, features, certs, specs