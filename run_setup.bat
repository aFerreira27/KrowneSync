@echo off

rem Start the backend in a new CMD window
start "Backend Server" cmd /k "cd backend && python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt && py run.py"

rem Start the frontend in a new CMD window
start "Frontend Dev Server" cmd /k "cd frontend && npm install && npm start"