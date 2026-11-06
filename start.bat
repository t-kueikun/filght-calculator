@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
    py -3 launch.py
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo Python 3.10+ is required. https://www.python.org/downloads/
        pause
        exit /b 1
    )
    python launch.py
)
if errorlevel 1 (
    echo.
    echo Startup failed. Check the error message above.
    pause
)
