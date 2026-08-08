@echo off
chcp 65001 >nul
title Codex 代理配置工具
echo ==========================================
echo  Clash Verge 代理环境变量配置
echo  端口: 7897 (混合端口)
echo ==========================================
echo.

:: 检查 Clash Verge 是否在运行
tasklist /FI "IMAGENAME eq clash-verge-service.exe" 2>nul | find /I "clash-verge-service" >nul
if %errorlevel%==0 (
  echo [OK] Clash Verge 服务正在运行
) else (
  echo [提示] 未检测到 clash-verge-service.exe 进程
  echo        请确认 Clash Verge 已启动,否则代理不生效
)
echo.

:: 设置代理环境变量(用户级,永久生效)
setx HTTPS_PROXY "http://127.0.0.1:7897" >nul
setx HTTP_PROXY "http://127.0.0.1:7897" >nul
setx ALL_PROXY "socks5://127.0.0.1:7897" >nul
setx NO_PROXY "localhost,127.0.0.1" >nul

echo [OK] 已写入永久代理环境变量(HTTPS_PROXY / HTTP_PROXY / ALL_PROXY)
echo.
echo  重要: setx 只对新打开的终端生效
echo  ----------------------------------------------------------
echo  - 请【关闭并重新打开】你的终端/PowerShell
echo  - 然后输入以下命令验证:
echo      echo %%HTTPS_PROXY%%
echo      应显示: http://127.0.0.1:7897
echo  ----------------------------------------------------------
echo.
echo  验证代理是否连通:
echo      curl -m 8 https://api.openai.com -o NUL -w "%%{http_code}"
echo      返回 200/401 说明代理已通(401 是正常,表示连上了需要鉴权)
echo.
echo  之后启动 Codex 应该秒连,不再出现"正在连接 1/5"
echo.
pause
