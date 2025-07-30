# KrowneSync - Product Data Synchronization Tool

KrowneSync is a comprehensive tool for comparing product data from CSV files or Salesforce with products listed on Krowne.com. It provides detailed comparison reports and helps maintain data consistency across platforms.

## Features

- **CSV Data Import**: Upload and process CSV files with product data
- **Salesforce Integration**: Connect directly to Salesforce to fetch product information
- **Web Scraping**: Automatically scrape product data from Krowne.com
- **Intelligent Matching**: Advanced product matching using ID, name, and fuzzy matching algorithms
- **Detailed Comparison**: Compare names, prices, descriptions, and availability
- **Interactive Dashboard**: Real-time monitoring and visualization of sync status
- **Export Results**: Generate CSV reports of comparison results
- **Docker Containerized**: Easy deployment with Docker Compose

## Architecture

- **Backend**: Python Flask API with web scraping and data processing capabilities
- **Frontend**: React.js dashboard with modern UI/UX
- **Database**: Redis for caching (optional)
- **Reverse Proxy**: Nginx for load balancing and SSL termination
- **Containerization**: Docker with multi-stage builds

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Git

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd krowne-sync
```

2. Create environment files:
```bash
# Backend environment
cp backend/.env.example backend/.env
# Edit backend/.env with your configuration

# Frontend environment  
cp frontend/.env.example frontend/.env
# Edit frontend/.env with your configuration
```

3. Start the application:
```bash
docker-compose up -d
```

4. Access the application:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Nginx (Production): http://localhost:80

### Development Setup

For local development without Docker:

#### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

#### Frontend Setup
```bash
cd frontend
npm install
npm start
```

## Configuration

### Environment Variables

#### Backend (.env)
```env
FLASK_ENV=development
SECRET_KEY=your-secret-key-here
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
REDIS_URL=redis://redis:6379/0
KROWNE_BASE_URL=https://krowne.com
SCRAPING_DELAY=1
MAX_CONCURRENT_REQUESTS=5
LOG_LEVEL=INFO
```

#### Frontend (.env)
```env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_VERSION=1.0.0
REACT_APP_ENVIRONMENT=development
```

### Salesforce Configuration

To connect to Salesforce, you need:

1. **Connected App** in Salesforce:
   - Go to Setup → App Manager → New Connected App
   - Enable OAuth Settings
   - Add required scopes: `api`, `refresh_token`, `offline_access`

2. **Required Information**:
   - Client ID (Consumer Key)
   - Client Secret (Consumer Secret)
   - Username
   - Password
   - Security Token

## Usage

### CSV Upload

1. Navigate to the "CSV Upload" tab
2. Upload a CSV file with the following required columns:
   - `product_id`: Unique identifier
   - `name`: Product name
   - `price`: Product price (numeric)
   - `description`: Product description

3. Optional columns:
   - `category`: Product category
   - `sku`: Stock keeping unit
   - `brand`: Product brand

### Salesforce Integration

1. Navigate to the "Salesforce" tab
2. Enter your Salesforce credentials
3. Test the connection
4. Configure field mappings if needed

### Running Comparisons

1. Configure your data source (CSV or Salesforce)
2. Go to the Dashboard
3. Click "Start CSV Sync" or "Start Salesforce Sync"
4. View results in the "Results" tab

## API Documentation

### Endpoints

#### Health Check
```http
GET /api/health
```

#### CSV Upload
```http
POST /api/upload-csv
Content-Type: multipart/form-data

Body: CSV file
```

#### Salesforce Sync
```http
POST /api/salesforce-sync
Content-Type: application/json

{
  "client_id": "string",
  "client_secret": "string", 
  "username": "string",
  "password": "string",
  "security_token": "string"
}
```

#### Compare Products
```http
POST /api/compare
Content-Type: application/json

{
  "source_type": "csv|salesforce",
  "filename": "string", // for CSV
  "salesforce_config": {} // for Salesforce
}
```

#### Export Results
```http
POST /api/export-results
Content-Type: application/json

