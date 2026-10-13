#!/bin/sh
# Vercel "build command": compile the F# core to JavaScript in core/.
#
# core/ is not committed. Every deploy builds it fresh from fsharp/, so what is served is always
# what the F# says. Fable's own runtime library is copied into core/fable_modules/ by the compiler.
set -eu

export PATH="$HOME/.dotnet:$PATH"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
# No ICU packages on the build image, and we do not need culture-aware anything.
export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

dotnet fable fsharp/IpaTrombone.fsproj --outDir core

# The output directory is the repository root, so anything left in it is published. Remove .NET's
# intermediate folders; keep only core/.
rm -rf fsharp/obj fsharp/bin fsharp/tests/obj fsharp/tests/bin

test -f core/src/01-TongueSpace.js || { echo "Fable did not produce core/src/01-TongueSpace.js" >&2; exit 1; }
echo "built core/: $(find core -type f | wc -l) files"
