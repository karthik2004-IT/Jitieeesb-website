@echo off
firebase --version > version.log 2>&1
exit %ERRORLEVEL%