{
  "results": []
}
```

## Development

### Project Structure

```
krowne-sync/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── routes.py
│   │   └── services/
│   │       ├── csv_processor.py
│   │       ├── salesforce_client.py
│   │       ├── web_scraper.py
│   │       └── data_comparator.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   └── App.js
│   ├── package.json
│   └── Dockerfile
├── nginx/
│   └── nginx.conf
├── k8s/
│   ├── backend-deployment.yaml
│   ├── frontend-deployment.yaml
│   ├── nginx-deployment.yaml
│   └── redis-deployment.yaml
├── docker-compose.yml
├── docker-compose.prod.yml
└── README.md
```

### Backend Components

- **CSV Processor**: Handles CSV file parsing and validation
- **Salesforce Client**: Manages Salesforce API integration
- **Web Scraper**: Scrapes product data from Krowne.com
- **Data Comparator**: Performs intelligent product matching and comparison

### Frontend Components

- **Dashboard**: Main overview and control panel
- **FileUpload**: CSV file upload interface
- **SalesforceConfig**: Salesforce connection configuration
- **ComparisonResults**: Results visualization and export

### Adding New Features

1. **Backend**: Add new service classes in `app/services/`
2. **Frontend**: Add new components in `src/components/`
3. **API**: Extend routes in `app/routes.py`
4. **Database**: Add models in `app/models.py` (if using database)

## Testing

### Backend Tests
```bash
cd backend
pytest tests/ -v --cov=app
```

### Frontend Tests
```bash
cd frontend
npm test
```

### Integration Tests
```bash
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

### End-to-End Tests
```bash
cd e2e-tests
npm install
npm run test
```

## Deployment

### Production Deployment

1. **Environment Setup**:
   - Set production environment variables
   - Configure SSL certificates
   - Set up monitoring and logging

2. **Docker Compose Production**:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

3. **Kubernetes Deployment**:
```bash
# Apply all Kubernetes manifests
kubectl apply -f k8s/

# Or apply individually
kubectl apply -f k8s/redis-deployment.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/nginx-deployment.yaml

# Check deployment status
kubectl get pods
kubectl get services
```

### Monitoring and Logging

1. **Application Logs**:
```bash
# Docker Compose
docker-compose logs -f

# Kubernetes
kubectl logs -f deployment/krownesync-backend
kubectl logs -f deployment/krownesync-frontend
```

2. **Health Monitoring**:
   - Backend health endpoint: `/api/health`
   - Frontend build info: accessible via browser dev tools
   - Redis monitoring: Use Redis CLI or monitoring tools

### SSL/TLS Configuration

For production deployments, configure SSL certificates:

1. **Let's Encrypt with Certbot**:
```bash
certbot --nginx -d your-domain.com
```

2. **Custom SSL Certificates**:
   - Place certificates in `nginx/certs/`
   - Update `nginx/nginx.conf` with SSL configuration

## Troubleshooting

### Common Issues

1. **Connection Refused Errors**:
   - Check if all services are running: `docker-compose ps`
   - Verify network connectivity between containers
   - Check environment variables

2. **Salesforce Authentication Errors**:
   - Verify credentials and security token
   - Check IP restrictions in Salesforce
   - Ensure Connected App permissions are correct

3. **Web Scraping Issues**:
   - Check if Krowne.com is accessible
   - Verify scraping rate limits
   - Review user-agent settings

4. **CSV Processing Errors**:
   - Validate CSV format and required columns
   - Check file encoding (UTF-8 recommended)
   - Verify data types match expected formats

### Performance Optimization

1. **Backend Optimization**:
   - Implement Redis caching for frequently accessed data
   - Use connection pooling for database connections
   - Optimize scraping with concurrent requests (within limits)

2. **Frontend Optimization**:
   - Implement lazy loading for large datasets
   - Use pagination for results display
   - Optimize bundle size with code splitting

## Contributing

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes
4. Add tests for new functionality
5. Run the test suite: `npm test` and `pytest`
6. Commit your changes: `git commit -m 'Add new feature'`
7. Push to the branch: `git push origin feature/new-feature`
8. Submit a pull request

### Code Style Guidelines

- **Python**: Follow PEP 8 standards, use `black` for formatting
- **JavaScript**: Use ESLint and Prettier for consistent formatting
- **Commit Messages**: Use conventional commit format

### Development Workflow

1. **Local Development**: Use development Docker Compose setup
2. **Testing**: Ensure all tests pass before submitting PR
3. **Documentation**: Update README and API docs for new features
4. **Code Review**: All changes require peer review

## Security

### Best Practices

- Store sensitive configuration in environment variables
- Use HTTPS in production
- Implement rate limiting for API endpoints
- Regular security updates for dependencies
- Input validation and sanitization

### Data Privacy

- CSV files are processed in memory and not permanently stored
- Salesforce credentials are not logged or cached
- Web scraping respects robots.txt and rate limits

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:

- Create an issue in the GitHub repository
- Contact the development team
- Check the troubleshooting section above

## Changelog

### Version 1.0.0
- Initial release
- CSV upload and processing
- Salesforce integration
- Web scraping functionality
- Docker containerization
- React.js frontend dashboard

### Future Roadmap

- [ ] Advanced matching algorithms (machine learning)
- [ ] Real-time sync capabilities
- [ ] Additional data source integrations
- [ ] Enhanced reporting and analytics
- [ ] Mobile-responsive design improvements
- [ ] API rate limiting and authentication
- [ ] Webhook support for real-time updates