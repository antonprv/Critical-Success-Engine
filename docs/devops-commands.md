Powershell:
pwsh devops/build-all.ps1               # полная сборка
pwsh devops/build-all.ps1 -SkipPhysics  # без физики, быстрее
pwsh devops/start-desktop.ps1

Bash:
bash devops/build-all.sh --skip-physics
bash devops/start-desktop.sh
