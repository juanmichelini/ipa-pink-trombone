#!/bin/sh
# Vercel "install command": put the .NET SDK on the build machine and restore Fable.
#
# Vercel builds in an Amazon Linux 2023 container with no .NET. The .NET team ships the SDK in that
# distribution's own repository, so `dnf` is the first choice; Microsoft's install script is the
# fallback. The same script runs in CI inside an amazonlinux:2023 container (see
# .github/workflows/fsharp.yml), so a change here is tested before it reaches a deploy.
set -eu

if ! command -v dotnet >/dev/null 2>&1; then
  if ! dnf install -y dotnet-sdk-8.0; then
    echo "dnf could not install dotnet-sdk-8.0, falling back to dotnet-install.sh" >&2
    curl -sSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
    sh /tmp/dotnet-install.sh --channel 8.0 --install-dir "$HOME/.dotnet"
  fi
fi
export PATH="$HOME/.dotnet:$PATH"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1

dotnet --version
# The tool manifest in .config/dotnet-tools.json pins Fable's exact version.
dotnet tool restore
