@echo off

rem Start the backend in a new CMD window
start "Backend Server" cmd /k "cd backend && venv\Scripts\activate && py run.py"

rem Start the frontend in a new CMD window
start "Frontend Dev Server" cmd /k "cd frontend && npm start"