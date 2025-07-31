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
```

#### Frontend (.env)
```env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_VERSION=1.0.0
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
├── docker-compose.yml
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

3. **Kubernetes Deployment** (optional):
   - Use provided Kubernetes manifests in `k8s/` directory
   - Configure ingress and persistent volumes
   - Set up horizontal pod autoscaling

### Environment-Specific Configurations

#### Development
```yaml
# docker-compose.override.yml
version: '3.8'
services:
  backend:
    environment:
      - FLASK_ENV=development
    volumes:
      - ./backend:/app
    command: flask run --host=0.0.0.0 --reload
  
  frontend:
    volumes:
      - ./frontend/src:/app/src
    command: npm start
```

#### Production
```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  backend:
    environment:
      - FLASK_ENV=production
    restart: always
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
  
  frontend:
    restart: always
    deploy:
      replicas: 2
```

## Monitoring and Logging

### Application Monitoring

The application includes built-in health checks and monitoring endpoints:

- **Health Check**: `/api/health`
- **Metrics**: `/api/metrics` (if enabled)
- **Status Dashboard**: Available in the frontend

### Logging Configuration

Logs are structured and include:
- Request/response logging
- Error tracking
- Performance metrics
- Business logic events

```python
# Example log configuration
LOGGING_CONFIG = {
    'version': 1,
    'formatters': {
        'default': {
            'format': '[%(asctime)s] %(levelname)s in %(module)s: %(message)s',
        }
    },
    'handlers': {
        'file': {
            'class': 'logging.FileHandler',
            'filename': 'logs/krowne_sync.log',
            'formatter': 'default'
        }
    },
    'root': {
        'level': 'INFO',
        'handlers': ['file']
    }
}
```

### Performance Optimization

1. **Backend Optimizations**:
   - Async processing for web scraping
   - Redis caching for repeated requests
   - Connection pooling for database operations
   - Request rate limiting

2. **Frontend Optimizations**:
   - Code splitting and lazy loading
   - Image optimization
   - CDN integration for static assets
   - Service worker for offline functionality

3. **Infrastructure Optimizations**:
   - Nginx caching and compression
   - Docker multi-stage builds
   - Container resource limits
   - Load balancing

## Security Considerations

### Backend Security

- **Input Validation**: All inputs are validated and sanitized
- **SQL Injection Prevention**: Using parameterized queries
- **Rate Limiting**: API endpoints are rate-limited
- **CORS Configuration**: Proper CORS headers configured
- **File Upload Security**: File type and size validation

### Frontend Security

- **XSS Prevention**: Input sanitization and CSP headers
- **CSRF Protection**: CSRF tokens for state-changing operations
- **Secure Headers**: Security headers configured in Nginx
- **Authentication**: Secure session management

### Infrastructure Security

- **Container Security**: Non-root users, minimal base images
- **Network Security**: Internal container communication
- **SSL/TLS**: HTTPS encryption in production
- **Secrets Management**: Environment variables for sensitive data

## Troubleshooting

### Common Issues

#### Backend Issues

**Issue**: CSV upload fails
```bash
# Check file permissions
ls -la backend/uploads/

# Check disk space
df -h

# View logs
docker-compose logs backend
```

**Issue**: Salesforce connection fails
```bash
# Test credentials
curl -X POST http://localhost:5000/api/salesforce-sync \
  -H "Content-Type: application/json" \
  -d '{"client_id":"...","client_secret":"...","username":"...","password":"...","security_token":"..."}'

# Check network connectivity
docker-compose exec backend ping login.salesforce.com
```

**Issue**: Web scraping fails
```bash
# Check target website availability
curl -I https://krowne.com

# Verify user agent and rate limiting
docker-compose logs backend | grep scraper
```

#### Frontend Issues

**Issue**: API calls failing
```bash
# Check backend connectivity
curl http://localhost:5000/api/health

# Verify CORS configuration
docker-compose logs nginx
```

**Issue**: Build failures
```bash
# Clear node modules and rebuild
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

#### Infrastructure Issues

**Issue**: Docker compose fails to start
```bash
# Check port conflicts
netstat -tulpn | grep :80
netstat -tulpn | grep :3000
netstat -tulpn | grep :5000

# Check Docker resources
docker system df
docker system prune
```

**Issue**: Performance problems
```bash
# Monitor resource usage
docker stats

# Check logs for bottlenecks
docker-compose logs --tail=100 -f
```

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Backend debug
export FLASK_ENV=development
export FLASK_DEBUG=1

# Frontend debug
export REACT_APP_DEBUG=true
```

## Contributing

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/new-feature
   ```

3. **Make changes and commit**:
   ```bash
   git add .
   git commit -m "Add new feature"
   ```

4. **Run tests**:
   ```bash
   # Backend tests
   cd backend && pytest

   # Frontend tests
   cd frontend && npm test
   ```

5. **Submit a pull request**

### Code Standards

#### Backend (Python)
- Follow PEP 8 style guide
- Use type hints where appropriate
- Write docstrings for all functions
- Maintain test coverage above 80%

#### Frontend (React)
- Use functional components with hooks
- Follow ESLint configuration
- Write PropTypes for all components
- Use meaningful component and variable names

#### Git Workflow
- Use conventional commit messages
- Squash commits before merging
- Include tests for new features
- Update documentation

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:

- **Documentation**: Check this README and inline code comments
- **Issues**: Create a GitHub issue for bugs and feature requests
- **Discussions**: Use GitHub Discussions for general questions
- **Email**: [your-email@domain.com]

## Roadmap

### Version 1.1
- [ ] Advanced filtering and search in results
- [ ] Bulk operations for product updates
- [ ] API rate limiting dashboard
- [ ] Enhanced error reporting

### Version 1.2
- [ ] Multiple website support beyond Krowne.com
- [ ] Scheduled sync operations
- [ ] Email notifications for sync results
- [ ] Advanced analytics and reporting

### Version 2.0
- [ ] Machine learning for improved product matching
- [ ] Real-time sync capabilities
- [ ] Multi-tenant support
- [ ] Advanced API with GraphQL

## Acknowledgments

- React community for excellent documentation
- Flask team for the robust web framework
- BeautifulSoup for reliable web scraping
- Docker team for containerization technology