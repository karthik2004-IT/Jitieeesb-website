@echo off
firebase deploy --non-interactive > deploy.log 2>&1
exit %ERRORLEVEL%
